// astryx template: table-page — 규정 목록(대리점 목록과 같은 꼴). 문서 머리(제목 · 사실 묶음) → 검색(오른쪽 300) → 조항 표. 벗어난 곳은 docs/design/components.md
import { Badge } from '@astryxdesign/core/Badge'
import { HStack, Layout, LayoutContent, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Table, type TableColumn, type TablePlugin, pixel, proportional } from '@astryxdesign/core/Table'
import { Heading, Text } from '@astryxdesign/core/Text'
import { useSetAtom } from 'jotai'
import { useState } from 'react'
import { L } from '../labels'
import { NoResult } from '../ui/Empty'
import { Search, hit } from '../ui/Search'
import { Rule } from './Rule'
import { targetAtom } from '../state'
import { flushEdges } from '../ui/Flush'
import { Pending } from '../ui/Pending'
import { Source } from '../ui/Source'
import { place as docPlace, useRules, where } from '../tickets/22-규정'

/** 표의 줄: 조항과 그 조항의 규칙 수 */
type Line = { id: string; title: string; place: string; where: string; rules: number; source: string; sha: string; first: number; last: number } & Record<string, unknown>

export function Rules() {
  const q = useRules()
  const d = q.data
  const setTarget = useSetAtom(targetAtom)
  const [find, setFind] = useState('')
  if (!d) return <Pending of={q} />
  // 조항이 하나뿐이면 한 줄짜리 목록 대신 그 조항의 기록을 바로 보인다
  if (d.clauses.length === 1) return <Rule />
  const rows: Line[] = d.clauses.map((c) => ({ id: c.id, title: c.title, place: docPlace(c), where: where(c), rules: d.rules.filter((r) => r.clause === c.id).length, source: c.source, sha: c.sha, first: c.first, last: c.last }))
  const visible = rows.filter((r) => hit(find, r.title))
  const open = (id: string) => setTarget({ kind: L.규정, id })
  const columns: TableColumn<Line>[] = [
    {
      key: 'title',
      header: L.조항,
      width: proportional(2, { minWidth: 64 }),
      renderCell: (r) => (
        <Link weight="semibold" onClick={() => open(r.id)}>
          {r.title}
        </Link>
      ),
    },
    { key: 'rules', header: L.규칙, width: pixel(80), renderCell: (r) => <Badge variant="neutral" label={String(r.rules)} /> },
    { key: 'place', header: L.위치, width: proportional(2, { minWidth: 64 }), renderCell: (r) => <Text color="secondary" maxLines={1}>{r.place}</Text> },
    { key: 'source', header: L.출처, align: 'end', width: pixel(96), renderCell: (r) => <Source kind={r.source} tip={r.title} place={`${r.first}–${r.last}${L.행}`} rows={[[L.위치, r.where], [L.해시, r.sha]]} /> },
  ]
  // 줄 전체가 눌린다(대리점 목록과 같다). 줄 안의 링크 · 출처 표지를 누른 것은 줄이 다시 열지 않는다
  const openRow: TablePlugin<Line> = {
    transformBodyRow(props, r) {
      return { ...props, htmlProps: { ...props.htmlProps, onClick: (e: { target: EventTarget }) => !(e.target as Element).closest('button, a, input, label') && open(r.id) } }
    },
  }
  return (
    <Layout
      height="fill"
      contentWidth={960}
      content={
        <LayoutContent role="main" padding={0}>
          <VStack padding={4} gap={8}>
            {/* table-page: 문서의 제목과 사실 묶음은 본문의 머리(스크롤과 함께 지나간다) */}
            <VStack gap={6} paddingBlockEnd={4}>
              <HStack gap={3} vAlign="center" wrap="wrap">
                <StackItem size="fill">
                  <Heading level={1}>{L.규정}</Heading>
                </StackItem>
              </HStack>
              <MetadataList columns="multi" orientation="vertical" label={{ position: 'top' }}>
                <MetadataListItem label={L.조항}>
                  <Text hasTabularNumbers>{`${rows.length}`}</Text>
                </MetadataListItem>
                {find.trim() && (
                  <MetadataListItem label={L.결과}>
                    <Text hasTabularNumbers>{`${visible.length}${L.건}`}</Text>
                  </MetadataListItem>
                )}
              </MetadataList>
            </VStack>
            <HStack gap={3} vAlign="center" hAlign="end" wrap="wrap">
              <VStack width={300}>
                <Search value={find} onChange={setFind} />
              </VStack>
            </HStack>
            {!visible.length ? (
              <NoResult query={find} onClear={() => setFind('')} />
            ) : (
              <Table<Line> data={visible} columns={columns} idKey="id" density="balanced" dividers="none" hasHover textOverflow="truncate" plugins={{ open: openRow, flush: flushEdges<Line>() }} />
            )}
          </VStack>
        </LayoutContent>
      }
    />
  )
}
