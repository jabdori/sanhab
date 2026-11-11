// 05 승인권자: 심사 상세의 사유 칸. 지금 역할이 할 수 있는 조치마다의 분류를 고르고 메모를 쓴다.
// 다 채운 사유만 04의 reasonAtom에 넣는다(분류가 비었거나 기타인데 메모가 비면 사유가 필수인 조치가 눌리지 않는다).
import { useAtom, useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { roleAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { Reason, blank, sent } from '../../ui/Reason'
import { reasonAtom, useReview } from '../04-심사/review'

function Box({ id }: { id: string }) {
  const rules = useData<{ kind: string; must: boolean; classes: string[] }[]>(`/reviews/${id}/reasons`)
  const [draft, setDraft] = useState(blank)
  const [reason, setReason] = useAtom(reasonAtom)
  const want = sent(draft)
  // 조치가 거절되어 04가 비워도, 쓰고 있는 사유가 남아 있으면 다시 넣는다
  useEffect(() => {
    if (JSON.stringify(reason) !== JSON.stringify(want)) setReason(want)
  })
  useEffect(() => () => setReason(null), [setReason])
  return <Reason groups={(rules ?? []).map((r) => ({ of: r.kind, classes: r.classes }))} value={draft} onChange={setDraft} />
}

/** 조치가 없으면(승인권자가 아니거나 이미 결정됨) 없음. 결정이 내려지거나 역할이 바뀌면 쓰던 사유를 비운다 */
function Slot() {
  const r = useReview()
  const role = useAtomValue(roleAtom)
  if (!r) return null
  return r.actions.length ? <Box key={`${r.review.id}/${role}/${r.history.length}`} id={r.review.id} /> : <Empty />
}

export default [{ slot: 'reason', kind: L.심사, View: Slot }] satisfies Piece[]
