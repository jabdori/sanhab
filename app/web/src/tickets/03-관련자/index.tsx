// 03 관련자: 대리점 기록의 "관계"(그림과 같은 내용의 표, 그룹). 값은 서버가 조회할 때 계산한다.
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Table, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { useAtom } from 'jotai'
import { L } from '../../labels'
import { targetAtom } from '../../state'
import { Empty } from '../../ui/Empty'
import { Pending } from '../../ui/Pending'
import { Region } from '../../ui/Region'
import { Relation } from '../../ui/Relation'
import { Source } from '../../ui/Source'
import { Dealer } from '../02-대리점'
import { sharedLoad } from '../load'

type Dlr = { id: string; name: string }
type Near = Dlr & { match: string[]; related: boolean } & Record<string, unknown>
export type Related = {
  id: string
  idents: { id: string; item: string; value: string }[]
  near: Near[]
  lines: [string, string][]
  group: Dlr[]
  source: string
}

/** 열어 둔 대리점의 관계(조각들이 한 번만 읽는다) */
export const useRelated = sharedLoad<Related>((get) => {
  const t = get(targetAtom)
  return t?.kind === L.대리점 ? `/dealers/${t.id}/related` : null
})

export function Links() {
  const [, setTarget] = useAtom(targetAtom)
  const q = useRelated()
  const d = q.data
  if (!d) return <Region title={L.관계}><Pending of={q} /></Region>
  const me = d.group.find((g) => g.id === d.id)
  const none = d.near.length === 0 || !me
  return (
    <Region
      title={L.관계}
      aside={!none && <Source kind={d.source} side="right" tip={`${L.관련자} · ${L.그룹}`} rows={[[L.관련자, L['식별자 일치 2 이상']], [L.그룹, L['관련자의 전이']]]} />}
    >
      {none ? (
        <Empty />
      ) : (
        <VStack gap={3}>
          <Relation left={[me]} mid={d.idents.map((i) => ({ id: i.id, name: i.value }))} right={d.near} lines={d.lines} />
          <Table<Near>
            data={d.near}
            idKey="id"
            density="balanced"
            columns={[
              { key: 'name', header: L.대리점, width: proportional(2, { minWidth: 120 }), renderCell: (n) => <Dealer name={n.name} id={n.id} onOpen={() => setTarget({ kind: L.대리점, id: n.id })} /> },
              {
                key: 'match',
                header: L.일치,
                width: proportional(2, { minWidth: 96 }),
                renderCell: (n) => (
                  <HStack gap={1} wrap="wrap">
                    {n.match.map((k) => (
                      <Token key={k} size="sm" label={k} />
                    ))}
                  </HStack>
                ),
              },
              { key: 'related', header: L.관련자, width: proportional(1, { minWidth: 72 }), renderCell: (n) => (n.related ? <Token size="sm" label={L.관련자} /> : <Text color="secondary">{L.없음}</Text>) },
            ]}
          />
        </VStack>
      )}
    </Region>
  )
}

