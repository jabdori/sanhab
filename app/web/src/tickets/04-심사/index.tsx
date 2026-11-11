// 04 심사: 메뉴 "작업"의 목록(담당·진행, 여러 개를 골라 승인)과 심사 상세(가운데: 제목·숫자 줄, 구성, 관계, 규정 / 오른쪽: 조치, 이력).
// 가운데의 조각은 order -40(제목·숫자 줄) · -30(구성) · -20(관계) · -10(규정)이다. 뒤 티켓이 kind: L.심사로 끼우는 조각은 order를 적지 않으면 규정 아래에 놓이고, 사이에 끼우려면 그 사이의 값을 적는다.
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Tabs } from '@base-ui/react/tabs'
import { useAtom } from 'jotai'
import { useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, store, targetAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { Mark } from '../../ui/Mark'
import { Pill } from '../../ui/Pill'
import { Relation } from '../../ui/Relation'
import { Source } from '../../ui/Source'
import { button, floating, label } from '../../ui/styles'
import { Table, num } from '../../ui/Table'
import { Title } from '../../ui/Title'
import { type Decision, reasonAtom, useReview } from './review'

type Task = { id: string; kind: string; view: string; target: string; name?: string; ym?: string; total?: number; marks: string[]; role: string; pick: boolean }

/** 결정을 보낸다. 거절되어도 화면을 다시 읽어 지금 할 수 있는 조치를 보인다 */
const decide = (ids: string[], kind: string, reason?: object | null) =>
  api('/decide', { ids, kind, reason: reason ?? undefined }).catch(() => store.set(changedAtom, (n) => n + 1))

const tones = { [L.대기]: 'wait', [L.승인]: 'good', [L.보류]: 'hold', [L.반려]: 'bad' } as const
const marks = (list: string[]) => list.map((m) => <Mark key={m}>{m}</Mark>)

function Tasks() {
  const d = useData<{ mine: Task[]; going: Task[] }>('/tasks')
  const [target, setTarget] = useAtom(targetAtom)
  const [tab, setTab] = useState<'mine' | 'going'>('mine')
  const [picked, setPicked] = useState<string[]>([])
  if (!d) return null
  const list = d[tab]
  // 고른 줄 가운데 아직 고를 수 있는 것만 센다(승인되면 목록에서 빠진다)
  const chosen = picked.filter((id) => d.mine.some((t) => t.pick && t.target === id))
  const open = !!target
  return (
    <div className="flex flex-col gap-2">
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List className="flex gap-4 border-b border-line">
          {([['mine', L.담당], ['going', L.진행]] as const).map(([value, name]) => (
            <Tabs.Tab key={value} value={value} className="flex h-head cursor-pointer items-center gap-1 text-body text-action outline-none hover:text-action-hover data-active:text-figure data-active:text-text">
              {name}
              <span className="tabular-nums">{d[value].length}</span>
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.Root>
      <Table
        head={['', L.종류, L.대상, ...(open ? [] : [L.귀속월]), L.합산, ...(open ? [] : [L.표시]), ...(tab === 'going' && !open ? [L.담당] : [])]}
        right={[open ? 3 : 4]}
        current={list.findIndex((t) => t.view === target?.kind && t.target === target?.id)}
        rows={list.map((t) => [
          t.pick && (
            <input
              type="checkbox"
              aria-label={L.선택}
              className="accent-action"
              checked={chosen.includes(t.target)}
              onChange={(e) => setPicked(e.target.checked ? [...chosen, t.target] : chosen.filter((id) => id !== t.target))}
            />
          ),
          t.kind,
          <button className="cursor-pointer text-left text-action hover:text-action-hover" onClick={() => setTarget({ kind: t.view, id: t.target })}>
            {t.name}
          </button>,
          ...(open ? [] : [t.ym]),
          t.total === undefined ? null : num(t.total),
          ...(open ? [] : [<span className="flex gap-2">{marks(t.marks)}</span>]),
          ...(tab === 'going' && !open ? [t.role] : []),
        ])}
      />
      {tab === 'mine' && chosen.length > 0 && (
        <div className="sticky -bottom-4 flex items-center gap-2 border-t border-line bg-bg py-2">
          <span className={label}>{L.선택}</span>
          <span className="text-figure tabular-nums">{chosen.length}</span>
          <AlertDialog.Root>
            <AlertDialog.Trigger className={button}>{L.승인}</AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Popup className={`${floating} fixed top-1/2 left-1/2 flex w-list -translate-x-1/2 -translate-y-1/2 flex-col gap-4 p-6`}>
                <AlertDialog.Title className="flex items-baseline gap-2 text-title">
                  {L.승인}
                  <span className="tabular-nums">{chosen.length}</span>
                </AlertDialog.Title>
                <div className="flex justify-end gap-2">
                  <AlertDialog.Close className={button}>{L.취소}</AlertDialog.Close>
                  <AlertDialog.Close className={button} onClick={() => decide(chosen, L.승인).then(() => setPicked([]))}>
                    {L.승인}
                  </AlertDialog.Close>
                </div>
              </AlertDialog.Popup>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </div>
      )}
    </div>
  )
}

/** 제목 줄과 숫자 줄 */
function Head() {
  const r = useReview()?.review
  if (!r) return null
  return (
    <div className="flex flex-col gap-2">
      <Title name={r.name} sub={r.ym}>
        <Pill tone={tones[r.status as keyof typeof tones] ?? 'wait'}>{r.status}</Pill>
        {marks(r.marks)}
      </Title>
      <dl className="flex items-baseline gap-6">
        {[
          [L.합산, num(r.total)],
          [L.한도, num(r.limit)],
          [L.승인권자, r.approver],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-2">
            <dt className={label}>{k}</dt>
            <dd className="text-figure tabular-nums">{v}</dd>
          </div>
        ))}
        <Source kind={r.source}>{L['귀속월의 지급을 더하고 반려는 뺀다, 합산이 한도 이하이면 영업지원, 넘으면 영업임원']}</Source>
      </dl>
    </div>
  )
}

function Members() {
  const r = useReview()
  if (!r) return null
  return (
    <section className="mt-4 flex flex-col gap-2">
      <h2 className={label}>{L.구성}</h2>
      <Table
        head={[L.대리점, L.금액, L.일치, L.출처]}
        right={[1]}
        rows={r.members.map((m) => [
          <span className="flex items-center gap-2">
            {m.name}
            <span className="text-text-sub">{m.id}</span>
          </span>,
          m.pay ? num(m.pay.amount) : <Empty />,
          m.match.length ? m.match.join(' · ') : <span className="text-text-mute">{L.없음}</span>,
          m.pay && <Source kind={m.pay.source} file={m.pay.file} row={m.pay.row} />,
        ])}
      />
    </section>
  )
}

/** 관계 그림. 같은 내용은 구성 표의 "일치" 열에 글자로 있다 */
function Links() {
  const r = useReview()
  if (!r) return null
  return (
    <section className="mt-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className={label}>{L.관계}</h2>
        <Source kind={L.계산}>{L['식별자 셋 중 둘 이상이 일치하면 관련자, 관련자를 이으면 그룹']}</Source>
      </div>
      {r.relation.right.length ? <Relation {...r.relation} /> : <Empty />}
    </section>
  )
}

function Rules() {
  const r = useReview()
  if (!r) return null
  return (
    <section className="mt-4 flex flex-col gap-2">
      <h2 className={label}>{L.규정}</h2>
      <Table
        head={[L.조항, L.규칙, L.출처]}
        rows={r.rules.map((x) => [
          x.title,
          `${x.name} v${x.ver}`,
          <Source kind={x.source}>
            <div className="flex justify-between gap-2">
              <span className="break-all">{x.file}</span>
              <span className="shrink-0 tabular-nums">
                {x.first}–{x.last}
                {L.행}
              </span>
            </div>
            <p className="border-t border-line pt-2 whitespace-pre-wrap">{x.text}</p>
          </Source>,
        ])}
      />
    </section>
  )
}

/** 결정 한 줄: 결정 · 사람 · 날짜 · 사유 */
const Line = ({ d }: { d: Decision }) => (
  <p className="text-body tabular-nums">
    {[d.kind, d.role, d.at, d.reason?.class ? [d.reason.class, d.reason.memo].filter(Boolean).join(' ') : `${L.사유} ${L.없음}${d.source === L.원본 ? `(${L.원본})` : ''}`].join(' · ')}
  </p>
)

/** 조치: 지금 역할이 할 수 있는 것만 버튼으로. 없으면 내려진 결정, 그것도 없으면 승인권자 */
function Action() {
  const r = useReview()
  const [reason, setReason] = useAtom(reasonAtom)
  if (!r) return null
  const last = r.history.at(-1)
  if (!r.actions.length)
    return last ? (
      <Line d={last} />
    ) : (
      <div className="flex items-baseline gap-2">
        <span className={label}>{L.승인권자}</span>
        <span className="text-figure">{r.review.approver}</span>
      </div>
    )
  return (
    <div className="flex gap-2">
      {r.actions.map((a) => (
        <button key={a.kind} className={button} disabled={a.reason && !reason?.class} onClick={() => decide([r.review.id], a.kind, reason).then(() => setReason(null))}>
          {a.kind}
        </button>
      ))}
    </div>
  )
}

function History() {
  const r = useReview()
  if (!r) return null
  return r.history.length ? r.history.map((d, i) => <Line key={i} d={d} />) : <Empty />
}

export default [
  { slot: 'list', menu: L.작업, View: Tasks },
  { slot: 'fact', kind: L.심사, order: -40, View: Head },
  { slot: 'fact', kind: L.심사, order: -30, View: Members },
  { slot: 'fact', kind: L.심사, order: -20, View: Links },
  { slot: 'fact', kind: L.심사, order: -10, View: Rules },
  { slot: 'action', kind: L.심사, View: Action },
  { slot: 'history', kind: L.심사, View: History },
] satisfies Piece[]
