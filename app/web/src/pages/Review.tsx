// 심사 기록: astryx detail-page 템플릿에서 출발한 화면. 머리(← 작업 · n/전체 · 앞 뒤 / 제목 / 메타 한 줄 / 페이지 조치 / 탭) → 본문 영역 → 오른쪽 레일(요약 · AI 보고).
// 좁으면(본문이 레일과 나란히 설 수 없으면) 레일이 본문 아래로 간다. 조치는 누를 때 확인 창에서 사유(분류 · 메모)를 받는다.
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, Layout, LayoutContent, LayoutHeader, LayoutPanel, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Heading, Text } from '@astryxdesign/core/Text'
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, ViewColumnsIcon } from '@heroicons/react/24/outline'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Fragment, type ReactNode, useState } from 'react'
import { L } from '../labels'
import { api, changedAtom, menuAtom, navAtom, store, targetAtom, useData } from '../state'
import { Confirm } from '../ui/Confirm'
import { Empty } from '../ui/Empty'
import { grade } from '../ui/grade'
import { Mark } from '../ui/Mark'
import { Pill } from '../ui/Pill'
import { type Draft, Reason, blank, ready, sent } from '../ui/Reason'
import { Source } from '../ui/Source'
import { num } from '../ui/Table'
import { Line, Links, Members, Rules } from '../tickets/04-심사'
import { bundled, useReview } from '../tickets/04-심사/review'
import { History, useResubmit } from '../tickets/06-반려'
import { Then } from '../tickets/09-재검토'
import { Way } from '../tickets/10-추인'
import { Flags } from '../tickets/11-정황'
import { OfReview } from '../tickets/12-가설'
import { Picture } from '../tickets/16-경위'
import type { Report } from '../tickets/17-보고/report'

const tones = { [L.대기]: 'wait', [L.승인]: 'good', [L.보류]: 'hold', [L.반려]: 'bad' } as const

const Bullet = () => (
  <Text type="supporting" color="secondary">
    {'・'}
  </Text>
)

/** 메타 한 줄의 값: 이름표(보조) + 값 */
const Fact = ({ name, children }: { name: string; children: ReactNode }) => (
  <HStack gap={1} vAlign="center">
    <Text type="body" color="secondary">
      {name}
    </Text>
    <Text type="body" hasTabularNumbers>
      {children}
    </Text>
  </HStack>
)

/** ← 작업 · n/전체 · ‹ › : 작업 목록에서 열었을 때의 순서를 따라 앞뒤로 간다 */
function Back() {
  const nav = useAtomValue(navAtom)
  const [target, setTarget] = useAtom(targetAtom)
  const setMenu = useSetAtom(menuAtom)
  const at = nav.findIndex((t) => t.kind === target?.kind && t.id === target?.id)
  return (
    <HStack gap={2} vAlign="center">
      <Link color="secondary" onClick={() => (setMenu(L.작업), setTarget(null))}>
        <HStack gap={1} vAlign="center">
          <Icon icon={ArrowLeftIcon} size="sm" color="inherit" />
          {L.작업}
        </HStack>
      </Link>
      {at >= 0 && (
        <>
          <Bullet />
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {at + 1}/{nav.length}
          </Text>
          <Button label={L.앞} variant="ghost" size="sm" isIconOnly icon={<Icon icon={ChevronLeftIcon} size="sm" />} isDisabled={at === 0} onClick={() => setTarget(nav[at - 1])} />
          <Button label={L.뒤} variant="ghost" size="sm" isIconOnly icon={<Icon icon={ChevronRightIcon} size="sm" />} isDisabled={at === nav.length - 1} onClick={() => setTarget(nav[at + 1])} />
        </>
      )}
    </HStack>
  )
}

/** 페이지 조치 하나: 누르면 확인 창. 분류가 있는 조치는 창에서 사유를 고르고(필수이면 고를 때까지 실행이 눌리지 않는다), 서버가 거절하면 그 낱말을 `bad`로 */
function Act({ kind, classes, must, send }: { kind: string; classes: string[]; must: boolean; send: (reason: object | null) => Promise<unknown> }) {
  const r = useReview()!.review
  const [draft, setDraft] = useState<Draft>(blank)
  return (
    <Confirm label={kind} variant={grade(kind)} title={`${kind} · ${r.name}`} rows={[[L.귀속월, r.ym], [L.합산, num(r.total)]]} canConfirm={ready(kind, must, draft)}
      onConfirm={() => send(sent(draft)).finally(() => setDraft(blank))}
    >
      {classes.length > 0 && <Reason groups={[{ of: kind, classes }]} value={draft} onChange={setDraft} />}
    </Confirm>
  )
}

/** 오른쪽 위 페이지 조치: 보조 조치가 앞, 주 버튼(승인 · 재상신)이 맨 끝. 할 수 있는 것이 없으면 두지 않는다 */
function Actions({ onBad }: { onBad: (word: string | null) => void }) {
  const r = useReview()
  const s = useResubmit()
  if (!r) return null
  const fail = (e: Error) => {
    onBad(e.message)
    store.set(changedAtom, (n) => n + 1)
  }
  const go = (path: string, body: object) => (onBad(null), api(path, body).catch(fail))
  const acts = r.actions.filter((a) => !bundled.includes(a.kind)).sort((a, b) => (grade(a.kind) === 'primary' ? 1 : 0) - (grade(b.kind) === 'primary' ? 1 : 0))
  return (
    <HStack gap={2}>
      {acts.map((a) => (
        <Act key={a.kind} kind={a.kind} classes={a.classes} must={a.reason} send={(reason) => go('/decide', { ids: [r.review.id], kind: a.kind, reason: reason ?? undefined })} />
      ))}
      {s?.can && <Act kind={L.재상신} classes={s.classes} must send={(reason) => go('/resubmit', { id: s.id, reason })} />}
    </HStack>
  )
}

function Header({ tab, onTab, onRail, narrow }: { tab: string; onTab: (v: string) => void; onRail: () => void; narrow: boolean }) {
  const r = useReview()?.review
  const [bad, setBad] = useState<{ id: string; word: string } | null>(null)
  if (!r) return null
  const facts: ReactNode[] = [
    <Pill tone={tones[r.status as keyof typeof tones] ?? 'wait'}>{r.status}</Pill>,
    <Fact name={L.합산}>{num(r.total)}</Fact>,
    // 원본의 과거 승인에는 적용한 규칙의 기록이 없다(09)
    <Fact name={L.한도}>{r.limit === null ? L.미상 : num(r.limit)}</Fact>,
    <Fact name={L.승인권자}>{r.approver}</Fact>,
    ...r.marks.map((m) => <Mark>{m}</Mark>),
    <Source kind={r.source} file={r.file ?? undefined} row={r.row ?? undefined} tip={`${L.합산} · ${L.승인권자}`}
      rows={[
        [L.합산, L['귀속월 지급의 합, 반려 제외']],
        [L.승인권자, L['한도 이하 영업지원, 초과 영업임원']],
      ]}
    />,
  ]
  return (
    <LayoutHeader hasDivider padding={4} paddingBlockEnd={0}>
      <VStack gap={3}>
        <HStack gap={4} vAlign="start">
          <StackItem size="fill">
            <VStack gap={0}>
              <Back />
              <Heading level={1} maxLines={1}>
                {r.name} · {r.ym}
              </Heading>
              <HStack gap={1} vAlign="center" wrap="wrap">
                {facts.map((f, i) => (
                  <Fragment key={i}>
                    {i > 0 && <Bullet />}
                    {f}
                  </Fragment>
                ))}
              </HStack>
            </VStack>
          </StackItem>
          <VStack gap={2} hAlign="end">
            <Actions onBad={(word) => setBad(word ? { id: r.id, word } : null)} />
            {bad?.id === r.id && <Pill tone="bad">{bad.word}</Pill>}
          </VStack>
        </HStack>
        <HStack vAlign="center">
          <StackItem size="fill">
            <TabList value={tab} onChange={onTab} size="lg" isFullBleed>
              <Tab value="body" label={L.내용} />
              <Tab value="trail" label={L.경위} />
              <Tab value="history" label={L.이력} />
            </TabList>
          </StackItem>
          {!narrow && <Button label={L.요약} variant="ghost" icon={<Icon icon={ViewColumnsIcon} size="sm" />} isIconOnly onClick={onRail} />}
        </HStack>
      </VStack>
    </LayoutHeader>
  )
}

/** 레일의 요약: 본문을 읽기 전에 볼 값 */
function Summary() {
  const r = useReview()
  if (!r) return null
  const last = r.history.at(-1)
  return (
    <VStack gap={3}>
    <MetadataList columns="single" label={{ position: 'start', width: 72 }}>
      <MetadataListItem label={L.귀속월}>{r.review.ym}</MetadataListItem>
      <MetadataListItem label={L.구성}>{r.members.map((m) => m.name).join(' · ')}</MetadataListItem>
      <MetadataListItem label={L.담당}>{r.review.holder}</MetadataListItem>
      <MetadataListItem label={L.결정}>{last ? <Line d={last} /> : L.없음}</MetadataListItem>
    </MetadataList>
    {/* 이 심사가 든 추인 묶음(10): 있으면 그리로 가는 링크 */}
    <Way />
    </VStack>
  )
}

/** AI 보고 한 건: 그 정황의 가장 새 보고. 사실 · 추정 · 미확인만 읽기로(채택 · 불채택은 정황 기록에서) */
function SignalReport({ id, name }: { id: string; name: string }) {
  const d = useData<Report>(`/signals/${encodeURIComponent(id)}/report`)
  const setTarget = useSetAtom(targetAtom)
  const r = d?.report
  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Link weight="medium" onClick={() => setTarget({ kind: L.정황, id })}>
          {name}
        </Link>
        <Pill tone={r?.state === L.채택 ? 'good' : r?.state === L.오류 || r?.state === L.불채택 ? 'bad' : 'wait'}>{r?.state ?? L.대기}</Pill>
        <Source kind={L.AI} tip={r?.model ?? undefined} rows={[[L.모델, r?.model ?? L.없음], [L.날짜, r?.at ?? L.없음], [L.조회, String(r?.reads ?? L.없음)]]} />
      </HStack>
      {r && r.facts.length > 0 && (
        <MetadataList columns="single" label={{ position: 'top' }}>
          <MetadataListItem label={L.사실}>
            <ul className="flex flex-col gap-1 break-keep">{r.facts.map((f, i) => <li key={i}>{f.text}</li>)}</ul>
          </MetadataListItem>
          {r.guess.length > 0 && (
            <MetadataListItem label={L.추정}>
              <ul className="flex flex-col gap-1 break-keep">{r.guess.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </MetadataListItem>
          )}
          {r.unknown.length > 0 && (
            <MetadataListItem label={L.미확인}>
              <ul className="flex flex-col gap-1 break-keep">{r.unknown.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </MetadataListItem>
          )}
        </MetadataList>
      )}
    </VStack>
  )
}

/** 레일의 AI 보고: 이 심사에 걸린 정황마다 그 보고. 정황이 없으면 없음 */
function Reports() {
  const r = useReview()?.review
  const list = useData<{ id: string; name: string }[]>(r?.marks.includes(L.정황) ? `/reviews/${r.id}/signals` : null)
  if (!r?.marks.includes(L.정황) || !list?.length) return <Empty />
  return (
    <VStack gap={4}>
      {list.map((s) => (
        <SignalReport key={s.id} id={s.id} name={s.name} />
      ))}
    </VStack>
  )
}

function Rail() {
  return (
    <VStack gap={4}>
      <Collapsible trigger={<Heading level={4}>{L.요약}</Heading>} defaultIsOpen>
        <Summary />
      </Collapsible>
      <Collapsible trigger={<Heading level={4}>{`${L.AI} ${L.보고}`}</Heading>} defaultIsOpen={false}>
        <Reports />
      </Collapsible>
    </VStack>
  )
}

export function Review() {
  const [tab, setTab] = useState('body')
  const [rail, setRail] = useState(true)
  // 1440(메뉴 220 · 대화 380)에서는 본문과 레일이 나란히, 그보다 좁으면 레일이 본문 아래로
  const narrow = useMediaQuery('(max-width: 1400px)')
  const r = useReview()
  if (!r) return null
  return (
    <Layout
      height="fill"
      contentWidth={1000}
      defaultHasDividers
      header={<Header tab={tab} onTab={setTab} onRail={() => setRail(!rail)} narrow={narrow} />}
      content={
        <LayoutContent role="main">
          <VStack gap={4}>
            {tab === 'body' && (
              <>
                <Then />
                <Members />
                <Links />
                <Rules />
                <Flags />
                <OfReview />
              </>
            )}
            {tab === 'trail' && <Picture />}
            {tab === 'history' && <History />}
            {narrow && <Rail />}
          </VStack>
        </LayoutContent>
      }
      end={!narrow && rail ? (
        <LayoutPanel width={320} padding={4} role="complementary">
          <Rail />
        </LayoutPanel>
      ) : undefined}
    />
  )
}
