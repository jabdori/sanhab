// astryx template: ai-chat, ai-chat-landing — 대화 열(ai-chat)과 빈 대화(ai-chat-landing)의 코드에서 출발. 벗어난 곳은 docs/design/components.md
// 24 대화: 모든 화면 오른쪽 끝의 대화 칸(App의 end, 폭 조절). 사람이 묻고 AI가 DB를 읽어 답한다.
// 대화는 그래프의 노드다(D61): 기록을 열면 그 기록을 다룬 가장 최근 대화를 이어 열고, 새 대화·지난 대화를 고를 수 있다. 답이 끝날 때마다 서버에 저장한다(다룬 기록·읽은 기록은 선으로).
// 받는 부품은 AI SDK의 useChat(UI 메시지 스트림 — docs/spike). 가운데(사실)에는 AI의 글이 없고 이 칸에만 있다.
// 지금 열어 둔 대상이 문맥으로 따라오고(눌러서 끈다) 붙임으로 다른 기록을 더한다. 답 아래의 조회는 서버가 도구 결과에서 찾아 붙인 기록 목록이다.
// 대화는 역할마다 따로다. 누른 뒤 요청이 끝날 때까지 전송·보고는 다시 눌리지 않는다. AI가 멈춰 있어도 다른 화면은 그대로 된다.
import { useChat } from '@ai-sdk/react'
import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { List, ListItem } from '@astryxdesign/core/List'
import { Badge } from '@astryxdesign/core/Badge'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HStack, Layout, LayoutContent, LayoutHeader, StackItem, VStack } from '@astryxdesign/core/Layout'
import { ChatComposer, ChatComposerDrawer, ChatComposerInput, ChatLayout, ChatMessage, ChatMessageBubble, ChatMessageList, ChatSystemMessage, ChatTokenizedText, ChatToolCalls } from '@astryxdesign/core/Chat'
import { Avatar } from '@astryxdesign/core/Avatar'
import { ClickableCard } from '@astryxdesign/core/ClickableCard'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { Heading } from '@astryxdesign/core/Text'
import { DocumentArrowUpIcon, PaperClipIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { Text } from '@astryxdesign/core/Text'
import { Section } from '@astryxdesign/core/Section'
import { Token } from '@astryxdesign/core/Token'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { useAtomValue } from 'jotai'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Markdown } from '@astryxdesign/core/Markdown'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { IconButton } from '@astryxdesign/core/IconButton'
import { AtSymbolIcon, BanknotesIcon, BookOpenIcon, BuildingStorefrontIcon, ClipboardDocumentCheckIcon, ClockIcon, DocumentCheckIcon, DocumentTextIcon, FlagIcon, ArrowPathIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import type { ChatComposerInputHandle } from '@astryxdesign/core/Chat'
import type { SearchableItem } from '@astryxdesign/core/Typeahead'
import { useEffect, useRef, useState } from 'react'
import { ASK, L } from '../../labels'
import { State } from '../../ui/Mark'
import { api, changedAtom, exampleAtom, roleAtom, rolesAtom, store, targetAtom, useData, type Target } from '../../state'
import { fail } from '../../ui/status'
import { Card as ActionCard, type CardData } from '../25-카드'

/** 답에 붙는 조회한 기록(서버가 `data-reads`로 보낸다). go는 이름과 같은 순서의 여는 길(열 화면이 없는 기록은 null) */
/** 말에 붙은 문맥(보낸 말 위에 그대로 남는다): 종류 · id · 이름 */
type Ctx = { kind: string; id: string; name: string }
type Talk = UIMessage<{ ctx?: Ctx[] }, { reads: { names: string[]; go?: (Target | null)[] }; card: CardData; doc: { id: string; name: string } }>

/** 칩에 보이는 이름. 아직 받지 못했거나 모르면 id */
const key = (t: Target) => `${t.kind}/${t.id}`
const same = (a: Target, b: Target) => a.kind === b.kind && a.id === b.id
/** 기록 종류의 아이콘(문맥 카드) */
const KIND_ICON: Record<string, typeof FlagIcon> = { [L.심사]: ClipboardDocumentCheckIcon, [L.정황]: FlagIcon, [L.소명]: DocumentTextIcon, [L.대리점]: BuildingStorefrontIcon, [L.지급]: BanknotesIcon, [L.추인]: ArrowPathIcon, [L.규정]: BookOpenIcon }
const kindIcon = (k: string) => <Icon icon={KIND_ICON[k] ?? DocumentTextIcon} size="sm" />
/** `@`로 붙일 기록 찾기(서버 /chat/find — 문맥 밖의 기록도 이름으로 찾는다) */
const records = {
  search: async (q: string): Promise<SearchableItem<Ctx>[]> => (await api<{ items: Ctx[] }>(`/chat/find?q=${encodeURIComponent(q)}`)).items.map((i) => ({ id: `${i.kind}/${i.id}`, label: i.name, auxiliaryData: i })),
  bootstrap: () => records.search(''),
  cancel: () => {},
}

/** 서버의 오류: 200이 아니면 본문 `{ error }`, 스트림 안의 오류는 낱말 그대로 */
const word = (e: Error) => {
  try {
    return JSON.parse(e.message).error ?? e.message
  } catch {
    return e.message
  }
}

/** 실패의 표지: AI가 응답하지 않으면 `대기`(17의 보고와 같은 뜻), 그 밖의 낱말(대상 · 오류)은 그대로 */
const Mark = ({ word }: { word: string }) => <Badge variant={word === L.대기 ? 'neutral' : fail} label={word} />

/** 대화 목록의 한 줄(서버 `/chat/sessions`) */
type Sess = { id: string; title: string; target: Target | null; name: string | null; count: number; updated: string }

/** 저장할 말: 파일 파트(data URL)는 빼고 */
const lean = (ms: Talk[]) => ms.map((m) => ({ ...m, parts: m.parts.filter((p) => p.type !== 'file') }))

/** here: 지금 연 기록을 다룬 대화(기록을 열지 않았으면 null). 대화 목록 창은 이것(`기록`)부터 보이고 `전체`로 바꾼다 — 지난 대화의 입구는 이 창 하나 */
function Panel({ sid, initial, list, here, onPick }: { sid: string | null; initial: Talk[]; list: Sess[]; here: Sess[] | null; onPick: (id: string) => void }) {
  const target = useAtomValue(targetAtom)
  // 이 대화의 id: 새 대화면 첫 말을 보낼 때 서버에 만든다(만든 뒤에도 칸은 그대로 — 다시 그리지 않는다)
  const session = useRef<string | null>(sid)
  const [history, setHistory] = useState(false)
  const [scope, setScope] = useState<'here' | 'all'>(here ? 'here' : 'all')
  const past = scope === 'here' && here ? here : list
  const [follow, setFollow] = useState(true)
  const [pinned, setPinned] = useState<Target[]>([])
  const [text, setText] = useState('')
  const [kept, setKept] = useState<{ state?: string; error?: string } | null>(null)
  const [keeping, setKeeping] = useState(false)
  // 올릴 파일(26): 보내면 AI가 소명의 서류로 넘긴다
  const [file, setFile] = useState<File | null>(null)
  const pick = useRef<HTMLInputElement>(null)
  const [tooBig, setTooBig] = useState(false)
  const input = useRef<ChatComposerInputHandle>(null)
  /** 올릴 서류 고르기(+ 메뉴 · 붙여넣기 · 끌어놓기): 19의 한도(2MB, 이미지·PDF)를 넘으면 붙이지 않는다 */
  const choose = (f: File | null) => {
    const ok = !f || (f.size <= 2 * 1024 * 1024 && ['image/png', 'image/jpeg', 'application/pdf'].includes(f.type))
    setTooBig(!ok)
    setFile(ok ? f : null)
  }
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
    messages: initial,
    // 답이 끝날 때마다 대화 전체를 저장한다: 제목은 첫 말, 다룬 기록은 문맥·붙임, 읽은 기록은 답 아래의 조회(D61)
    onFinish: ({ messages: all }) => {
      const id = session.current
      if (!id) return
      const first = all.find((m) => m.role === 'user')?.parts.map((p) => (p.type === 'text' ? p.text : '')).join('') ?? ''
      const reads = all.flatMap((m) => m.parts.flatMap((p) => (p.type === 'data-reads' ? (p.data.go ?? []).filter((g): g is Target => !!g) : [])))
      api(`/chat/sessions/${id}`, { messages: lean(all), title: first.replace(/\s+/g, ' ').trim().slice(0, 40), about: [ctx.current.target, ...ctx.current.attach].filter(Boolean), reads }, 'PUT').catch(() => {})
    },
    // AI가 파일을 소명의 서류로 넘겼으면 소명 화면이 다시 읽는다
    onData: (p) => {
      if (p.type === 'data-doc') store.set(changedAtom, (n) => n + 1)
    },
  })
  const busy = status === 'submitted' || status === 'streaming'
  // 머리의 제목: 저장된 제목, 아직 목록에 없으면(방금 연 새 대화) 첫 말
  const title = list.find((x) => x.id === session.current)?.title || messages.find((m) => m.role === 'user')?.parts.map((p) => (p.type === 'text' ? p.text : '')).join('').slice(0, 40)

  const send = async (value: string) => {
    if (busy || !value.trim()) return
    clearError()
    if (!session.current) {
      try {
        session.current = (await api<{ id: string }>('/chat/sessions', { target: ctx.current.target })).id
      } catch {
        session.current = null
      }
    }
    setKept(null)
    const used: Ctx[] = [...(now ? [now] : []), ...pinned].map((t) => ({ ...t, name: named[key(t)] ?? t.id }))
    const files = file ? (() => { const d = new DataTransfer(); d.items.add(file); return d.files })() : undefined
    sendMessage({ text: value.trim(), files, metadata: { ctx: used } })
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
          {/* 머리: 대화 · 지금 대화의 제목 / 아이콘 단추 — 지난 대화(히스토리 → 목록 창), 새 대화 */}
          <HStack gap={2} vAlign="center">
            <Icon icon={SparklesIcon} size="sm" color="accent" />
            <StackItem size="fill">
              <VStack gap={0}>
                <Heading level={3}>{L.대화}</Heading>
                {title && (
                  <Text type="supporting" color="secondary" maxLines={1}>
                    {title}
                  </Text>
                )}
              </VStack>
            </StackItem>
            <IconButton label={`${L.대화} ${L.목록}`} tooltip={`${L.대화} ${L.목록}`} variant="ghost" size="sm" icon={<Icon icon={ClockIcon} size="sm" />} onClick={() => setHistory(true)} />
            <IconButton label={`${L.새} ${L.대화}`} tooltip={`${L.새} ${L.대화}`} variant="ghost" size="sm" icon={<Icon icon={PencilSquareIcon} size="sm" />} onClick={() => onPick('')} />
          </HStack>
          <Dialog isOpen={history} onOpenChange={setHistory} width={480}>
            <DialogHeader title={`${L.대화} ${L.목록}`} onOpenChange={setHistory} />
            {here && (
              <SegmentedControl label={`${L.대화} ${L.목록}`} value={scope} onChange={(v) => setScope(v as typeof scope)} size="sm">
                <SegmentedControlItem label={L.기록} value="here" />
                <SegmentedControlItem label={L.전체} value="all" />
              </SegmentedControl>
            )}
            {past.length ? (
              <List hasDividers>
                {past.map((x) => (
                  <ListItem
                    key={x.id}
                    label={x.title || L.대화}
                    description={[x.name, x.count > 1 ? `${L.기록} ${x.count}` : null, x.updated].filter(Boolean).join(' · ')}
                    isSelected={x.id === session.current}
                    onClick={() => {
                      setHistory(false)
                      onPick(x.id)
                    }}
                  />
                ))}
              </List>
            ) : (
              <EmptyState title={`${L.대화} ${L.없음}`} isCompact />
            )}
          </Dialog>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
        {/* ChatLayout은 flex 1로 높이를 채운다: 세로 Stack(높이 100%) 안에 둔다 */}
        <VStack height="100%">
        <ChatLayout
          density="spacious"
          composer={
            <ChatComposer
              value={text}
              onChange={setText}
              onSubmit={send}
              density="balanced"
              placeholder={L.질문}
              input={
                <ChatComposerInput
                  handleRef={input}
                  label={L.대화}
                  placeholder={L.질문}
                  maxRows={4}
                  // `@`: 문맥 밖의 기록을 이름으로 찾아 문맥 카드로 붙인다(입력에는 남기지 않는다)
                  triggers={[
                    {
                      character: '@',
                      searchSource: records,
                      onSelect: (item) => {
                        const c = item.auxiliaryData as Ctx
                        setNamed((n) => ({ ...n, [key(c)]: c.name }))
                        setPinned((p) => (p.some((x) => same(x, c)) ? p : [...p, { kind: c.kind, id: c.id }].slice(-5)))
                        return ''
                      },
                    },
                  ]}
                  onFiles={(fs) => choose(fs[0] ?? null)}
                />
              }
              drawer={
                // 문맥은 입력창 안의 카드다: 지금 연 기록(자동, 빼면 이 대화에서 빠진다) · `@`로 붙인 기록 · 올릴 서류. 아무것도 없으면 칸을 두지 않는다
                (now || pinned.length > 0 || file) && (
                  <ChatComposerDrawer label={L.문맥}>
                    <HStack gap={1} vAlign="center" wrap="wrap">
                      {[...(now ? [now] : []), ...pinned].map((t) => (
                        <Token key={key(t)} icon={kindIcon(t.kind)} label={named[key(t)] ?? t.id} size="md" onRemove={() => (now && same(t, now) ? setFollow(false) : setPinned(pinned.filter((p) => !same(p, t))))} />
                      ))}
                      {file && <Token icon={<Icon icon={DocumentTextIcon} size="sm" />} label={file.name} size="md" onRemove={() => choose(null)} />}
                    </HStack>
                  </ChatComposerDrawer>
                )
              }
              headerActions={
                // ai-chat: 기록 찾기(@)와 서류 붙이기 — 아이콘 단추 둘
                <>
                  <Button label={L.기록} variant="ghost" size="sm" icon={<Icon icon={AtSymbolIcon} size="sm" />} isIconOnly onClick={() => input.current?.insertText('@')} />
                  <Button label={L.서류} variant="ghost" size="sm" icon={<Icon icon={PaperClipIcon} size="sm" />} isIconOnly onClick={() => pick.current?.click()} />
                </>
              }
              footerActions={<IconButton label={L.보고} tooltip={L.보고} variant="ghost" size="sm" icon={<Icon icon={DocumentCheckIcon} size="sm" />} isDisabled={busy || keeping || !answered || !signal} onClick={keep} />}
            />
          }
          emptyState={
            // ai-chat-landing: 인사(아이콘 + 한 줄)와 큰 제목, 제안 카드(누르면 그 말을 보낸다). 제안은 "지금 연 기록"에 대한 것이라 연 기록이 있을 때만
            <Section variant="transparent" padding={4}>
              <VStack gap={6}>
                <VStack gap={1}>
                  <HStack gap={2} vAlign="center">
                    <Icon icon={SparklesIcon} size="md" color="accent" />
                    <Text type="large" as="h2">{L.대화}</Text>
                  </HStack>
                  {now && named[key(now)] && <Text type="display-3" as="h1">{named[key(now)]}</Text>}
                </VStack>
                {now && (
                  <Grid columns={{ minWidth: 200 }} gap={3}>
                    {Object.entries(ASK).map(([name, prompt]) => (
                      <ClickableCard key={name} label={name} padding={3} variant="muted" isDisabled={busy} onClick={() => send(prompt)}>
                        <VStack gap={0.5}>
                          <Heading level={4}>{name}</Heading>
                          <Text type="supporting" color="secondary">{prompt}</Text>
                        </VStack>
                      </ClickableCard>
                    ))}
                  </Grid>
                )}
              </VStack>
            </Section>
          }
        >
          {messages.length > 0 || error ? (
          <ChatMessageList isStreaming={busy}>
            {/* ai-chat: 맨 위 날짜 구분선 — 이 대화의 날짜(새 대화면 오늘) */}
            <ChatSystemMessage variant="divider">{(list.find((x) => x.id === session.current)?.updated ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })).slice(0, 10)}</ChatSystemMessage>
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
                  avatar={ai ? <Avatar name={L.AI} size="md" /> : null}
                >
                  {/* 보낸 말에 붙었던 문맥과 서류(카드 그대로 남는다) */}
                  {!ai && (m.metadata?.ctx?.length || m.parts.some((p) => p.type === 'file')) ? (
                    <HStack gap={1} wrap="wrap" hAlign="end">
                      {m.metadata?.ctx?.map((c) => (
                        <Token key={key(c)} icon={kindIcon(c.kind)} label={c.name} size="sm" onClick={() => store.set(targetAtom, { kind: c.kind, id: c.id })} />
                      ))}
                      {m.parts.map((p) => (p.type === 'file' ? <Token key={p.url.slice(-40) + p.filename} icon={<Icon icon={DocumentTextIcon} size="sm" />} label={p.filename ?? L.서류} size="sm" /> : null))}
                    </HStack>
                  ) : null}
                  {body && (
                    <ChatMessageBubble variant={ai ? 'ghost' : undefined}>
                      {ai ? <Markdown density="compact" isStreaming={busy} className="break-keep">{body}</Markdown> : <ChatTokenizedText>{body}</ChatTokenizedText>}
                    </ChatMessageBubble>
                  )}
                  {/* AI가 조회한 기록: 도구 호출 목록(ai-chat의 ChatToolCalls). 화면이 있는 기록은 줄 끝의 링크로 연다 */}
                  {ids.length > 0 && (
                    <ChatToolCalls
                      label={`${L.조회} ${ids.length}`}
                      calls={reads.map(({ name, go }, k) => ({
                        key: `${k}/${name}`,
                        name: L.조회,
                        target: name,
                        status: 'complete' as const,
                        stats: go ? <Link type="supporting" onClick={() => store.set(targetAtom, go)}>{L.열기}</Link> : undefined,
                      }))}
                    />
                  )}
                  {cards.map((c) => (
                    <ChatMessageBubble key={`${c.kind}/${c.id}/${c.action}`} variant="ghost" width="100%">
                      <ActionCard card={c} />
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
                      {kept.state ? <State word={kept.state} /> : <Mark word={kept.error ?? L.오류} />}
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
            choose(e.target.files?.[0] ?? null)
            e.target.value = ''
          }} />
        </LayoutContent>
      }
    />
  )
}

/**
 * 대화 칸(astryx ai-chat 템플릿의 대화 열): 모든 화면의 오른쪽 끝에 붙고 입력창이 늘 보인다.
 * 기본은 이어 하기: 기록을 열었으면 그 기록을 다룬 가장 최근 대화, 아니면 이 역할의 가장 최근 대화. `새 대화`나 목록에서 고르면 그것을 연다
 */
export function Chat() {
  const role = useAtomValue(roleAtom)
  const target = useAtomValue(targetAtom)
  // 안내의 예시 장면이 바뀌면(문제가 드러난 뒤 예시 대화가 생긴다) 대화 칸을 다시 그린다
  const ex = useAtomValue(exampleAtom)
  return <For key={`${role}/${target ? key(target) : ''}/${(ex?.['#'] as string | undefined) ?? ''}`} target={target} />
}

function For({ target }: { target: Target | null }) {
  // 연 대화: 처음 한 번만 기본값(이어 하기)으로 정하고, 그 뒤에는 사람이 고를 때만 바뀐다 — 첫 말로 새 대화가 생겨 목록이 바뀌어도 칸을 다시 그리지 않는다(답이 끊기지 않게)
  const [open, setOpen] = useState<{ sid: string | null; n: number } | null>(null)
  const all = useData<{ sessions: Sess[] }>(`/chat/sessions?n=${open?.n ?? 0}`)
  const of = useData<{ sessions: Sess[] }>(target ? `/chat/sessions?of=${encodeURIComponent(key(target))}` : null)
  const pick = (id: string) => setOpen((o) => ({ sid: id || null, n: (o?.n ?? 0) + 1 }))
  if (!all || (target && !of)) return null
  if (!open) {
    setOpen({ sid: (target ? of!.sessions : all.sessions)[0]?.id ?? null, n: 0 })
    return null
  }
  return <Load key={open.n} sid={open.sid} list={all.sessions} here={target ? of!.sessions : null} onPick={pick} />
}

function Load({ sid, list, here, onPick }: { sid: string | null; list: Sess[]; here: Sess[] | null; onPick: (id: string) => void }) {
  const got = useData<{ messages: Talk[] }>(sid ? `/chat/sessions/${sid}` : null)
  if (sid && !got) return null
  return <Panel sid={sid} initial={got?.messages ?? []} list={list} here={here} onPick={onPick} />
}
