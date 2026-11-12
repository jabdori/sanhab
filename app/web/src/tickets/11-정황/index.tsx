// 11 정황: 정황 상세(가운데: 제목·숫자 줄, 근거, 관계 / 오른쪽: 조치(요청 · 기각), 사유, 이력)와 심사 상세의 "정황" 줄.
// 가운데의 조각은 order -40(제목·숫자 줄) · -30(근거) · -20(관계)이다. 뒤 티켓이 kind: L.정황으로 끼우는 조각은 order를 적지 않으면 관계 아래에 놓인다(12의 가설).
// 가운데의 값은 모두 코드가 기록에서 읽은 것이다(AI의 글은 오른쪽 "보고"에 — 17).
import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { type ReactNode, useEffect, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, roleAtom, store, targetAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { Figures } from '../../ui/Figures'
import { grade } from '../../ui/grade'
import { Mark } from '../../ui/Mark'
import { Pill } from '../../ui/Pill'
import { Reason, blank, ready, sent as filled } from '../../ui/Reason'
import { Region } from '../../ui/Region'
import { Relation } from '../../ui/Relation'
import { DECISION, Source } from '../../ui/Source'
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
  // 근접·지연의 기준은 가정(결정 번호로 잇는다). 나머지는 계산한 기준이라 이름표와 값으로 보인다
  const src = DECISION[s.kind] ? (
    <Source kind={L.가정} of={s.kind} tip={`${k} ${v}`} rows={[[k, v]]} />
  ) : (
    <Source kind={s.source} tip={`${k} ${v}`} rows={[[k, v]]} />
  )
  return (
    <>
      <Title name={s.name}>{pill(s.state)}</Title>
      <Figures
        items={[
          [L.근거, d.evidence.length],
          [L.대리점, s.dealers.length],
          ...(s.kind === L.지연 ? [[L.지연, `${d.delay}${L.일}`] as [string, string]] : []),
        ]}
      >
        {src}
      </Figures>
    </>
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
  // 날짜(또는 귀속월)와 대리점은 뜻이 다르니 열을 나눈다. 줄이 없는 쪽은 빈칸이고, 한쪽이 아예 없으면 그 열을 두지 않는다
  const dated = (e: (typeof rows)[number]) => e.at || e.ym
  const hasDate = rows.some(dated)
  const hasDealer = rows.some((e) => !dated(e) && e.dealer)
  const when = rows.filter(dated).every((e) => e.ym && !e.at) ? L.귀속월 : L.날짜
  const split = (date: ReactNode, dealer: ReactNode) => [...(hasDate ? [date] : []), ...(hasDealer ? [dealer] : [])]
  return (
    <Region title={L.근거}>
      <Table
        head={[L.근거, ...(hasDate ? [when] : []), ...(hasDealer ? [L.대리점] : []), nodes ? L.식별자 : amounts ? L.금액 : L.비교, L.출처]}
        right={!nodes && amounts ? [1 + Number(hasDate) + Number(hasDealer)] : []}
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
          ...split(
          e.known ? (
            <span className="flex flex-wrap items-center gap-x-2 tabular-nums">
              <span className="whitespace-nowrap">{`${L.변경일} ${e.at}`}</span>
              <span className="whitespace-nowrap">{`${L.인지일} ${e.known}`}</span>
              <span className="whitespace-nowrap">{`${e.days}${L.일}`}</span>
              <Source kind={L.계산} tip={`${L.지연} ${e.days}${L.일}`} rows={[[L.지연, `${e.days}${L.일}`]]} />
            </span>
          ) : (
            (e.at ?? e.ym)
          ),
          dated(e) ? null : e.dealer?.name,
          ),
          e.node?.name ?? (e.amount == null ? e.value : num(e.amount)),
          <Source kind={e.source} file={e.file ?? undefined} row={e.row ?? undefined}
            tip={e.value ?? undefined}
            rows={e.want && e.got ? [[L.승인, [num(e.want.amount), ...e.want.accounts].join(' · ')], [L.회신, [num(e.got.amount), e.got.account].join(' · ')], [L.비교, e.value ?? '']] : undefined}
          >
          </Source>,
        ])}
      />
    </Region>
  )
}

/** 관계 그림: 대상 대리점이 왼쪽, 근거의 사람·주소·계좌가 가운데. 점선은 등록이 아닌 이어짐(회수가 들어간 계좌). 같은 내용은 근거 표에 있다 */
function Links() {
  const d = useSignal()
  if (!d) return null
  return (
    <Region title={L.관계}>{d.relation.mid.length ? <Relation {...d.relation} /> : <Empty />}</Region>
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
        <Text type="supporting">{L.담당}</Text>
        <Text weight="semibold">{d.role}</Text>
      </div>
    )
  return (
    <div className="flex flex-wrap items-center gap-2">
      {d.actions.map((a) => (
        <Button key={a.kind} label={a.kind} variant={grade(a.kind)} isDisabled={sent === d || !ready(a.kind, a.reason, reason)}
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
        />
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
  // 정황의 조치(요청·기각)의 사유만. 조치가 없으면 접힌다(보고의 채택·불채택은 보고 칸에서 고른다 — 17)
  const groups = d.actions.map((a) => ({ of: a.kind, classes: a.classes }))
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
  const list = useData<{ id: string; kind: string; name: string; state: string }[]>(r && on ? `/reviews/${r.id}/signals` : null)
  const setTarget = useSetAtom(targetAtom)
  if (!on || !list) return null
  return (
    <Region title={L.정황}>
      <Table
        head={[L.정황, L.상태, L.출처]}
        onRow={(y) => setTarget({ kind: L.정황, id: list[y].id })}
        rows={list.map((s) => [
          <Link color="primary" weight="medium" onClick={() => setTarget({ kind: L.정황, id: s.id })}>
            {s.name}
          </Link>,
          pill(s.state),
          // 기준이 가정인 종류(근접 D51, 지연 D30)는 그 가정의 표지
          DECISION[s.kind] && <Source kind={L.가정} of={s.kind} />,
        ])}
      />
    </Region>
  )
}

export default [
  { slot: 'head', kind: L.정황, View: Head },
  { slot: 'fact', kind: L.정황, order: -30, View: Evidence },
  { slot: 'fact', kind: L.정황, order: -20, View: Links },
  { slot: 'action', kind: L.정황, View: Action },
  { slot: 'reason', kind: L.정황, View: Box },
  { slot: 'history', kind: L.정황, View: History },
  { slot: 'fact', kind: L.심사, View: Flags },
] satisfies Piece[]
