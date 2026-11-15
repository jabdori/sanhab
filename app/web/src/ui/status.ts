// 낱말 → astryx 색 변형의 대응은 이 파일 한 곳에만 둔다(tokens.md의 "색"). 다른 파일은 색 이름을 쓰지 않는다(lint가 막는다).
// 색의 수준은 astryx 템플릿(work-item-detail · table-grouped · dashboard-progress · ai-chat-landing): 상태(완료 success · 진행 중 accent · 멈춤 warning · 아님 error),
// 범주 표시(Token 색), 기록 종류의 아이콘 색, 결과 자리의 CheckCircle success. AI가 쓴 글에는 칠하지 않는다.
import { AcademicCapIcon, ArrowRightStartOnRectangleIcon, ArrowPathIcon, BanknotesIcon, BookOpenIcon, BuildingStorefrontIcon, ChatBubbleLeftRightIcon, CheckBadgeIcon, CheckIcon, DocumentMagnifyingGlassIcon, FlagIcon, NoSymbolIcon, PlusCircleIcon, StopIcon } from '@heroicons/react/24/outline'
import { L } from '../labels'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'error'

const SUCCESS = [L.승인, L.완료, L.해소, L.채택, L.인정, L.성공, L.정산, L.추인]
const WARNING = [L.보류, L.보완, L.미응답, L.재심사]
const ERROR = [L.반려, L.불채택, L.오류, L.불인정, L.불일치, L.실패, L.누락, L.거부]
/** 진행 중: 사람이(또는 AI · 은행이) 움직이는 중인 상태 — 소명 요청 · 보고 검토 · 작업 진행 · 이체(회신 대기) */
const PROGRESS = [L.요청, L.검토, L.진행, L.이체]

/** 기본 상태: 표지를 달지 않는다(astryx Badge — "Skip the badge for the default state; only highlight exceptions"). 일이 늘 처음 놓이는 대기, 비교가 맞은 일치 */
export const DEFAULT: string[] = [L.대기, L.일치, L.접수]
export const plain = (state?: string | null) => !state || DEFAULT.includes(state)

/** 상태(심사 · 지급 · 정황 · 소명 · 보고 · 대사의 비교) → 색(StatusDot 변형) */
export const tone = (state: string): Tone =>
  (SUCCESS as string[]).includes(state) ? 'success' : (WARNING as string[]).includes(state) ? 'warning' : (ERROR as string[]).includes(state) ? 'error' : (PROGRESS as string[]).includes(state) ? 'accent' : 'neutral'
/** 상태 → Badge 변형. Badge에는 accent가 없어 진행 중은 강조색과 같은 남색 계열(blue: 남색 글자 · 옅은 남색 면) */
export const badge = (state: string) => {
  const t = tone(state)
  return t === 'accent' ? ('blue' as const) : t
}

/** 결과 자리(대사 일치 · 서류 비교 일치)의 완료 표지: CheckCircle 아이콘 색(dashboard-progress의 onTrack) */
export const done = 'success' as const

/** 서버가 거절한 낱말(권한 · 사유 · 상태 · 대상)과 실패 → 오류 */
export const fail = 'error' as const

/** 주의가 필요한 수(지연 n일 · 걸린 정황 수 …) → 주의 */
export const caution = 'warning' as const

/** 한도 대비 막대: 넘으면 오류, 아니면 테마의 강조색 */
export const meter = (over: boolean) => (over ? ('error' as const) : ('accent' as const))

/** 표시 → 아이콘. 정황만 주의(warning Badge), 나머지는 Token — 범주 색(work-item-detail의 라벨 Token)은 COLOR, 없으면 기본 */
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
/** 범주 표시의 Token 색: 다시 보는 것(재심사 · 재검토) purple, 추인 green, 가설 orange. 종결 · 정산 · 거부 · 새 · 이탈 · 예시는 기본 */
const COLOR: Record<string, 'purple' | 'green' | 'orange'> = { [L.재심사]: 'purple', [L.재검토]: 'purple', [L.추인]: 'green', [L.가설]: 'orange' }
export const mark = (m: string) => ({ icon: ICON[m] ?? FlagIcon, caution: m === L.정황, color: COLOR[m] ?? ('default' as const) })

/** 기록 종류 → 아이콘과 그 색(ai-chat-landing의 색 아이콘처럼 종류를 한눈에). 작업 목록 묶음 머리 · 대리점/규정 목록 머리 · 기록 머리 · 대화의 기록 카드가 같은 대응을 쓴다 */
const KIND: Record<string, { icon: typeof FlagIcon; color: 'blue' | 'orange' | 'cyan' | 'teal' | 'green' | 'purple' | 'gray' }> = {
  [L.심사]: { icon: DocumentMagnifyingGlassIcon, color: 'blue' },
  [L.정황]: { icon: FlagIcon, color: 'orange' },
  [L.소명]: { icon: ChatBubbleLeftRightIcon, color: 'cyan' },
  [L.지급]: { icon: BanknotesIcon, color: 'teal' },
  [L.추인]: { icon: CheckBadgeIcon, color: 'green' },
  [L.대리점]: { icon: BuildingStorefrontIcon, color: 'purple' },
  [L.규정]: { icon: BookOpenIcon, color: 'gray' },
}
export const kind = (k: string) => KIND[k] ?? null

/** 줄의 주의 단계(StatusDot): 정황이 걸리면 주의, 반려 · 재심사는 오류, 진행 중(요청 · 검토 · 이체 …)은 강조, 나머지는 neutral */
export const dot = (marks: string[], state?: string | null): Tone =>
  marks.includes(L.정황) ? 'warning' : state === L.반려 || state === L.재심사 ? 'error' : state && tone(state) === 'accent' ? 'accent' : 'neutral'

/** 정황의 주의 점: 끝난 것(해소 · 기각)은 neutral, 소명을 요청한 것은 진행 중(강조), 나머지(접수)는 주의 */
export const signalDot = (state: string): Tone => (state === L.해소 || state === L.기각 ? 'neutral' : state === L.요청 ? 'accent' : 'warning')

/** 한도 대비 비율: 한도를 조금 넘으면 100%로 반올림되지 않게 소수 한 자리(2,007,205 → 100.4%) */
export const pct = (total: number, limit: number) => {
  const p = (total / limit) * 100
  // 넘은 것은 올림(2,007,205 → 100.4%, 100.04% → 100.1%) — 반올림이나 버림으로 100%가 되지 않게
  return `${p > 100 && Math.round(p) <= 100 ? (Math.ceil(p * 10) / 10).toFixed(1) : Math.round(p)}%`
}

/** 금액의 표기: 천 단위 쉼표("원"은 붙이지 않는다) */
export const num = (n: number) => n.toLocaleString('ko-KR')

/** 줄을 바꾸지 않는 붙임표(2026‑06이 `2026-` / `06`으로 꺾이지 않게) — 좁은 칸의 제목 · 이름에만. 계좌 같은 데이터 값에는 쓰지 않는다(복사하면 다른 글자가 된다 — whitespace-nowrap으로) */
export const nb = (s: string) => s.replace(/-/g, '\u2011')
