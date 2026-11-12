import { Table as Grid, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table'
import type { ReactNode } from 'react'
import { Empty } from './Empty'

/** 금액의 표기: 천 단위 쉼표 */
export const num = (n: number) => n.toLocaleString('ko-KR')

/**
 * 표(astryx Table, 촘촘한 밀도). 칸은 줄을 바꾸지 않고, 자리가 좁으면 이 표만 가로로 민다. 첫 열은 사람이 읽는 이름.
 * `right`는 오른쪽 정렬하는 열(금액), `current`는 열어 둔 줄, `mark`는 강조하는 줄(근거 연결이 가리킨 줄 — 화면에 보이게 스크롤하고 잠깐 노랗다).
 * `onRow`를 주면 줄 전체가 눌린다(목록에서 대상 열기). 줄 안의 이름은 그래도 Link로 둔다(키보드로 가는 길). 줄이 없으면 `없음`.
 * `fit`은 내용 폭만큼만 쓰는 열(고정 폭의 고르기 칸 — 넓은 목록에서 남는 폭을 나눠 갖지 않게).
 * `wrap`은 좁으면 줄을 바꾸는 열(긴 주소처럼 잘라서는 안 되는 값 — 낱말 단위로 넘어간다).
 * `clip`은 남는 폭을 다 쓰고 넘치면 줄임표로 자르는 열(좁은 칸의 긴 이름 — 잘리면 머물 때 전체가 보인다). 마지막 열은 오른쪽 여백 24(theme.css — bleed로 끝에 붙지 않게)
 */
export function Table({ head, rows, right = [], clip = [], wrap = [], fit = [], current, mark, onRow }: { head: string[]; rows: ReactNode[][]; right?: number[]; clip?: number[]; wrap?: number[]; fit?: number[]; current?: number; mark?: number; onRow?: (y: number) => void }) {
  if (!rows.length) return <Empty />
  // 칸은 내용 폭을 따른다(astryx는 칸을 같은 폭으로 자르는 max-width:0을 둔다 — 금액·이름이 잘리지 않게 푼다)
  const side = (i: number) => `${clip.includes(i) ? 'w-full max-w-0' : 'max-w-none'} ${fit.includes(i) ? 'w-0' : ''} ${wrap.includes(i) ? 'whitespace-normal break-keep' : ''} ${right.includes(i) ? 'text-right' : ''}`
  return (
    // 줄 전체가 눌리는 표(목록)의 이름 Link는 머물 때만 밑줄(theme.css의 .rows-open)
    <div className={`min-w-0 whitespace-nowrap tabular-nums ${onRow ? 'rows-open' : ''}`}>
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
                  {clip.includes(i) ? (
                    // 한 줄로 자르고 줄임표. 글자뿐이면 머물 때 전체(title)
                    <span data-clip="" className="block truncate" title={typeof c === 'string' ? c : undefined}>
                      {c}
                    </span>
                  ) : (
                    c
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Grid>
    </div>
  )
}
