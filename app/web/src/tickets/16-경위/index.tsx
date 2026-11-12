// 16 경위: 지급·심사·추인의 오른쪽 경위 칸에 사슬 순서의 목록(날짜, 종류, 대상)과 `그림` 버튼. 누르면 가운데가 경위 그림으로 바뀐다.
// 그림: 원인은 왼쪽, 결과는 오른쪽, 방향은 바뀌지 않는다. 지금 대상의 줄기(앞뒤로 이어진 칸과 선)가 진하다. 칸을 누르면 그 대상으로 간다. 결정의 칸에는 사람과 사유가 붙는다.
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { ToggleButton } from '@astryxdesign/core/ToggleButton'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { targetAtom, trailOpenAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { Region } from '../../ui/Region'
import { Table } from '../../ui/Table'

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

function Go({ node }: { node: Node }) {
  const setTarget = useSetAtom(targetAtom)
  return (
    <Link tooltip={node.name} onClick={() => setTarget(node.go)}>{node.name}</Link>
  )
}

/** 오른쪽: 사슬의 순서(원인 → 결과, 서버가 준 그대로). 날짜가 없는 칸은 미상. 대상이 길면 줄임표(머물면 전체) */
function List() {
  const d = useTrail()
  const [open, setOpen] = useAtom(trailOpenAtom)
  if (!d) return <Empty />
  return (
    <div className="flex flex-col gap-2">
      <div>
        <ToggleButton label={L.그림} size="sm" isPressed={open} onPressedChange={setOpen} />
      </div>
      <Table head={[L.날짜, L.종류, L.대상]} clip={[2]} rows={d.nodes.map((n) => [n.at ?? L.미상, n.kind, <Go key={n.key} node={n} />])} current={d.nodes.findIndex((n) => n.key === d.now)} />
    </div>
  )
}

// 그림의 치수(간격 단위 4의 배수). 칸은 종류·날짜 / 대상(두 줄까지) / 사람·사유에 맞춘 높이. 1280에서 네 칸이 목록을 접은 가운데에 들어간다. 넘치면 그림이 가로로 밀린다(글자를 줄이지 않는다)
const W = 144
const H = 96
const GAP_X = 32
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
  if (!d) return <Empty />
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
      <div className="overflow-x-auto">
        <svg role="img" aria-label={L.경위} width={width} height={height}>
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
              <button
                type="button"
                aria-current={n.key === d.now || undefined}
                onClick={() => setTarget(n.go)}
                className={`flex h-full w-full cursor-pointer flex-col justify-center gap-0.5 overflow-hidden rounded-md border px-3 text-left hover:bg-muted ${n.key === d.now ? 'border-2 border-primary bg-muted' : on.has(n.key) ? 'border-secondary bg-surface' : 'border-border bg-surface opacity-60'}`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <Text weight="semibold">{n.kind}</Text>
                  {/* 아직 일어나지 않은 칸(결정 전의 심사, 표시 전의 지급)은 날짜를 비운다 */}
                  {n.at && (
                    <Text type="supporting" hasTabularNumbers>
                      {n.at}
                    </Text>
                  )}
                </span>
                <Text maxLines={2} display="block">
                  {n.name}
                </Text>
                {n.who?.role && (
                  <Text type="supporting" maxLines={1} display="block">
                    {[n.who.role, n.who.reason?.class, n.who.reason?.memo].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </button>
            </foreignObject>
          ))}
        </svg>
      </div>
    </Region>
  )
}

const kinds = [L.지급, L.심사, L.추인]
export default [
  ...kinds.map((kind) => ({ slot: 'trail', kind, View: List }) as const),
  ...kinds.map((kind) => ({ slot: 'map', kind, View: Picture }) as const),
] satisfies Piece[]
