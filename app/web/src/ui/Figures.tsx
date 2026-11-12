import type { ReactNode } from 'react'
import { label } from './styles'

/** 숫자 줄: 이름표 + 값의 항목들. 항목은 쪼개지지 않고, 폭이 모자라면 항목 단위로 다음 줄로 넘어간다. children에는 출처 표지를 둔다 */
export const Figures = ({ items, children }: { items: [string, ReactNode][]; children?: ReactNode }) => (
  <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
    {items.map(([k, v]) => (
      <div key={k} className="flex shrink-0 items-baseline gap-2 whitespace-nowrap">
        <dt className={label}>{k}</dt>
        <dd className="text-figure tabular-nums">{v}</dd>
      </div>
    ))}
    {children}
  </dl>
)
