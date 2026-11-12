// 03 관련자: 대리점 상세의 가운데에 "관계"(그림과 같은 내용의 표, 그룹)를 끼운다. 값은 서버가 조회할 때 계산한다.
import { useAtom } from 'jotai'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { targetAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { Figures } from '../../ui/Figures'
import { Region } from '../../ui/Region'
import { Relation } from '../../ui/Relation'
import { Source } from '../../ui/Source'
import { Table } from '../../ui/Table'
import { Dealer } from '../02-대리점'
import { Text } from '@astryxdesign/core/Text'

type Dlr = { id: string; name: string }
type Related = {
  id: string
  idents: { id: string; item: string; value: string }[]
  near: (Dlr & { match: string[]; related: boolean })[]
  lines: [string, string][]
  group: Dlr[]
  source: string
}

function Fact() {
  const [target, setTarget] = useAtom(targetAtom)
  const d = useData<Related>(target && `/dealers/${target.id}/related`)
  if (!d || d.id !== target?.id) return null
  const me = d.group.find((g) => g.id === d.id)
  const none = d.near.length === 0 || !me
  return (
    <Region
      title={L.관계}
      aside={
        !none && (
          <Source kind={d.source} side="right" tip={`${L.관련자} · ${L.그룹}`} rows={[[L.관련자, L['식별자 일치 2 이상']], [L.그룹, L['관련자의 전이']]]} />
        )
      }
    >
      {none ? (
        <Empty />
      ) : (
        <>
          <Relation left={[me]} mid={d.idents.map((i) => ({ id: i.id, name: i.value }))} right={d.near} lines={d.lines} />
          <Table
            head={[L.대리점, L.일치, L.관련자]}
            rows={d.near.map((n) => [
              <Dealer name={n.name} id={n.id} onOpen={() => setTarget({ kind: L.대리점, id: n.id })} />,
              n.match.join(' · '),
              n.related ? L.관련자 : <Text color="secondary">{L.없음}</Text>,
            ])}
          />
          {d.group.length > 1 && <Figures items={[[L.그룹, d.group.map((g) => g.name).join(' · ')]]} />}
        </>
      )}
    </Region>
  )
}

export default [{ slot: 'fact', kind: L.대리점, order: 200, View: Fact }] satisfies Piece[]
