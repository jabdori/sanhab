// 07 지급: 메뉴 "작업"의 목록 위에 지급의 상태별 수(회계·자금에게만. 누르면 그 상태의 지급이 보인다)와 지급 상세(가운데: 제목·숫자 줄 / 오른쪽: 조치, 이력).
// 제목·숫자 줄은 머리(slot 'head')이고, 뒤 티켓이 kind: L.지급으로 끼우는 가운데 조각은 order를 적지 않는다(08의 대사).
import { Link } from '@astryxdesign/core/Link'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Text } from '@astryxdesign/core/Text'
import { useAtom, useSetAtom } from 'jotai'
import { useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, store, targetAtom, useData } from '../../state'
import { Confirm } from '../../ui/Confirm'
import { Empty } from '../../ui/Empty'
import { Figures } from '../../ui/Figures'
import { grade } from '../../ui/grade'
import { Pill } from '../../ui/Pill'
import { Region } from '../../ui/Region'
import { Source } from '../../ui/Source'
import { Table, num } from '../../ui/Table'
import { Title } from '../../ui/Title'
import { usePay } from './pay'

// 지급의 상태(대기·재심사·이체·완료)와 그 색. 이체는 지급으로 표시했고 은행의 회신을 기다리는 것(D54). 원본의 값(승인·미지급·반려)은 여기에 없다
const tones = { [L.대기]: 'wait', [L.재심사]: 'again', [L.이체]: 'wait', [L.완료]: 'good' } as const
type State = keyof typeof tones
const pill = (state: string) => <Pill tone={tones[state as State] ?? 'wait'}>{state}</Pill>

/** 목록 위: 대기 n  재심사 n  이체 n  완료 n 탭. 하나를 고르면 그 상태의 지급이 아래에 보인다 */
function Counts() {
  const d = useData<{ mine: boolean; counts: Record<State, number>; rows: { id: string; name: string; ym: string; amount: number; state: string }[] }>('/pays')
  const [target, setTarget] = useAtom(targetAtom)
  const [picked, setShown] = useState<State | null>(null)
  if (!d?.mine) return null
  // 고르지 않았으면 지급이 있는 첫 상태
  const shown = picked ?? (Object.keys(tones) as State[]).find((s) => d.counts[s]) ?? L.대기
  const list = d.rows.filter((p) => p.state === shown)
  const open = (id: string) => setTarget({ kind: L.지급, id })
  return (
    <Region title={L.지급} className="pb-6">
      <TabList value={shown} onChange={(v) => setShown(v as State)} hasDivider>
        {(Object.keys(tones) as State[]).map((s) => (
          <Tab key={s} value={s} label={s} endContent={<Text color="secondary" hasTabularNumbers>{d.counts[s]}</Text>} />
        ))}
      </TabList>
      <Table
        head={[L.대리점, L.귀속월, L.금액, L.상태]}
        right={[2]}
        current={list.findIndex((p) => target?.kind === L.지급 && p.id === target.id)}
        onRow={(y) => open(list[y].id)}
        rows={list.map((p) => [
          <Link color="primary" weight="medium" onClick={() => open(p.id)}>
            {p.name}
          </Link>,
          p.ym,
          num(p.amount),
          pill(p.state),
        ])}
      />
    </Region>
  )
}

/** 머리(가운데 위에 고정): 대리점 · 귀속월 · 상태 / 금액, 계좌, 이 지급을 승인한 심사(누르면 그 심사가 열린다). 값은 원본이라 표지 없이 행 번호만 */
function Head() {
  const p = usePay()
  const setTarget = useSetAtom(targetAtom)
  if (!p) return null
  const { pay } = p
  const cell = 'flex items-baseline gap-2'
  return (
    <>
      <Title name={pay.name} sub={pay.ym}>
        {pill(pay.state)}
      </Title>
      <Figures
        items={[
          [
            L.금액,
            <span className={cell}>
              {num(pay.amount)}
              <Source kind={pay.source} file={pay.file} row={pay.row} />
            </span>,
          ],
          [
            L.계좌,
            p.accounts.length ? (
              <span className={cell}>
                {p.accounts.map((a) => (
                  <span key={a.value} className={cell}>
                    {a.value}
                    <Source kind={a.source} file={a.file} row={a.row} />
                  </span>
                ))}
              </span>
            ) : (
              <Empty />
            ),
          ],
          [L.심사, <Link onClick={() => setTarget({ kind: L.심사, id: pay.review.id })}>{pay.review.name}</Link>],
        ]}
      />
    </>
  )
}

/** 지급 표시 한 줄: 지급(굵게) · 사람 · 날짜 */
const Line = ({ h }: { h: { role: string; at: string } }) => (
  <div className="flex flex-wrap items-center gap-x-2 tabular-nums">
    <Text weight="semibold">{L.지급}</Text>
    <Text color="secondary">{[h.role, h.at].join(' · ')}</Text>
  </div>
)

/** 조치: 지급으로 표시할 수 있으면 버튼(주 버튼, 되돌릴 수 없으므로 확인 창을 거친다). 아니면 남긴 지급 표시, 대기인데 담당이 아닌 역할에게는 누구 차례인지, 재심사이면 없음.
 *  거절되어도 화면을 다시 읽어 지금 할 수 있는 조치를 보인다 */
function Action() {
  const p = usePay()
  if (!p) return null
  if (!p.can) {
    // 회신이 실패해 대기로 돌아온 지급(08)은 지급 표시가 남아 있어도 다시 지급할 차례다
    if (p.history.length && (p.pay.state === L.이체 || p.pay.state === L.완료)) return <Line h={p.history[p.history.length - 1]} />
    if (p.pay.state !== L.대기) return <Empty />
    return (
      <div className="flex items-baseline gap-2">
        <Text type="supporting">{L.담당}</Text>
        <Text weight="semibold">{p.role}</Text>
      </div>
    )
  }
  return (
    <div>
      <Confirm
        label={L.지급}
        variant={grade(L.지급)}
        title={`${L.지급} ${p.pay.name} ${num(p.pay.amount)}`}
        onConfirm={() => api('/pay', { id: p.pay.id }).catch(() => store.set(changedAtom, (n) => n + 1))}
      />
    </div>
  )
}

export default [
  { slot: 'list', menu: L.작업, order: -1, View: Counts },
  { slot: 'head', kind: L.지급, View: Head },
  { slot: 'action', kind: L.지급, View: Action },
  // 이력은 08(대사)의 조각이 지급 표시와 회신을 일어난 순서대로 함께 보인다
] satisfies Piece[]
