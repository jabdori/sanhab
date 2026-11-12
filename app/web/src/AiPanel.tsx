// AI 구역의 위쪽(대화 칸 위): 지금 연 기록에 대해 AI가 쓴 것을 접히는 카드 한 장으로 — 심사는 걸린 정황들의 보고, 정황은 그 보고(채택 · 불채택 포함), 소명은 서류 정리와 미확인.
// 본문(사실)에는 AI의 글을 두지 않는다. 오른쪽 전체가 AI 구역이다(대화는 그 아래).
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, Section, VStack } from '@astryxdesign/core/Layout'
import { Heading } from '@astryxdesign/core/Text'
import { SparklesIcon } from '@heroicons/react/24/outline'
import { useAtomValue } from 'jotai'
import type { ReactNode } from 'react'
import { L } from './labels'
import { Reports } from './pages/Review'
import { targetAtom } from './state'
import { AiReport } from './tickets/17-보고'
import { Tidy } from './tickets/19-서류'
import { Unknown } from './tickets/20-소명'

/** 기록의 종류 → AI가 쓴 것 */
const BODY: Record<string, () => ReactNode> = {
  [L.심사]: Reports,
  [L.정황]: AiReport,
  [L.소명]: () => (
    <VStack gap={4}>
      <Tidy />
      <Unknown />
    </VStack>
  ),
}

export function AiPanel() {
  const target = useAtomValue(targetAtom)
  const Body = target ? BODY[target.kind] : undefined
  if (!Body || !target) return null
  return (
    // 대화 칸의 머리 위에 고정. 길면 칸 높이의 절반까지만 차지하고 그 안에서 스크롤
    <Section key={`${target.kind}/${target.id}`} dividers={['bottom']} padding={4} className="max-h-1/2 overflow-y-auto">
      <Collapsible
        trigger={
          <HStack gap={2} vAlign="center">
            <Icon icon={SparklesIcon} size="sm" color="accent" />
            <Heading level={3}>{`${L.AI} ${L.보고}`}</Heading>
          </HStack>
        }
        defaultIsOpen
      >
        <Body />
      </Collapsible>
    </Section>
  )
}
