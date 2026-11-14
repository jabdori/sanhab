// 낱말 → astryx 색 변형의 대응은 이 파일 한 곳에만 둔다(tokens.md의 "색 — 의미가 있을 때만"). 다른 파일은 색 이름을 쓰지 않는다(lint가 막는다).
// 색은 주의(warning) · 오류(error) · 완료(success)뿐이고 나머지는 neutral이다. 분류 · 일치 · 출처 · 규칙에는 색을 주지 않는다.
import { AcademicCapIcon, ArrowRightStartOnRectangleIcon, ArrowPathIcon, CheckIcon, FlagIcon, NoSymbolIcon, PlusCircleIcon, StopIcon } from '@heroicons/react/24/outline'
import { L } from '../labels'

type Tone = 'neutral' | 'success' | 'warning' | 'error'

const SUCCESS = [L.승인, L.완료, L.해소, L.채택, L.인정, L.성공, L.정산, L.추인]
const WARNING = [L.보류, L.보완, L.미응답, L.재심사]
const ERROR = [L.반려, L.불채택, L.오류, L.불인정, L.불일치, L.실패, L.누락, L.거부]

/** 기본 상태: 표지를 달지 않는다(astryx Badge — "Skip the badge for the default state; only highlight exceptions"). 일이 늘 처음 놓이는 대기, 비교가 맞은 일치 */
export const DEFAULT: string[] = [L.대기, L.일치, L.접수]
export const plain = (state?: string | null) => !state || DEFAULT.includes(state)

/** 상태(심사 · 지급 · 정황 · 소명 · 보고 · 대사의 비교) → Badge 변형 */
export const badge = (state: string): Tone =>
  (SUCCESS as string[]).includes(state) ? 'success' : (WARNING as string[]).includes(state) ? 'warning' : (ERROR as string[]).includes(state) ? 'error' : 'neutral'

/** 서버가 거절한 낱말(권한 · 사유 · 상태 · 대상)과 실패 → 오류 */
export const fail = 'error' as const

/** 주의가 필요한 수(지연 n일 · 걸린 정황 수 …) → 주의 */
export const caution = 'warning' as const

/** 한도 대비 막대: 넘으면 오류, 아니면 테마의 강조색 */
export const meter = (over: boolean) => (over ? ('error' as const) : ('accent' as const))

/** 표시 → 아이콘. 정황(과 정황의 가설)만 주의(warning Badge)이고 나머지는 색 없는 Token */
const ICON: Record<string, typeof FlagIcon> = {
  [L.정황]: FlagIcon,
  [L.가설]: FlagIcon,
  [L.재검토]: ArrowPathIcon,
  [L.재심사]: ArrowPathIcon,
  [L.추인]: CheckIcon,
  [L.정산]: CheckIcon,
  [L.거부]: NoSymbolIcon,
  [L.종결]: StopIcon,
  // 재접수 뒤에 붙은 근거(정황의 깃발과 겹치지 않게)
  [L.새]: PlusCircleIcon,
  // D64: 등록 변경으로 그룹에서 빠진 심사(영업임원 승인으로 올라감)
  [L.이탈]: ArrowRightStartOnRectangleIcon,
  // 안내의 예시 기록(ui/example.json)
  [L.예시]: AcademicCapIcon,
}
export const mark = (m: string) => ({ icon: ICON[m] ?? FlagIcon, caution: m === L.정황 })

/** 줄의 주의 단계(StatusDot): 정황이 걸리면 주의, 반려 · 재심사는 오류, 나머지는 neutral */
export const dot = (marks: string[], state?: string | null): Tone =>
  marks.includes(L.정황) ? 'warning' : state === L.반려 || state === L.재심사 ? 'error' : 'neutral'

/** 정황의 주의 점: 끝난 것(해소 · 기각)은 neutral */
export const signalDot = (state: string): Tone => (state === L.해소 || state === L.기각 ? 'neutral' : 'warning')

/** 한도 대비 비율: 한도를 조금 넘으면 100%로 반올림되지 않게 소수 한 자리(2,007,205 → 100.4%) */
export const pct = (total: number, limit: number) => {
  const p = (total / limit) * 100
  return `${p > 100 && Math.round(p) <= 100 ? (Math.floor(p * 10) / 10).toFixed(1) : Math.round(p)}%`
}

/** 금액의 표기: 천 단위 쉼표("원"은 붙이지 않는다) */
export const num = (n: number) => n.toLocaleString('ko-KR')

/** 줄을 바꾸지 않는 붙임표(2026‑06이 `2026-` / `06`으로 꺾이지 않게) — 좁은 칸의 이름에 */
export const nb = (s: string) => s.replace(/-/g, '\u2011')
