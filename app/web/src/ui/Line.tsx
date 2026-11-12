import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'

/**
 * 이력 한 줄(모든 화면이 같은 꼴): 결정·조치의 낱말(굵게) · 나머지(사람 · 날짜 · 사유의 분류 · 결과 — 보조 색). 메모는 그 아래 줄에 따로.
 * 결정(04의 Line), 지급 표시(07), 회신(08), 발송·접수(18) 모두 이것으로 그린다
 */
export const Line = ({ kind, parts, memo }: { kind: string; parts: (string | null | undefined)[]; memo?: string | null }) => (
  <VStack gap={0.5}>
    <HStack gap={2} vAlign="center" wrap="wrap">
      <Text weight="semibold">{kind}</Text>
      <Text color="secondary" hasTabularNumbers>
        {parts.filter(Boolean).join(' · ')}
      </Text>
    </HStack>
    {memo && <Text color="secondary">{memo}</Text>}
  </VStack>
)
