import { Table, proportional } from '@astryxdesign/core/Table'
import { VStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'

type Row = { name: string; a: string; b?: string } & Record<string, unknown>

/** 두 열 비교(당시 / 현재, 현재 / 가설, 현재 / 모의): astryx Table. 두 값이 다른 줄만 굵다. 한쪽에만 값이 있는 줄(인지일)은 굵게 하지 않는다. 값 하나에 사실 하나라 여럿이면 줄 바꿈(\n)으로 줄마다 */
export function Compare({ head, rows }: { head: [string, string]; rows: [string, string, string?][] }) {
  const data: Row[] = rows.map(([name, a, b]) => ({ name, a, b }))
  const weight = (r: Row) => (r.b !== undefined && r.a !== r.b ? 'semibold' : undefined)
  return (
    <Table<Row>
      data={data}
      idKey="name"
      density="balanced"
      columns={[
        { key: 'name', header: '', width: proportional(1, { minWidth: 80 }), renderCell: (r) => <Text weight="semibold">{r.name}</Text> },
        { key: 'a', header: head[0], width: proportional(1, { minWidth: 80 }), renderCell: (r) => <VStack gap={0.5}>{r.a.split('\n').map((x) => <Text key={x} weight={weight(r)} hasTabularNumbers>{x}</Text>)}</VStack> },
        { key: 'b', header: head[1], width: proportional(1, { minWidth: 80 }), renderCell: (r) => <Text weight={weight(r)} hasTabularNumbers>{r.b ?? ''}</Text> },
      ]}
    />
  )
}
