// 읽는 중 · 실패의 자리(astryx Skeleton · EmptyState). 값이 아직 없을 때 그 자리에 그린다:
//   const q = useLoad<T>(path); if (!q.data) return <Pending of={q} />            — 영역 · 목록
//   if (!q.data) return <Pending of={q} page />                                    — 기록 화면 하나(detail-page 꼴의 틀)
// 여러 조회를 기다리면 of={[a, b]}: 하나라도 실패하면 실패, 하나라도 읽는 중이면 읽는 중.
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HStack, Layout, LayoutContent, LayoutHeader, Section, VStack } from '@astryxdesign/core/Layout'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { L } from '../labels'
import type { Load } from '../state'

/** 몸통의 자리: 줄 셋(읽는 중) */
const Lines = () => (
  <VStack gap={3}>
    {[0, 1, 2].map((i) => (
      <Skeleton key={i} height={20} index={i} />
    ))}
  </VStack>
)

export function Pending({ of, page = false }: { of: Load<unknown> | Load<unknown>[]; page?: boolean }) {
  const all = Array.isArray(of) ? of : [of]
  const error = all.find((l) => l.error)?.error
  if (!error && !all.some((l) => l.loading)) return null
  // 없는 기록(404)은 `없음`, 그 밖의 실패는 `오류` + 서버의 말
  const body = error ? (
    error.status === 404 ? <EmptyState title={L.없음} isCompact={!page} /> : <EmptyState title={L.오류} description={error.message} isCompact={!page} />
  ) : (
    <Lines />
  )
  if (!page) return body
  // 기록 화면(ui/Record의 RecordPage와 같은 틀): 머리(돌아가기 · 제목 · 메타) | 본문(Section 둘)
  return (
    <Layout
      height="fill"
      contentWidth={1000}
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={2}>
            <Skeleton width={120} height={16} />
            <Skeleton width={320} height={32} index={1} />
            <HStack gap={2}>
              <Skeleton width={80} height={20} index={2} />
              <Skeleton width={120} height={20} index={3} />
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent role="main">
          <VStack gap={4}>
            <Section>{body}</Section>
            {!error && (
              <Section>
                <Lines />
              </Section>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  )
}
