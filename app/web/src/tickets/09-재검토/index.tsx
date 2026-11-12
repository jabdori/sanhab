// 09 재검토: 승인된 심사의 가운데에 원본의 지급일을, 재검토 표시가 붙은 심사에는 당시 / 현재를 나란히 둔다(04의 제목·숫자 줄 -40과 구성 -30 사이).
// 원본에는 승인한 날이 없다(이력에는 미상). 지급일은 승인한 날이 아니므로 이름표를 달아 따로 보인다.
// 당시는 굳은 심사의 값 그대로이고 현재는 서버가 다시 계산해 준다. 과거의 심사는 대리점 상세의 지급 줄에서 연다(02의 조각).
import { Text } from '@astryxdesign/core/Text'
import { L } from '../../labels'
import { useData } from '../../state'
import { Compare } from '../../ui/Compare'
import { Region } from '../../ui/Region'
import { HStack } from '@astryxdesign/core/Layout'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Source } from '../../ui/Source'
import { num } from '../../ui/status'
import { useReview } from '../04-심사/review'

type Side = { total: number; approver: string }
type Again = {
  id: string
  then: Side & { members: number }
  now: Side & { members: { id: string; name: string }[]; limit: number; rules: { name: string; ver: number }[] }
  /** 현재의 구성을 만든 식별자의 인지일. 없으면 미상 */
  known: string | null
  /** 인지일이 승인(과거의 승인은 지급일)보다 뒤: 당시에는 알 수 없었던 건 */
  late: boolean
  /** 원본에 지급일이 있는 지급 */
  paid: { at: string; source: string; file: string; row: number }[]
  source: string
}

const size = (n: number) => (n === 1 ? L.단독 : `${n}${L.곳}`)

export function Then() {
  const r = useReview()?.review
  const d = useData<Again>(r?.status === L.승인 ? `/reviews/${r.id}/again` : null)
  if (!r || d?.id !== r.id) return null
  const rule = d.now.rules.find((x) => x.name === L.한도)
  const paid = d.paid.length > 0 && (
    <Region title={L.지급일}>
      <MetadataList columns="single" label={{ position: 'start', width: 72 }}>
        {d.paid.map((p, i) => (
          <MetadataListItem key={i} label={L.지급일}>
            <HStack gap={2} vAlign="center">
              <Text hasTabularNumbers>{p.at}</Text>
              <Source kind={p.source} file={p.file} row={p.row} />
            </HStack>
          </MetadataListItem>
        ))}
      </MetadataList>
    </Region>
  )
  if (!r.marks.includes(L.재검토)) return paid
  return (
    <>
      {paid}
      <Region
        title={L.재검토}
        aside={
        <Source
            kind={d.source}
            side="right"
            tip={`${L.당시} · ${L.현재}`}
            rows={[
              [L.현재, L['귀속월의 식별자, 규칙 버전']],
              [L.구성, d.now.members.map((m) => m.name).join(' · ')],
              [L.한도, [num(d.now.limit), rule && `${rule.name} v${rule.ver}`].filter(Boolean).join(' · ')],
              [L.재검토, L['당시 영업지원, 현재 영업임원']],
            ]}
          />
        }
      >
      <Compare
        head={[L.당시, L.현재]}
        rows={[
          [L.구성, size(d.then.members), size(d.now.members.length)],
          [L.합산, num(d.then.total), num(d.now.total)],
          [L.승인권자, d.then.approver, d.now.approver],
          // 당시 회사가 알았는지: 인지일이 승인 뒤이면 당시는 미인지, 현재는 그 인지일(D30). 미상이면 구분할 수 없다(D5)
          d.late ? [L.인지일, L.미인지, d.known ?? L.미상] : [L.인지일, d.known ?? L.미상],
        ]}
      />
      </Region>
    </>
  )
}

