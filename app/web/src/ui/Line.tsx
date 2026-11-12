import { Text } from '@astryxdesign/core/Text'

/**
 * 이력 한 줄(모든 화면이 같은 꼴): 결정·조치의 낱말(굵게) · 나머지(사람 · 날짜 · 사유의 분류 · 결과 — 보조 색). 메모는 그 아래 줄에 따로.
 * 결정(04의 Line), 지급 표시(07), 회신(08), 발송·접수(18) 모두 이것으로 그린다
 */
export const Line = ({ kind, parts, memo }: { kind: string; parts: (string | null | undefined)[]; memo?: string | null }) => (
  <div className="flex flex-col gap-0.5 break-keep">
    <div className="flex flex-wrap items-center gap-x-2 tabular-nums">
      <Text weight="semibold">{kind}</Text>
      <Text color="secondary">{parts.filter(Boolean).join(' · ')}</Text>
    </div>
    {memo && <p className="wrap-anywhere text-secondary">{memo}</p>}
  </div>
)
