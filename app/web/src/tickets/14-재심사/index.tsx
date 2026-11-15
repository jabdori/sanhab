// 14 재심사: 지급 기록의 "재심사" 영역. 지급이 재심사가 된 까닭(변경: 누가·언제·무엇을)과 앞선 승인, 다시 승인한 심사.
// 재심사가 된 적 없는 지급에는 영역이 없다. 앞선 승인에는 04의 심사 기록이 표시 재심사를 보인다(Mark).
import { Link } from '@astryxdesign/core/Link'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Text } from '@astryxdesign/core/Text'
import { useSetAtom } from 'jotai'
import { L } from '../../labels'
import { targetAtom, useData } from '../../state'
import { Region } from '../../ui/Region'
import { usePay } from '../07-지급/pay'

type Redo = {
  redo: {
    payout: string
    was: { id: string; name: string; approver?: string; at?: string | null }
    cause: { role: string; at: string; item: string; value: string; since: string; dealer: string } | null
    at: string
    back: { id: string; name: string } | null
    /** 아직 다시 승인되지 않았으면 이 지급이 지금 든 심사 */
    now?: { id: string; name: string } | null
  }
}

export function Why() {
  const p = usePay().data
  // 재심사가 된 적 없는 지급에는 영역이 없다(값이 없는 것이 정상이라 읽는 중에도 그리지 않는다)
  const r = useData<Redo>(p ? `/pays/${p.pay.id}/redo` : null)
  const setTarget = useSetAtom(targetAtom)
  if (!p || r?.redo.payout !== p.pay.id) return null
  const { cause, was, back, now } = r.redo
  const open = (x: { id: string; name: string }) => <Link onClick={() => setTarget({ kind: L.심사, id: x.id })}>{x.name}</Link>
  return (
    <Region title={L.재심사}>
      <MetadataList columns="single" label={{ position: 'start', width: 72 }}>
        {/* 값 하나에 사실 하나(review.md 2-1): 재심사를 부른 변경(받은 날 · 대리점 · 항목의 새 값 · 변경일), 앞선 승인(그 심사 · 승인권자 · 날짜) */}
        {cause && (
          <>
            <MetadataListItem label={L.변경}>
              <Text hasTabularNumbers>{cause.at}</Text>
            </MetadataListItem>
            <MetadataListItem label={L.역할}>{cause.role}</MetadataListItem>
            <MetadataListItem label={L.대리점}>{cause.dealer}</MetadataListItem>
            <MetadataListItem label={cause.item}>{cause.value}</MetadataListItem>
            <MetadataListItem label={L.변경일}>
              <Text hasTabularNumbers>{cause.since}</Text>
            </MetadataListItem>
          </>
        )}
        <MetadataListItem label={L.승인}>{open(was)}</MetadataListItem>
        <MetadataListItem label={L.승인권자}>{was.approver ?? L.미상}</MetadataListItem>
        {was.at && (
          <MetadataListItem label={L.날짜}>
            <Text hasTabularNumbers>{was.at}</Text>
          </MetadataListItem>
        )}
        {(back ?? now) && <MetadataListItem label={L.심사}>{open((back ?? now)!)}</MetadataListItem>}
      </MetadataList>
    </Region>
  )
}

