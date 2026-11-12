import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { isValidElement, type ReactNode } from 'react'
import { L } from '../labels'
import { Empty } from './Empty'

/**
 * 숫자 줄: 판단의 재료가 되는 값들(합산 · 한도 · 승인권자 …). 이름표(보조)를 위에, 값(large, 고정폭 숫자)을 아래에 둔다.
 * 폭이 모자라면 항목 단위로 다음 줄로 넘어간다. children(줄 전체의 출처 표지)은 마지막 항목의 값 옆에 붙는다
 */
export const Figures = ({ items, children }: { items: [string, ReactNode][]; children?: ReactNode }) => (
  <HStack gap={8} vAlign="start" wrap="wrap">
    {items.map(([k, v], i) => (
      <VStack key={k} gap={0.5}>
        <Text type="supporting" color="secondary">
          {k}
        </Text>
        <HStack gap={3} vAlign="center">
          {v == null || v === '' || (isValidElement(v) && v.type === Empty) ? (
            <Text type="large" color="secondary">
              {L.없음}
            </Text>
          ) : (
            <Text type="large" weight="semibold" hasTabularNumbers>
              {v}
            </Text>
          )}
          {i === items.length - 1 && children}
        </HStack>
      </VStack>
    ))}
  </HStack>
)
