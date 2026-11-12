// 04 심사: 메뉴 "작업"의 목록(담당·진행, 여러 개를 골라 승인)과 심사 상세(가운데: 제목·숫자 줄, 구성, 관계, 규정 / 오른쪽: 조치. 이력은 06이 결정과 재상신을 함께 보인다).
// 제목·숫자 줄은 머리(slot 'head', 가운데 위에 고정)이고, 가운데의 조각은 order -30(구성) · -20(관계) · -10(규정)이다. 뒤 티켓이 kind: L.심사로 끼우는 조각은 order를 적지 않으면 규정 아래에 놓이고, 사이에 끼우려면 그 사이의 값을 적는다.
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Link } from '@astryxdesign/core/Link'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Text } from '@astryxdesign/core/Text'
import { atom, useAtom, useSetAtom } from 'jotai'
import { type ReactNode, useEffect, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, menuAtom, store, targetAtom, useData } from '../../state'
import { Confirm } from '../../ui/Confirm'
import { Empty } from '../../ui/Empty'
import { Figures } from '../../ui/Figures'
import { grade } from '../../ui/grade'
import { Line as Row } from '../../ui/Line'
import { Mark } from '../../ui/Mark'
import { Pill } from '../../ui/Pill'
import { blank, ready, sent as filled } from '../../ui/Reason'
import { Region } from '../../ui/Region'
import { Relation } from '../../ui/Relation'
import { Source } from '../../ui/Source'
import { Table, num } from '../../ui/Table'
import { Title } from '../../ui/Title'
import { type Decision, bundled, reasonAtom, useReview } from './review'

type Task = { id: string; kind: string; view: string; target: string; name?: string; ym?: string; total?: number | null; marks: string[]; role: string; pick: boolean; state?: string }

/** 결정을 보낸다. 거절되어도 화면을 다시 읽어 지금 할 수 있는 조치를 보인다 */
const decide = (ids: string[], kind: string, reason?: object | null) =>
  api('/decide', { ids, kind, reason: reason ?? undefined }).catch(() => store.set(changedAtom, (n) => n + 1))

const tones = { [L.대기]: 'wait', [L.승인]: 'good', [L.보류]: 'hold', [L.반려]: 'bad' } as const
/** 지급 작업의 상태(07)와 그 색. 작업 목록의 상태 열에만 쓴다 */
const payTones = { [L.대기]: 'wait', [L.재심사]: 'again', [L.이체]: 'wait', [L.완료]: 'good' } as const

/** 목록의 정렬: 종류(한 건씩 정하는 작업이 위, 묶어서 승인하는 심사가 맨 아래 — 개수가 많은 심사가 발송·소명 같은 할 일을 덮지 않게. 종류끼리는 copy.md "작업의 종류" 순서) → 귀속월 오름차순 → 대상 */
const KINDS: string[] = [L.추인, L.종결, L.정황, L.발송, L.소명, L.미응답, L.지급, L.대사, L.재상신, L.심사]
const rank = (t: Task) => (KINDS.includes(t.kind) ? KINDS.indexOf(t.kind) : KINDS.length)
const order = (a: Task, b: Task) => rank(a) - rank(b) || (a.ym ?? '9').localeCompare(b.ym ?? '9') || (a.name ?? '').localeCompare(b.name ?? '', 'ko')

/** 담당·진행 탭. 대상을 열면 목록의 자리가 바뀌어 다시 그려지므로 탭은 밖에 둔다 */
const tabAtom = atom<'mine' | 'going'>('mine')

const marks = (list: string[], short?: boolean) => list.map((m) => <Mark key={m} short={short}>{m}</Mark>)

function Tasks() {
  const d = useData<{ mine: Task[]; going: Task[] }>('/tasks')
  const [target, setTarget] = useAtom(targetAtom)
  const [tab, setTab] = useAtom(tabAtom)
  const [picked, setPicked] = useState<string[]>([])
  // 결정을 보낸 때의 목록. 새 목록을 받을 때까지는 다시 누를 수 없다
  const [sent, setSent] = useState<unknown>(null)
  if (!d) return null
  const list = [...d[tab]].sort(order)
  // 고른 줄 가운데 아직 고를 수 있는 것만 센다(승인되면 목록에서 빠진다)
  const chosen = picked.filter((id) => d.mine.some((t) => t.pick && t.target === id))
  const open = (t: Task) => setTarget({ kind: t.view, id: t.target })
  // 상세가 열려 목록이 좁으면(360) 표시는 첫 열에 아이콘만 둔다(고르기 칸이 있는 줄은 표시가 없다 — 정황이 없어야 고를 수 있다). 넓으면 표시 열에 낱말까지
  const narrow = !!target
  // 첫 열은 종류이고 그 앞에 고정 폭의 고르기 칸(좁으면 표시 아이콘)이 있다. 열이 가장 왼쪽에서 시작하므로 종류 글자의 자리가 모든 역할·탭에서 같다.
  // 나머지 열은 값이 있는 줄이 하나라도 있을 때만 둔다
  const cols: { head: string; right?: boolean; cell: (t: Task) => ReactNode }[] = [
    {
      head: L.종류,
      cell: (t) => (
        <span className="flex items-center gap-2">
          <span className="flex w-8 items-center gap-1">
            {t.pick ? (
              <CheckboxInput label={L.선택} isLabelHidden size="sm" value={chosen.includes(t.target)}
                onChange={(on) => setPicked(on ? [...chosen, t.target] : chosen.filter((id) => id !== t.target))}
              />
            ) : (
              narrow && marks(t.marks, true)
            )}
          </span>
          <Text color="secondary">{t.kind}</Text>
        </span>
      ),
    },
    {
      head: L.대상,
      cell: (t) => (
        <Link color="primary" weight="medium" onClick={() => open(t)}>
          {t.name}
        </Link>
      ),
    },
    ...(list.some((t) => t.ym) ? [{ head: L.귀속월, cell: (t: Task) => t.ym }] : []),
    ...(list.some((t) => t.total != null) ? [{ head: L.금액, right: true, cell: (t: Task) => (t.total == null ? null : num(t.total)) }] : []),
    ...(!narrow && list.some((t) => t.kind === L.지급) ? [{ head: L.상태, cell: (t: Task) => t.kind === L.지급 && t.state && <Pill tone={payTones[t.state as keyof typeof payTones] ?? 'wait'}>{t.state}</Pill> }] : []),
    ...(!narrow && list.some((t) => t.marks.length) ? [{ head: L.표시, cell: (t: Task) => <span className="flex gap-2">{marks(t.marks)}</span> }] : []),
    ...(tab === 'going' ? [{ head: L.담당, cell: (t: Task) => t.role }] : []),
  ]
  return (
    <div className="flex flex-col gap-3">
      <TabList value={tab} onChange={(v) => setTab(v as 'mine' | 'going')} hasDivider>
        {([['mine', L.담당], ['going', L.진행]] as const).map(([value, name]) => (
          <Tab key={value} value={value} label={name} endContent={<Text color="secondary" hasTabularNumbers>{d[value].length}</Text>} />
        ))}
      </TabList>
      <Table
        head={cols.map((c) => c.head)}
        right={cols.flatMap((c, i) => (c.right ? [i] : []))}
        current={list.findIndex((t) => t.view === target?.kind && t.target === target?.id)}
        onRow={(y) => open(list[y])}
        rows={list.map((t) => cols.map((c) => c.cell(t)))}
      />
      {/* 일괄 승인 띠: 목록 칸의 맨 아래에 붙고, 칸의 여백(24)까지 덮어 아래 줄이 비치지 않는다 */}
      {tab === 'mine' && chosen.length > 0 && (
        <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 flex items-center gap-3 border-t border-border bg-surface px-6 py-3">
          <Text type="supporting">{L.선택}</Text>
          <Text weight="semibold" hasTabularNumbers>
            {chosen.length}
          </Text>
          <Confirm label={L.승인} variant={grade(L.승인)} title={`${L.승인} ${chosen.length}`} rows={[[L.대상, d.mine.filter((t) => chosen.includes(t.target)).map((t) => t.name).join(' · ')]]} isDisabled={sent === d}
            onConfirm={() => {
              setSent(d)
              return decide(chosen, L.승인).then(() => setPicked([]))
            }}
          />
        </div>
      )}
    </div>
  )
}

/** 머리(가운데 위에 고정): 제목 줄과 숫자 줄. 숫자 줄이 판단의 재료 전부다(합산, 한도, 승인권자) */
function Head() {
  const r = useReview()?.review
  if (!r) return null
  return (
    <>
      <Title name={r.name} sub={r.ym}>
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
        <Source
          kind={r.source}
          file={r.file ?? undefined}
          row={r.row ?? undefined}
          tip={`${L.합산} · ${L.승인권자}`}
          rows={[
            [L.합산, L['귀속월 지급의 합, 반려 제외']],
            [L.승인권자, L['한도 이하 영업지원, 초과 영업임원']],
          ]}
        />
      </Figures>
    </>
  )
}

function Members() {
  const r = useReview()
  if (!r) return null
  return (
    <Region title={L.구성}>
      <Table
        head={[L.대리점, L.금액, L.일치, L.출처]}
        right={[1]}
        rows={r.members.flatMap((m) =>
          // 지급마다 한 줄(금액의 합이 합산과 같다). 지급이 없는 구성원도 한 줄
          (m.pays.length ? m.pays : [null]).map((p) => [
            <span className="flex items-baseline gap-2">
              <Text weight="medium">{m.name}</Text>
              <Text type="supporting">{m.id}</Text>
            </span>,
            p ? num(p.amount) : '',
            m.match.length ? m.match.join(' · ') : <Text color="secondary">{L.없음}</Text>,
            p && <Source kind={p.source} file={p.file ?? undefined} row={p.row ?? undefined} />,
          ]),
        )}
      />
    </Region>
  )
}

/** 관계 그림. 같은 내용은 구성 표의 "일치" 열에 글자로 있다. 이웃이 없으면(단독) 접힌 `관계 없음` */
function Links() {
  const r = useReview()
  if (!r) return null
  return (
    <Region
      title={L.관계}
      aside={
        r.relation.right.length > 0 && (
          <Source
            kind={L.계산}
            side="right"
            tip={`${L.관련자} · ${L.그룹}`}
            rows={[
              [L.관련자, L['식별자 일치 2 이상']],
              [L.그룹, L['관련자의 전이']],
            ]}
          />
        )
      }
    >
      {r.relation.right.length ? <Relation {...r.relation} /> : <Empty />}
    </Region>
  )
}

/** 규정 줄. 조항을 누르면 메뉴 "규정"의 그 조항이 열린다(22) */
function Rules() {
  const r = useReview()
  const setMenu = useSetAtom(menuAtom)
  const setTarget = useSetAtom(targetAtom)
  if (!r) return null
  return (
    <Region title={L.규정}>
      <Table
        head={[L.조항, L.규칙, L.출처]}
        rows={r.rules.map((x) => [
          <Link onClick={() => {
              setMenu(L.규정)
              setTarget({ kind: L.규정, id: x.clause })
            }}
          >
            {x.title}
          </Link>,
          `${x.name} v${x.ver}`,
          <Source kind={x.source} tip={x.title} place={`${x.first}–${x.last}${L.행}`} rows={[[L.위치, `${x.file} ${x.first}–${x.last}${L.행}`]]}>
            {x.text}
          </Source>,
        ])}
      />
    </Region>
  )
}

/** 결정 한 줄: 결정(굵게) · 사람 · 날짜 · 사유의 분류. 메모는 그 아래에 따로. 앱에서 사람이 내린 결정은 제품의 동작이므로 출처 표지를 달지 않는다 */
export const Line = ({ d }: { d: Decision }) => (
  <Row kind={d.kind} parts={[d.role, d.at ?? L.미상, d.reason?.class ?? `${L.사유} ${L.없음}${d.source === L.원본 ? `(${L.원본})` : ''}`]} memo={d.reason?.memo} />
)

/** 조치: 지금 역할이 할 수 있는 것만 버튼으로(등급은 ui/grade — 승인이 주 버튼). 없으면, 끝난 심사(승인·반려)는 내려진 결정, 아직 승인권자의 차례인 심사(대기·보류. 재상신으로 돌아온 것 포함)는 승인권자.
 * 버튼은 사유가 그 조치의 규칙에 맞을 때만 눌린다(필수이면 그 조치의 분류, 기타이면 메모까지). 서버가 거절하면 그 낱말을 보인다 */
function Action() {
  const r = useReview()
  const [reason, setReason] = useAtom(reasonAtom)
  // 결정을 보낸 때의 심사. 새 값을 받을 때까지는 다시 누를 수 없다
  const [sent, setSent] = useState<unknown>(null)
  // 서버가 거절한 까닭의 낱말(권한·사유·상태·대상). 다음 조치를 누르거나 다른 대상을 열면 사라진다
  const [bad, setBad] = useState<string | null>(null)
  const id = r?.review.id
  useEffect(() => {
    setBad(null)
  }, [id])
  if (!r) return null
  // 묶음에 내리는 조치(추인·거부·종결·이견)는 한 건 화면에서 누르지 않는다. 묶음으로 가는 길은 10이 낸다
  const acts = r.actions.filter((a) => !bundled.includes(a.kind))
  const last = r.history.at(-1)
  if (!acts.length)
    return last && r.review.status !== L.대기 && r.review.status !== L.보류 ? (
      <Line d={last} />
    ) : (
      <div className="flex items-baseline gap-2">
        <Text type="supporting">{r.review.holder === r.review.approver ? L.승인권자 : L.담당}</Text>
        <Text weight="semibold">{r.review.holder}</Text>
      </div>
    )
  return (
    <div className="flex flex-wrap items-center gap-2">
      {acts.map((a) => (
        <Button key={a.kind} label={a.kind} variant={grade(a.kind)} isDisabled={sent === r || !ready(a.kind, a.reason, reason)}
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
        />
      ))}
      {bad && <Pill tone="bad">{bad}</Pill>}
    </div>
  )
}

export default [
  { slot: 'list', menu: L.작업, View: Tasks },
  { slot: 'head', kind: L.심사, View: Head },
  { slot: 'fact', kind: L.심사, order: -30, View: Members },
  { slot: 'fact', kind: L.심사, order: -20, View: Links },
  { slot: 'fact', kind: L.심사, order: -10, View: Rules },
  { slot: 'action', kind: L.심사, View: Action },
] satisfies Piece[]
