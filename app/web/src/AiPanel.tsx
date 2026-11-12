// 기록의 보조 칸에 들어가는 AI 보고: 심사는 걸린 정황들의 보고, 정황은 그 보고(채택 · 불채택 포함), 소명은 서류 정리와 미확인. 본문(사실)과 칸이 나뉜다.
import { VStack } from '@astryxdesign/core/Layout'
import { useAtomValue } from 'jotai'
import type { ReactNode } from 'react'
import { L } from './labels'
import { Reports } from './pages/Review'
import { useReview } from './tickets/04-심사/review'
import { useDocs } from './tickets/19-서류/docs'
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

/** 지금 연 기록에 대해 AI가 쓴 것(보조 칸의 `AI 보고` 영역). 없으면 null */
export function AiBody() {
  const target = useAtomValue(targetAtom)
  const review = useReview()
  const docs = useDocs()
  const Body = target ? BODY[target.kind] : undefined
  // AI가 쓴 것이 없는 기록에는 영역을 두지 않는다: 정황이 걸리지 않은 심사, 서류가 아직 없는 소명
  const none = (target?.kind === L.심사 && !review?.review.marks.includes(L.정황)) || (target?.kind === L.소명 && !docs?.docs.length)
  if (!Body || !target || none) return null
  return <Body key={`${target.kind}/${target.id}`} />
}
