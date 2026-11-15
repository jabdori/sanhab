// astryx template: detail-page — 영역은 ItemsCard 꼴(Region)
// 12 가설: 정황 상세와 심사 상세의 "가설" — 정황이 사실이라고 놓았을 때의 일치, 그룹, 승인권자를 현재와 나란히 둔다(다른 줄만 굵다).
// 값은 모두 코드가 03의 계산에 정황이 가리키는 선을 더해 다시 구한 것이고 출처는 가정이다. 합산과 저장된 승인권자에는 들어가지 않는다.
import { L } from '../../labels'
import { useLoad } from '../../state'
import { VStack } from '@astryxdesign/core/Layout'
import { Heading } from '@astryxdesign/core/Text'
import { Compare } from '../../ui/Compare'
import { Pending } from '../../ui/Pending'
import { Region } from '../../ui/Region'
import { Source } from '../../ui/Source'
import { useReview } from '../04-심사/review'
import { useSignal } from '../11-정황/signal'

type Hypo = {
  id: string
  name: string
  /** 정황이 더하는 식별자의 종류(없으면 더하는 것이 없다) */
  adds: string[]
  /** 대상과 나머지 대리점의 일치: 현재, 가설 */
  match: { dealer: string; cur: string[]; hyp: string[] }[]
  group: [number, number]
  approver: [string, string]
}

const kinds = (v: string[]) => (v.length ? v.join(' · ') : L.없음)

/** 가설 영역의 출처 표지(가정). 설명 칸은 더하는 일치의 이름표와 값 */
function Tag({ adds }: { adds: string[] }) {
  return (
    // 설명 칸 아래 줄은 이 가설이 더하는 일치(정황이 사실이면 생기는 것). 더하는 것이 없으면 줄을 두지 않는다
    <Source kind={L.가정} of={L.가설} tip={adds.length ? `${L.가설} · ${L.일치} ${kinds(adds)}` : L.가설} rows={adds.length ? [[L.가설, `${L.일치} ${kinds(adds)}`]] : undefined} />
  )
}

function Rows({ h }: { h: Hypo }) {
  return (
    <Compare
      head={[L.현재, L.가설]}
      rows={[
        ...h.match.map((m): [string, string, string] => [`${L.일치} ${m.dealer}`, kinds(m.cur), kinds(m.hyp)]),
        [L.그룹, `${h.group[0]}${L.곳}`, `${h.group[1]}${L.곳}`],
        [L.승인권자, h.approver[0], h.approver[1]],
      ]}
    />
  )
}

export function OfSignal() {
  const id = useSignal()?.signal.id
  const q = useLoad<Hypo>(id ? `/signals/${encodeURIComponent(id)}/hypo` : null)
  if (!id) return null
  // 읽는 동안에도 영역 자리를 잡는다(뒤의 영역이 밀리지 않게). 앞 정황의 값이 남아 있으면 읽는 중으로 본다
  const h = q.data?.id === id ? q.data : undefined
  if (!h)
    return (
      <Region title={L.가설} aside={<Tag adds={[]} />}>
        <Pending of={q.data ? { loading: true } : q} />
      </Region>
    )
  return (
    <Region title={L.가설} aside={<Tag adds={h.adds} />}>
      <Rows h={h} />
    </Region>
  )
}

/** 심사 상세: 그 심사의 구성원에 걸린 열린 정황마다. 그룹과 승인권자는 그 심사의 값이다 */
export function OfReview() {
  const id = useReview()?.review.id
  const q = useLoad<Hypo[]>(id ? `/reviews/${id}/hypo` : null)
  if (!id) return null
  if (!q.data) return <Pending of={q} />
  const list = q.data
  // 정황이 걸리지 않은 심사에는 가설이 없다
  if (!list.length) return null
  return (
    <Region title={L.가설} aside={<Tag adds={[...new Set(list.flatMap((h) => h.adds))]} />}>
      {/* 정황마다 표 하나(Section 몸통의 간격 4) */}
      <VStack gap={4}>
        {list.map((h) => (
          <VStack key={h.id} gap={1}>
            <Heading level={4}>{h.name}</Heading>
            <Rows h={h} />
          </VStack>
        ))}
      </VStack>
    </Region>
  )
}

