import type { ReactNode } from 'react'
import { Empty } from './Empty'
import { label } from './styles'

/** 금액의 표기: 천 단위 쉼표 */
export const num = (n: number) => n.toLocaleString('ko-KR')

/** 표. 칸은 줄을 바꾸지 않고, 자리가 좁으면 이 표만 가로로 민다. 줄 높이는 선을 포함해 36·32(칸에 높이를 준다). 첫 열은 사람이 읽는 이름. `right`는 오른쪽 정렬하는 열(금액), `current`는 열어 둔 줄. 줄이 없으면 `없음` */
export function Table({ head, rows, right = [], current }: { head: string[]; rows: ReactNode[][]; right?: number[]; current?: number }) {
  if (!rows.length) return <Empty />
  const side = (i: number) => (right.includes(i) ? 'text-right' : 'text-left')
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-table whitespace-nowrap tabular-nums">
        <thead>
          <tr className="bg-surface">
            {head.map((h, i) => (
              <th key={i} className={`h-head border-b border-line px-2 ${label} ${side(i)}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, y) => (
            <tr key={y} aria-current={y === current || undefined} className={y === current ? 'bg-surface' : ''}>
              {r.map((c, i) => (
                <td key={i} className={`h-row border-b border-line px-2 ${side(i)}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
