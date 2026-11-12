// 11 정황: 정황 상세(가운데: 제목·숫자 줄, 근거, 관계 / 오른쪽: 조치(요청 · 기각), 사유, 이력)와 심사 상세의 "정황" 줄.
// 가운데의 조각은 order -40(제목·숫자 줄) · -30(근거) · -20(관계)이다. 뒤 티켓이 kind: L.정황으로 끼우는 조각은 order를 적지 않으면 관계 아래에 놓인다(12의 가설).
// 가운데의 값은 모두 코드가 기록에서 읽은 것이다(AI의 글은 오른쪽 "보고"에 — 17).
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, roleAtom, store, targetAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { Figures } from '../../ui/Figures'
import { Mark } from '../../ui/Mark'
import { Pill } from '../../ui/Pill'
import { Reason, blank, ready, sent as filled } from '../../ui/Reason'
import { Relation } from '../../ui/Relation'
import { Source } from '../../ui/Source'
import { button, label } from '../../ui/styles'
import { Table, num } from '../../ui/Table'
import { Title } from '../../ui/Title'
import { Line } from '../04-심사'
import { useReview } from '../04-심사/review'
import { useReport } from '../17-보고/report'
import { markAtom, reasonAtom, useSignal } from './signal'

// 정황의 상태와 그 색(tokens.md: 접수·요청은 대기의 색)
const tones = { [L.접수]: 'wait', [L.요청]: 'wait', [L.기각]: 'wait', [L.해소]: 'good' } as const
const pill = (state: string) => <Pill tone={tones[state as keyof typeof tones] ?? 'wait'}>{state}</Pill>

/** 제목 줄과 숫자 줄: 종류 · 대상 · 상태 / 근거의 수, 대리점의 수. 출처 표지에는 그 종류를 찾는 기준 */
function Head() {
  const d = useSignal()
  if (!d) return null
  const s = d.signal
  // 기준: 이름표와 값(문장 금지). 계좌는 회수의 계좌가 다른 대리점의 계좌와 일치, 동명은 대표자만 일치, 대사는 비교가 불일치
  const basis: Record<string, [string, string]> = {
    [L.계좌]: [L.일치, `${L.회수} · ${L.계좌}`],
    [L.동명]: [L.일치, L.대표자],
    [L.근접]: [L.근접, d.near.map(num).join(' – ')],
    [L.지연]: [L.지연, `${d.delay}${L.일}`],
    [L.대사]: [L.비교, L.불일치],
  }
  const [k, v] = basis[s.kind] ?? [s.kind, L.없음]
  return (
    <div className="mb-4 flex flex-col gap-2">
      <Title name={s.name}>{pill(s.state)}</Title>
      <Figures
        items={[
          [L.근거, d.evidence.length],
          [L.대리점, s.dealers.length],
          ...(s.kind === L.지연 ? [[L.지연, `${d.delay}${L.일}`] as [string, string]] : []),
        ]}
      >
        <Source kind={s.source}>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
            <dt className={label}>{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </dl>
        </Source>
      </Figures>
    </div>
  )
}

/** 근거 표(ux-plan의 모양): 정황이 가리키는 기록마다 한 줄 — 무엇(회수·계좌·대표자·지급·대사), 언제 또는 어느 대리점, 값(식별자, 금액, 대사에서 맞지 않은 항목), 출처.
 * 회수의 줄은 대상 대리점의 것이라 날짜를, 식별자의 줄은 그것을 등록한 대리점을 적는다. 회수의 금액 같은 나머지 값은 출처 표지가 여는 원본의 행에 있다.
 * 대사의 줄은 출처가 계산이라 표지에 맞춰 본 값(승인)과 회신의 값이 열린다 */
function Evidence() {
  const d = useSignal()
  const mark = useAtomValue(markAtom)
  if (!d) return null
  const rows = d.evidence
  const nodes = rows.some((e) => e.node)
  const amounts = rows.every((e) => e.amount != null)
  // 2열은 줄마다 날짜·귀속월·대리점 중 하나다. 한 가지뿐이면 그 이름, 섞이면 대상
  const when = rows.every((e) => e.ym) ? L.귀속월 : rows.every((e) => e.at) ? L.날짜 : rows.every((e) => !e.at && !e.ym && e.dealer) ? L.대리점 : L.대상
  return (
    <section className="mb-4 flex flex-col gap-2">
      <h2 className={label}>{L.근거}</h2>
      <Table
        head={[L.근거, when, nodes ? L.식별자 : amounts ? L.금액 : L.비교, L.출처]}
        right={!nodes && amounts ? [2] : []}
        mark={rows.findIndex((e) => e.id === mark)}
        rows={rows.map((e) => [
          d.fresh.includes(e.id) ? (
            <span className="flex items-center gap-2 whitespace-nowrap">
              {e.item}
              <Mark>{L.새}</Mark>
            </span>
          ) : (
            e.item
          ),
          e.known ? (
            <span className="flex flex-wrap items-center gap-x-2 tabular-nums">
              <span className="whitespace-nowrap">{`${L.변경일} ${e.at}`}</span>
              <span className="whitespace-nowrap">{`${L.인지일} ${e.known}`}</span>
              <span className="whitespace-nowrap">{`${e.days}${L.일}`}</span>
              <Source kind={L.계산}>
                <dl className="grid grid-cols-2 gap-x-2 gap-y-1 tabular-nums">
                  <dt className={label}>{L.지연}</dt>
                  <dd>{`${e.days}${L.일}`}</dd>
                </dl>
              </Source>
            </span>
          ) : (
            (e.at ?? e.ym ?? e.dealer?.name)
          ),
          e.node?.name ?? (e.amount == null ? e.value : num(e.amount)),
          <Source kind={e.source} file={e.file ?? undefined} row={e.row ?? undefined}>
            {e.want && e.got && (
              <dl className="grid grid-cols-2 gap-x-2 gap-y-1 tabular-nums">
                <dt className={label}>{L.승인}</dt>
                <dd>{[num(e.want.amount), ...e.want.accounts].join(' · ')}</dd>
                <dt className={label}>{L.회신}</dt>
                <dd>{[num(e.got.amount), e.got.account].join(' · ')}</dd>
                <dt className={label}>{L.비교}</dt>
                <dd>{e.value}</dd>
              </dl>
            )}
          </Source>,
        ])}
      />
    </section>
  )
}

/** 관계 그림: 대상 대리점이 왼쪽, 근거의 사람·주소·계좌가 가운데. 점선은 등록이 아닌 이어짐(회수가 들어간 계좌). 같은 내용은 근거 표에 있다 */
function Links() {
  const d = useSignal()
  if (!d) return null
  return (
    <section className="mb-4 flex flex-col gap-2">
      <h2 className={label}>{L.관계}</h2>
      {d.relation.mid.length ? <Relation {...d.relation} /> : <Empty />}
    </section>
  )
}

/** 조치: 내부 감시에게만 요청 · 기각. 없으면 내려진 결정, 그것도 없으면 담당.
 * 버튼은 사유가 그 조치의 규칙에 맞을 때만 눌리고(기각은 분류 필수, 기타이면 메모까지), 누른 뒤 새 값을 받을 때까지 다시 눌리지 않는다. 서버가 거절하면 그 낱말을 보인다 */
function Action() {
  const d = useSignal()
  const [reason, setReason] = useAtom(reasonAtom)
  const [sent, setSent] = useState<unknown>(null)
  const [bad, setBad] = useState<string | null>(null)
  const id = d?.signal.id
  useEffect(() => setBad(null), [id])
  if (!d) return null
  const last = d.history.at(-1)
  if (!d.actions.length)
    return last ? (
      <Line d={last} />
    ) : (
      <div className="flex items-baseline gap-2">
        <span className={label}>{L.담당}</span>
        <span className="text-figure">{d.role}</span>
      </div>
    )
  return (
    <div className="flex flex-wrap items-center gap-2">
      {d.actions.map((a) => (
        <button key={a.kind} className={button} disabled={sent === d || !ready(a.kind, a.reason, reason)}
          onClick={() => {
            setSent(d)
            setBad(null)
            api('/rule', { id: d.signal.id, kind: a.kind, reason: filled(reason) ?? undefined }).then(
              () => setReason(blank),
              (e: Error) => {
                setBad(e.message)
                store.set(changedAtom, (n) => n + 1)
              },
            )
          }}
        >
          {a.kind}
        </button>
      ))}
      {bad && <Pill tone="bad">{bad}</Pill>}
    </div>
  )
}

/** 사유: 조치가 없으면 없음. 요청 · 기각과 보고의 채택 · 불채택(17)이 같은 칸을 쓴다. 다른 정황을 열거나 역할이 바뀌거나 결정이 내려지면 쓰던 사유를 비운다(보고가 처음 오면 trail이 undefined → [] 로 바뀌므로 길이는 0으로 본다) */
function Box() {
  const d = useSignal()
  const r = useReport()
  const role = useAtomValue(roleAtom)
  const [draft, setDraft] = useAtom(reasonAtom)
  useEffect(() => setDraft(blank), [d?.signal.id, d?.history.length, r?.trail.length ?? 0, role, setDraft])
  if (!d) return null
  const groups = [...d.actions, ...(r?.actions ?? [])].map((a) => ({ of: a.kind, classes: a.classes }))
  return groups.length ? <Reason groups={groups} value={draft} onChange={setDraft} /> : <Empty />
}

function History() {
  const d = useSignal()
  const r = useReport()
  if (!d) return null
  // 요청 · 기각과 보고의 채택 · 불채택(17)을 일어난 순서대로
  const all = [...d.history.map((h) => ({ ...h, stamp: (h as { stamp?: string }).stamp ?? '' })), ...(r?.trail ?? [])].sort((a, b) => a.stamp.localeCompare(b.stamp))
  return all.length ? all.map((h, i) => <Line key={i} d={h} />) : <Empty />
}

/** 심사 상세의 "정황": 그 심사의 구성원에 걸린 정황. 누르면 그 정황이 열린다. 표시가 붙은 심사에만 보인다 */
function Flags() {
  const r = useReview()?.review
  const on = r?.marks.includes(L.정황)
  const list = useData<{ id: string; name: string; state: string }[]>(r && on ? `/reviews/${r.id}/signals` : null)
  const setTarget = useSetAtom(targetAtom)
  if (!on || !list) return null
  return (
    <section className="mb-4 flex flex-col gap-2">
      <h2 className={label}>{L.정황}</h2>
      <Table
        head={[L.정황, L.상태]}
        rows={list.map((s) => [
          <button className="cursor-pointer text-left text-action hover:text-action-hover" onClick={() => setTarget({ kind: L.정황, id: s.id })}>
            {s.name}
          </button>,
          pill(s.state),
        ])}
      />
    </section>
  )
}

export default [
  { slot: 'fact', kind: L.정황, order: -40, View: Head },
  { slot: 'fact', kind: L.정황, order: -30, View: Evidence },
  { slot: 'fact', kind: L.정황, order: -20, View: Links },
  { slot: 'action', kind: L.정황, View: Action },
  { slot: 'reason', kind: L.정황, View: Box },
  { slot: 'history', kind: L.정황, View: History },
  { slot: 'fact', kind: L.심사, View: Flags },
] satisfies Piece[]
