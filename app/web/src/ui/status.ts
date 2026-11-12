// 상태와 표시의 낱말 → astryx 변형. 화면은 이 값을 Badge · Token · StatusDot에 직접 넘긴다(색은 언제나 글자와 함께).
import { ArrowPathIcon, CheckIcon, FlagIcon, NoSymbolIcon, StopIcon } from '@heroicons/react/24/outline'
import { L } from '../labels'

type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'purple'

/** 처리 상태(심사 · 지급 · 정황 · 보고) → Badge 변형 */
const STATE: Record<string, BadgeVariant> = {
  [L.대기]: 'neutral',
  [L.승인]: 'success',
  [L.보류]: 'warning',
  [L.반려]: 'error',
  [L.재심사]: 'purple',
  [L.이체]: 'info',
  [L.완료]: 'success',
  [L.접수]: 'neutral',
  [L.요청]: 'info',
  [L.기각]: 'neutral',
  [L.해소]: 'success',
  [L.검토]: 'info',
  [L.채택]: 'success',
  [L.불채택]: 'error',
  [L.오류]: 'error',
}
export const badge = (state: string): BadgeVariant => STATE[state] ?? 'neutral'

/** 표시(정황 · 재검토 …) → Token 색과 아이콘. 정황만 주의 색이다 */
const MARK: Record<string, { color: 'orange' | 'purple' | 'blue' | 'red' | 'gray' | 'green'; icon: typeof FlagIcon }> = {
  [L.정황]: { color: 'orange', icon: FlagIcon },
  [L.재검토]: { color: 'purple', icon: ArrowPathIcon },
  [L.재심사]: { color: 'purple', icon: ArrowPathIcon },
  [L.추인]: { color: 'blue', icon: CheckIcon },
  [L.정산]: { color: 'green', icon: CheckIcon },
  [L.거부]: { color: 'red', icon: NoSymbolIcon },
  [L.종결]: { color: 'gray', icon: StopIcon },
}
export const mark = (m: string) => MARK[m] ?? { color: 'gray' as const, icon: FlagIcon }

/** 줄의 주의 단계(StatusDot): 정황이 걸리면 경고, 반려·재심사는 오류, 나머지는 중립 */
export const dot = (marks: string[], state?: string | null): 'warning' | 'error' | 'neutral' =>
  marks.includes(L.정황) ? 'warning' : state === L.반려 || state === L.재심사 ? 'error' : 'neutral'

/** 식별자의 종류(일치) → Token 색 */
const MATCH: Record<string, 'blue' | 'teal' | 'purple'> = { [L.대표자]: 'blue', [L.주소]: 'teal', [L.계좌]: 'purple' }
export const match = (kind: string) => MATCH[kind] ?? 'default'

/** 금액의 표기: 천 단위 쉼표("원"은 붙이지 않는다) */
export const num = (n: number) => n.toLocaleString('ko-KR')
