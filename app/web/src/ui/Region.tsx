import { Card } from '@astryxdesign/core/Card'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Heading } from '@astryxdesign/core/Text'
import type { ReactNode } from 'react'

/**
 * 영역: astryx Card 한 장 — 제목 줄(Heading 2 + `aside` 출처 표지·상태 / 오른쪽 영역 조치 `actions`) 아래 몸통.
 * astryx에 제목 달린 카드가 없어 이 조합만 앱이 갖는다
 */
export const Region = ({ title, aside, actions, children }: { title: string; aside?: ReactNode; actions?: ReactNode; children: ReactNode }) => (
  <Card>
    <VStack gap={4}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <StackItem size="fill">
          <HStack gap={2} vAlign="center">
            <Heading level={2}>{title}</Heading>
            {aside}
          </HStack>
        </StackItem>
        {actions && <HStack gap={2}>{actions}</HStack>}
      </HStack>
      <VStack gap={3}>
        {children}
      </VStack>
    </VStack>
  </Card>
)
