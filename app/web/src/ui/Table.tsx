import type { ReactNode } from 'react'
import { Empty } from './Empty'
import { label } from './styles'

/** 금액의 표기: 천 단위 쉼표 */
export const num = (n: number) => n.toLocaleString('ko-KR')

/** 표. 첫 열은 사람이 읽는 이름. `right`는 오른쪽 정렬하는 열(금액), `current`는 열어 둔 줄. 줄이 없으면 `없음` */
export function Table({ head, rows, right = [], current }: { head: string[]; rows: ReactNode[][]; right?: number[]; current?: number }) {
  if (!rows.length) return <Empty />
  const side = (i: number) => (right.includes(i) ? 'text-right' : 'text-left')
  return (
    <table className="w-full border-collapse text-table tabular-nums">
      <thead>
        <tr className="h-head bg-surface">
          {head.map((h, i) => (
            <th key={i} className={`border-b border-line px-2 ${label} ${side(i)}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, y) => (
          <tr key={y} aria-current={y === current || undefined} className={`h-row ${y === current ? 'bg-surface' : ''}`}>
            {r.map((c, i) => (
              <td key={i} className={`border-b border-line px-2 ${side(i)}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
