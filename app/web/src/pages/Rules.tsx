// 규정 목록: astryx table-page 템플릿에서 출발한 화면. 머리(제목 · 건수) → 검색 → 조항 표(조항을 누르면 그 기록이 열린다).
import { Badge } from '@astryxdesign/core/Badge'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HStack, Layout, LayoutContent, LayoutHeader, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { PowerSearch, type PowerSearchFilter, usePowerSearchConfig } from '@astryxdesign/core/PowerSearch'
import { Section } from '@astryxdesign/core/Section'
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table'
import { Heading, Text } from '@astryxdesign/core/Text'
import { useSetAtom } from 'jotai'
import { useState } from 'react'
import { L } from '../labels'
import { targetAtom } from '../state'
import { Source } from '../ui/Source'
import { useRules, where } from '../tickets/22-규정'

const fields = [{ key: 'title', type: 'string', label: L.조항 }] as const

/** 표의 줄: 조항과 그 조항의 규칙 수 */
type Line = { id: string; title: string; place: string; where: string; rules: number; source: string; sha: string; first: number; last: number } & Record<string, unknown>

export function Rules() {
  const d = useRules()
  const setTarget = useSetAtom(targetAtom)
  const [filters, setFilters] = useState<PowerSearchFilter[]>([])
  const { config, applyFilters } = usePowerSearchConfig(fields, L.규정)
  const rows: Line[] = (d?.clauses ?? []).map((c) => ({ id: c.id, title: c.title, place: c.file, where: where(c), rules: d!.rules.filter((r) => r.clause === c.id).length, source: c.source, sha: c.sha, first: c.first, last: c.last }))
  const visible = applyFilters(filters, rows)
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack gap={2} vAlign="center">
            <Heading level={1}>{L.규정}</Heading>
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {rows.length}
            </Text>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <VStack gap={0} height="100%">
            <Section variant="transparent" padding={3}>
              <PowerSearch config={config} filters={filters} onChange={(f) => setFilters([...f])} label={L.검색} placeholder={L.검색} resultCount={String(visible.length)} />
            </Section>
            <StackItem size="fill" className="min-h-0 overflow-y-auto">
              {d && !visible.length ? (
                <EmptyState title={L.없음} />
              ) : (
                <Table density="compact" hasHover>
                  <TableHeader>
                    <TableRow isHeaderRow>
                      <TableHeaderCell>{L.조항}</TableHeaderCell>
                      <TableHeaderCell>{L.규칙}</TableHeaderCell>
                      <TableHeaderCell>{L.위치}</TableHeaderCell>
                      <TableHeaderCell>{L.출처}</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((r) => (
                      // 줄 전체가 눌린다(대리점 목록과 같다). 줄 안의 링크·출처 표지를 누른 것은 줄이 다시 열지 않는다
                      <TableRow key={r.id} className="cursor-pointer" onClick={(e) => !(e.target as Element).closest('button, a, input, label') && setTarget({ kind: L.규정, id: r.id })}>
                        <TableCell>
                          <Link weight="semibold" onClick={() => setTarget({ kind: L.규정, id: r.id })}>
                            {r.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="neutral" label={String(r.rules)} />
                        </TableCell>
                        <TableCell>
                          <Text color="secondary" maxLines={1}>
                            {r.place}
                          </Text>
                        </TableCell>
                        <TableCell>
                          <Source kind={r.source} tip={r.title} place={`${r.first}–${r.last}${L.행}`} rows={[[L.위치, r.where], [L.해시, r.sha]]} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </StackItem>
          </VStack>
        </LayoutContent>
      }
    />
  )
}
