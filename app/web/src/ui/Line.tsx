import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { L } from '../labels'
import { Token } from '@astryxdesign/core/Token'

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

/** 이름 여럿(구성 · 그룹 · 규칙): 개수 한 줄 + 이름은 Token 줄. 값 하나에 사실 하나(review.md 2-1) — ` · `로 잇지 않는다 */
export const Names = ({ list, unit }: { list: string[]; unit: string }) =>
  list.length ? (
    <VStack gap={1}>
      <Text weight="bold" hasTabularNumbers>{`${list.length}${unit}`}</Text>
      <HStack gap={1} wrap="wrap">
        {list.map((n) => <Token key={n} size="sm" label={n} />)}
      </HStack>
    </VStack>
  ) : (
    <Text color="secondary">{L.없음}</Text>
  )
