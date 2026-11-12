// 대리점 목록: astryx table-page 템플릿에서 출발한 화면. 머리(제목 · 건수) → 검색 → 대리점 표(이름을 누르면 그 기록이 열린다).
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HStack, Layout, LayoutContent, LayoutHeader, StackItem, VStack } from '@astryxdesign/core/Layout'
import { PowerSearch, type PowerSearchFilter, usePowerSearchConfig } from '@astryxdesign/core/PowerSearch'
import { Section } from '@astryxdesign/core/Section'
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table'
import { Heading, Text } from '@astryxdesign/core/Text'
import { useSetAtom } from 'jotai'
import { useState } from 'react'
import { L } from '../labels'
import { targetAtom, useData } from '../state'
import { Dealer, type Row } from '../tickets/02-대리점'

const fields = [
  { key: 'name', type: 'string', label: L.대리점 },
  { key: 'rep', type: 'string', label: L.대표자 },
  { key: 'address', type: 'string', label: L.주소 },
  { key: 'account', type: 'string', label: L.계좌 },
] as const

/** 표의 줄: 등록값(여러 개일 수 있다)은 한 줄로 이어 검색과 표시에 같이 쓴다 */
type Line = { id: string; name: string; rep: string; address: string; account: string } & Record<string, unknown>

export function Dealers() {
  const list = useData<Row[]>('/dealers')
  const setTarget = useSetAtom(targetAtom)
  const [filters, setFilters] = useState<PowerSearchFilter[]>([])
  const { config, applyFilters } = usePowerSearchConfig(fields, L.대리점)
  const rows: Line[] = (list ?? []).map((r) => ({ id: r.id, name: r.name, rep: r.rep.join(' '), address: r.address.join(' '), account: r.account.join(' ') }))
  const open = (id: string) => setTarget({ kind: L.대리점, id })
  const visible = applyFilters(filters, rows)
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack gap={2} vAlign="center">
            <Heading level={1}>{L.대리점}</Heading>
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
              {list && !visible.length ? (
                <EmptyState title={L.없음} />
              ) : (
                <Table density="balanced" hasHover>
                  <TableHeader>
                    <TableRow isHeaderRow>
                      <TableHeaderCell>{L.대리점}</TableHeaderCell>
                      <TableHeaderCell>{L.대표자}</TableHeaderCell>
                      <TableHeaderCell>{L.주소}</TableHeaderCell>
                      <TableHeaderCell>{L.계좌}</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((r) => (
                      // 줄 전체가 눌린다. 줄 안의 링크·단추를 누른 것은 줄이 다시 열지 않는다
                      <TableRow key={r.id} className="cursor-pointer" onClick={(e) => !(e.target as Element).closest('button, a, input, label') && open(r.id)}>
                        <TableCell>
                          <Dealer name={r.name} id={r.id} onOpen={() => open(r.id)} />
                        </TableCell>
                        <TableCell>{r.rep}</TableCell>
                        <TableCell>{r.address}</TableCell>
                        <TableCell>{r.account}</TableCell>
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
