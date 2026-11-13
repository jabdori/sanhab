// 작업: astryx table-grouped 템플릿 꼴. 머리(제목 / 전체·담당·진행 / 검색) → 숫자 타일(dashboard-alert-rail의 KPI) → 종류별 묶음(접힘 · 건수)이 있는 표.
// 줄을 누르면 기록 화면이 열린다(오른쪽은 AI 구역). 심사 묶음은 체크로 골라 선택 띠에서 한꺼번에 승인한다.
import { Badge } from '@astryxdesign/core/Badge'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HStack, Layout, LayoutContent, LayoutHeader, StackItem, VStack } from '@astryxdesign/core/Layout'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Table, type TableColumn, type TablePlugin, TableSelectionToolbar, pixel, proportional, useTableGroupedRows } from '@astryxdesign/core/Table'
import { Heading, Text } from '@astryxdesign/core/Text'
import { useAtom, useSetAtom } from 'jotai'
import { atom } from 'jotai'
import { useState } from 'react'
import { L } from '../labels'
import { Search, hit } from '../ui/Search'
import { api, changedAtom, navAtom, store, targetAtom, useData } from '../state'
import { Confirm } from '../ui/Confirm'
import { grade } from '../ui/grade'
import { Mark, State } from '../ui/Mark'
import { Tiles } from '../ui/Record'
import { dot, num, plain } from '../ui/status'

export type Task = { id: string; kind: string; view: string; target: string; name?: string; ym?: string; total?: number | null; marks: string[]; role: string; pick: boolean; state?: string; pay?: string | null }

/** 종류의 묶음(위에서 아래로). 한 건씩 정하는 작업이 위, 묶어서 승인하는 심사가 맨 아래 */
const GROUPS: string[][] = [[L.추인, L.종결], [L.정황], [L.발송, L.소명, L.미응답], [L.지급, L.대사], [L.재상신, L.심사]]
const order = (a: Task, b: Task) => (a.ym ?? '9').localeCompare(b.ym ?? '9') || (a.name ?? '').localeCompare(b.name ?? '', 'ko', { numeric: true })

/** 전체 · 담당 · 진행. 기록을 열었다 돌아와도 남는다 */
const scopeAtom = atom<'all' | 'mine' | 'going'>('mine')


/** 결정을 보낸다. 거절되어도 목록을 다시 읽어 지금 할 수 있는 것을 보인다 */
const decide = (ids: string[]) => api('/decide', { ids, kind: L.승인 }).catch(() => store.set(changedAtom, (n) => n + 1))

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
  // 요약 타일: 담당 · 진행 · 정황(내 차례 가운데 정황이 걸린 것, 주의) · 금액(내 차례의 합)
  // 요약 타일: 역할마다 의미 있는 것만 — 담당, 내 작업의 종류별 건수(지급은 지급 상태별), 정황이 걸린 건(주의), 금액(내 작업의 합), 진행(다른 역할에게 넘어간 것)
  const count = (f: (t: Task) => boolean) => mine.filter(f).length
  const pays = [L.대기, L.재심사, L.이체, L.완료].filter((p) => mine.some((t) => t.kind === L.지급 && t.pay === p))
  const flagged = count((t) => t.marks.includes(L.정황) && t.kind !== L.정황)
  const total = mine.reduce((n, t) => n + (t.total ?? 0), 0)
  // 숫자 타일: 묶음 머리의 건수와 겹치는 종류별 수는 두지 않는다. 담당 · 지급 상태 · 정황 · 금액 · 진행만(한 줄)
  const tiles: [string, string, 'warning' | undefined][] = [
    [L.담당, String(mine.length), undefined],
    ...pays.map((p): [string, string, 'warning' | undefined] => [`${L.지급} ${p}`, String(count((t) => t.kind === L.지급 && t.pay === p)), p === L.재심사 ? 'warning' : undefined]),
    ...(flagged ? [[L.정황, String(flagged), 'warning'] as [string, string, 'warning']] : []),
    ...(total ? [[L.금액, num(total), undefined] as [string, string, undefined]] : []),
    ...(d?.going.length ? [[L.진행, String(d.going.length), undefined] as [string, string, undefined]] : []),
  ]
  const open = (t: Task) => {
    // 앞 · 뒤와 n/전체는 그 줄이 든 묶음 안에서(추인끼리, 심사끼리)
    const g = groups.find((x) => x.items.some((i) => i.id === t.id))
    setNav((g?.items ?? rows).map((r) => ({ kind: r.view, id: r.target })))
    setTarget({ kind: t.view, id: t.target })
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
    {
      key: 'name',
      header: L.대상,
      width: proportional(3, { minWidth: 160 }),
      renderCell: (t) => (
        <HStack gap={2} vAlign="center">
          <StatusDot variant={dot(t.marks, t.pay ?? t.state)} label={t.marks.join(' · ') || (t.pay ?? t.state ?? t.kind)} />
          <Text weight="medium">{t.name ?? t.target}</Text>
        </HStack>
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
            <Search value={q} onChange={setQ} />
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          {rows.length > 0 && <Tiles items={tiles.map(([name, value, tone]) => ({ name, value, dot: tone }))} />}
          {chosen.length > 0 && (
            <TableSelectionToolbar
              label={L.선택}
              selection={{ selectedKeys: new Set(chosen.map((t) => t.target)), selectedCount: chosen.length, hasSelection: true, clearSelection: () => setPicked(new Set()) }}
              renderSelectionLabel={(n) => `${L.선택} ${n}`}
              clearLabel={L.해제}
              startContent={
                <Confirm label={L.승인} variant={grade(L.승인)} title={`${L.승인} ${chosen.length}`} rows={[[L.대상, chosen.map((t) => t.name).join(' · ')]]}
                  onConfirm={() => decide(chosen.map((t) => t.target)).then(() => setPicked(new Set()))}
                />
              }
            />
          )}
          {d && !groups.length ? (
            <EmptyState title={L.없음} />
          ) : (
            <Table<Row> data={grouped.data} columns={shown} idKey={grouped.idKey} density="balanced" dividers="rows" textOverflow="truncate" hasHover plugins={{ grouped: grouped.plugin, open: openRow }} />
          )}
        </LayoutContent>
      }
    />
  )
}
