import { L } from '../labels'

type Dot = { id: string; name: string }

// 그림의 치수(theme.css의 간격 단위 4의 배수). 세 열: 대상 대리점 | 사람·주소·계좌 | 이웃 대리점
const ROW = 36
const BOX = 28
const DEALER = 92
const IDENT = 144
const GAP = 24
const X = [0, DEALER + GAP, DEALER + GAP + IDENT + GAP]
const WIDTH = X[2] + DEALER

/**
 * 관계 그림: 대리점은 둥근 모양, 사람·주소·계좌는 각진 모양. 한 대상의 바로 옆 이웃만 그리고 방향은 왼쪽에서 오른쪽으로 고정이다.
 * `left`는 대상 대리점, `mid`는 식별자, `right`는 이웃 대리점, `lines`는 [대리점 id, 식별자 id]. 같은 내용의 표를 함께 둔다.
 * `hints`는 등록된 선이 아닌 이어짐(정황 — 회수가 들어간 계좌)이고 점선으로 그린다.
 */
// ponytail: 값이 길면 상자를 넘친다(원본에서 가장 긴 주소·계좌는 들어간다). 넘치는 값이 생기면 줄여 적고 <title>로 전체를 보인다
export function Relation({ left, mid, right, lines, hints = [] }: { left: Dot[]; mid: Dot[]; right: Dot[]; lines: [string, string][]; hints?: [string, string][] }) {
  const cols = [left, mid, right]
  const height = Math.max(...cols.map((c) => c.length), 1) * ROW
  /** 점의 가운데 높이: 열마다 세로 가운데로 모은다 */
  const y = (col: number, i: number) => (height - cols[col].length * ROW) / 2 + ROW / 2 + i * ROW
  const at = (col: number, id: string) => {
    const i = cols[col].findIndex((d) => d.id === id)
    return i < 0 ? null : y(col, i)
  }
  return (
    // 자리가 좁으면(1280, 대화를 펼침) 그림 전체가 비율대로 줄어든다
    <>
      <svg role="img" aria-label={L.관계} viewBox={`0 0 ${WIDTH} ${height}`} width={WIDTH} height={height} className="h-auto max-w-full text-sm">
        {[...lines, ...hints].map(([dealer, ident], i) => {
          const dash = i >= lines.length ? '4 4' : undefined
          const to = at(1, ident)
          const fromLeft = at(0, dealer)
          const from = fromLeft ?? at(2, dealer)
          if (to === null || from === null) return null
          return fromLeft !== null ? (
            <line key={i} x1={X[0] + DEALER} y1={from} x2={X[1]} y2={to} strokeDasharray={dash} className="stroke-disabled" />
          ) : (
            <line key={i} x1={X[1] + IDENT} y1={to} x2={X[2]} y2={from} strokeDasharray={dash} className="stroke-disabled" />
          )
        })}
        {cols.map((col, c) =>
          col.map((d, i) => {
            const width = c === 1 ? IDENT : DEALER
            return (
              <g key={`${c}${d.id}`}>
                <rect x={X[c]} y={y(c, i) - BOX / 2} width={width} height={BOX} rx={c === 1 ? 0 : BOX / 2} className="fill-surface stroke-secondary" />
                <text x={X[c] + width / 2} y={y(c, i)} textAnchor="middle" dominantBaseline="central" className="fill-primary tabular-nums">
                  {d.name}
                </text>
              </g>
            )
          }),
        )}
      </svg>
    </>
  )
}
