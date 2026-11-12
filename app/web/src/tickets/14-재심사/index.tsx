// 14 재심사: 지급 상세의 오른쪽 사유 자리. 지급이 재심사가 된 까닭(변경: 누가·언제·무엇을)과 앞선 승인, 다시 승인한 심사.
// 재심사가 된 적 없는 지급에는 없음. 앞선 승인에는 04의 심사 상세가 표시 재심사를 보인다(Mark).
import { useSetAtom } from 'jotai'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { targetAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { label } from '../../ui/styles'
import { usePay } from '../07-지급/pay'

type Redo = {
  redo: {
    payout: string
    was: { id: string; name: string }
    cause: { role: string; at: string; item: string; value: string; since: string; dealer: string } | null
    at: string
    back: { id: string; name: string } | null
  }
}

function Why() {
  const p = usePay()
  const r = useData<Redo>(p && `/pays/${p.pay.id}/redo`)
  const setTarget = useSetAtom(targetAtom)
  if (!p) return null
  if (r?.redo.payout !== p.pay.id) return <Empty />
  const { cause, was, back } = r.redo
  const open = (x: { id: string; name: string }) => (
    <button className="cursor-pointer text-left text-base text-action hover:text-action-hover" onClick={() => setTarget({ kind: L.심사, id: x.id })}>
      {x.name}
    </button>
  )
  return (
    <div className="flex flex-col gap-2 text-base break-keep">
      {cause && (
        <div>
          <p className="tabular-nums">{[L.변경, cause.role, cause.at].join(' · ')}</p>
          <p className="text-text-sub wrap-anywhere tabular-nums">
            {cause.dealer} · {cause.item} {cause.value} · {L.변경일} {cause.since}
          </p>
        </div>
      )}
      <div className="flex items-baseline gap-2">
        <span className={label}>{L.승인}</span>
        {open(was)}
      </div>
      {back && (
        <div className="flex items-baseline gap-2">
          <span className={label}>{L.심사}</span>
          {open(back)}
        </div>
      )}
    </div>
  )
}

export default [{ slot: 'reason', kind: L.지급, View: Why }] satisfies Piece[]
