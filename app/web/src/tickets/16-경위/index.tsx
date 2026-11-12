// 16 경위: 지급·심사·추인의 오른쪽 경위 칸에 시간순 목록(날짜, 종류, 대상)과 `그림` 버튼. 누르면 가운데가 경위 그림으로 바뀐다.
// 그림: 원인은 왼쪽, 결과는 오른쪽, 방향은 바뀌지 않는다. 지금 대상의 줄기(앞뒤로 이어진 칸과 선)가 진하다. 칸을 누르면 그 대상으로 간다. 결정의 칸에는 사람과 사유가 붙는다.
import { Toggle } from '@base-ui/react/toggle'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { targetAtom, trailOpenAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { button, label } from '../../ui/styles'
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
    <button className="cursor-pointer text-left text-action hover:text-action-hover" onClick={() => setTarget(node.go)}>
      {node.name}
    </button>
  )
}

/** 오른쪽: 시간순 목록. 날짜가 없는 칸(미상)이 먼저, 같은 날은 사슬의 순서 그대로 */
function List() {
  const d = useTrail()
  const [open, setOpen] = useAtom(trailOpenAtom)
  if (!d) return <Empty />
  const rows = d.nodes
    .map((n, i) => ({ n, i }))
    .sort((a, b) => (a.n.at ?? '').localeCompare(b.n.at ?? '') || a.i - b.i)
  return (
    <div className="flex flex-col gap-2">
      <Toggle pressed={open} onPressedChange={setOpen} className={`${button} self-start data-pressed:text-text`}>
        {L.그림}
      </Toggle>
      <Table head={[L.날짜, L.종류, L.대상]} rows={rows.map(({ n }) => [n.at ?? L.미상, n.kind, <Go key={n.key} node={n} />])} current={rows.findIndex(({ n }) => n.key === d.now)} />
    </div>
  )
}

// 그림의 치수(theme.css의 간격 단위 4의 배수)
const W = 172
const H = 88
const GAP_X = 40
const GAP_Y = 12

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

function Picture() {
  const d = useTrail()
  const setTarget = useSetAtom(targetAtom)
  if (!d) return <Empty />
  const col = depths(d)
  const on = trunk(d)
  const rows: Record<number, number> = {}
  const pos = Object.fromEntries(
    d.nodes.map((n) => {
      const r = (rows[col[n.key]] = (rows[col[n.key]] ?? -1) + 1)
      return [n.key, { x: col[n.key] * (W + GAP_X), y: r * (H + GAP_Y) }]
    }),
  )
  const width = (Math.max(...Object.values(col)) + 1) * (W + GAP_X) - GAP_X
  const height = (Math.max(...Object.values(rows)) + 1) * (H + GAP_Y) - GAP_Y
  return (
    <div className="overflow-x-auto">
      <svg role="img" aria-label={L.경위} width={width} height={height} className="text-label">
        <defs>
          <marker id="head" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M0 0L8 4L0 8z" className="fill-text-mute" />
          </marker>
          <marker id="head-on" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M0 0L8 4L0 8z" className="fill-text" />
          </marker>
        </defs>
        {d.edges.map(([a, b]) => {
          const strong = on.has(a) && on.has(b)
          return (
            <line
              key={`${a}${b}`}
              x1={pos[a].x + W}
              y1={pos[a].y + H / 2}
              x2={pos[b].x}
              y2={pos[b].y + H / 2}
              markerEnd={`url(#${strong ? 'head-on' : 'head'})`}
              className={strong ? 'stroke-text' : 'stroke-text-mute'}
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
              className={`flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-box border bg-bg px-2 py-1 text-left hover:bg-surface ${on.has(n.key) ? 'border-2 border-text' : 'border-line'}`}
            >
              <span className={`${label} tabular-nums`}>
                {n.kind} {n.at ?? L.미상}
              </span>
              <span className="truncate text-body" title={n.name}>
                {n.name}
              </span>
              {n.who?.role && (
                <span className={`${label} truncate`}>
                  {[n.who.role, n.who.reason?.class].filter(Boolean).join(' · ')}
                </span>
              )}
              {n.who?.reason?.memo && (
                <span className={`${label} truncate`} title={n.who.reason.memo}>
                  {n.who.reason.memo}
                </span>
              )}
            </button>
          </foreignObject>
        ))}
      </svg>
    </div>
  )
}

const kinds = [L.지급, L.심사, L.추인]
export default [
  ...kinds.map((kind) => ({ slot: 'trail', kind, View: List }) as const),
  ...kinds.map((kind) => ({ slot: 'map', kind, View: Picture }) as const),
] satisfies Piece[]
