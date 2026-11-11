// 05 승인권자: 심사 상세의 사유 칸. 지금 역할이 할 수 있는 조치마다의 분류를 고르고 메모를 쓴다.
// 쓰고 있는 사유는 04의 reasonAtom에 있고, 조치 버튼(04)이 그것으로 눌릴 수 있는지를 정하고 함께 보낸다.
import { useAtom, useAtomValue } from 'jotai'
import { useEffect } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { roleAtom } from '../../state'
import { Empty } from '../../ui/Empty'
import { Reason, blank } from '../../ui/Reason'
import { bundled, reasonAtom, useReview } from '../04-심사/review'

/** 조치가 없으면(승인권자가 아니거나 이미 결정됨) 없음. 다른 심사를 열거나 역할이 바뀌거나 결정이 내려지면 쓰던 사유를 비운다 */
function Box() {
  const r = useReview()
  const role = useAtomValue(roleAtom)
  const [draft, setDraft] = useAtom(reasonAtom)
  useEffect(() => setDraft(blank), [r?.review.id, r?.history.length, role, setDraft])
  if (!r) return null
  // 한 건 화면에서 누를 수 없는 조치(묶음의 것)는 사유도 받지 않는다
  const acts = r.actions.filter((a) => !bundled.includes(a.kind))
  return acts.length ? <Reason groups={acts.map((a) => ({ of: a.kind, classes: a.classes }))} value={draft} onChange={setDraft} /> : <Empty />
}

export default [{ slot: 'reason', kind: L.심사, View: Box }] satisfies Piece[]
