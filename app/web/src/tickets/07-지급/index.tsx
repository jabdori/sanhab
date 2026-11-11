// 07 지급: 메뉴 "작업"의 목록 위에 지급의 상태별 수(회계·자금에게만. 누르면 그 상태의 지급이 펼쳐진다)와 지급 상세(가운데: 제목·숫자 줄 / 오른쪽: 조치, 이력).
// 가운데의 조각은 order -40(제목·숫자 줄) 하나다. 뒤 티켓이 kind: L.지급으로 끼우는 조각은 order를 적지 않으면 그 아래에 놓인다(08의 대사).
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { useAtom, useSetAtom } from 'jotai'
import { useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, store, targetAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { Figures } from '../../ui/Figures'
import { Pill } from '../../ui/Pill'
import { Source } from '../../ui/Source'
import { button, floating, label } from '../../ui/styles'
import { Table, num } from '../../ui/Table'
import { Title } from '../../ui/Title'
import { usePay } from './pay'

// 지급의 상태(대기·재심사·완료)와 그 색. 원본의 값(승인·미지급·반려)은 여기에 없다
const tones = { [L.대기]: 'wait', [L.재심사]: 'again', [L.완료]: 'good' } as const
type State = keyof typeof tones
const pill = (state: string) => <Pill tone={tones[state as State] ?? 'wait'}>{state}</Pill>

/** 목록 위: 대기 n  재심사 n  완료 n. 하나를 누르면 그 상태의 지급이 아래에 펼쳐지고, 다시 누르면 접힌다 */
function Counts() {
  const d = useData<{ mine: boolean; counts: Record<State, number>; rows: { id: string; name: string; ym: string; amount: number; state: string }[] }>('/pays')
  const [target, setTarget] = useAtom(targetAtom)
  const [shown, setShown] = useState<string[]>([])
  if (!d?.mine) return null
  const list = d.rows.filter((p) => shown.includes(p.state))
  return (
    <div className="mb-4 flex flex-col gap-2">
      <ToggleGroup value={shown} onValueChange={setShown} className="flex items-center gap-4">
        <span className={label}>{L.지급}</span>
        {(Object.keys(tones) as State[]).map((s) => (
          <Toggle key={s} value={s} className="flex h-head cursor-pointer items-baseline gap-1 text-body text-action outline-none hover:text-action-hover data-pressed:text-text">
            {s}
            <span className="text-figure tabular-nums">{d.counts[s]}</span>
          </Toggle>
        ))}
      </ToggleGroup>
      {shown.length > 0 && (
        <Table
          head={[L.대리점, L.귀속월, L.금액, L.상태]}
          right={[2]}
          current={list.findIndex((p) => target?.kind === L.지급 && p.id === target.id)}
          rows={list.map((p) => [
            <button className="cursor-pointer text-left text-action hover:text-action-hover" onClick={() => setTarget({ kind: L.지급, id: p.id })}>
              {p.name}
            </button>,
            p.ym,
            num(p.amount),
            pill(p.state),
          ])}
        />
      )}
    </div>
  )
}

/** 제목 줄과 숫자 줄: 대리점 · 귀속월 · 상태 / 금액, 계좌, 이 지급을 승인한 심사(누르면 그 심사가 열린다) */
function Head() {
  const p = usePay()
  const setTarget = useSetAtom(targetAtom)
  if (!p) return null
  const { pay } = p
  const cell = 'flex items-baseline gap-2'
  return (
    <div className="mb-4 flex flex-col gap-2">
      <Title name={pay.name} sub={`· ${pay.ym}`}>
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
          [
            L.심사,
            <button className="cursor-pointer text-body text-action hover:text-action-hover" onClick={() => setTarget({ kind: L.심사, id: pay.review.id })}>
              {pay.review.name}
            </button>,
          ],
        ]}
      />
    </div>
  )
}

/** 지급 표시 한 줄: 지급 · 사람 · 날짜 */
const Line = ({ h }: { h: { role: string; at: string } }) => <p className="text-body tabular-nums">{[L.지급, h.role, h.at].join(' · ')}</p>

/** 조치: 지급으로 표시할 수 있으면 버튼(되돌릴 수 없으므로 확인 창을 거친다). 아니면 남긴 지급 표시, 대기인데 담당이 아닌 역할에게는 누구 차례인지, 재심사이면 없음.
 *  거절되어도 화면을 다시 읽어 지금 할 수 있는 조치를 보인다 */
function Action() {
  const p = usePay()
  if (!p) return null
  if (!p.can) {
    // 회신이 실패해 대기로 돌아온 지급(08)은 지급 표시가 남아 있어도 다시 지급할 차례다
    if (p.history.length && p.pay.state === L.완료) return <Line h={p.history[p.history.length - 1]} />
    if (p.pay.state !== L.대기) return <Empty />
    return (
      <div className="flex items-baseline gap-2">
        <span className={label}>{L.담당}</span>
        <span className="text-figure">{p.role}</span>
      </div>
    )
  }
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger className={`${button} self-start`}>{L.지급}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Popup className={`${floating} fixed top-1/2 left-1/2 flex w-list -translate-x-1/2 -translate-y-1/2 flex-col gap-4 p-6`}>
          <AlertDialog.Title className="flex items-baseline gap-2 text-title">
            {L.지급}
            <span>{p.pay.name}</span>
            <span className="tabular-nums">{num(p.pay.amount)}</span>
          </AlertDialog.Title>
          <div className="flex justify-end gap-2">
            <AlertDialog.Close className={button}>{L.취소}</AlertDialog.Close>
            <AlertDialog.Close className={button} onClick={() => api('/pay', { id: p.pay.id }).catch(() => store.set(changedAtom, (n) => n + 1))}>
              {L.지급}
            </AlertDialog.Close>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

function History() {
  const p = usePay()
  if (!p) return null
  return p.history.length ? p.history.map((h, i) => <Line key={i} h={h} />) : <Empty />
}

export default [
  { slot: 'list', menu: L.작업, order: -1, View: Counts },
  { slot: 'fact', kind: L.지급, order: -40, View: Head },
  { slot: 'action', kind: L.지급, View: Action },
  { slot: 'history', kind: L.지급, View: History },
] satisfies Piece[]
