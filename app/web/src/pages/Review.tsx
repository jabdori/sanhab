// 심사 기록: astryx detail-page 템플릿에서 출발한 화면. 머리(← 작업 · n/전체 · 앞 뒤 / 제목 / 메타 한 줄 / 페이지 조치 / 탭) → 본문(바탕 위의 카드들) → 오른쪽 레일(요약 · AI 보고 카드).
// 좁으면(본문이 레일과 나란히 설 수 없으면) 레일이 본문 아래로 간다. 조치는 누를 때 확인 창에서 사유(분류 · 메모)를 받는다.
import { Avatar } from '@astryxdesign/core/Avatar'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Citation } from '@astryxdesign/core/Citation'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Grid } from '@astryxdesign/core/Grid'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, Layout, LayoutContent, LayoutHeader, LayoutPanel, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { List, ListItem } from '@astryxdesign/core/List'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Heading, Text } from '@astryxdesign/core/Text'
import { ArrowLeftIcon, BuildingStorefrontIcon, ChevronLeftIcon, ChevronRightIcon, SparklesIcon, UserIcon, ViewColumnsIcon } from '@heroicons/react/24/outline'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Fragment, type ReactNode, useState } from 'react'
import { L } from '../labels'
import { api, changedAtom, menuAtom, navAtom, store, targetAtom, useData } from '../state'
import { Confirm } from '../ui/Confirm'
import { Empty } from '../ui/Empty'
import { grade } from '../ui/grade'
import { Mark } from '../ui/Mark'
import { type Draft, Reason, blank, ready, sent } from '../ui/Reason'
import { Region } from '../ui/Region'
import { Source } from '../ui/Source'
import { badge } from '../ui/status'
import { num } from '../ui/Table'
import { Line, Links, Members, Rules } from '../tickets/04-심사'
import { bundled, useReview } from '../tickets/04-심사/review'
import { History, useResubmit } from '../tickets/06-반려'
import { Then } from '../tickets/09-재검토'
import { Way } from '../tickets/10-추인'
import { Flags } from '../tickets/11-정황'
import { OfReview } from '../tickets/12-가설'
import { Picture, Timeline } from '../tickets/16-경위'
import type { Report } from '../tickets/17-보고/report'

const Bullet = () => (
  <Text type="supporting" color="secondary">
    {'・'}
  </Text>
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

/** 페이지 조치 하나: 누르면 확인 창. 분류가 있는 조치는 창에서 사유를 고르고(필수이면 고를 때까지 실행이 눌리지 않는다) */
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

/** 오른쪽 위 페이지 조치: 보조 조치가 앞, 주 버튼(승인 · 재상신)이 맨 끝. 서버가 거절하면 `onBad`로 그 낱말 */
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

/** 메타 한 줄의 항목: 아이콘 + 값 */
const Meta = ({ icon, children }: { icon: typeof UserIcon; children: ReactNode }) => (
  <HStack gap={1} vAlign="center">
    <Icon icon={icon} size="sm" color="secondary" />
    <Text>{children}</Text>
  </HStack>
)

function Header({ tab, onTab, onRail, narrow }: { tab: string; onTab: (v: string) => void; onRail: () => void; narrow: boolean }) {
  const r = useReview()
  const [bad, setBad] = useState<{ id: string; word: string } | null>(null)
  if (!r) return null
  const v = r.review
  const facts: ReactNode[] = [
    <Badge variant={badge(v.status)} label={v.status} />,
    <Meta icon={UserIcon}>{v.approver}</Meta>,
    <Meta icon={BuildingStorefrontIcon}>{`${r.members.length}${L.곳}`}</Meta>,
    ...v.marks.map((m) => <Mark>{m}</Mark>),
  ]
  return (
    <LayoutHeader hasDivider padding={4} paddingBlockEnd={0}>
      <VStack gap={3}>
        <HStack gap={4} vAlign="start">
          <StackItem size="fill">
            <VStack gap={1}>
              <Back />
              <Heading level={1} maxLines={1}>
                {v.name} · {v.ym}
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
            <Actions onBad={(word) => setBad(word ? { id: v.id, word } : null)} />
            {bad?.id === v.id && <Badge variant="error" label={bad.word} />}
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

/** 판단의 재료 세 타일: 합산(한도 대비 막대, 넘으면 오류 색) · 한도 · 승인권자. 합산 · 승인권자는 계산이라 출처 표지를 단다 */
function Tiles() {
  const r = useReview()?.review
  if (!r) return null
  const over = r.limit !== null && r.total > r.limit
  const tile = (name: string, value: ReactNode, below?: ReactNode, aside?: ReactNode) => (
    <Card>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <Text type="supporting" color="secondary">
              {name}
            </Text>
          </StackItem>
          {aside}
        </HStack>
        {value}
        {below}
      </VStack>
    </Card>
  )
  const big = (v: string) => (
    <Text type="large" weight="semibold" hasTabularNumbers>
      {v}
    </Text>
  )
  return (
    <Grid columns={3} gap={4}>
      {tile(
        L.합산,
        big(num(r.total)),
        r.limit !== null && (
          <ProgressBar label={L.한도} isLabelHidden value={Math.min(r.total, r.limit)} max={r.limit} variant={over ? 'error' : 'accent'} hasValueLabel formatValueLabel={() => `${Math.round((r.total / r.limit!) * 100)}%`} />
        ),
        <Source kind={r.source} file={r.file ?? undefined} row={r.row ?? undefined} tip={L.합산} rows={[[L.합산, L['귀속월 지급의 합, 반려 제외']]]} />,
      )}
      {/* 원본의 과거 승인에는 적용한 규칙의 기록이 없다(09) */}
      {tile(L.한도, big(r.limit === null ? L.미상 : num(r.limit)), over && <Badge variant="error" label={`+${num(r.total - r.limit!)}`} />)}
      {tile(
        L.승인권자,
        <HStack gap={2} vAlign="center">
          <Avatar name={r.approver} size="sm" />
          <Text type="large" weight="semibold">
            {r.approver}
          </Text>
        </HStack>,
        r.holder !== r.approver && <Text type="supporting" color="secondary">{`${L.담당} ${r.holder}`}</Text>,
        <Source kind={L.계산} tip={L.승인권자} rows={[[L.승인권자, L['한도 이하 영업지원, 초과 영업임원']]]} />,
      )}
    </Grid>
  )
}

/** 정황이 걸린 심사: 사유가 필수인 조치를 경고 띠로 */
function Notice() {
  const r = useReview()
  const on = !!r?.review.marks.includes(L.정황)
  const list = useData<unknown[]>(on ? `/reviews/${r!.review.id}/signals` : null)
  if (!r || !on) return null
  // 제목: 걸린 정황의 수. 설명: 이 역할의 조치에 사유가 필수이면 `사유 필수`
  const must = r.actions.some((a) => a.reason && !bundled.includes(a.kind))
  return <Banner status="warning" title={list ? `${L.정황} ${list.length}` : L.정황} description={must ? L['사유 필수'] : undefined} collapsible={false} />
}

/** 경위 탭: 그림과 같은 칸들의 시간 순 목록(incident-console의 Timeline 꼴) */
function Trail() {
  return (
    <>
      <Picture />
      <Region title={L.경위}>
        <Timeline />
      </Region>
    </>
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

/** AI 보고 한 건: 그 정황의 가장 새 보고를 읽기로. 사실마다 근거(Citation), 추정 · 미확인은 목록 */
function SignalReport({ id, name }: { id: string; name: string }) {
  const d = useData<Report>(`/signals/${encodeURIComponent(id)}/report`)
  const setTarget = useSetAtom(targetAtom)
  const r = d?.report
  const lines = (list: string[]) => (
    <List density="compact">
      {list.map((t, i) => (
        <ListItem key={i} label={<Text>{t}</Text>} />
      ))}
    </List>
  )
  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <StackItem size="fill">
          <Link weight="semibold" onClick={() => setTarget({ kind: L.정황, id })}>
            {name}
          </Link>
        </StackItem>
        <Badge variant={badge(r?.state ?? L.대기)} label={r?.state ?? L.대기} />
        <Source kind={L.AI} tip={r?.model ?? undefined} rows={[[L.모델, r?.model ?? L.없음], [L.날짜, r?.at ?? L.없음], [L.조회, String(r?.reads ?? L.없음)]]} />
      </HStack>
      {r && r.facts.length > 0 && (
        <MetadataList columns="single" label={{ position: 'top' }}>
          <MetadataListItem label={L.사실}>
            <VStack gap={2}>
              {r.facts.map((f, i) => (
                <HStack key={i} gap={2} vAlign="start">
                  <Citation number={i + 1} variant="number" source={{ title: f.ref }} />
                  <Text>{f.text}</Text>
                </HStack>
              ))}
            </VStack>
          </MetadataListItem>
          {r.guess.length > 0 && <MetadataListItem label={L.추정}>{lines(r.guess)}</MetadataListItem>}
          {r.unknown.length > 0 && <MetadataListItem label={L.미확인}>{lines(r.unknown)}</MetadataListItem>}
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

/** 레일: 접히는 칸마다 카드 한 장(바탕과 갈려 경계가 보인다) */
function Rail() {
  return (
    <VStack gap={4}>
      <Card>
        <Collapsible trigger={<Heading level={4}>{L.요약}</Heading>} defaultIsOpen>
          <Summary />
        </Collapsible>
      </Card>
      <Card>
        <Collapsible
          trigger={
            <HStack gap={2} vAlign="center">
              <Icon icon={SparklesIcon} size="sm" color="accent" />
              <Heading level={4}>{`${L.AI} ${L.보고}`}</Heading>
            </HStack>
          }
          defaultIsOpen={false}
        >
          <Reports />
        </Collapsible>
      </Card>
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
        <LayoutContent role="main" className="bg-body">
          <VStack gap={4}>
            {tab === 'body' && (
              <>
                <Notice />
                <Tiles />
                <Then />
                <Members />
                <Links />
                <Rules />
                <Flags />
                <OfReview />
              </>
            )}
            {tab === 'trail' && <Trail />}
            {tab === 'history' && (
              <Region title={L.이력}>
                <History />
              </Region>
            )}
            {narrow && <Rail />}
          </VStack>
        </LayoutContent>
      }
      end={
        !narrow && rail ? (
          <LayoutPanel width={320} padding={4} role="complementary" className="bg-body">
            <Rail />
          </LayoutPanel>
        ) : undefined
      }
    />
  )
}
