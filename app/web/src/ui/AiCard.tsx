// AI 보고 카드: AI가 쓴 것을 다룬 사실 영역 바로 아래에 붙인다(D63). 사실 영역(흰 면의 평평한 Section)과 층이 다르다 — 그림자로 떠 있는 카드,
// 머리는 AI 아이콘 + 제목(무엇에 대한 보고인지) + 표지. 글자는 칠하지 않는다(색은 의미가 있을 때만 — 판단이 AI 쪽으로 기울지 않게)
import { Card } from '@astryxdesign/core/Card'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Heading } from '@astryxdesign/core/Text'
import { SparklesIcon } from '@heroicons/react/24/outline'
import type { ReactNode } from 'react'

export function AiCard({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <Card elevation="med" padding={4} data-tour="ai">
      <VStack gap={3}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Icon icon={SparklesIcon} size="sm" color="accent" />
          <StackItem size="fill">
            <Heading level={3}>{title}</Heading>
          </StackItem>
          {aside}
        </HStack>
        {children}
      </VStack>
    </Card>
  )
}
