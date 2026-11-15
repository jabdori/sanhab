// astryx template: table-grouped(작업 목록과 같은 목록 꼴) — 규정 목록(대리점 목록과 같은 꼴). 문서 머리(제목 · 사실 묶음) → 검색(오른쪽 300) → 조항 표. 벗어난 곳은 docs/design/components.md
import { Badge } from '@astryxdesign/core/Badge'
import { HStack, Layout, LayoutContent, LayoutHeader, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Table, type TableColumn, type TablePlugin, pixel, proportional } from '@astryxdesign/core/Table'
import { Heading, Text } from '@astryxdesign/core/Text'
import { useSetAtom } from 'jotai'
import { useState } from 'react'
import { L } from '../labels'
import { NoResult } from '../ui/Empty'
import { Search, hit } from '../ui/Search'
import { Rule } from './Rule'
import { targetAtom } from '../state'
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
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={4}>
            <HStack gap={3} vAlign="center">
              <StackItem size="fill">
                <Heading level={1}>{L.규정}</Heading>
              </StackItem>
            </HStack>
            {/* 작업 목록과 같은 꼴: 검색칸 옆에 걸러진 건수 */}
            <HStack gap={2} vAlign="center">
              <StackItem size="fill">
                <Search value={find} onChange={setFind} />
              </StackItem>
              <Text type="supporting" color="secondary" hasTabularNumbers>{`${visible.length}${L.건}`}</Text>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent role="main" padding={0}>
          {!visible.length ? (
            <NoResult query={find} onClear={() => setFind('')} />
          ) : (
            <Table<Line> data={visible} columns={columns} idKey="id" density="balanced" dividers="rows" hasHover textOverflow="truncate" plugins={{ open: openRow }} />
          )}
        </LayoutContent>
      }
    />
  )
}
