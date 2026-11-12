// 10 추인: 추인·종결 작업에서 여는 화면. 대상은 현재 계산의 그룹 × 귀속월 묶음이고(D50), 그 달의 재검토인 과거의 승인이 모두 보인다.
// 조치는 04의 결정 경로(/decide)에 묶음의 심사 하나를 보낸다 — 같은 결정이 묶음의 나머지에도 남는 것은 DB가 한다.
// 사유는 05의 부품과 04의 reasonAtom을 그대로 쓴다. 과거의 심사 한 건은 표의 이름을 눌러 연다(04의 심사 상세).
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { unwrap } from 'jotai/utils'
import { useEffect, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, roleAtom, store, targetAtom } from '../../state'
import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { Compare } from '../../ui/Compare'
import { Empty } from '../../ui/Empty'
import { Figures } from '../../ui/Figures'
import { grade } from '../../ui/grade'
import { Mark } from '../../ui/Mark'
import { Pill } from '../../ui/Pill'
import { Reason, blank, ready, sent as filled } from '../../ui/Reason'
import { Region } from '../../ui/Region'
import { Source } from '../../ui/Source'
import { Table, num } from '../../ui/Table'
import { Title } from '../../ui/Title'
import { Line } from '../04-심사'
import { type Decision, reasonAtom, useReview } from '../04-심사/review'

type Bundle = {
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

const bundleAtom = atom(async (get) => {
  get(changedAtom)
  get(roleAtom)
  const t = get(targetAtom)
  return t?.kind === L.추인 ? api<Bundle>(`/ratifies/${t.id}`).catch(() => null) : null
})
// 다시 읽는 동안에는 앞의 값을 그대로 둔다(04의 심사와 같다)
const latestAtom = unwrap(bundleAtom, (prev) => prev ?? null)

function useBundle() {
  const target = useAtomValue(targetAtom)
  const b = useAtomValue(latestAtom)
  return b && b.ratify.id === target?.id ? b : null
}

const size = (n: number) => (n === 1 ? L.단독 : `${n}${L.곳}`)
const uniq = (list: string[]) => [...new Set(list)].join(' · ')

/** 머리(가운데 위에 고정): 제목 줄과 현재 계산의 숫자 줄 */
function Head() {
  const b = useBundle()
  if (!b) return null
  const r = b.ratify
  return (
    <>
      <Title name={r.name} sub={r.ym}>
        {r.marks.map((m) => (
          <Mark key={m}>{m}</Mark>
        ))}
      </Title>
      <Figures
        items={[
          [L.합산, num(r.total)],
          [L.한도, num(r.limit)],
          [L.승인권자, r.approver],
        ]}
      >
        <Source
          kind={r.source}
          tip={`${L.합산} · ${L.승인권자}`}
          rows={[
            [L.합산, L['귀속월 지급의 합, 반려 제외']],
            [L.구성, b.members.map((m) => m.name).join(' · ')],
          ]}
        />
      </Figures>
    </>
  )
}

/** 당시 / 현재와, 그 달의 재검토인 과거의 승인 */
function Then() {
  const b = useBundle()
  const setTarget = useSetAtom(targetAtom)
  if (!b) return null
  return (
    <>
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
      <Region title={L.심사}>
        <Table
          head={[L.대상, L.금액, L.승인권자, L.지급일, L.출처]}
          right={[1]}
          rows={b.reviews.map((r) => [
            <Link weight="medium" onClick={() => setTarget({ kind: L.심사, id: r.id })}>
              {r.name}
            </Link>,
            num(r.total),
            r.approver,
            r.paid ?? L.미상,
            <Source kind={r.source} file={r.file ?? undefined} row={r.row ?? undefined} />,
          ])}
        />
      </Region>
    </>
  )
}

/** 조치: 지금 역할이 할 수 있는 것만 버튼으로(추인 / 종결·이견). 없으면 마지막 결정, 그것도 없으면 담당 */
function Action() {
  const b = useBundle()
  const [reason, setReason] = useAtom(reasonAtom)
  // 결정을 보낸 때의 묶음. 새 값을 받을 때까지는 다시 누를 수 없다
  const [sent, setSent] = useState<unknown>(null)
  const [bad, setBad] = useState<string | null>(null)
  const id = b?.ratify.id
  useEffect(() => setBad(null), [id])
  if (!b) return null
  const last = b.history.at(-1)
  if (!b.actions.length)
    return last ? (
      <Line d={last} />
    ) : (
      <div className="flex items-baseline gap-2">
        <Text type="supporting">{L.담당}</Text>
        <Text weight="semibold">{b.role}</Text>
      </div>
    )
  return (
    <div className="flex flex-wrap items-center gap-2">
      {b.actions.map((a) => (
        <Button key={a.kind} label={a.kind} variant={grade(a.kind)} isDisabled={sent === b || !ready(a.kind, a.reason, reason)}
          onClick={() => {
            setSent(b)
            setBad(null)
            api('/decide', { ids: [b.target], kind: a.kind, reason: filled(reason) ?? undefined }).then(
              () => setReason(blank),
              (e: Error) => {
                setBad(e.message)
                store.set(changedAtom, (n) => n + 1)
              },
            )
          }}
        />
      ))}
      {bad && <Pill tone="bad">{bad}</Pill>}
    </div>
  )
}

/** 사유. 다른 묶음을 열거나 역할이 바뀌거나 결정이 내려지면 쓰던 사유를 비운다 */
function Box() {
  const b = useBundle()
  const role = useAtomValue(roleAtom)
  const [draft, setDraft] = useAtom(reasonAtom)
  useEffect(() => setDraft(blank), [b?.ratify.id, b?.history.length, role, setDraft])
  if (!b) return null
  return b.actions.length ? <Reason groups={b.actions.map((a) => ({ of: a.kind, classes: a.classes }))} value={draft} onChange={setDraft} /> : <Empty />
}

function History() {
  const b = useBundle()
  if (!b) return null
  return b.history.length ? b.history.map((d, i) => <Line key={i} d={d} />) : <Empty />
}

/** 한 건 화면의 조치 자리: 이 심사가 든 묶음으로 가는 길. 추인·거부·종결·이견은 묶음에서 한다(D50) */
function Way() {
  const r = useReview()
  const [b, setB] = useState<{ id: string; name: string; ym: string } | null>(null)
  const id = r?.review.id
  const marks = r?.review.marks.join()
  useEffect(() => {
    setB(null)
    if (id) api<{ id: string; name: string; ym: string }>(`/reviews/${id}/ratify`).then(setB, () => {})
  }, [id, marks])
  if (!b) return null
  return (
    <div className="flex items-baseline gap-2">
      <Text type="supporting">{L.추인}</Text>
      <Link onClick={() => store.set(targetAtom, { kind: L.추인, id: b.id })}>
        {b.name} · {b.ym}
      </Link>
    </div>
  )
}

export default [
  { slot: 'action', kind: L.심사, order: 10, View: Way },
  { slot: 'head', kind: L.추인, View: Head },
  { slot: 'fact', kind: L.추인, order: -30, View: Then },
  { slot: 'action', kind: L.추인, View: Action },
  { slot: 'reason', kind: L.추인, View: Box },
  { slot: 'history', kind: L.추인, View: History },
] satisfies Piece[]
