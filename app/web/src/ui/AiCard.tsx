// AI 보고 카드: AI가 쓴 것을 다룬 사실 영역 바로 아래에 붙인다(D63). 사실 영역(흰 면의 평평한 Section)과 층이 다르다 — 그림자로 떠 있는 카드,
// 머리는 AI 아이콘 + 제목(기본 `보고` — 같은 화면에 이미 보이는 이름은 되풀이하지 않는다, review.md 2) + 표지. 글자는 칠하지 않는다(색은 의미가 있을 때만 — 판단이 AI 쪽으로 기울지 않게)
import { Card } from '@astryxdesign/core/Card'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Heading } from '@astryxdesign/core/Text'
import { SparklesIcon } from '@heroicons/react/24/outline'
import type { ReactNode } from 'react'
import { L } from '../labels'

export function AiCard({ title = L.보고, aside, children }: { title?: ReactNode; aside?: ReactNode; children: ReactNode }) {
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
