// 05 승인권자: 심사 상세의 사유 칸. 지금 역할이 할 수 있는 조치마다의 분류를 고르고 메모를 쓴다.
// 쓰고 있는 사유는 04의 reasonAtom에 있고, 조치 버튼(04)이 그것으로 눌릴 수 있는지를 정하고 함께 보낸다.
import { useAtom, useAtomValue } from 'jotai'
import { useEffect } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { roleAtom } from '../../state'
import { Empty } from '../../ui/Empty'
import { Reason, blank } from '../../ui/Reason'
import { reasonAtom, useReview } from '../04-심사/review'

/** 조치가 없으면(승인권자가 아니거나 이미 결정됨) 없음. 반려된 심사의 사유 자리는 06이 채운다(재상신의 사유). 다른 심사를 열거나 역할이 바뀌거나 결정이 내려지면 쓰던 사유를 비운다 */
function Box() {
  const r = useReview()
  const role = useAtomValue(roleAtom)
  const [draft, setDraft] = useAtom(reasonAtom)
  useEffect(() => setDraft(blank), [r?.review.id, r?.history.length, role, setDraft])
  if (!r) return null
  if (r.review.status === L.반려) return null
  return r.actions.length ? <Reason groups={r.actions.map((a) => ({ of: a.kind, classes: a.classes }))} value={draft} onChange={setDraft} /> : <Empty />
}

export default [{ slot: 'reason', kind: L.심사, View: Box }] satisfies Piece[]
