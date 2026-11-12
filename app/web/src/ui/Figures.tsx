import { Text } from '@astryxdesign/core/Text'
import { isValidElement, type ReactNode } from 'react'
import { L } from '../labels'
import { Empty } from './Empty'

/** 값이 없으면(빈 값, `<Empty />`) 값 등급의 `없음`(보조 색). 작은 회색 글자로 줄이 내려앉지 않게 */
const value = (v: ReactNode) =>
  v == null || v === '' || (isValidElement(v) && v.type === Empty) ? (
    <Text type="large" color="secondary" weight="normal">
      {L.없음}
    </Text>
  ) : (
    <Text type="large" hasTabularNumbers>
      {v}
    </Text>
  )

/**
 * 숫자 줄: 판단의 재료가 되는 값들(합산 · 한도 · 승인권자 …). 이름표(보조)를 위에, 값(large, 고정폭 숫자)을 아래에 둔다.
 * 이름표는 모두 같은 높이에서 시작하고(위 맞춤), 값 줄은 높이가 정해져 있어 값 옆의 출처 표지가 줄을 밀지 않는다.
 * 항목은 쪼개지지 않고, 폭이 모자라면 항목 단위로 다음 줄로 넘어간다. children(줄 전체의 출처 표지)은 마지막 항목의 값 옆에 붙어 함께 넘어간다
 */
export const Figures = ({ items, children }: { items: [string, ReactNode][]; children?: ReactNode }) => (
  <dl className="flex flex-wrap items-start gap-x-8 gap-y-3">
    {items.map(([k, v], i) => (
      <div key={k} className="flex shrink-0 flex-col gap-0.5 whitespace-nowrap">
        <dt>
          <Text type="supporting">{k}</Text>
        </dt>
        <dd className="flex min-h-7 items-center gap-3">
          {value(v)}
          {i === items.length - 1 && children}
        </dd>
      </div>
    ))}
  </dl>
)
