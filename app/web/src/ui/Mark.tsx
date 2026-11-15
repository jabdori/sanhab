// 상태와 표시의 표지. 자리마다 템플릿의 꼴을 따른다(색의 대응은 ui/status.ts 한 곳):
//   기록 머리 · 요약 · 영역 제목 옆의 상태 → State(Badge, detail-page)
//   목록 줄의 상태 → StateDot(StatusDot + 글자, table-grouped) / 줄의 주의 단계 → RowDot(StatusDot만)
//   표시(정황 · 재검토 · 추인 …) → Mark / 기록 종류 → Kind(색 면 타일) / 결과 자리의 완료 → Done(CheckCircle)
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { Badge } from '@astryxdesign/core/Badge'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack } from '@astryxdesign/core/Layout'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import { badge, caution, done, dot, kind, mark, plain, tone } from './status'

/** 표시(정황 · 재검토 · 추인 …): 아이콘 + 글자. 주의가 필요한 정황만 warning Badge, 나머지는 범주 색 Token(tokens.md의 색 표) */
export const Mark = ({ children }: { children: string }) => {
  const m = mark(children)
  return m.caution ? <Badge variant={caution} icon={<Icon icon={m.icon} size="sm" />} label={children} /> : <Token size="sm" color={m.color} icon={<Icon icon={m.icon} size="sm" />} label={children} />
}

/** 타일 크기(아이콘 + 안쪽 여백): 목록 제목 옆(lg 36) > 기록 머리 · 문맥 카드 · 제안 카드(md 32) > 묶음 머리(sm 28) > 칩(xsm 20 — 알약 칩 안이라 둥글게 보여도 맞다) */
const TILE = { lg: ['md', 2], md: ['sm', 2], sm: ['sm', 1.5], xsm: ['xsm', 1] } as const

/** 기록 종류의 표지: 옅은 같은 색 면의 타일에 색 아이콘(work-item-detail의 첨부 타일 꼴). 면은 Card의 색 변형(--color-background-<색>, 범주용) — 타일이지 카드 묶음이 아니다.
 *  `label`이 있으면 타일 옆에 글자(기록 머리의 메타 줄), 없으면 타일만 */
export function Kind({ of, label, size = 'md' }: { of: string; label?: boolean; size?: keyof typeof TILE }) {
  const k = kind(of)
  if (!k) return null
  const [icon, pad] = TILE[size]
  const tile = (
    <Card variant={k.color} padding={pad}>
      <Center>
        <Icon icon={k.icon} size={icon} color={k.color} />
      </Center>
    </Card>
  )
  return label ? (
    <HStack gap={2} vAlign="center">
      {tile}
      <Text type="body">{of}</Text>
    </HStack>
  ) : (
    tile
  )
}

/** 결과 자리의 완료(대사 일치 · 서류 비교 일치): CheckCircle success + 글자(dashboard-progress). `label`이 없으면 아이콘만(표의 칸) */
export const Done = ({ word, label = true }: { word: string; label?: boolean }) => (
  <HStack gap={1} vAlign="center">
    <Icon icon={CheckCircleIcon} size="sm" color={done} label={label ? undefined : word} />
    {label && <Text weight="medium">{word}</Text>}
  </HStack>
)

/** 머리의 상태(Badge): 기본 상태(대기 · 일치 · 접수)는 그리지 않고 예외만 */
export const State = ({ word }: { word?: string | null }) => (plain(word) ? null : <Badge variant={badge(word!)} label={word!} />)

/** 목록 줄의 상태(table-grouped의 상태 칸): 색 점 + 글자. 기본 상태는 그리지 않는다 */
export const StateDot = ({ word }: { word?: string | null }) =>
  plain(word) ? null : (
    <HStack gap={2} vAlign="center">
      <StatusDot variant={tone(word!)} label={word!} />
      <Text type="body">{word}</Text>
    </HStack>
  )

/** 목록 줄 맨 앞의 주의 단계(table-grouped의 첫 칸): 정황 → 주의, 반려 · 재심사 → 오류, 나머지 neutral. label은 읽어 주는 말(상태나 표시) */
export const RowDot = ({ marks, state, label }: { marks: string[]; state?: string | null; label: string }) => <StatusDot variant={dot(marks, state)} label={label} />
