// 상태와 표시의 표지. 자리마다 템플릿의 꼴을 따른다(색의 대응은 ui/status.ts 한 곳):
//   기록 머리 · 요약 · 영역 제목 옆의 상태 → State(Badge, detail-page)
//   목록 줄의 상태 → StateDot(StatusDot + 글자, table-grouped) / 줄의 주의 단계 → RowDot(StatusDot만)
//   표시(정황 · 재검토 · 추인 …) → Mark
import { Badge } from '@astryxdesign/core/Badge'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack } from '@astryxdesign/core/Layout'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { badge, caution, dot, mark, plain } from './status'

/** 표시(정황 · 재검토 · 추인 …): 아이콘 + 글자. 주의가 필요한 정황만 warning Badge, 나머지는 색 없는 Token(tokens.md의 색 표) */
export const Mark = ({ children }: { children: string }) => {
  const m = mark(children)
  return m.caution ? <Badge variant={caution} icon={<Icon icon={m.icon} size="sm" />} label={children} /> : <Token size="sm" icon={<Icon icon={m.icon} size="sm" />} label={children} />
}

/** 머리의 상태(Badge): 기본 상태(대기 · 일치 · 접수)는 그리지 않고 예외만 */
export const State = ({ word }: { word?: string | null }) => (plain(word) ? null : <Badge variant={badge(word!)} label={word!} />)

/** 목록 줄의 상태(table-grouped의 상태 칸): 색 점 + 글자. 기본 상태는 그리지 않는다 */
export const StateDot = ({ word }: { word?: string | null }) =>
  plain(word) ? null : (
    <HStack gap={2} vAlign="center">
      <StatusDot variant={badge(word!)} label={word!} />
      <Text type="body">{word}</Text>
    </HStack>
  )

/** 목록 줄 맨 앞의 주의 단계(table-grouped의 첫 칸): 정황 → 주의, 반려 · 재심사 → 오류, 나머지 neutral. label은 읽어 주는 말(상태나 표시) */
export const RowDot = ({ marks, state, label }: { marks: string[]; state?: string | null; label: string }) => <StatusDot variant={dot(marks, state)} label={label} />
