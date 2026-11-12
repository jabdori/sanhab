// 24 대화: 오른쪽 끝의 접히는 칸. 사람이 묻고 AI가 DB를 읽어 답한다. 대화는 임시라서 서버에도 남지 않고(화면이 매번 전체를 보낸다), 보고로 남길 때만 기록이 된다.
// 받는 부품은 AI SDK의 useChat(UI 메시지 스트림 — docs/spike). 가운데(사실)에는 AI의 글이 없고 이 칸에만 있다.
// 지금 열어 둔 대상이 문맥으로 따라오고(눌러서 끈다) 붙임으로 다른 기록을 더한다. 답 아래의 조회는 서버가 도구 결과에서 찾아 붙인 기록 목록이다.
// 역할을 바꾸면 대화가 비워진다(임시). 누른 뒤 요청이 끝날 때까지 전송·보고는 다시 눌리지 않는다. AI가 멈춰 있어도 다른 화면은 그대로 된다.
import { useChat } from '@ai-sdk/react'
import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { ChatComposer, ChatComposerInput, ChatMessage, ChatMessageBubble, ChatMessageList } from '@astryxdesign/core/Chat'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, chatOpenAtom, listOpenAtom, roleAtom, rolesAtom, store, targetAtom, type Target } from '../../state'
import { Pill } from '../../ui/Pill'
import { Card, type CardData } from '../25-카드'

/** 답에 붙는 조회한 기록(서버가 `data-reads`로 보낸다). go는 이름과 같은 순서의 여는 길(열 화면이 없는 기록은 null) */
type Talk = UIMessage<never, { reads: { names: string[]; go?: (Target | null)[] }; card: CardData; doc: { id: string; name: string } }>

/** 칩에 보이는 이름. 아직 받지 못했거나 모르면 id */
const key = (t: Target) => `${t.kind}/${t.id}`
const same = (a: Target, b: Target) => a.kind === b.kind && a.id === b.id

/** 서버의 오류: 200이 아니면 본문 `{ error }`, 스트림 안의 오류는 낱말 그대로 */
const word = (e: Error) => {
  try {
    return JSON.parse(e.message).error ?? e.message
  } catch {
    return e.message
  }
}

/** 실패의 표지: AI가 응답하지 않으면 `대기`(17의 보고와 같은 뜻), 그 밖의 낱말(대상 · 오류)은 그대로 */
const Mark = ({ word }: { word: string }) => <Pill tone={word === L.대기 ? 'wait' : 'bad'}>{word}</Pill>

function Panel() {
  const open = useAtomValue(chatOpenAtom)
  const target = useAtomValue(targetAtom)
  const [follow, setFollow] = useState(true)
  const [pinned, setPinned] = useState<Target[]>([])
  const [text, setText] = useState('')
  const [kept, setKept] = useState<{ state?: string; error?: string } | null>(null)
  const [keeping, setKeeping] = useState(false)
  // 올릴 파일(26): 보내면 AI가 소명의 서류로 넘긴다
  const [file, setFile] = useState<File | null>(null)
  const pick = useRef<HTMLInputElement>(null)
  const [tooBig, setTooBig] = useState(false)
  // 보낼 때의 문맥을 읽는 곳(전송기는 한 번만 만든다)
  const ctx = useRef<{ target: Target | null; attach: Target[] }>({ target: null, attach: [] })
  const now = follow ? target : null
  // 칩의 이름(제목 줄과 같은 이름)은 서버에서 한 번에 받아 둔다
  const [named, setNamed] = useState<Record<string, string | null>>({})
  const want = [target, ...pinned].filter((t): t is Target => !!t && !(key(t) in named))
  const wantKey = want.map(key).join('|')
  useEffect(() => {
    if (!want.length) return
    api<{ names: (string | null)[] }>(`/chat/names?items=${encodeURIComponent(JSON.stringify(want))}`).then(
      (r) => setNamed((n) => ({ ...n, ...Object.fromEntries(want.map((t, i) => [key(t), r.names[i] ?? null])) })),
      () => {},
    )
  }, [wantKey])
  const shown = (t: Target) => `${t.kind} ${named[key(t)] ?? t.id}`.trim()
  ctx.current = { target: now, attach: pinned }
  const [transport] = useState(
    () =>
      new DefaultChatTransport<Talk>({
        api: '/api/chat',
        headers: (): Record<string, string> => {
          const token = store.get(rolesAtom).find((r) => r.role === store.get(roleAtom))?.token
          return token ? { authorization: `Bearer ${token}` } : {}
        },
        // 대화가 길어지면 마지막 20개만 보낸다
        // 파일은 가장 나중에 올린 말의 것만 싣는다(본문이 커지지 않게: 파일은 data URL이라 4/3배, 한도 8MB)
        prepareSendMessagesRequest: ({ messages }) => {
          const last = messages.map((m) => m.parts.some((p) => p.type === 'file')).lastIndexOf(true)
          const sent = messages.slice(-20).map((m) => (m === messages[last] ? m : { ...m, parts: m.parts.filter((p) => p.type !== 'file') }))
          return { body: { messages: sent, ...ctx.current } }
        },
      }),
  )
  const { messages, sendMessage, status, error, clearError } = useChat<Talk>({
    transport,
    // AI가 파일을 소명의 서류로 넘겼으면 소명 화면이 다시 읽는다
    onData: (p) => {
      if (p.type === 'data-doc') store.set(changedAtom, (n) => n + 1)
    },
  })
  const busy = status === 'submitted' || status === 'streaming'
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages, status, error])

  const send = (value: string) => {
    if (busy || !value.trim()) return
    clearError()
    setKept(null)
    sendMessage({ text: value.trim(), files: file ? pick.current?.files ?? undefined : undefined })
    setText('')
    setFile(null)
    setTooBig(false)
    if (pick.current) pick.current.value = ''
  }
  // 보고로 남기기의 대상은 정황이다(열어 둔 정황, 없으면 붙인 정황)
  const signal = [now, ...pinned].some((t) => t?.kind === L.정황)
  const answered = messages.some((m) => m.role === 'assistant' && m.parts.some((p) => p.type === 'text' && p.text))
  const keep = async () => {
    setKeeping(true)
    setKept(null)
    try {
      const body = { messages: messages.slice(-20).map(({ role, parts }) => ({ role, parts: parts.filter((p) => p.type === 'text') })), ...ctx.current }
      setKept({ state: (await api<{ state: string }>('/chat/report', body)).state })
    } catch (e) {
      setKept({ error: word(e as Error) })
    } finally {
      setKeeping(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" hidden={!open}>
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <div className="flex flex-wrap items-center gap-1">
          <Text type="supporting">{L.문맥}</Text>
          {now && <Token label={shown(now)} size="sm" onClick={() => setFollow(false)} />}
          {pinned.map((t) => (
            <Token key={key(t)} label={shown(t)} size="sm" onRemove={() => setPinned(pinned.filter((p) => !same(p, t)))} />
          ))}
          {!follow && target && <Token label={shown(target)} size="sm" color="gray" onClick={() => setFollow(true)} />}
        </div>
        <div>
          <Button label={L.붙임} size="sm" isDisabled={!target || pinned.some((p) => same(p, target))} onClick={() => target && setPinned([...pinned, target].slice(-5))} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <ChatMessageList align="top" density="compact" isStreaming={busy}>
          {messages.map((m) => {
            const reads = m.parts.flatMap((p) => (p.type === 'data-reads' ? p.data.names.map((name, i) => ({ name, go: p.data.go?.[i] ?? null })) : []))
            const ids = reads.map((r) => r.name)
            const cards = m.parts.flatMap((p) => (p.type === 'data-card' ? [p.data] : []))
            const body = m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')
            const ai = m.role === 'assistant'
            return (
              <ChatMessage
                key={m.id}
                sender={ai ? 'assistant' : 'user'}
                name={ai && (body || ids.length > 0 || cards.length > 0) ? <Token label={L.AI} size="sm" /> : null}
                metadata={
                  ids.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <Text type="supporting">{L.조회}</Text>
                      {/* 화면이 있는 기록은 이동 링크(다른 화면의 이동과 같은 꼴), 없는 것(사람·주소 …)은 글자 */}
                      {reads.map(({ name, go }) =>
                        go ? (
                          <Link key={name} type="supporting" onClick={() => store.set(targetAtom, go)}>
                            {name}
                          </Link>
                        ) : (
                          <Text key={name} type="supporting" hasTabularNumbers>
                            <span className="wrap-anywhere">{name}</span>
                          </Text>
                        ),
                      )}
                    </div>
                  )
                }
              >
                {m.parts.map((p) => (p.type === 'file' ? <Token key={p.url.slice(-40) + p.filename} label={p.filename ?? L.서류} size="sm" /> : null))}
                {body && (
                  <ChatMessageBubble>
                    <span className="break-keep wrap-anywhere whitespace-pre-wrap">{body}</span>
                  </ChatMessageBubble>
                )}
                {cards.map((c) => (
                  <ChatMessageBubble key={`${c.kind}/${c.id}/${c.action}`} variant="ghost" width="100%">
                    <Card card={c} />
                  </ChatMessageBubble>
                ))}
              </ChatMessage>
            )
          })}
        </ChatMessageList>
        {error && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Mark word={word(error)} />
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="flex flex-col gap-2 border-t border-border p-3">
        {kept && (
          <div className="flex flex-wrap items-center gap-2">
            <Text type="supporting">{L.보고}</Text>
            {kept.state ? <Pill tone="wait">{kept.state}</Pill> : <Mark word={kept.error ?? L.오류} />}
          </div>
        )}
        {file && <Token label={file.name} size="sm" onRemove={() => { setFile(null); if (pick.current) pick.current.value = '' }} />}
        <input ref={pick} type="file" hidden aria-label={L.서류} accept="image/png,image/jpeg,application/pdf" onChange={(e) => {
            // 19의 한도(2MB, 이미지·PDF)를 넘으면 붙이지 않는다
            const f = e.target.files?.[0] ?? null
            const ok = !f || (f.size <= 2 * 1024 * 1024 && ['image/png', 'image/jpeg', 'application/pdf'].includes(f.type))
            setTooBig(!ok)
            setFile(ok ? f : null)
            if (!ok) e.target.value = ''
          }} />
        {tooBig && <Mark word={L.대상} />}
        <ChatComposer
          value={text}
          onChange={setText}
          onSubmit={send}
          elevation="none"
          density="compact"
          input={<ChatComposerInput label={L.대화} placeholder={L.대화} maxRows={4} />}
          footerActions={
            <>
              <Button label={L.서류} size="sm" isDisabled={busy} onClick={() => pick.current?.click()} />
              <Button label={L.보고} size="sm" isDisabled={busy || keeping || !answered || !signal} onClick={keep} />
            </>
          }
        />
      </div>
    </div>
  )
}

/** 접힌 손잡이(40)와 펼친 칸(380). 말은 접어도 남는다(칸을 숨길 뿐이다) */
function Chat() {
  const [open, setOpen] = useAtom(chatOpenAtom)
  const setListOpen = useSetAtom(listOpenAtom)
  const role = useAtomValue(roleAtom)
  return (
    <aside className={`flex shrink-0 flex-col border-l border-border bg-surface ${open ? 'w-chat-open' : 'w-chat'}`}>
      <div className={`flex items-center gap-2 pt-3 ${open ? 'border-b border-border px-3 pb-3' : 'justify-center'}`}>
        {/* 40폭의 손잡이: 버튼 부품의 안쪽 여백이 낱말을 자르므로 글자 그대로 누른다 */}
        <button type="button" className="cursor-pointer" aria-expanded={open} onClick={() => {
            setOpen(!open)
            // 둘 중 하나만 펼쳐진다: 대화를 펼치면 목록이 접힌다
            if (!open) setListOpen(false)
          }}
        >
          <Text type="supporting" color="secondary" weight="medium">
            {L.대화}
          </Text>
        </button>
        {open && <Pill tone="wait">{L.임시}</Pill>}
      </div>
      <Panel key={role} />
    </aside>
  )
}

export default [{ slot: 'chat', View: Chat }] satisfies Piece[]
