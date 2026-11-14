// 열어 둔 정황. 정황 상세에 조각을 끼우는 티켓(12 가설, 17 보고)은 useSignal()로 같은 값을 읽는다(조각마다 따로 부르지 않고, 조치 뒤에 저절로 다시 읽힌다).
import { atom, useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { L } from '../../labels'
import { api, changedAtom, roleAtom, targetAtom } from '../../state'
import type { Decision } from '../04-심사/review'

type Dot = { id: string; name: string }
/** 근거 한 줄: 가리키는 기록의 값(서버가 그 기록에서 읽는다). id는 그 기록의 id */
export type Evidence = {
  id: string
  /** 무엇인지: 회수, 계좌·주소·대표자(식별자의 등록), 지급, 대사 */
  item: string
  dealer?: Dot | null
  at?: string | null
  ym?: string | null
  node?: Dot | null
  amount?: number | null
  /** 대사: 맞지 않은 항목(금액 · 계좌)과 맞춰 본 값(승인)·회신의 값 */
  value?: string | null
  want?: { amount: number; accounts: string[] } | null
  got?: { amount: number; account: string; owner?: string | null; owner_then?: string | null } | null
  /** 사건(변경): 인지일과 변경일과의 차이(일) */
  known?: string | null
  days?: number | null
  source: string
  file?: string | null
  row?: number | null
}
export type Signal = {
  signal: { id: string; kind: string; name: string; state: string; source: string; dealers: Dot[] }
  evidence: Evidence[]
  /** lines는 등록된 식별자 선, hints는 등록이 아닌 이어짐(회수가 들어간 계좌) */
  relation: { left: Dot[]; mid: Dot[]; right: Dot[]; lines: [string, string][]; hints: [string, string][] }
  /** 근접의 기준(가정): 금액의 범위 */
  near: [number, number]
  /** 마지막 결정 뒤에 붙은 근거(재접수의 새 줄)의 기록 id */
  fresh: string[]
  /** 지연의 기준(가정): 일수 */
  delay: number
  /** 정황을 담당하는 역할 */
  role: string
  /** 지금 역할이 할 수 있는 조치(요청 · 기각). reason은 사유가 필수인지 */
  actions: { kind: string; reason: boolean; classes: string[] }[]
  history: Decision[]
  /** 거부된 추인의 정황: 그 거부 */
  refused?: { role: string; at: string; reason: { class?: string; memo?: string } | null } | null
}

const signalAtom = atom(async (get) => {
  get(changedAtom)
  get(roleAtom)
  const t = get(targetAtom)
  return t?.kind === L.정황 ? api<Signal>(`/signals/${encodeURIComponent(t.id)}`).catch(() => null) : null
})
// 다시 읽는 동안에는 앞의 값을 그대로 둔다(조치 뒤에 화면이 비지 않게)
const latestAtom = unwrap(signalAtom, (prev) => prev ?? null)

export function useSignal() {
  const target = useAtomValue(targetAtom)
  const s = useAtomValue(latestAtom)
  return s && target?.kind === L.정황 && s.signal.id === target.id ? s : null
}

/** 근거 표에서 강조할 줄(그 기록의 id). 근거 연결(17 보고의 사실)이 정하고 1.2초 뒤 비운다 */
export const markAtom = atom<string | null>(null)
