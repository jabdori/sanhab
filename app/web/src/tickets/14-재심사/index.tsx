// 14 재심사: 지급 기록의 "재심사" 영역. 지급이 재심사가 된 까닭(변경: 누가·언제·무엇을)과 앞선 승인, 다시 승인한 심사.
// 재심사가 된 적 없는 지급에는 영역이 없다. 앞선 승인에는 04의 심사 기록이 표시 재심사를 보인다(Mark).
import { Link } from '@astryxdesign/core/Link'
import { VStack } from '@astryxdesign/core/Layout'
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
    was: { id: string; name: string }
    cause: { role: string; at: string; item: string; value: string; since: string; dealer: string } | null
    at: string
    back: { id: string; name: string } | null
    /** 아직 다시 승인되지 않았으면 이 지급이 지금 든 심사 */
    now?: { id: string; name: string } | null
  }
}

export function Why() {
  const p = usePay()
  const r = useData<Redo>(p && `/pays/${p.pay.id}/redo`)
  const setTarget = useSetAtom(targetAtom)
  if (!p || r?.redo.payout !== p.pay.id) return null
  const { cause, was, back, now } = r.redo
  const open = (x: { id: string; name: string }) => <Link onClick={() => setTarget({ kind: L.심사, id: x.id })}>{x.name}</Link>
  return (
    <Region title={L.재심사}>
      <MetadataList columns="single" label={{ position: 'start', width: 72 }}>
        {cause && (
          <MetadataListItem label={L.변경}>
            <VStack gap={0.5}>
              <Text hasTabularNumbers>{[cause.role, cause.at].join(' · ')}</Text>
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {`${cause.dealer} · ${cause.item} ${cause.value} · ${L.변경일} ${cause.since}`}
              </Text>
            </VStack>
          </MetadataListItem>
        )}
        <MetadataListItem label={L.승인}>{open(was)}</MetadataListItem>
        {(back ?? now) && <MetadataListItem label={L.심사}>{open((back ?? now)!)}</MetadataListItem>}
      </MetadataList>
    </Region>
  )
}

