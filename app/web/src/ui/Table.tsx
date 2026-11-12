import { Table as Grid, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table'
import type { ReactNode } from 'react'
import { Empty } from './Empty'

/** 금액의 표기: 천 단위 쉼표 */
export const num = (n: number) => n.toLocaleString('ko-KR')

/**
 * 표(astryx Table, 촘촘한 밀도). 칸은 줄을 바꾸지 않고, 자리가 좁으면 이 표만 가로로 민다. 첫 열은 사람이 읽는 이름.
 * `right`는 오른쪽 정렬하는 열(금액), `current`는 열어 둔 줄, `mark`는 강조하는 줄(근거 연결이 가리킨 줄 — 화면에 보이게 스크롤하고 잠깐 노랗다).
 * `onRow`를 주면 줄 전체가 눌린다(목록에서 대상 열기). 줄 안의 이름은 그래도 Link로 둔다(키보드로 가는 길). 줄이 없으면 `없음`
 */
export function Table({ head, rows, right = [], current, mark, onRow }: { head: string[]; rows: ReactNode[][]; right?: number[]; current?: number; mark?: number; onRow?: (y: number) => void }) {
  if (!rows.length) return <Empty />
  // 칸은 내용 폭을 따른다(astryx는 칸을 같은 폭으로 자르는 max-width:0을 둔다 — 금액·이름이 잘리지 않게 푼다)
  const side = (i: number) => `max-w-none ${right.includes(i) ? 'text-right' : ''}`
  return (
    <div className="min-w-0 whitespace-nowrap tabular-nums">
      <Grid density="compact" hasHover={!!onRow}>
        <TableHeader>
          <TableRow isHeaderRow>
            {head.map((h, i) => (
              <TableHeaderCell key={i} className={side(i)}>
                {h}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, y) => (
            <TableRow
              key={y}
              ref={y === mark ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
              aria-current={y === current || undefined}
              // 줄 안의 단추·입력(이름의 Link, 출처 표지, 고르기)을 누른 것은 줄을 열지 않는다
              onClick={onRow && ((e) => !(e.target as Element).closest('button, a, input, label') && onRow(y))}
              className={`${y === mark ? 'mark' : ''} ${y === current ? 'bg-muted' : ''} ${onRow ? 'cursor-pointer' : ''}`}
            >
              {r.map((c, i) => (
                <TableCell key={i} className={side(i)}>
                  {c}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Grid>
    </div>
  )
}
