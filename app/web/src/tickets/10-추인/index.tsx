// 10 추인: 추인·종결 작업에서 여는 화면(pages/Ratify가 이 파일의 영역·조치를 짠다). 대상은 현재 계산의 그룹 × 귀속월 묶음이고(D50), 그 달의 재검토인 과거의 승인이 모두 보인다.
// 조치는 04의 결정 경로(/decide)에 묶음의 심사 하나를 보낸다 — 같은 결정이 묶음의 나머지에도 남는 것은 DB가 한다.
// 과거의 심사 한 건은 표의 이름을 눌러 연다(04의 심사 상세).
import { Badge } from '@astryxdesign/core/Badge'
import { HStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { useSetAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { L } from '../../labels'
import { api, changedAtom, store, targetAtom } from '../../state'
import { Compare } from '../../ui/Compare'
import { Mark } from '../../ui/Mark'
import { Pending } from '../../ui/Pending'
import { Act, byGrade, Tiles } from '../../ui/Record'
import { Region } from '../../ui/Region'
import { Source } from '../../ui/Source'
import { meter, num, pct } from '../../ui/status'
import { Line } from '../04-심사'
import { sharedLoad } from '../load'
import { Steps, why } from '../16-경위'
import { type Decision, useReview } from '../04-심사/review'

export type Bundle = {
  ratify: { id: string; name: string; ym: string; marks: string[]; total: number; limit: number; approver: string; source: string }
  members: { id: string; name: string }[]
  /** 그 달의 재검토인 과거의 승인. 값은 당시의 것 */
  reviews: { id: string; name: string; members: number; total: number; approver: string; paid: string | null; source: string; file: string | null; row: number | null }[]
  /** 결정을 보낼 심사(묶음의 첫 건) */
  target: string
  /** 지금 차례인 역할. 종결됐으면 없다 */
  role: string | null
  actions: { kind: string; reason: boolean; classes: string[] }[]
  history: Decision[]
}

// 다시 읽는 동안에는 앞의 값을 그대로 둔다(04의 심사와 같다)
export const useBundle = sharedLoad<Bundle>((get) => {
  const t = get(targetAtom)
  return t?.kind === L.추인 ? `/ratifies/${t.id}` : null
})

const size = (n: number) => (n === 1 ? L.단독 : `${n}${L.곳}`)
const uniq = (list: string[]) => [...new Set(list)].join(' · ')

/** 판단의 재료 세 타일(심사 기록과 같다): 합산(한도 대비 막대) · 한도 · 승인권자. 합산 · 승인권자는 계산이라 출처 표지를 단다 */
export function RatifyTiles() {
  const q = useBundle()
  const b = q.data
  if (!b) return <Pending of={q} />
  const r = b.ratify
  const over = r.total > r.limit
  return (
    <Tiles
      items={[
        {
          name: L.합산,
          value: num(r.total),
          below: (
            <ProgressBar label={L.한도} isLabelHidden value={Math.min(r.total, r.limit)} max={r.limit} variant={meter(over)} hasValueLabel formatValueLabel={() => pct(r.total, r.limit!)} />
          ),
          aside: (
            <Source
              kind={r.source}
              tip={`${L.합산} · ${L.승인권자}`}
              rows={[
                [L.합산, L['귀속월 지급의 합, 반려 제외']],
                [L.구성, b.members.map((m) => m.name).join(' · ')],
              ]}
            />
          ),
        },
        // 넘친 금액은 보조 글자로(합산 막대가 이미 빨갛다)
        { name: L.한도, value: num(r.limit), below: over && <Text type="supporting" color="secondary" hasTabularNumbers>{`+${num(r.total - r.limit)}`}</Text> },
      ]}
    />
  )
}

/** 재검토(당시 / 현재) 영역 */
export function Again() {
  const q = useBundle()
  const b = q.data
  if (!b) return <Region title={L.재검토}><Pending of={q} /></Region>
  return (
    <Region
      title={L.재검토}
      aside={
        <Source
          kind={b.ratify.source}
          side="right"
          tip={`${L.당시} · ${L.현재}`}
          rows={[
            [L.현재, L['귀속월의 식별자, 규칙 버전']],
            [L.재검토, L['당시 영업지원, 현재 영업임원']],
          ]}
        />
      }
    >
      <Compare
        head={[L.당시, L.현재]}
        rows={[
          [L.구성, uniq(b.reviews.map((r) => size(r.members))), size(b.members.length)],
          [L.승인권자, uniq(b.reviews.map((r) => r.approver)), b.ratify.approver],
        ]}
      />
    </Region>
  )
}

type Past = Bundle['reviews'][number] & Record<string, unknown>

/** 심사 영역: 그 달의 재검토인 과거의 승인. 이름을 누르면 그 심사가 열린다(04의 심사 기록) */
export function Past() {
  const q = useBundle()
  const b = q.data
  const setTarget = useSetAtom(targetAtom)
  if (!b) return <Region title={L.심사}><Pending of={q} /></Region>
  return (
    <Region title={L.심사} aside={<Badge variant="neutral" label={String(b.reviews.length)} />}>
      <Table<Past>
        data={b.reviews as Past[]}
        idKey="id"
        density="balanced"
        columns={[
          {
            key: 'name',
            header: L.대상,
            width: proportional(1, { minWidth: 72 }),
            renderCell: (r) => (
              <Link weight="semibold" onClick={() => setTarget({ kind: L.심사, id: r.id })}>
                {r.name}
              </Link>
            ),
          },
          { key: 'total', header: L.금액, align: 'end', width: pixel(104), renderCell: (r) => <Text weight="semibold" hasTabularNumbers>{num(r.total)}</Text> },
          { key: 'approver', header: L.승인권자, width: pixel(80), renderCell: (r) => <Text>{r.approver}</Text> },
          { key: 'paid', header: L.지급일, width: pixel(112), renderCell: (r) => <Text hasTabularNumbers>{r.paid ?? L.미상}</Text> },
          { key: 'source', header: L.출처, align: 'end', width: pixel(88), renderCell: (r) => <Source kind={r.source} file={r.file ?? undefined} row={r.row ?? undefined} /> },
        ]}
      />
    </Region>
  )
}

/** 이견이 남았고 아직 종결되지 않았는가: 머리의 상태(이견 Badge)와 조치가 이것을 본다 */
export const dissent = (b: Bundle) => b.history.some((h) => h.kind === L.이견) && !b.ratify.marks.includes(L.종결)

/** 페이지 조치: 지금 역할이 할 수 있는 것만(추인 / 거부 · 종결 · 이견). 보조가 앞, 주 버튼이 맨 끝. 서버가 거절하면 `onBad`로 그 낱말 */
export function RatifyActions({ onBad }: { onBad: (word: string | null) => void }) {
  const b = useBundle().data
  // 이견을 남긴 뒤에는 종결만 남는다(같은 이견을 되풀이하지 않는다 — 서버는 막지 않는다)
  const acts = b ? b.actions.filter((a) => !(a.kind === L.이견 && dissent(b))) : []
  // 지금 역할이 할 수 있는 조치가 없으면(종결 · 차례가 아님) 조치 자리를 두지 않는다
  if (!b || !acts.length) return null
  const r = b.ratify
  const rows: [string, string][] = [[L.귀속월, r.ym], [L.합산, num(r.total)]]
  const fail = (e: Error) => {
    onBad(e.message)
    store.set(changedAtom, (n) => n + 1)
  }
  return (
    <HStack gap={2}>
      {byGrade(acts).map((a) => (
        <Act key={a.kind} kind={a.kind} classes={a.classes} must={a.reason} target={r.name} rows={rows}
          send={(reason) => (onBad(null), api('/decide', { ids: [b.target], kind: a.kind, reason: reason ?? undefined }).catch(fail))}
        />
      ))}
    </HStack>
  )
}

/** 레일의 요약 */
export function RatifySummary() {
  const q = useBundle()
  const b = q.data
  if (!b) return <Pending of={q} />
  const last = b.history.at(-1)
  return (
    <MetadataList columns="single" label={{ position: 'start', width: 72 }}>
      <MetadataListItem label={L.귀속월}>{b.ratify.ym}</MetadataListItem>
      <MetadataListItem label={L.구성}>{b.members.map((m) => m.name).join(' · ')}</MetadataListItem>
      <MetadataListItem label={L.담당}>{b.role ?? L.없음}</MetadataListItem>
      <MetadataListItem label={L.결정}>{last ? <Line d={last} /> : L.없음}</MetadataListItem>
    </MetadataList>
  )
}

/** 이력: 모든 기록 화면과 같은 꼴(16-경위의 Steps) — 결정 · 역할 / 사유의 분류 · 메모 / 날짜 */
export function RatifyHistory() {
  const q = useBundle()
  const b = q.data
  if (!b) return <Pending of={q} />
  return <Steps list={b.history.map((d) => ({ title: `${d.kind} · ${d.role}`, text: why(d), at: d.at }))} />
}

/** 한 건 화면의 조치 자리: 이 심사가 든 묶음으로 가는 길. 추인·거부·종결·이견은 묶음에서 한다(D50) */
/** 열어 둔 심사가 든 추인 묶음(없으면 null) */
export function useWay() {
  const r = useReview()
  const [b, setB] = useState<{ id: string; name: string; ym: string } | null>(null)
  const id = r?.review.id
  const marks = r?.review.marks.join()
  useEffect(() => {
    setB(null)
    if (id) api<{ id: string; name: string; ym: string }>(`/reviews/${id}/ratify`).then(setB, () => {})
  }, [id, marks])
  return b
}

/** 추인 묶음으로 가는 링크(표시 + 묶음 이름 — 귀속월은 심사와 같아 되풀이하지 않는다) */
export function Way({ b }: { b: { id: string; name: string; ym: string } }) {
  return (
    <HStack gap={2} vAlign="center">
      <Mark>{L.추인}</Mark>
      <Link onClick={() => store.set(targetAtom, { kind: L.추인, id: b.id })}>
        {b.name}
      </Link>
    </HStack>
  )
}

