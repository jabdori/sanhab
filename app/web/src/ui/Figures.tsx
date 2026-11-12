import { Text } from '@astryxdesign/core/Text'
import type { ReactNode } from 'react'

/**
 * 숫자 줄: 판단의 재료가 되는 값들(합산 · 한도 · 승인권자 …). 이름표(보조)를 위에, 값(large, 고정폭 숫자)을 아래에 둔다.
 * 항목은 쪼개지지 않고, 폭이 모자라면 항목 단위로 다음 줄로 넘어간다. children에는 출처 표지를 둔다(값 줄의 끝에 붙는다)
 */
export const Figures = ({ items, children }: { items: [string, ReactNode][]; children?: ReactNode }) => (
  <dl className="flex flex-wrap items-end gap-x-8 gap-y-3">
    {items.map(([k, v]) => (
      <div key={k} className="flex shrink-0 flex-col gap-0.5 whitespace-nowrap">
        <dt>
          <Text type="supporting">{k}</Text>
        </dt>
        <dd>
          <Text type="large" hasTabularNumbers>
            {v}
          </Text>
        </dd>
      </div>
    ))}
    {children && <div className="flex items-center gap-2 pb-0.5">{children}</div>}
  </dl>
)
