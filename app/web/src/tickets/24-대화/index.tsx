// 24 대화: 오른쪽 끝의 접히는 칸. 사람이 묻고 AI가 DB를 읽어 답한다. 대화는 임시라서 서버에도 남지 않고(화면이 매번 전체를 보낸다), 보고로 남길 때만 기록이 된다.
// 받는 부품은 AI SDK의 useChat(UI 메시지 스트림 — docs/spike). 가운데(사실)에는 AI의 글이 없고 이 칸에만 있다.
// 지금 열어 둔 대상이 문맥으로 따라오고(눌러서 끈다) 붙임으로 다른 기록을 더한다. 답 아래의 조회는 서버가 도구 결과에서 찾아 붙인 기록 목록이다.
// 역할을 바꾸면 대화가 비워진다(임시). 누른 뒤 요청이 끝날 때까지 전송·보고는 다시 눌리지 않는다. AI가 멈춰 있어도 다른 화면은 그대로 된다.
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, chatOpenAtom, listOpenAtom, roleAtom, rolesAtom, store, targetAtom, type Target } from '../../state'
import { Pill } from '../../ui/Pill'
import { button, label } from '../../ui/styles'

/** 답에 붙는 조회한 기록(서버가 `data-reads`로 보낸다) */
type Talk = UIMessage<never, { reads: { names: string[] } }>

/** 칩에 보이는 이름. 아직 받지 못했거나 모르면 id */
const key = (t: Target) => `${t.kind}/${t.id}`
const same = (a: Target, b: Target) => a.kind === b.kind && a.id === b.id
const chip = 'max-w-full cursor-pointer rounded-pill border border-line px-2 text-label wrap-anywhere hover:text-action-hover'
/** 임시를 드러내는 점선 테두리(보고의 실선 칸과 구분) */
const bubble = 'rounded-box border border-dashed border-line px-3 py-2 break-keep wrap-anywhere whitespace-pre-wrap'

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
  const shown = (t: Target) => `${t.kind} ${named[key(t)] ?? t.id}`
  ctx.current = { target: now, attach: pinned }
  const [transport] = useState(
    () =>
      new DefaultChatTransport<Talk>({
        api: '/api/chat',
        headers: (): Record<string, string> => {
          const token = store.get(rolesAtom).find((r) => r.role === store.get(roleAtom))?.token
          return token ? { authorization: `Bearer ${token}` } : {}
        },
        body: () => ctx.current,
      }),
  )
  const { messages, sendMessage, status, error, clearError } = useChat<Talk>({ transport })
  const busy = status === 'submitted' || status === 'streaming'
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages, status, error])

  const send = () => {
    if (busy || !text.trim()) return
    clearError()
    setKept(null)
    sendMessage({ text: text.trim() })
    setText('')
  }
  // 보고로 남기기의 대상은 정황이다(열어 둔 정황, 없으면 붙인 정황)
  const signal = [now, ...pinned].some((t) => t?.kind === L.정황)
  const answered = messages.some((m) => m.role === 'assistant' && m.parts.some((p) => p.type === 'text' && p.text))
  const keep = async () => {
    setKeeping(true)
    setKept(null)
    try {
      const body = { messages: messages.map(({ role, parts }) => ({ role, parts: parts.filter((p) => p.type === 'text') })), ...ctx.current }
      setKept({ state: (await api<{ state: string }>('/chat/report', body)).state })
    } catch (e) {
      setKept({ error: word(e as Error) })
    } finally {
      setKeeping(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" hidden={!open}>
      <div className="flex flex-col gap-2 border-b border-line p-3">
        <div className="flex flex-wrap items-center gap-1">
          <span className={label}>{L.문맥}</span>
          {now && (
            <button className={chip} aria-pressed={follow} onClick={() => setFollow(false)}>
              {shown(now)}
            </button>
          )}
          {pinned.map((t) => (
            <button key={`${t.kind}/${t.id}`} className={chip} onClick={() => setPinned(pinned.filter((p) => !same(p, t)))}>
              {shown(t)} ×
            </button>
          ))}
          {!follow && target && (
            <button className={`${chip} text-text-mute line-through`} aria-pressed={false} onClick={() => setFollow(true)}>
              {shown(target)}
            </button>
          )}
        </div>
        <div>
          <button className={button} disabled={!target || pinned.some((p) => same(p, target))} onClick={() => target && setPinned([...pinned, target].slice(-5))}>
            {L.붙임}
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        {messages.map((m) => {
          const ids = m.parts.flatMap((p) => (p.type === 'data-reads' ? p.data.names : []))
          const body = m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')
          return (
            <div key={m.id} className={`flex flex-col gap-1 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              {m.role === 'assistant' && (body || ids.length > 0) && <span className={label}>{L.AI}</span>}
              {body && <p className={`${bubble} ${m.role === 'user' ? 'bg-surface' : 'bg-bg'} max-w-full text-body`}>{body}</p>}
              {ids.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className={label}>{L.조회}</span>
                  <ul className="flex flex-col gap-1">
                    {ids.map((id) => (
                      <li key={id} className="text-label tabular-nums wrap-anywhere text-text-sub">
                        {id}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })}
        {status === 'submitted' && <span className="text-text-mute">…</span>}
        {error && (
          <div className="flex flex-wrap items-center gap-2">
            <Mark word={word(error)} />
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="flex flex-col gap-2 border-t border-line p-3">
        {kept && (
          <div className="flex flex-wrap items-center gap-2">
            <span className={label}>{L.보고}</span>
            {kept.state ? <Pill tone="wait">{kept.state}</Pill> : <Mark word={kept.error ?? L.오류} />}
          </div>
        )}
        <textarea
          aria-label={L.대화}
          rows={3}
          className="w-full resize-none rounded-box border border-line bg-bg p-2 text-body outline-none focus:border-action"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
        />
        <div className="flex gap-2">
          <button className={button} disabled={busy || !text.trim()} onClick={send}>
            {L.전송}
          </button>
          <button className={button} disabled={busy || keeping || !answered || !signal} onClick={keep}>
            {L.보고}
          </button>
        </div>
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
    <aside className={`flex shrink-0 flex-col border-l border-line bg-surface ${open ? 'w-chat-open' : 'w-chat'}`}>
      <div className={`flex items-center gap-2 pt-3 ${open ? 'border-b border-line px-3 pb-3' : 'justify-center'}`}>
        <button className={`cursor-pointer ${label} hover:text-action`} aria-expanded={open} onClick={() => {
            setOpen(!open)
            // 둘 중 하나만 펼쳐진다: 대화를 펼치면 목록이 접힌다
            if (!open) setListOpen(false)
          }}>
          {L.대화}
        </button>
        {open && <span className={`rounded-pill border border-line px-2 ${label}`}>{L.임시}</span>}
      </div>
      <Panel key={role} />
    </aside>
  )
}

export default [{ slot: 'chat', View: Chat }] satisfies Piece[]
