import { HStack, Section, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Heading } from '@astryxdesign/core/Text'
import { isValidElement, type ReactNode } from 'react'
import { Empty } from './Empty'

// astryx template: detail-page — 영역 하나는 detail-page의 ItemsCard 꼴(Section 카드: 제목 줄 Heading 2 + 표지 · 오른쪽 조치, 아래 몸통)
/**
 * 영역(astryx detail-page의 Section): 위 구분선이 있는 흰 면의 Section — 제목 줄(Heading 2 + `aside` 출처 표지 · 건수 / 오른쪽 영역 조치 `actions`) 아래 몸통.
 * 카드가 아니다(tokens.md 면 — Card soup 금지). 몸통이 `없음`(Empty)뿐이고 조치가 없으면 영역째 그리지 않는다
 */
export const Region = ({ title, aside, actions, children }: { title: string; aside?: ReactNode; actions?: ReactNode; children: ReactNode }) =>
  isValidElement(children) && children.type === Empty && !actions ? null : (
    // data-region: 안내(ui/Tour)가 영역을 제목으로 찾아 밝힌다
    <Section data-region={title}>
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
        <VStack gap={3}>{children}</VStack>
      </VStack>
    </Section>
  )
