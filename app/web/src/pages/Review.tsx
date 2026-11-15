// astryx template: detail-page
// 심사 기록: astryx detail-page 템플릿에서 출발한 화면. 머리(← 작업 · n/전체 · 앞 뒤 / 제목 / 메타 한 줄 / 페이지 조치 / 탭) → 본문(바탕 위의 카드들) → 오른쪽 레일(요약 · AI 보고 카드).
// 좁으면(본문이 레일과 나란히 설 수 없으면) 레일이 본문 아래로 간다. 조치는 누를 때 확인 창에서 사유(분류 · 메모)를 받는다.
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Text } from '@astryxdesign/core/Text'
import { BuildingStorefrontIcon, UserIcon } from '@heroicons/react/24/outline'
import { type ReactNode, useState } from 'react'
import { L } from '../labels'
import { api, changedAtom, store, useLoad } from '../state'
import { Mark, State } from '../ui/Mark'
import { AiCard } from '../ui/AiCard'
import { Pending } from '../ui/Pending'
import { Act, Meta, RecordPage, Tiles, byGrade } from '../ui/Record'
import { Region } from '../ui/Region'
import { Source } from '../ui/Source'
import { meter, num, pct, plain } from '../ui/status'
import { Links, Members, Rules } from '../tickets/04-심사'
import { type Review as Data, bundled, useReview, useReviewLoad } from '../tickets/04-심사/review'
import { History, type Resubmit, useResubmit } from '../tickets/06-반려'
import { Then } from '../tickets/09-재검토'
import { Way, useWay } from '../tickets/10-추인'
import { Flags } from '../tickets/11-정황'
import { OfReview } from '../tickets/12-가설'
import { Picture, Timeline } from '../tickets/16-경위'
import { Body as ReportBody } from '../tickets/17-보고'
import type { Report } from '../tickets/17-보고/report'
import { Names } from '../ui/Line'

/** 오른쪽 위 페이지 조치: 보조 조치가 앞, 주 버튼(승인 · 재상신)이 맨 끝. 서버가 거절하면 `onBad`로 그 낱말 */
function Actions({ r, s, onBad }: { r: Data; s: Resubmit | null; onBad: (word: string | null) => void }) {
  const fail = (e: Error) => {
    onBad(e.message)
    store.set(changedAtom, (n) => n + 1)
  }
  const go = (path: string, body: object) => (onBad(null), api(path, body).catch(fail))
  const v = r.review
  const rows: [string, string][] = [[L.귀속월, v.ym], [L.상태, v.status], [L.합산, num(v.total)]]
  // 할 수 있는 조치가 없으면 버튼 자리에 누가 정하는지(components.md: 권한이 없으면 버튼 대신 승인권자)
  if (!r.actions.some((a) => !bundled.includes(a.kind)) && !s?.can && !v.fixed)
    return (
      <HStack gap={2} vAlign="center">
        <Text type="supporting" color="secondary">{L.승인권자}</Text>
        <Text weight="semibold">{v.holder ?? v.approver}</Text>
      </HStack>
    )
  return (
    <HStack gap={2}>
      {byGrade(r.actions.filter((a) => !bundled.includes(a.kind))).map((a) => (
        <Act key={a.kind} kind={a.kind} classes={a.classes} must={a.reason} target={v.name} rows={rows} send={(reason) => go('/decide', { ids: [v.id], kind: a.kind, reason: reason ?? undefined })} />
      ))}
      {s?.can && <Act kind={L.재상신} classes={s.classes} must target={v.name} rows={rows} send={(reason) => go('/resubmit', { id: s.id, reason })} />}
    </HStack>
  )
}

/** 판단의 재료 세 타일: 합산(한도 대비 막대, 넘으면 오류 색) · 한도 · 승인권자. 합산 · 승인권자는 계산이라 출처 표지를 단다 */
function ReviewTiles({ r }: { r: Data['review'] }) {
  const over = r.limit !== null && r.total > r.limit
  return (
    <Tiles
      items={[
        {
          name: L.합산,
          value: num(r.total),
          below: r.limit !== null && (
            <ProgressBar label={L.한도} isLabelHidden value={Math.min(r.total, r.limit)} max={r.limit} variant={meter(over)} hasValueLabel formatValueLabel={() => pct(r.total, r.limit!)} />
          ),
          aside: <Source kind={r.source} file={r.file ?? undefined} row={r.row ?? undefined} tip={L.합산} rows={[[L.합산, L['귀속월 지급의 합, 반려 제외']]]} />,
        },
        // 원본의 과거 승인에는 적용한 규칙의 기록이 없다(09)
        // 넘친 금액은 보조 글자로(합산 막대가 이미 빨갛다 — 같은 경고를 두 번 칠하지 않는다)
        { name: L.한도, value: r.limit === null ? L.미상 : num(r.limit), below: over && <Text type="supporting" color="secondary" hasTabularNumbers>{`+${num(r.total - r.limit!)}`}</Text> },
      ]}
    />
  )
}

/** 경위 탭: 그림과 같은 칸들의 시간 순 목록(detail-page의 TimelineSection 꼴) */
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


/** AI 보고 한 건: 그 정황의 가장 새 보고(정황 기록의 AI 카드와 같은 꼴, 읽기만). 보고가 여럿일 때만 정황 이름이 제목 */
function SignalReport({ id, name, many }: { id: string; name: string; many: boolean }) {
  const q = useLoad<Report>(`/signals/${encodeURIComponent(id)}/report`)
  const r = q.data?.report
  return (
    <AiCard
      title={many ? name : undefined}
      aside={
        <HStack gap={2} vAlign="center">
          <Source kind={L.AI} tip={L.보고} rows={[[L.모델, r?.model ?? L.없음], [L.날짜, r?.at ?? L.없음], [L.조회, String(r?.reads ?? L.없음)]]} />
          <State word={r?.state ?? L.대기} />
        </HStack>
      }
    >
      {q.data ? <ReportBody d={q.data} /> : <Pending of={q} />}
    </AiCard>
  )
}

/** AI 보고: 이 심사에 걸린 정황마다 그 보고 카드(정황 영역 바로 아래, D63). 정황이 없으면 없음 */
export function Reports() {
  const r = useReview()?.review
  const on = !!r?.marks.includes(L.정황)
  const q = useLoad<{ id: string; name: string }[]>(on ? `/reviews/${r!.id}/signals` : null)
  // 정황 표시가 없는 심사에는 보고가 없다(이전 심사의 값이 남아 있어도 그리지 않는다)
  if (!on) return null
  if (!q.data) return <Pending of={q} />
  return (
    <VStack gap={4}>
      {q.data.map((s) => (
        <SignalReport key={s.id} id={s.id} name={s.name} many={q.data!.length > 1} />
      ))}
    </VStack>
  )
}

export function Review() {
  const r = useReviewLoad()
  const [bad, setBad] = useState<{ id: string; word: string } | null>(null)
  const way = useWay()
  const s = useResubmit()
  if (!r.data) return <Pending of={r} page />
  const { data } = r
  const v = data.review
  return (
    <RecordPage
      title={`${v.name} · ${v.ym}`}
      meta={[
        <State word={v.status} />,
        <Meta icon={UserIcon}>{v.holder ?? v.approver}</Meta>,
        <Meta icon={BuildingStorefrontIcon}>{`${data.members.length}${L.곳}`}</Meta>,
        // 추인 묶음(10)이 있으면 그 표시는 묶음으로 가는 링크(Way)가 맡는다 — 같은 `추인`을 두 번 두지 않는다
        ...v.marks.filter((m) => !(way && m === L.추인)).map((m) => <Mark>{m}</Mark>),
        ...(way ? [<Way b={way} />] : []),
      ]}
      actions={<Actions r={data} s={s} onBad={(word) => setBad(word ? { id: v.id, word } : null)} />}
      bad={bad?.id === v.id ? bad.word : null}
      // 보조 칸의 요약: 상태 · 담당(실제로 결정하는 사람) · 승인권자(합산으로 정한 것, 가설로 올라갔으면 표시) · 귀속월 · 구성
      props={[
        [L.상태, plain(v.status) ? v.status : <State word={v.status} />],
        // 반려 뒤의 차례는 영업지원(재상신) — 담당은 지금 할 사람
        [L.담당, v.status === L.반려 ? L.영업지원 : v.holder ?? v.approver],
        // 반려 · 보류의 사유는 받는 사람이 내용에서 바로 본다(이력 탭까지 가지 않게)
        // 값 하나에 사실 하나(review.md 2-1): 사유의 분류와 메모를 줄마다
        ...data.history.filter((h) => h.kind === v.status && (h.kind === L.반려 || h.kind === L.보류)).slice(-1).flatMap((h): [string, ReactNode][] => [[L.사유, h.reason?.class ?? L.없음], ...(h.reason?.memo ? [[L.메모, h.reason.memo] as [string, ReactNode]] : [])]),
        [L.승인권자, v.holder && v.holder !== v.approver ? <HStack gap={2} vAlign="center"><Text>{v.holder}</Text><Mark>{v.marks.includes(L.이탈) ? L.이탈 : L.가설}</Mark></HStack> : v.approver],
        [L.귀속월, v.ym],
        [L.구성, <Names list={data.members.map((m) => m.name)} unit={L.곳} />],
      ]}
      tabs={[
        {
          value: 'body',
          label: L.내용,
          body: (
            <>
              <ReviewTiles r={v} />
              <Then />
              <Members />
              <Links />
              <Rules />
              <Flags />
              <Reports />
              <OfReview />
            </>
          ),
        },
        { value: 'trail', label: L.경위, body: <Trail /> },
        {
          value: 'history',
          label: L.이력,
          body: (
            <Region title={L.이력}>
              <History />
            </Region>
          ),
        },
      ]}
    />
  )
}
