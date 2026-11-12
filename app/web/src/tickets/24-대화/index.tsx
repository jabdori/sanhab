// 24 대화: 모든 화면 오른쪽의 대화 칸(App의 end, 폭 조절). 사람이 묻고 AI가 DB를 읽어 답한다. 대화는 임시라서 서버에도 남지 않고(화면이 매번 전체를 보낸다), 보고로 남길 때만 기록이 된다.
// 받는 부품은 AI SDK의 useChat(UI 메시지 스트림 — docs/spike). 가운데(사실)에는 AI의 글이 없고 이 칸에만 있다.
// 지금 열어 둔 대상이 문맥으로 따라오고(눌러서 끈다) 붙임으로 다른 기록을 더한다. 답 아래의 조회는 서버가 도구 결과에서 찾아 붙인 기록 목록이다.
// 역할을 바꾸면 대화가 비워진다(임시). 누른 뒤 요청이 끝날 때까지 전송·보고는 다시 눌리지 않는다. AI가 멈춰 있어도 다른 화면은 그대로 된다.
import { useChat } from '@ai-sdk/react'
import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { Badge } from '@astryxdesign/core/Badge'
import { ClickableCard } from '@astryxdesign/core/ClickableCard'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, Layout, LayoutContent, LayoutHeader, VStack } from '@astryxdesign/core/Layout'
import { ChatComposer, ChatComposerDrawer, ChatComposerInput, ChatLayout, ChatMessage, ChatMessageBubble, ChatMessageList, ChatSystemMessage } from '@astryxdesign/core/Chat'
import { Icon } from '@astryxdesign/core/Icon'
import { Heading } from '@astryxdesign/core/Text'
import { DocumentArrowUpIcon, PaperClipIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { Text } from '@astryxdesign/core/Text'
import { Section } from '@astryxdesign/core/Section'
import { Token } from '@astryxdesign/core/Token'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { useAtomValue } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { ASK, L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, roleAtom, rolesAtom, store, targetAtom, type Target } from '../../state'
import { badge } from '../../ui/status'
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
const Mark = ({ word }: { word: string }) => <Badge variant={word === L.대기 ? 'neutral' : 'error'} label={word} />

function Panel() {
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
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack gap={2} vAlign="center">
            <Icon icon={SparklesIcon} size="sm" color="accent" />
            <Heading level={3}>{L.대화}</Heading>
            <Badge variant="neutral" label={L.임시} />
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
        {/* ChatLayout은 flex 1로 높이를 채운다: 세로 Stack(높이 100%) 안에 둔다 */}
        <VStack height="100%">
        <ChatLayout
          density="compact"
          composer={
            <ChatComposer
              value={text}
              onChange={setText}
              onSubmit={send}
              density="compact"
              placeholder={L.대화}
              input={<ChatComposerInput label={L.대화} placeholder={L.대화} maxRows={4} />}
              drawer={
                <ChatComposerDrawer label={L.문맥}>
                  <HStack gap={1} vAlign="center" wrap="wrap">
                    {now && <Token label={shown(now)} size="sm" onClick={() => setFollow(false)} />}
                    {pinned.map((t) => (
                      <Token key={key(t)} label={shown(t)} size="sm" onRemove={() => setPinned(pinned.filter((p) => !same(p, t)))} />
                    ))}
                    {!follow && target && <Token label={shown(target)} size="sm" color="gray" onClick={() => setFollow(true)} />}
                    {file && <Token label={file.name} size="sm" onRemove={() => { setFile(null); if (pick.current) pick.current.value = '' }} />}
                    {!now && !pinned.length && !file && <Text type="supporting">{L.문맥} {L.없음}</Text>}
                  </HStack>
                </ChatComposerDrawer>
              }
              headerActions={
                <>
                  <Button label={L.붙임} variant="ghost" size="sm" isIconOnly icon={<Icon icon={PaperClipIcon} size="sm" />} isDisabled={!target || pinned.some((p) => same(p, target))} onClick={() => target && setPinned([...pinned, target].slice(-5))} />
                  <Button label={L.서류} variant="ghost" size="sm" isIconOnly icon={<Icon icon={DocumentArrowUpIcon} size="sm" />} isDisabled={busy} onClick={() => pick.current?.click()} />
                </>
              }
              footerActions={<Button label={L.보고} variant="ghost" size="sm" isDisabled={busy || keeping || !answered || !signal} onClick={keep} />}
            />
          }
          emptyState={
            // ai-chat-landing 꼴: 비었을 때 제목과 질문 제안. 제안을 누르면 그 말을 보낸다
            <Section variant="transparent" padding={4}>
            <VStack gap={4}>
              <EmptyState title={L.대화} icon={<Icon icon={SparklesIcon} size="lg" color="accent" />} isCompact />
              <Grid columns={1} gap={2}>
                {Object.entries(ASK).map(([name, prompt]) => (
                  <ClickableCard key={name} label={name} variant="muted" padding={3} isDisabled={busy} onClick={() => send(prompt)}>
                    <VStack gap={0.5}>
                      <Heading level={4}>{name}</Heading>
                      <Text type="supporting" color="secondary">
                        {prompt}
                      </Text>
                    </VStack>
                  </ClickableCard>
                ))}
              </Grid>
            </VStack>
            </Section>
          }
        >
          {messages.length > 0 || error ? (
          <ChatMessageList isStreaming={busy}>
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
                  avatar={ai ? <Icon icon={SparklesIcon} size="md" color="accent" /> : null}
                  metadata={
                    ids.length > 0 && (
                      <VStack gap={1}>
                        <Text type="supporting">{L.조회}</Text>
                        {/* 화면이 있는 기록은 이동 링크(다른 화면의 이동과 같은 꼴), 없는 것(사람·주소 …)은 글자 */}
                        {reads.map(({ name, go }) =>
                          go ? (
                            <Link key={name} type="supporting" onClick={() => store.set(targetAtom, go)}>
                              {name}
                            </Link>
                          ) : (
                            <Text key={name} type="supporting" hasTabularNumbers className="wrap-anywhere">
                              {name}
                            </Text>
                          ),
                        )}
                      </VStack>
                    )
                  }
                >
                  {m.parts.map((p) => (p.type === 'file' ? <Token key={p.url.slice(-40) + p.filename} label={p.filename ?? L.서류} size="sm" /> : null))}
                  {body && (
                    <ChatMessageBubble variant={ai ? 'ghost' : undefined}>
                      <Text className="break-keep wrap-anywhere whitespace-pre-wrap">{body}</Text>
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
            {(error || kept || tooBig) && (
              <ChatSystemMessage>
                <HStack gap={2} vAlign="center" wrap="wrap">
                  {error && <Mark word={word(error)} />}
                  {tooBig && <Mark word={L.대상} />}
                  {kept && (
                    <>
                      <Text type="supporting">{L.보고}</Text>
                      {kept.state ? <Badge variant={badge(kept.state)} label={kept.state} /> : <Mark word={kept.error ?? L.오류} />}
                    </>
                  )}
                </HStack>
              </ChatSystemMessage>
            )}
          </ChatMessageList>
          ) : null}
        </ChatLayout>
        </VStack>
        <input ref={pick} type="file" hidden aria-label={L.서류} accept="image/png,image/jpeg,application/pdf" onChange={(e) => {
            // 19의 한도(2MB, 이미지·PDF)를 넘으면 붙이지 않는다
            const f = e.target.files?.[0] ?? null
            const ok = !f || (f.size <= 2 * 1024 * 1024 && ['image/png', 'image/jpeg', 'application/pdf'].includes(f.type))
            setTooBig(!ok)
            setFile(ok ? f : null)
            if (!ok) e.target.value = ''
          }} />
        </LayoutContent>
      }
    />
  )
}

/** 대화 칸(astryx ai-chat 템플릿의 대화 열): 모든 화면의 오른쪽에 붙고 입력창이 늘 보인다. 역할을 바꾸면 비워진다(임시) */
export function Chat() {
  const role = useAtomValue(roleAtom)
  return <Panel key={role} />
}

export default [] satisfies Piece[]
