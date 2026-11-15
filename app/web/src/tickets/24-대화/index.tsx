// astryx template: ai-chat, ai-chat-landing — 대화 열(ai-chat)과 빈 대화(ai-chat-landing)의 코드에서 출발. 벗어난 곳은 docs/design/components.md
// 24 대화: 모든 화면 오른쪽 끝의 대화 칸(App의 end, 폭 조절). 사람이 묻고 AI가 DB를 읽어 답한다.
// 대화는 역할마다 하나의 어시스턴트다(D67): 화면을 옮겨도 이어지고, 새 대화는 사람이 시작한다. 지금 보는 화면은 입력창의 문맥 카드로 늘 따라오고,
// 사람의 말마다 그때의 화면이 남는다. 대화는 그래프의 노드다(D61): 답이 끝날 때마다 저장하고 말마다 다룬 기록을 선으로 잇는다.
// AI의 도구 호출(조회 · 카드 · 서류 · 표시)은 부르는 순간 한 줄씩 보인다(서버의 data-step, 끝나면 걸린 시간). 조회문은 보이지 않고 읽은 기록의 이름만 보인다.
// AI는 답에 화면 부품(A2UI, data-a2ui)을 그릴 수 있다 — 앱의 부품 목록 안의 것만, 보기만(25-카드의 Surface). 말마다 시각(보낸 순간 · 답을 마친 순간)이 붙고 실패한 답은 표시된다.
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
import { ChatComposer, ChatComposerDrawer, ChatComposerInput, ChatLayout, ChatLayoutScrollButton, ChatMessage, ChatMessageBubble, ChatMessageList, ChatMessageMetadata, ChatSystemMessage, ChatTokenizedText, ChatToolCalls, useChatLayoutContext } from '@astryxdesign/core/Chat'
import { Timestamp } from '@astryxdesign/core/Timestamp'
import { Center } from '@astryxdesign/core/Center'
import { ClickableCard } from '@astryxdesign/core/ClickableCard'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { Heading } from '@astryxdesign/core/Text'
import { DocumentArrowUpIcon, InboxIcon, PaperClipIcon, SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline'
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
import { TypeaheadItem, type SearchableItem } from '@astryxdesign/core/Typeahead'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ASK, ASK_ANY, L } from '../../labels'
import { Kind, State } from '../../ui/Mark'
import { api, changedAtom, exampleAtom, menuAtom, roleAtom, rolesAtom, store, targetAtom, useData, type Target } from '../../state'
import { fail, nb, kind, plain } from '../../ui/status'
import { Card as ActionCard, Surface, type A2ui, type CardData } from '../25-카드'

/** 답에 붙는 조회한 기록(서버가 `data-reads`로 보낸다). go는 이름과 같은 순서의 여는 길(열 화면이 없는 기록은 null) */
/** 말에 붙은 문맥(보낸 말 위에 그대로 남는다): 종류 · id · 이름 */
type Ctx = { kind: string; id: string; name: string }
/** 도구 호출 한 줄(서버의 data-step, 같은 id로 진행 → 완료): 도구의 낱말, 상태, 읽은 기록의 이름과 여는 길, 걸린 시간(밀리초) */
type Step = { tool: string; state: 'run' | 'done' | 'fail'; names: string[]; go: (Target | null)[]; ms?: number | null }
/** 말의 메타데이터: 문맥(보낸 말), 시각(보낸 순간 · 서버가 답을 마친 순간, ISO), 실패의 낱말(AI 답). 옛 말에는 시각이 없다 */
type Meta = { ctx?: Ctx[]; at?: string; fail?: string | null }
type Talk = UIMessage<Meta, { reads: { names: string[]; go?: (Target | null)[] }; card: CardData; doc: { id: string; name: string }; step: Step; a2ui: { messages: A2ui[] } }>
/** 도구 줄의 걸린 시간(템플릿 ai-chat의 duration 꼴: 45ms · 3.2s) */
const took = (ms?: number | null) => (ms == null ? undefined : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`)

/** 칩에 보이는 이름. 아직 받지 못했거나 모르면 id */
const key = (t: Target) => `${t.kind}/${t.id}`
const same = (a: Target, b: Target) => a.kind === b.kind && a.id === b.id
/** 글 줄 안(보낸 말의 칩)의 기록 종류: 선 아이콘 16px, 종류 색(ui/status의 kind). 모르는 종류는 문서 아이콘 */
const kindIcon = (k: string) => {
  const c = kind(k)
  return <Icon icon={c?.icon ?? DocumentTextIcon} size="sm" color={c?.color} />
}
/** 카드 · 항목 첫머리(`@` 메뉴 줄 · 문맥 칸의 붙인 기록)의 종류: 색 타일 한 크기(Kind sm 28) */
const kindTile = (k: string) => (kind(k) ? <Kind of={k} size="sm" /> : <Icon icon={DocumentTextIcon} size="md" />)
/** `@`로 찾은 기록(서버 /chat/find): 칩의 이름(name) 외에 줄의 제목(title)과 대리점 · 귀속월 · 상태(있는 것만) */
type Found = Ctx & { title?: string; dealer?: string; ym?: string; state?: string }
/** 줄의 설명: 종류 · 귀속월 · 상태(기본 상태 — 대기 · 일치 · 접수 — 는 쓰지 않는다, ui/Mark의 State와 같다) */
const about = (f: Found) => [f.kind, f.ym, plain(f.state) ? null : f.state].filter(Boolean).join(' · ')
/** 메뉴 줄 · 문맥 칸 카드의 꼴(TypeaheadItem: 종류 타일 · 제목 · 설명) */
const FoundItem = ({ f }: { f: Found }) => <TypeaheadItem item={{ id: `${f.kind}/${f.id}`, label: f.title ?? f.name }} icon={kindTile(f.kind)} description={about(f)} />
/** `@`로 붙일 기록 찾기: 이름 · 귀속월(`2026-01`, `1월`) · 종류 · 상태로 찾는다. 빈 찾기는 지금 보는 기록(near)과 같은 대리점의 기록이 먼저.
 *  줄은 종류마다 묶고(auxiliaryData.group), 목록은 메뉴 안에서 스크롤한다(메뉴 높이는 부품의 것) */
const records = {
  search: async (q: string): Promise<SearchableItem<Found>[]> => {
    const t = store.get(targetAtom)
    const near = t ? `&near=${encodeURIComponent(key(t))}` : ''
    return (await api<{ items: Found[] }>(`/chat/find?q=${encodeURIComponent(q)}${near}`)).items.map((i) => ({ id: `${i.kind}/${i.id}`, label: i.title ?? i.name, auxiliaryData: { ...i, group: i.kind } }))
  },
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

/** 저장할 말: 파일 파트는 이름만 남긴다(내용 data URL은 저장하지 않는다 — 다시 열어도 붙임 칩은 보이고, 서버는 빈 url을 파일로 읽지 않는다) */
const lean = (ms: Talk[]) => ms.map((m) => ({ ...m, parts: m.parts.map((p) => (p.type === 'file' ? { ...p, url: '' } : p)) }))

/** here: 지금 연 기록을 다룬 대화(기록을 열지 않았으면 null). 대화 목록 창은 이것(`기록`)부터 보이고 `전체`로 바꾼다 — 지난 대화의 입구는 이 창 하나 */
function Panel({ sid, initial, list, here, onPick }: { sid: string | null; initial: Talk[]; list: Sess[]; here: Sess[] | null; onPick: (id: string) => void }) {
  const target = useAtomValue(targetAtom)
  // 이 대화의 id: 새 대화면 첫 말을 보낼 때 서버에 만든다(만든 뒤에도 칸은 그대로 — 다시 그리지 않는다)
  const session = useRef<string | null>(sid)
  const [history, setHistory] = useState(false)
  const [scope, setScope] = useState<'here' | 'all'>(here ? 'here' : 'all')
  const past = scope === 'here' && here ? here : list
  // `@`로 붙인 기록(문맥 칸의 카드 — 사람이 넣은 것만, D67)
  const [pinned, setPinned] = useState<Found[]>([])
  const [text, setText] = useState('')
  const [kept, setKept] = useState<{ state?: string; error?: string } | null>(null)
  const [keeping, setKeeping] = useState(false)
  // 맨 아래로: 보낼 때 · 보고를 남길 때 늘린다(위로 올려 둔 채 보내도 새 말이 보이게)
  const [bump, setBump] = useState(0)
  // 문맥 칸 접기(사람이 누른 것). `@`로 찾는 동안에는 찾기 목록이 문맥 카드를 덮지 않게 접는다
  const [folded, setFolded] = useState(false)
  const mention = /(^|\s)@[^\s@]*$/.test(text)
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
  const menu = useAtomValue(menuAtom)
  // 지금 보는 화면은 카드 없이 요청에 함께 보낸다(서버가 문맥으로 쓴다, D67): 연 기록, 목록 화면이면 메뉴 이름
  const now = target
  const view = !target ? menu : null
  // 보던 기록의 이름(보낸 말의 칩 — 제목 줄과 같은 이름)은 서버에서 받아 둔다
  const [named, setNamed] = useState<Record<string, string | null>>({})
  const want = [target].filter((t): t is Target => !!t && !(key(t) in named))
  const wantKey = want.map(key).join('|')
  useEffect(() => {
    if (!want.length) return
    api<{ names: (string | null)[] }>(`/chat/names?items=${encodeURIComponent(JSON.stringify(want))}`).then(
      (r) => setNamed((n) => ({ ...n, ...Object.fromEntries(want.map((t, i) => [key(t), r.names[i] ?? null])) })),
      () => {},
    )
  }, [wantKey])
  const shown = (t: Target) => `${t.kind} ${named[key(t)] ?? t.id}`.trim()
  ctx.current = { target: now, attach: pinned.map(({ kind, id }) => ({ kind, id })) }
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
  // 대화 전체를 저장한다: 제목은 첫 말, 다룬 기록은 문맥·붙임, 읽은 기록은 답 아래의 조회(D61)
  const save = (all: Talk[]) => {
    const id = session.current
    if (!id) return
    const first = all.find((m) => m.role === 'user')?.parts.map((p) => (p.type === 'text' ? p.text : '')).join('') ?? ''
    const reads = all.flatMap((m) => m.parts.flatMap((p) => (p.type === 'data-reads' ? (p.data.go ?? []).filter((g): g is Target => !!g) : [])))
    const about = [...new Map(all.flatMap((m) => (m.metadata?.ctx ?? []).filter((c) => c.id).map(({ kind, id }) => [key({ kind, id }), { kind, id }] as const))).values()]
    api(`/chat/sessions/${id}`, { messages: lean(all), title: first.replace(/\s+/g, ' ').trim().slice(0, 40), about, reads }, 'PUT').catch(() => {})
  }
  const { messages, setMessages, sendMessage, status, error, clearError } = useChat<Talk>({
    transport,
    messages: initial,
    // 답이 끝날 때마다 저장한다
    onFinish: ({ messages: all }) => save(all),
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
    // 이 말을 할 때 보던 화면(목록이면 메뉴 이름)과 붙인 기록 — 말 위에 남고 서버가 AI에게도 전한다
    const used: Ctx[] = [...(view ? [{ kind: view, id: '', name: '' }] : []), ...(now ? [{ ...now, name: named[key(now)] ?? now.id }] : []), ...pinned.map(({ kind, id, name }) => ({ kind, id, name }))]
    const files = file ? (() => { const d = new DataTransfer(); d.items.add(file); return d.files })() : undefined
    sendMessage({ text: value.trim(), files, metadata: { ctx: used, at: new Date().toISOString() } })
    setBump((n) => n + 1)
    setText('')
    setFile(null)
    setTooBig(false)
    if (pick.current) pick.current.value = ''
  }
  // ai-chat-landing의 applySuggestion: 제안을 입력창에 넣는다(보내지 않는다 — 사람이 고쳐 보낸다)
  const applySuggestion = (prompt: string) => {
    const el = input.current
    if (!el) return
    el.focus()
    if (document.activeElement) window.getSelection()?.selectAllChildren(document.activeElement)
    el.insertText(prompt)
  }
  // 조치 카드를 실행하면 그 카드를 실행됨으로 대화에 저장한다(다시 열어도 실행됨 — 입력칸 · 실행 단추로 돌아가지 않는다)
  const ran = (c: CardData) => {
    const next = messages.map((m) => ({ ...m, parts: m.parts.map((p) => (p.type === 'data-card' && p.data.kind === c.kind && p.data.id === c.id && p.data.action === c.action ? { ...p, data: { ...p.data, done: true } } : p)) }))
    setMessages(next)
    save(next)
  }
  // 보고로 남기기의 대상은 정황이다(열어 둔 정황, 없으면 붙인 정황)
  const signal = [now, ...pinned].some((t) => t?.kind === L.정황)
  const answered = messages.some((m) => m.role === 'assistant' && m.parts.some((p) => p.type === 'text' && p.text))
  const keep = async () => {
    setKeeping(true)
    setKept(null)
    setBump((n) => n + 1)
    try {
      const body = { messages: messages.slice(-20).map(({ role, parts }) => ({ role, parts: parts.filter((p) => p.type === 'text') })), ...ctx.current }
      setKept({ state: (await api<{ state: string }>('/chat/report', body)).state })
    } catch (e) {
      setKept({ error: word(e as Error) })
    } finally {
      setKeeping(false)
      setBump((n) => n + 1)
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
                {/* 제목 줄 높이는 대화가 없어도 같게 — 첫 질문이 없으면 새 대화 */}
                <Text type="supporting" color="secondary" maxLines={1}>
                  {title || `${L.새} ${L.대화}`}
                </Text>
              </VStack>
            </StackItem>
            <IconButton label={`${L.대화} ${L.목록}`} tooltip={`${L.대화} ${L.목록}`} variant="ghost" size="sm" icon={<Icon icon={ClockIcon} size="sm" />} onClick={() => setHistory(true)} />
            <IconButton label={`${L.새} ${L.대화}`} tooltip={`${L.새} ${L.대화}`} variant="ghost" size="sm" icon={<Icon icon={PencilSquareIcon} size="sm" />} onClick={() => onPick('')} />
          </HStack>
          {/* 대화 목록 창(DialogScrollingContent 블록 꼴): 머리 · 갈래 단추 · 목록의 왼쪽 끝을 한 줄에(List edge="outset") */}
          <Dialog isOpen={history} onOpenChange={setHistory} width={480}>
            <Layout
              header={<DialogHeader title={`${L.대화} ${L.목록}`} onOpenChange={setHistory} />}
              content={
            <LayoutContent>
            <VStack gap={3}>
            {here && (
              <HStack>
              <SegmentedControl label={`${L.대화} ${L.목록}`} value={scope} onChange={(v) => setScope(v as typeof scope)} size="sm">
                <SegmentedControlItem label={L.기록} value="here" />
                <SegmentedControlItem label={L.전체} value="all" />
              </SegmentedControl>
              </HStack>
            )}
            {past.length ? (
              <List hasDividers edge="flush">
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
            </VStack>
            </LayoutContent>
              }
            />
          </Dialog>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
        {/* ChatLayout은 flex 1로 높이를 채운다: 세로 Stack(높이 100%) 안에 둔다 */}
        <VStack height="100%">
        <ChatLayout
          scrollButton={<Jump bump={bump} />}
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
                      renderItem: (item) => <FoundItem f={item.auxiliaryData as Found} />,
                      menuLabel: L.기록,
                      onSelect: (item) => {
                        const c = item.auxiliaryData as Found
                        setPinned((p) => (p.some((x) => same(x, c)) ? p : [...p, c].slice(-5)))
                        return ''
                      },
                    },
                  ]}
                  onFiles={(fs) => choose(fs[0] ?? null)}
                />
              }
              drawer={
                // 문맥 칸: 사람이 넣은 것만 — `@`로 붙인 기록과 올릴 서류, 각각 X로 뺀다(D67). 아무것도 없으면 칸을 두지 않는다
                (pinned.length > 0 || file) && (
                  <ChatComposerDrawer label={L.문맥} count={pinned.length + (file ? 1 : 0)} isCollapsed={folded || mention} onCollapsedChange={setFolded}>
                    {/* 서랍 안 내용은 제 폭만큼이라 X가 카드 끝에 붙지 않았다 — 칸 폭을 채운다 */}
                    <VStack gap={1} width="100%">
                      {pinned.map((t) => (
                        <HStack key={key(t)} gap={2} vAlign="center">
                          <StackItem size="fill">
                            <FoundItem f={t} />
                          </StackItem>
                          <IconButton label={L.빼기} tooltip={L.빼기} variant="ghost" size="sm" icon={<Icon icon={XMarkIcon} size="sm" />} onClick={() => setPinned(pinned.filter((p) => !same(p, t)))} />
                        </HStack>
                      ))}
                      {file && (
                        <HStack gap={2} vAlign="center">
                          <StackItem size="fill">
                            <TypeaheadItem item={{ id: 'file', label: file.name }} icon={kindTile(L.서류)} description={L.서류} />
                          </StackItem>
                          <IconButton label={L.빼기} tooltip={L.빼기} variant="ghost" size="sm" icon={<Icon icon={XMarkIcon} size="sm" />} onClick={() => choose(null)} />
                        </HStack>
                      )}
                    </VStack>
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
            // ai-chat-landing에서 벗어남(components.md): 인사와 큰 제목은 두지 않는다 — 제안 카드만 — 연 기록이 있으면 그 기록 이야기, 없으면 일반 제안
            (
              <Section variant="transparent" padding={4}>
                <Grid columns={{ minWidth: 200 }} gap={3}>
                  {Object.entries(now ? ASK : ASK_ANY).map(([name, prompt]) => (
                    <ClickableCard key={name} label={name} padding={3} variant="muted" isDisabled={busy} onClick={() => applySuggestion(prompt)}>
                      {/* 주제의 색 면 타일(work-item-detail 첨부 카드의 타일 꼴, 색은 ui/status.ts의 kind) */}
                      <HStack gap={4} vAlign="center">
                        <Kind of={name} size="sm" />
                        <StackItem size="fill">
                          <VStack gap={0.5}>
                            <Heading level={4}>{name}</Heading>
                            <Text type="supporting" color="secondary">{prompt}</Text>
                          </VStack>
                        </StackItem>
                      </HStack>
                    </ClickableCard>
                  ))}
                </Grid>
              </Section>
            )
          }
        >
          {messages.length > 0 || error ? (
          <ChatMessageList isStreaming={busy}>
            {/* ai-chat: 맨 위 날짜 구분선 — 이 대화의 날짜(새 대화면 오늘) */}
            <ChatSystemMessage variant="divider">{(list.find((x) => x.id === session.current)?.updated ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })).slice(0, 10)}</ChatSystemMessage>
            {messages.map((m) => {
              const steps = m.parts.flatMap((p) => (p.type === 'data-step' ? [{ id: p.id ?? '', ...p.data }] : []))
              const cards = m.parts.flatMap((p) => (p.type === 'data-card' ? [p.data] : []))
              const surfaces = m.parts.flatMap((p) => (p.type === 'data-a2ui' ? [{ id: p.id ?? '', ...p.data }] : []))
              const body = m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')
              const ai = m.role === 'assistant'
              const empty = ai && !body && !steps.length && !cards.length && !surfaces.length
              // 말의 시각과 상태: 템플릿처럼 마지막 말풍선의 metadata. 시각이 없는 옛 말은 두지 않는다
              const at = m.metadata?.at
              const meta = at || m.metadata?.fail ? <ChatMessageMetadata timestamp={at ? <Timestamp value={at} format="time" timezoneID="Asia/Seoul" /> : undefined} status={m.metadata?.fail ? fail : undefined} /> : undefined
              // 말풍선: 글 · 화면 부품 · 조치 카드 순서
              const bubbles = [
                ...(body ? [{ key: 'text', wide: false, node: ai ? <Markdown density="compact" isStreaming={busy}>{body}</Markdown> : <ChatTokenizedText>{body}</ChatTokenizedText> }] : []),
                ...surfaces.map((x) => ({ key: `a2ui/${x.id}`, wide: true, node: <Surface messages={x.messages} /> })),
                ...cards.map((c) => ({ key: `${c.kind}/${c.id}/${c.action}`, wide: true, node: <ActionCard card={c} onDone={() => ran(c)} /> })),
              ]
              // 답이 오기 전의 빈 AI 말: 마지막이고 받는 중이면 응답 대기 줄 하나, 아니면 그리지 않는다(아바타가 둘이 되지 않게)
              if (empty && !(busy && m === messages.at(-1))) return null
              if (empty)
                return (
                  <ChatMessage key={m.id} sender="assistant" avatar={AI_MARK}>
                    <ChatToolCalls calls={[{ key: 'wait', name: L.응답, status: 'running' }]} />
                  </ChatMessage>
                )
              return (
                <ChatMessage
                  key={m.id}
                  sender={ai ? 'assistant' : 'user'}
                  avatar={ai ? AI_MARK : null}
                >
                  {/* 보낸 말에 붙었던 문맥과 서류(카드 그대로 남는다) */}
                  {!ai && (m.metadata?.ctx?.length || m.parts.some((p) => p.type === 'file')) ? (
                    <HStack gap={1} wrap="wrap" hAlign="end">
                      {m.metadata?.ctx?.map((c) => (
                        <Token key={key(c)} icon={kindIcon(c.kind)} label={c.name || c.kind} size="sm" onClick={c.id ? () => store.set(targetAtom, { kind: c.kind, id: c.id }) : undefined} />
                      ))}
                      {m.parts.map((p) => (p.type === 'file' ? <Token key={p.url.slice(-40) + p.filename} icon={<Icon icon={DocumentTextIcon} size="sm" />} label={p.filename ?? L.서류} size="sm" /> : null))}
                    </HStack>
                  ) : null}
                  {/* AI의 도구 호출: 부르는 순간 한 줄(진행 → 완료). 조회는 읽은 기록의 이름, 펼치면 기록마다 여는 링크 */}
                  {/* 대화 칸 폭 안에서: 도구 줄은 제 글 폭만큼 넓어져 긴 이름이 칸 오른쪽에서 잘렸다 — 칸 폭(maxWidth)으로 막으면 이름이 말줄임된다 */}
                  {steps.length > 0 && (
                    <VStack maxWidth="100%">
                      <ChatToolCalls
                        label={`${L.도구} ${steps.length}`}
                        calls={steps.map((x) => ({
                          key: x.id,
                          name: x.tool,
                          status: x.state === 'run' ? ('running' as const) : x.state === 'fail' ? ('error' as const) : ('complete' as const),
                          duration: x.state === 'done' ? took(x.ms) : undefined,
                          // 이름이 없는 조회(개수 세기 등)는 이름 칸을 두지 않는다
                          target: uniq(x.names).length > 2 ? `${uniq(x.names).slice(0, 2).join(' · ')} ${L.외} ${uniq(x.names).length - 2}` : x.names.length ? uniq(x.names).join(' · ') : undefined,
                          resultDetail: x.names.length ? (
                            <VStack gap={1}>
                              {uniq(x.names).map((name) => {
                                const go = x.go[x.names.indexOf(name)]
                                return go ? <Link key={name} type="supporting" onClick={() => store.set(targetAtom, go)}>{name}</Link> : <Text key={name} type="supporting">{name}</Text>
                              })}
                          </VStack>
                        ) : undefined,
                      }))}
                    />
                    </VStack>
                  )}
                  {bubbles.map((b, i) => (
                    <ChatMessageBubble key={b.key} variant={ai ? 'ghost' : undefined} width={b.wide ? '100%' : undefined} metadata={i === bubbles.length - 1 ? meta : undefined}>
                      {b.node}
                    </ChatMessageBubble>
                  ))}
                  {/* 말풍선 없이 끝난 답(도구 줄만 — 실패한 답): 시각과 상태는 말 끝에 */}
                  {!bubbles.length && meta}
                </ChatMessage>
              )
            })}
            {busy && messages.at(-1)?.role === 'user' && (
              <ChatMessage sender="assistant" avatar={AI_MARK}>
                <ChatToolCalls calls={[{ key: 'wait', name: L.응답, status: 'running' }]} />
              </ChatMessage>
            )}
            {keeping && (
              <ChatMessage sender="assistant" avatar={AI_MARK}>
                <ChatToolCalls calls={[{ key: 'keep', name: L.보고, status: 'running' }]} />
              </ChatMessage>
            )}
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

/** 같은 이름을 한 번만(도구 줄의 이름 반복 제거) */
const uniq = (a: string[]) => [...new Set(a)]

/** 맨 아래로 가는 단추: 맨 아래에 있으면 보이지 않는다(템플릿 기본은 '새 메시지' 표지가 맨 아래에서도 남아 답 끝을 가린다).
 *  bump가 바뀌면(보냄 · 보고) 그리고 대화를 열 때 맨 아래로 간다 — 위로 올려 둔 채 보내도 새 말이 보이고, 다시 연 대화는 마지막 말부터 보인다 */
function Jump({ bump }: { bump: number }) {
  const box = useChatLayoutContext()!.scrollContainerRef
  const [away, setAway] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const on = () => setAway(el.scrollHeight - el.scrollTop - el.clientHeight > 48)
    on()
    el.addEventListener('scroll', on, { passive: true })
    const ro = new ResizeObserver(on)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', on); ro.disconnect() }
  }, [box])
  const down = useCallback(() => box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }), [box])
  // 그린 뒤(말 · 표가 높이를 정한 뒤) 맨 아래로
  useEffect(() => {
    const id = requestAnimationFrame(() => box.current?.scrollTo({ top: box.current.scrollHeight }))
    return () => cancelAnimationFrame(id)
  }, [bump, box])
  return <ChatLayoutScrollButton isVisible={away} onClick={down} />
}

// AI의 말 표지: 헤더 · AI 카드와 같은 반짝이 아이콘(이름 첫 글자 아바타는 뜻이 없다). 답의 첫 줄은 언제나 도구 줄(조회 · 응답, 높이 40px)이므로 그 줄의 가운데에 둔다
const AI_MARK = (
  <Center width={32} height={40}>
    <Icon icon={SparklesIcon} size="sm" color="accent" />
  </Center>
)

/**
 * 대화 칸(astryx ai-chat 템플릿의 대화 열): 모든 화면의 오른쪽 끝에 붙고 입력창이 늘 보인다.
 * 역할마다 하나의 대화(D67): 이 역할의 가장 최근 대화를 이어 열고, 화면을 옮겨도 다시 그리지 않는다. `새 대화`나 목록에서 고르면 그것을 연다
 */
export function Chat() {
  const role = useAtomValue(roleAtom)
  const target = useAtomValue(targetAtom)
  // 안내의 예시 장면이 바뀌면(문제가 드러난 뒤 예시 대화가 생긴다) 대화 칸을 다시 그린다
  const ex = useAtomValue(exampleAtom)
  return <For key={`${role}/${(ex?.['#'] as string | undefined) ?? ''}`} target={target} />
}

function For({ target }: { target: Target | null }) {
  // 연 대화: 처음 한 번만 기본값(이어 하기)으로 정하고, 그 뒤에는 사람이 고를 때만 바뀐다 — 첫 말로 새 대화가 생겨 목록이 바뀌어도 칸을 다시 그리지 않는다(답이 끊기지 않게)
  const [open, setOpen] = useState<{ sid: string | null; n: number } | null>(null)
  const all = useData<{ sessions: Sess[] }>(`/chat/sessions?n=${open?.n ?? 0}`)
  const of = useData<{ sessions: Sess[] }>(target ? `/chat/sessions?of=${encodeURIComponent(key(target))}` : null)
  const pick = (id: string) => setOpen((o) => ({ sid: id || null, n: (o?.n ?? 0) + 1 }))
  // 기록을 다룬 대화 목록(of)은 대화 목록 창의 `기록` 탭에만 쓴다 — 기다리지 않는다(기다리면 칸이 사라졌다 다시 생겨 진행 중인 대화를 잃는다)
  if (!all) return null
  if (!open) {
    // 역할의 가장 최근 대화를 이어 연다(화면을 옮겨도 그대로)
    setOpen({ sid: all.sessions[0]?.id ?? null, n: 0 })
    return null
  }
  return <Load key={open.n} sid={open.sid} list={all.sessions} here={target ? of?.sessions ?? null : null} onPick={pick} />
}

function Load({ sid, list, here, onPick }: { sid: string | null; list: Sess[]; here: Sess[] | null; onPick: (id: string) => void }) {
  const got = useData<{ messages: Talk[] }>(sid ? `/chat/sessions/${sid}` : null)
  if (sid && !got) return null
  return <Panel sid={sid} initial={got?.messages ?? []} list={list} here={here} onPick={onPick} />
}
