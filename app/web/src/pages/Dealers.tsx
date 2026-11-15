// astryx template: table-grouped(작업 목록과 같은 목록 꼴) — 대리점 목록. 문서 머리(제목 · 사실 묶음) → 검색(오른쪽 300) → 표. 벗어난 곳은 docs/design/components.md
import { HStack, Layout, LayoutContent, LayoutHeader, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Table, type TableColumn, type TablePlugin, proportional } from '@astryxdesign/core/Table'
import { Heading, Text } from '@astryxdesign/core/Text'
import { useSetAtom } from 'jotai'
import { useState } from 'react'
import { L } from '../labels'
import { NoResult } from '../ui/Empty'
import { Search, hit } from '../ui/Search'
import { navAtom, targetAtom, useData } from '../state'
import { Dealer, type Row } from '../tickets/02-대리점'

/** 표의 줄: 등록값(여러 개일 수 있다)은 한 줄로 이어 검색과 표시에 같이 쓴다 */
type Line = { id: string; name: string; rep: string; address: string; account: string } & Record<string, unknown>

export function Dealers() {
  const list = useData<Row[]>('/dealers')
  const setTarget = useSetAtom(targetAtom)
  const setNav = useSetAtom(navAtom)
  const [q, setQ] = useState('')
  const rows: Line[] = (list ?? []).map((r) => ({ id: r.id, name: r.name, rep: r.rep.join(' '), address: r.address.join(' '), account: r.account.join(' ') }))
  const visible = rows.filter((r) => hit(q, r.name, r.id, r.rep, r.address, r.account))
  // 지금 보이는(걸러진) 순서가 기록 화면의 n/전체가 된다
  const open = (id: string) => {
    setNav(visible.map((r) => ({ kind: L.대리점, id: r.id })))
    setTarget({ kind: L.대리점, id })
  }
  const columns: TableColumn<Line>[] = [
    { key: 'name', header: L.대리점, width: proportional(2, { minWidth: 64 }), renderCell: (r) => <Dealer name={r.name} id={r.id} onOpen={() => open(r.id)} /> },
    { key: 'rep', header: L.대표자, width: proportional(1, { minWidth: 64 }), renderCell: (r) => <Text maxLines={1}>{r.rep}</Text> },
    { key: 'address', header: L.주소, width: proportional(2, { minWidth: 64 }), renderCell: (r) => <Text maxLines={1}>{r.address}</Text> },
    { key: 'account', header: L.계좌, width: proportional(2, { minWidth: 64 }), renderCell: (r) => <Text maxLines={1} hasTabularNumbers>{r.account}</Text> },
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
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={4}>
            <Heading level={1}>{L.대리점}</Heading>
            {/* 작업 목록과 같은 꼴: 검색칸 옆에 걸러진 건수 */}
            <HStack gap={2} vAlign="center">
              <StackItem size="fill">
                <Search value={q} onChange={setQ} />
              </StackItem>
              <Text type="supporting" color="secondary" hasTabularNumbers>{`${visible.length}${L.건}`}</Text>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent role="main" padding={0}>
          {list && !visible.length ? (
            <NoResult query={q} onClear={() => setQ('')} />
          ) : (
            <Table<Line> data={visible} columns={columns} idKey="id" density="balanced" dividers="rows" hasHover textOverflow="truncate" plugins={{ open: openRow }} />
          )}
        </LayoutContent>
      }
    />
  )
}
