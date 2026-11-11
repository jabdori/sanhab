// 04 심사: 메뉴 "작업"의 목록(담당·진행, 여러 개를 골라 승인)과 심사 상세(가운데: 제목·숫자 줄, 구성, 관계, 규정 / 오른쪽: 조치. 이력은 06이 결정과 재상신을 함께 보인다).
// 가운데의 조각은 order -40(제목·숫자 줄) · -30(구성) · -20(관계) · -10(규정)이다. 뒤 티켓이 kind: L.심사로 끼우는 조각은 order를 적지 않으면 규정 아래에 놓이고, 사이에 끼우려면 그 사이의 값을 적는다.
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Checkbox } from '@base-ui/react/checkbox'
import { Tabs } from '@base-ui/react/tabs'
import { useAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, store, targetAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { Figures } from '../../ui/Figures'
import { Mark } from '../../ui/Mark'
import { Pill } from '../../ui/Pill'
import { blank, ready, sent as filled } from '../../ui/Reason'
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
  // 결정을 보낸 때의 목록. 새 목록을 받을 때까지는 다시 누를 수 없다
  const [sent, setSent] = useState<unknown>(null)
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
        head={['', L.종류, L.대상, ...(open ? [] : [L.귀속월]), L.금액, ...(open ? [] : [L.표시]), ...(tab === 'going' && !open ? [L.담당] : [])]}
        right={[open ? 3 : 4]}
        current={list.findIndex((t) => t.view === target?.kind && t.target === target?.id)}
        rows={list.map((t) => [
          t.pick && (
            <Checkbox.Root
              aria-label={L.선택}
              className="flex size-4 cursor-pointer items-center justify-center rounded-box border border-text-sub bg-bg text-label text-bg data-checked:border-action data-checked:bg-action"
              checked={chosen.includes(t.target)}
              onCheckedChange={(on) => setPicked(on ? [...chosen, t.target] : chosen.filter((id) => id !== t.target))}
            >
              <Checkbox.Indicator>✓</Checkbox.Indicator>
            </Checkbox.Root>
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
            <AlertDialog.Trigger className={button} disabled={sent === d}>
              {L.승인}
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Popup className={`${floating} fixed top-1/2 left-1/2 flex w-list -translate-x-1/2 -translate-y-1/2 flex-col gap-4 p-6`}>
                <AlertDialog.Title className="flex items-baseline gap-2 text-title">
                  {L.승인}
                  <span className="tabular-nums">{chosen.length}</span>
                </AlertDialog.Title>
                <div className="flex justify-end gap-2">
                  <AlertDialog.Close className={button}>{L.취소}</AlertDialog.Close>
                  <AlertDialog.Close className={button} onClick={() => {
                      setSent(d)
                      decide(chosen, L.승인).then(() => setPicked([]))
                    }}>
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
    <div className="mb-4 flex flex-col gap-2">
      <Title name={r.name} sub={`· ${r.ym}`}>
        <Pill tone={tones[r.status as keyof typeof tones] ?? 'wait'}>{r.status}</Pill>
        {marks(r.marks)}
      </Title>
      <Figures
        items={[
          [L.합산, num(r.total)],
          // 원본의 과거 승인에는 적용한 규칙의 기록이 없다(09)
          [L.한도, r.limit === null ? L.미상 : num(r.limit)],
          [L.승인권자, r.approver],
        ]}
      >
        <Source kind={r.source} file={r.file ?? undefined} row={r.row ?? undefined}>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
            <dt className={label}>{L.합산}</dt>
            <dd>{L['귀속월 지급의 합, 반려 제외']}</dd>
            <dt className={label}>{L.승인권자}</dt>
            <dd>{L['한도 이하 영업지원, 초과 영업임원']}</dd>
          </dl>
        </Source>
      </Figures>
    </div>
  )
}

function Members() {
  const r = useReview()
  if (!r) return null
  return (
    <section className="mb-4 flex flex-col gap-2">
      <h2 className={label}>{L.구성}</h2>
      <Table
        head={[L.대리점, L.금액, L.일치, L.출처]}
        right={[1]}
        rows={r.members.flatMap((m) =>
          // 지급마다 한 줄(금액의 합이 합산과 같다). 지급이 없는 구성원도 한 줄
          (m.pays.length ? m.pays : [null]).map((p) => [
            <span className="flex items-center gap-2">
              {m.name}
              <span className="text-text-sub">{m.id}</span>
            </span>,
            p ? num(p.amount) : <Empty />,
            m.match.length ? m.match.join(' · ') : <span className="text-text-mute">{L.없음}</span>,
            p && <Source kind={p.source} file={p.file ?? undefined} row={p.row ?? undefined} />,
          ]),
        )}
      />
    </section>
  )
}

/** 관계 그림. 같은 내용은 구성 표의 "일치" 열에 글자로 있다 */
function Links() {
  const r = useReview()
  if (!r) return null
  return (
    <section className="mb-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className={label}>{L.관계}</h2>
        <Source kind={L.계산} side="right">
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
            <dt className={label}>{L.관련자}</dt>
            <dd>{L['식별자 일치 2 이상']}</dd>
            <dt className={label}>{L.그룹}</dt>
            <dd>{L['관련자의 전이']}</dd>
          </dl>
        </Source>
      </div>
      {r.relation.right.length ? <Relation {...r.relation} /> : <Empty />}
    </section>
  )
}

function Rules() {
  const r = useReview()
  if (!r) return null
  return (
    <section className="mb-4 flex flex-col gap-2">
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

/** 결정 한 줄: 결정 · 사람 · 날짜 · 사유의 분류. 메모는 그 아래에 따로. 사유가 없는 조치(06의 재상신)는 사유 자리를 적지 않는다 */
export const Line = ({ d }: { d: Decision }) => (
  <div className="text-body break-keep">
    <p className="tabular-nums">{[d.kind, d.role, d.at ?? L.미상, ...(d.kind === L.재상신 ? [] : [d.reason?.class ?? `${L.사유} ${L.없음}${d.source === L.원본 ? `(${L.원본})` : ''}`])].join(' · ')}</p>
    {d.reason?.memo && <p className="text-text-sub">{d.reason.memo}</p>}
  </div>
)

/** 조치: 지금 역할이 할 수 있는 것만 버튼으로. 없으면 내려진 결정, 그것도 없으면 승인권자.
 * 버튼은 사유가 그 조치의 규칙에 맞을 때만 눌린다(필수이면 그 조치의 분류, 기타이면 메모까지). 서버가 거절하면 그 낱말을 보인다 */
function Action() {
  const r = useReview()
  const [reason, setReason] = useAtom(reasonAtom)
  // 결정을 보낸 때의 심사. 새 값을 받을 때까지는 다시 누를 수 없다
  const [sent, setSent] = useState<unknown>(null)
  // 서버가 거절한 까닭의 낱말(권한·사유·상태·대상). 다음 조치를 누르거나 다른 대상을 열면 사라진다
  const [bad, setBad] = useState<string | null>(null)
  const id = r?.review.id
  useEffect(() => setBad(null), [id])
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
    <div className="flex flex-wrap items-center gap-2">
      {r.actions.map((a) => (
        <button key={a.kind} className={button} disabled={sent === r || !ready(a.kind, a.reason, reason)}
          onClick={() => {
            setSent(r)
            setBad(null)
            api('/decide', { ids: [r.review.id], kind: a.kind, reason: filled(reason) ?? undefined }).then(
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

export default [
  { slot: 'list', menu: L.작업, View: Tasks },
  { slot: 'fact', kind: L.심사, order: -40, View: Head },
  { slot: 'fact', kind: L.심사, order: -30, View: Members },
  { slot: 'fact', kind: L.심사, order: -20, View: Links },
  { slot: 'fact', kind: L.심사, order: -10, View: Rules },
  { slot: 'action', kind: L.심사, View: Action },
] satisfies Piece[]
