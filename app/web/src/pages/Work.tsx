// astryx template: table-grouped — 작업 목록. 벗어난 곳은 docs/design/components.md
// 작업: astryx table-grouped 템플릿 꼴. 머리(제목 / 전체·담당·진행 / 검색) → 숫자 타일(dashboard-alert-rail의 KPI) → 종류별 묶음(접힘 · 건수)이 있는 표.
// 줄을 누르면 기록 화면이 열린다(오른쪽은 AI 구역). 심사 묶음은 체크로 골라 선택 띠에서 한꺼번에 승인한다.
import { Badge } from '@astryxdesign/core/Badge'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Center } from '@astryxdesign/core/Center'
import { HStack, Layout, LayoutContent, LayoutHeader, StackItem, VStack } from '@astryxdesign/core/Layout'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Table, type TableColumn, type TablePlugin, TableSelectionToolbar, pixel, proportional, useTableGroupedRows } from '@astryxdesign/core/Table'
import { Heading, Text } from '@astryxdesign/core/Text'
import { useAtom, useSetAtom } from 'jotai'
import { useState } from 'react'
import { L } from '../labels'
import { NoResult } from '../ui/Empty'
import { Search, hit } from '../ui/Search'
import { api, changedAtom, navAtom, paneAtom, scopeAtom, store, targetAtom, useData } from '../state'
import { Confirm } from '../ui/Confirm'
import { grade } from '../ui/grade'
import { Kind, Mark, State } from '../ui/Mark'
import { dot, num, plain } from '../ui/status'

export type Task = { id: string; kind: string; view: string; target: string; name?: string; ym?: string; total?: number | null; marks: string[]; role: string; pick: boolean; state?: string; pay?: string | null }

/** 종류의 묶음(위에서 아래로). 한 건씩 정하는 작업이 위, 묶어서 승인하는 심사가 맨 아래 */
const GROUPS: string[][] = [[L.추인, L.종결], [L.정황], [L.발송, L.소명, L.미응답], [L.지급, L.대사], [L.재상신, L.심사]]
const order = (a: Task, b: Task) => (a.ym ?? '9').localeCompare(b.ym ?? '9') || (a.name ?? '').localeCompare(b.name ?? '', 'ko', { numeric: true })

/** 작업 목록의 순서(묶음 → 귀속월 → 이름). 목록 칸(Pane)과 n/전체도 이 순서 */
export const sortTasks = (ts: Task[]) => GROUPS.flatMap((kinds) => ts.filter((t) => kinds.includes(t.kind)).sort(order))

/** 안내가 열어 볼 첫 작업: 목록과 같은 순서에서 정황이 걸린 것이 먼저(설명할 거리가 많다) */
export const firstTask = (mine: Task[]) => {
  const sorted = sortTasks(mine)
  return sorted.find((t) => t.marks.includes(L.정황)) ?? sorted[0]
}

/** 결정을 보낸다. 거절되어도 목록을 다시 읽어 지금 할 수 있는 것을 보인다 */
const decide = (ids: string[]) => api('/decide', { ids, kind: L.승인 }).catch(() => store.set(changedAtom, (n) => n + 1))

/** 일괄 승인 창의 줄: 건수 하나, 이어서 대리점마다 금액 하나(귀속월이 모두 같으면 한 줄로 따로, 다르면 이름표에) */
const pickRows = (ts: Task[]): [string, string][] => {
  const yms = new Set(ts.map((t) => t.ym))
  return [
    [L.대상, `${ts.length}${L.건}`],
    ...(yms.size === 1 ? ([[L.귀속월, [...yms][0] ?? '']] as [string, string][]) : []),
    ...ts.map((t): [string, string] => [yms.size === 1 ? (t.name ?? t.target) : `${t.name ?? t.target} ${t.ym ?? ''}`.trim(), t.total != null ? num(t.total) : '']),
  ]
}

export function Work() {
  const d = useData<{ mine: Task[]; going: Task[] }>('/tasks')
  const [scope, setScope] = useAtom(scopeAtom)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const setTarget = useSetAtom(targetAtom)
  const setNav = useSetAtom(navAtom)
  const mine = d?.mine ?? []
  const all = scope === 'all' ? [...mine, ...(d?.going ?? []).filter((g) => !mine.some((m) => m.id === g.id))] : d ? d[scope] : []
  // 검색은 이름·귀속월이 비지 않은 줄로 본다
  const visible = all.filter((t) => hit(q, t.name ?? t.target, t.ym, t.kind))
  const groups = GROUPS.map((kinds) => ({ kinds, items: visible.filter((t) => kinds.includes(t.kind)).sort(order) })).filter((g) => g.items.length)
  const rows = groups.flatMap((g) => g.items)
  // 고를 수 있는 줄: 내 차례의 심사 가운데 서버가 고를 수 있다고 한 것(정황이 없는 것)
  const can = (t: Task) => t.pick && mine.some((m) => m.id === t.id)
  const chosen = mine.filter((t) => can(t) && picked.has(t.target))
  const toggle = (ids: string[], on: boolean) => setPicked((p) => new Set([...p].filter((x) => !ids.includes(x)).concat(on ? ids : [])))
  const open = (t: Task) => {
    // 앞 · 뒤와 n/전체는 그 줄이 든 묶음 안에서(추인끼리, 심사끼리)
    const g = groups.find((x) => x.items.some((i) => i.id === t.id))
    setNav((g?.items ?? rows).map((r) => ({ kind: r.view, id: r.target })))
    setTarget({ kind: t.view, id: t.target })
    // 목록에서 기록을 열면 목록 칸은 접힌 채(본문이 좁아지지 않게 — 펴는 것은 기록 머리의 목록 단추)
    store.set(paneAtom, false)
  }
  // 표(table-grouped): 종류의 묶음마다 머리(접힘 · 건수), 줄 = 고르기 · 주의 점 · 대상 · 종류 · 귀속월 · 금액 · 담당 · 표시 · 상태
  type Row = Task & Record<string, unknown>
  const groupOf = (t: Task) => GROUPS.find((g) => g.includes(t.kind))?.filter((k) => rows.some((r) => r.kind === k)).join(' · ') ?? t.kind
  const grouped = useTableGroupedRows<Row>({
    data: rows as Row[],
    groupBy: (t) => groupOf(t),
    groupOrder: groups.map((g) => groupOf(g.items[0])),
    collapsedGroups: folded,
    onToggleGroup: (k) => setFolded((f) => new Set(f.has(k) ? [...f].filter((x) => x !== k) : [...f, k])),
    getRowKey: (t) => t.id,
    renderGroupHeader: (k, n) => {
      // 심사 묶음의 머리에는 고를 수 있는 줄 전부를 고르는 체크
      const pickable = rows.filter((t) => groupOf(t) === k && can(t))
      return (
        <HStack gap={2} vAlign="center">
          {pickable.length > 0 && (
            <HStack onClick={(e) => e.stopPropagation()}>
              <CheckboxInput label={L.전체} isLabelHidden size="sm" value={pickable.every((t) => picked.has(t.target))} onChange={(on) => toggle(pickable.map((t) => t.target), on)} />
            </HStack>
          )}
          {/* 묶음의 기록 종류(색 아이콘, ui/status.ts의 kind) */}
          {rows.find((t) => groupOf(t) === k) && <Kind of={rows.find((t) => groupOf(t) === k)!.view} />}
          <Text type="body" weight="bold">
            {k}
          </Text>
          <Badge variant="neutral" label={String(n)} />
        </HStack>
      )
    },
  })
  // 줄을 누르면 그 기록이 열린다(묶음 머리 줄은 접기만)
  const openRow: TablePlugin<Row> = {
    transformBodyRow(props, t) {
      if (!t.id) return props
      return { ...props, htmlProps: { ...props.htmlProps, onClick: (e: { target: EventTarget }) => !(e.target as Element).closest('button, a, input, label') && open(t) } }
    },
  }
  const showRole = rows.some((t) => t.role !== rows[0]?.role)
  const pickCol = rows.some((t) => t.kind === L.심사 && mine.some((m) => m.id === t.id))
  const columns: TableColumn<Row>[] = [
    // 고르기(심사 묶음이 있을 때만): 정황이 걸린 심사처럼 고를 수 없는 줄은 비활성
    ...(pickCol
      ? [
          {
            key: 'pick',
            header: '',
            width: pixel(48),
            renderCell: (t: Row) =>
              t.kind === L.심사 && mine.some((m) => m.id === t.id) && (
                <HStack onClick={(e) => e.stopPropagation()}>
                  <CheckboxInput label={L.선택} isLabelHidden size="sm" isDisabled={!can(t)} value={picked.has(t.target) && can(t)} onChange={(on) => toggle([t.target], on)} />
                </HStack>
              ),
          } as TableColumn<Row>,
        ]
      : []),
    // table-grouped: 첫 칸은 상태 점(가운데), 다음 칸이 이름
    {
      key: 'dot',
      header: '',
      width: pixel(44),
      renderCell: (t) => (
        <Center axis="horizontal">
          <StatusDot variant={dot(t.marks, t.pay ?? t.state)} label={t.marks.join(' · ') || (t.pay ?? t.state ?? t.kind)} />
        </Center>
      ),
    },
    {
      key: 'name',
      header: L.대상,
      width: proportional(3, { minWidth: 160 }),
      renderCell: (t) => (
        <Text type="body" maxLines={1}>
          {t.name ?? t.target}
        </Text>
      ),
    },
    { key: 'ym', header: L.귀속월, width: pixel(88), renderCell: (t) => <Text color="secondary" hasTabularNumbers>{t.ym}</Text> },
    { key: 'total', header: L.금액, align: 'end', width: pixel(112), renderCell: (t) => t.total != null && <Text hasTabularNumbers>{num(t.total)}</Text> },
    ...(showRole ? [{ key: 'role', header: L.담당, width: pixel(96), renderCell: (t: Row) => <Text color="secondary">{t.role}</Text> } as TableColumn<Row>] : []),
    {
      key: 'marks',
      header: L.표시,
      width: proportional(1, { minWidth: 96 }),
      renderCell: (t) => (
        <HStack gap={1} vAlign="center">
          {t.marks.map((m) => (
            <Mark key={m}>{m}</Mark>
          ))}
        </HStack>
      ),
    },
    { key: 'state', header: L.상태, width: pixel(80), renderCell: (t) => (t.pay ?? t.state) && <State word={(t.pay ?? t.state)} /> },
  ]
  // 값이 하나도 없는 칸은 두지 않는다(정황만 있는 내부 감시에는 귀속월 · 금액 · 표시가 없다)
  const has = { ym: rows.some((t) => t.ym), total: rows.some((t) => t.total != null), marks: rows.some((t) => t.marks.length), state: rows.some((t) => !plain(t.pay ?? t.state)) } as Record<string, boolean>
  const shown = columns.filter((c) => has[c.key as string] ?? true)
  return (
    <Layout
      height="fill"
      data-tour="work"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={4}>
            <HStack gap={3} vAlign="center">
              <StackItem size="fill">
                <Heading level={1}>{L.작업}</Heading>
              </StackItem>
              <SegmentedControl label={L.작업} value={scope} onChange={(v) => setScope(v as typeof scope)} size="sm">
                <SegmentedControlItem label={L.전체} value="all" />
                <SegmentedControlItem label={L.담당} value="mine" />
                <SegmentedControlItem label={L.진행} value="going" />
              </SegmentedControl>
            </HStack>
            {/* table-grouped: 검색칸 옆에 걸러진 건수(PowerSearch의 resultCount 자리) */}
            <HStack gap={2} vAlign="center">
              <StackItem size="fill">
                <Search value={q} onChange={setQ} />
              </StackItem>
              <Text type="supporting" color="secondary" hasTabularNumbers>{`${rows.length}${L.건}`}</Text>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent role="main" padding={0}>
          {chosen.length > 0 && (
            <TableSelectionToolbar
              label={L.선택}
              selection={{ selectedKeys: new Set(chosen.map((t) => t.target)), selectedCount: chosen.length, hasSelection: true, clearSelection: () => setPicked(new Set()) }}
              renderSelectionLabel={(n) => `${L.선택} ${n}`}
              clearLabel={L.해제}
              startContent={
                <Confirm label={L.승인} variant={grade(L.승인)} title={`${L.승인} ${chosen.length}`} rows={pickRows(chosen)}
                  onConfirm={() => decide(chosen.map((t) => t.target)).then(() => setPicked(new Set()))}
                />
              }
            />
          )}
          {d && !groups.length ? (
            <NoResult query={q} onClear={() => setQ('')} />
          ) : (
            <Table<Row> data={grouped.data} columns={shown} idKey={grouped.idKey} density="balanced" dividers="rows" textOverflow="truncate" hasHover plugins={{ grouped: grouped.plugin, open: openRow }} />
          )}
        </LayoutContent>
      }
    />
  )
}
