// astryx template: table-page — 대리점 목록. 문서 머리(제목 · 사실 묶음) → 검색(오른쪽 300) → 표. 벗어난 곳은 docs/design/components.md
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HStack, Layout, LayoutContent, StackItem, VStack } from '@astryxdesign/core/Layout'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Table, type TableColumn, type TablePlugin, proportional } from '@astryxdesign/core/Table'
import { Heading, Text } from '@astryxdesign/core/Text'
import { useSetAtom } from 'jotai'
import { useState } from 'react'
import { L } from '../labels'
import { Search, hit } from '../ui/Search'
import { targetAtom, useData } from '../state'
import { Dealer, type Row } from '../tickets/02-대리점'

/** 표의 줄: 등록값(여러 개일 수 있다)은 한 줄로 이어 검색과 표시에 같이 쓴다 */
type Line = { id: string; name: string; rep: string; address: string; account: string } & Record<string, unknown>

export function Dealers() {
  const list = useData<Row[]>('/dealers')
  const setTarget = useSetAtom(targetAtom)
  const [q, setQ] = useState('')
  const rows: Line[] = (list ?? []).map((r) => ({ id: r.id, name: r.name, rep: r.rep.join(' '), address: r.address.join(' '), account: r.account.join(' ') }))
  const open = (id: string) => setTarget({ kind: L.대리점, id })
  const visible = rows.filter((r) => hit(q, r.name, r.id, r.rep, r.address, r.account))
  const columns: TableColumn<Line>[] = [
    { key: 'name', header: L.대리점, width: proportional(2), renderCell: (r) => <Dealer name={r.name} id={r.id} onOpen={() => open(r.id)} /> },
    { key: 'rep', header: L.대표자, width: proportional(1), renderCell: (r) => <Text maxLines={1}>{r.rep}</Text> },
    { key: 'address', header: L.주소, width: proportional(2), renderCell: (r) => <Text maxLines={1}>{r.address}</Text> },
    { key: 'account', header: L.계좌, width: proportional(2), renderCell: (r) => <Text maxLines={1} hasTabularNumbers>{r.account}</Text> },
  ]
  // 줄을 누르면 그 대리점이 열린다(줄 안의 링크 · 단추는 그대로)
  const openRow: TablePlugin<Line> = {
    transformBodyRow(props, r) {
      return { ...props, htmlProps: { ...props.htmlProps, onClick: (e: { target: EventTarget }) => !(e.target as Element).closest('button, a, input, label') && open(r.id) } }
    },
  }
  return (
    <Layout
      height="fill"
      content={
        <LayoutContent padding={0}>
          <VStack padding={4} gap={8}>
            {/* table-page: 문서의 제목과 사실 묶음은 본문의 머리(스크롤과 함께 지나간다) */}
            <VStack gap={6} paddingBlockEnd={4}>
              <HStack gap={3} vAlign="center" wrap="wrap">
                <StackItem size="fill">
                  <Heading level={1}>{L.대리점}</Heading>
                </StackItem>
              </HStack>
              <MetadataList columns="multi" orientation="vertical" label={{ position: 'top' }}>
                <MetadataListItem label={L.대리점}>
                  <Text hasTabularNumbers>{`${rows.length}${L.곳}`}</Text>
                </MetadataListItem>
                <MetadataListItem label={L.결과}>
                  <Text hasTabularNumbers>{`${visible.length}${L.건}`}</Text>
                </MetadataListItem>
              </MetadataList>
            </VStack>
            <HStack gap={3} vAlign="center" hAlign="end" wrap="wrap">
              <VStack width={300}>
                <Search value={q} onChange={setQ} />
              </VStack>
            </HStack>
            {list && !visible.length ? (
              <EmptyState title={L.없음} />
            ) : (
              <Table<Line> data={visible} columns={columns} idKey="id" density="balanced" dividers="none" hasHover textOverflow="truncate" plugins={{ open: openRow }} />
            )}
          </VStack>
        </LayoutContent>
      }
    />
  )
}
