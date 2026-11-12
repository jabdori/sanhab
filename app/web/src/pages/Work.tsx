// 작업: astryx incident-console 템플릿에서 출발한 목록. 머리(제목 · 건수 / 전체·담당·진행) → 검색 → 종류별 묶음의 줄.
// 템플릿의 오른쪽 검사기 대신 줄을 누르면 기록 화면이 열린다(오른쪽은 대화 칸이 쓴다). 심사 묶음은 체크로 골라 띠에서 한꺼번에 승인한다.
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HStack, Layout, LayoutContent, LayoutHeader, StackItem, VStack } from '@astryxdesign/core/Layout'
import { List, ListItem } from '@astryxdesign/core/List'
import { PowerSearch, type PowerSearchFilter, usePowerSearchConfig } from '@astryxdesign/core/PowerSearch'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { TableSelectionToolbar } from '@astryxdesign/core/Table'
import { Heading, Text } from '@astryxdesign/core/Text'
import { useAtom, useSetAtom } from 'jotai'
import { atom } from 'jotai'
import { useState } from 'react'
import { L } from '../labels'
import { api, changedAtom, navAtom, store, targetAtom, useData } from '../state'
import { Confirm } from '../ui/Confirm'
import { grade } from '../ui/grade'
import { Mark } from '../ui/Mark'
import { Pill } from '../ui/Pill'
import { num } from '../ui/Table'

export type Task = { id: string; kind: string; view: string; target: string; name?: string; ym?: string; total?: number | null; marks: string[]; role: string; pick: boolean; state?: string; pay?: string | null }

/** 상태 표지의 색: 심사·지급 작업의 상태 */
const tones = { [L.대기]: 'wait', [L.승인]: 'good', [L.보류]: 'hold', [L.반려]: 'bad', [L.재심사]: 'again', [L.이체]: 'wait', [L.완료]: 'good' } as const

/** 종류의 묶음(위에서 아래로). 한 건씩 정하는 작업이 위, 묶어서 승인하는 심사가 맨 아래 */
const GROUPS: string[][] = [[L.추인, L.종결], [L.정황], [L.발송, L.소명, L.미응답], [L.지급, L.대사], [L.재상신, L.심사]]
const order = (a: Task, b: Task) => (a.ym ?? '9').localeCompare(b.ym ?? '9') || (a.name ?? '').localeCompare(b.name ?? '', 'ko', { numeric: true })

/** 전체 · 담당 · 진행. 기록을 열었다 돌아와도 남는다 */
const scopeAtom = atom<'all' | 'mine' | 'going'>('mine')

const fields = [
  { key: 'name', type: 'string', label: L.대상 },
  { key: 'kind', type: 'enum', label: L.종류, enumValues: GROUPS.flat().map((k) => ({ value: k, label: k })) },
  { key: 'ym', type: 'string', label: L.귀속월 },
] as const

/** 결정을 보낸다. 거절되어도 목록을 다시 읽어 지금 할 수 있는 것을 보인다 */
const decide = (ids: string[]) => api('/decide', { ids, kind: L.승인 }).catch(() => store.set(changedAtom, (n) => n + 1))

export function Work() {
  const d = useData<{ mine: Task[]; going: Task[] }>('/tasks')
  const [scope, setScope] = useAtom(scopeAtom)
  const [filters, setFilters] = useState<PowerSearchFilter[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const setTarget = useSetAtom(targetAtom)
  const setNav = useSetAtom(navAtom)
  const { config, applyFilters } = usePowerSearchConfig(fields, L.작업)
  const mine = d?.mine ?? []
  const all = scope === 'all' ? [...mine, ...(d?.going ?? []).filter((g) => !mine.some((m) => m.id === g.id))] : d ? d[scope] : []
  // 검색은 이름·귀속월이 비지 않은 줄로 본다
  const visible = applyFilters(filters, all.map((t) => ({ ...t, name: t.name ?? t.target, ym: t.ym ?? '' })))
  const groups = GROUPS.map((kinds) => ({ kinds, items: visible.filter((t) => kinds.includes(t.kind)).sort(order) })).filter((g) => g.items.length)
  const rows = groups.flatMap((g) => g.items)
  // 고를 수 있는 줄: 내 차례의 심사 가운데 서버가 고를 수 있다고 한 것(정황이 없는 것)
  const can = (t: Task) => t.pick && mine.some((m) => m.id === t.id)
  const chosen = mine.filter((t) => can(t) && picked.has(t.target))
  const toggle = (ids: string[], on: boolean) => setPicked((p) => new Set([...p].filter((x) => !ids.includes(x)).concat(on ? ids : [])))
  const open = (t: Task) => {
    setNav(rows.map((r) => ({ kind: r.view, id: r.target })))
    setTarget({ kind: t.view, id: t.target })
  }
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack gap={3} vAlign="center">
            <StackItem size="fill">
              <HStack gap={2} vAlign="center">
                <Heading level={1}>{L.작업}</Heading>
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {mine.length}
                </Text>
              </HStack>
            </StackItem>
            <SegmentedControl label={L.작업} value={scope} onChange={(v) => setScope(v as typeof scope)} size="sm">
              <SegmentedControlItem label={L.전체} value="all" />
              <SegmentedControlItem label={L.담당} value="mine" />
              <SegmentedControlItem label={L.진행} value="going" />
            </SegmentedControl>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <VStack gap={0} height="100%">
            <div className="p-3">
              <PowerSearch config={config} filters={filters} onChange={(f) => setFilters([...f])} label={L.검색} placeholder={L.검색} resultCount={String(visible.length)} />
            </div>
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
            <StackItem size="fill" className="min-h-0 overflow-y-auto">
              {d && !groups.length ? (
                <EmptyState title={L.없음} />
              ) : (
                <VStack gap={0}>
                  {groups.map((g) => {
                    const pickable = g.items.filter(can)
                    const box = g.kinds.includes(L.심사) && pickable.length > 0
                    return (
                      <VStack gap={0} key={g.kinds.join()}>
                        <HStack gap={2} vAlign="center" className="bg-muted px-3 py-2">
                          {box && (
                            <CheckboxInput label={L.전체} isLabelHidden size="sm" value={pickable.every((t) => picked.has(t.target))} onChange={(on) => toggle(pickable.map((t) => t.target), on)} />
                          )}
                          <Text type="label" color="secondary">
                            {g.kinds.filter((k) => g.items.some((t) => t.kind === k)).join(' · ')}
                          </Text>
                          <Text type="supporting" color="secondary" hasTabularNumbers>
                            {g.items.length}
                          </Text>
                        </HStack>
                        <List density="compact" hasDividers>
                          {g.items.map((t) => (
                            <ListItem
                              key={t.id}
                              label={t.name ?? t.target}
                              description={[t.ym, t.total != null && num(t.total), t.role].filter(Boolean).join(' · ')}
                              startContent={
                                box && (
                                  // 줄을 여는 누름과 따로: 체크만 바뀐다
                                  <span onClick={(e) => e.stopPropagation()}>
                                    <CheckboxInput label={L.선택} isLabelHidden size="sm" isDisabled={!can(t)} value={picked.has(t.target) && can(t)} onChange={(on) => toggle([t.target], on)} />
                                  </span>
                                )
                              }
                              endContent={
                                <HStack gap={3} vAlign="center">
                                  {t.marks.map((m) => (
                                    <Mark key={m}>{m}</Mark>
                                  ))}
                                  {(t.pay ?? t.state) && <Pill tone={tones[(t.pay ?? t.state) as keyof typeof tones] ?? 'wait'}>{(t.pay ?? t.state)!}</Pill>}
                                </HStack>
                              }
                              onClick={() => open(t)}
                            />
                          ))}
                        </List>
                      </VStack>
                    )
                  })}
                </VStack>
              )}
            </StackItem>
          </VStack>
        </LayoutContent>
      }
    />
  )
}
