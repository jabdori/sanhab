// 16 경위: 지급·심사·추인 기록의 경위 탭 — 그림(Picture)과 시간 순 목록(Timeline).
// 그림: 원인은 왼쪽, 결과는 오른쪽, 방향은 바뀌지 않는다. 지금 대상의 줄기(앞뒤로 이어진 칸과 선)가 진하다. 칸을 누르면 그 대상으로 간다. 결정의 칸에는 사람과 사유가 붙는다.
import { ClickableCard } from '@astryxdesign/core/ClickableCard'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { List as Rows, ListItem } from '@astryxdesign/core/List'
import { Text } from '@astryxdesign/core/Text'
import { useAtomValue, useSetAtom } from 'jotai'
import { Icon } from '@astryxdesign/core/Icon'
import { UserCircleIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import { L } from '../../labels'
import { nb } from '../../ui/status'
import { targetAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { Region } from '../../ui/Region'

type Node = {
  key: string
  kind: string
  name: string
  at: string | null
  who: { role?: string; reason?: { class?: string; memo?: string } | null } | null
  go: { kind: string; id: string }
}
type Trail = { for: [string, string]; now: string; nodes: Node[]; edges: [string, string][] }

/** 대상의 종류 → 서버의 경로 */
const PATH: Record<string, string> = { [L.지급]: 'pay', [L.심사]: 'review', [L.추인]: 'ratify' }

function useTrail() {
  const target = useAtomValue(targetAtom)
  const path = target ? PATH[target.kind] : undefined
  const d = useData<Trail>(target && path ? `/trail/${path}/${encodeURIComponent(target.id)}` : null)
  // 대상이 바뀐 뒤에도 앞 대상의 값이 남아 있으므로 지금 대상의 것인지 본다
  return target && d && d.for[0] === path && d.for[1] === target.id ? d : undefined
}

/** 시간 순 목록(incident-console의 Timeline 꼴, 기록 화면의 경위 탭): 사람(역할)의 Avatar · 종류 · 대상 / 사유 / 날짜. 누르면 그 대상으로 */
export function Timeline() {
  const d = useTrail()
  const setTarget = useSetAtom(targetAtom)
  if (!d) return <Empty />
  return (
    <Rows density="balanced" hasDividers>
      {d.nodes.map((n) => (
        <ListItem
          key={n.key}
          align="start"
          isSelected={n.key === d.now}
          startContent={<Icon icon={n.who?.role ? UserCircleIcon : DocumentTextIcon} size="md" color="secondary" />}
          label={`${n.kind} · ${n.name}`}
          description={[n.who?.role, n.who?.reason?.class, n.who?.reason?.memo].filter(Boolean).join(' · ') || undefined}
          // 아직 일어나지 않은 칸(대기 중인 심사)은 그림처럼 날짜를 비운다
          endContent={n.at ? <Text type="supporting" color="secondary" hasTabularNumbers>{n.at}</Text> : undefined}
          onClick={() => setTarget(n.go)}
        />
      ))}
    </Rows>
  )
}

// 그림의 치수(간격 단위 4의 배수). 칸은 종류·날짜 / 대상(두 줄까지) / 사람·사유에 맞춘 높이. 1280에서 네 칸이 목록을 접은 가운데에 들어간다. 넘치면 그림이 가로로 밀린다(글자를 줄이지 않는다)
const W = 128
const H = 120
const GAP_X = 24
const GAP_Y = 16

/** 지금 대상의 줄기: 지금 칸에서 원인 쪽과 결과 쪽으로 이어진 칸 전부 */
function trunk(d: Trail) {
  const reach = (from: 0 | 1) => {
    const seen = new Set([d.now])
    for (let grew = true; grew; ) {
      grew = false
      for (const e of d.edges) if (seen.has(e[from]) && !seen.has(e[1 - from])) grew = !!seen.add(e[1 - from])
    }
    return seen
  }
  return new Set([...reach(0), ...reach(1)])
}

/** 칸의 열: 원인에서 가장 먼 길의 길이. 원인은 왼쪽, 결과는 오른쪽 */
function depths(d: Trail) {
  const at: Record<string, number> = {}
  const of = (k: string): number => (at[k] ??= Math.max(-1, ...d.edges.filter((e) => e[1] === k).map((e) => of(e[0]))) + 1)
  d.nodes.forEach((n) => of(n.key))
  return at
}

/** 가운데(경위를 펼쳤을 때): 원인 → 결과의 그림. 머리(제목·숫자 줄)는 위에 그대로 남고 몸통만 바뀐다.
 * 열마다 칸을 세로 가운데로 모으고, 선은 칸의 오른쪽 가운데에서 꺾여 다음 칸의 왼쪽 가운데로 들어간다(겹치지 않게 꺾는 자리는 열 사이 가운데) */
export function Picture() {
  const d = useTrail()
  const setTarget = useSetAtom(targetAtom)
  if (!d) return null
  const col = depths(d)
  const on = trunk(d)
  const count: Record<number, number> = {}
  d.nodes.forEach((n) => (count[col[n.key]] = (count[col[n.key]] ?? 0) + 1))
  const most = Math.max(...Object.values(count))
  const seen: Record<number, number> = {}
  const pos = Object.fromEntries(
    d.nodes.map((n) => {
      const c = col[n.key]
      const r = (seen[c] = (seen[c] ?? -1) + 1)
      const top = ((most - count[c]) * (H + GAP_Y)) / 2
      return [n.key, { x: c * (W + GAP_X), y: top + r * (H + GAP_Y) }]
    }),
  )
  const width = (Math.max(...Object.values(col)) + 1) * (W + GAP_X) - GAP_X
  const height = most * (H + GAP_Y) - GAP_Y
  return (
    <Region title={L.그림}>
        {/* 칸 폭이 모자라면(1280) 그림 전체가 비율대로 줄어든다 — 마지막 칸이 잘리지 않게 */}
        <svg role="img" aria-label={L.경위} viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="h-auto max-w-full">
          <defs>
            <marker id="head" markerUnits="userSpaceOnUse" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M0 0L8 4L0 8z" className="fill-disabled" />
            </marker>
            <marker id="head-on" markerUnits="userSpaceOnUse" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M0 0L8 4L0 8z" className="fill-primary" />
            </marker>
          </defs>
          {d.edges.map(([a, b]) => {
            const strong = on.has(a) && on.has(b)
            const [x1, y1, x2, y2] = [pos[a].x + W, pos[a].y + H / 2, pos[b].x, pos[b].y + H / 2]
            const mid = x1 + GAP_X / 2
            return (
              <path
                key={`${a}${b}`}
                d={`M${x1} ${y1}H${mid}V${y2}H${x2}`}
                fill="none"
                markerEnd={`url(#${strong ? 'head-on' : 'head'})`}
                className={strong ? 'stroke-primary' : 'stroke-disabled'}
                strokeWidth={strong ? 2 : 1}
              />
            )
          })}
          {d.nodes.map((n) => (
            <foreignObject key={n.key} x={pos[n.key].x} y={pos[n.key].y} width={W} height={H}>
              {/* 칸: 지금 대상은 muted 카드, 줄기 밖의 칸은 투명 카드(흐리게) */}
              <ClickableCard label={n.name} onClick={() => setTarget(n.go)} variant={n.key === d.now ? 'muted' : on.has(n.key) ? 'default' : 'transparent'} padding={2} height="100%" aria-current={n.key === d.now || undefined}>
                <VStack gap={0.5}>
                  {/* 종류 · 날짜는 한 줄씩(좁은 칸에서 `재심사`가 꺾이지 않게) */}
                  <Text weight="semibold" color={on.has(n.key) ? 'primary' : 'secondary'} className="whitespace-nowrap">
                    {n.kind}
                  </Text>
                  {/* 아직 일어나지 않은 칸(결정 전의 심사, 표시 전의 지급)은 날짜를 비운다 */}
                  {n.at && (
                    <Text type="supporting" hasTabularNumbers className="whitespace-nowrap">
                      {n.at}
                    </Text>
                  )}
                  {/* 줄은 띄어쓰기에서만 바꾼다(`2026-06`이 꺾이지 않게) */}
                  <Text maxLines={2} color={on.has(n.key) ? 'primary' : 'secondary'} className="break-keep">
                    {nb(n.name)}
                  </Text>
                  {n.who?.role && (
                    <Text type="supporting" maxLines={1}>
                      {[n.who.role, n.who.reason?.class, n.who.reason?.memo].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                </VStack>
              </ClickableCard>
            </foreignObject>
          ))}
        </svg>
    </Region>
  )
}

