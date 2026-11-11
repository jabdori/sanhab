// 열어 둔 심사. 심사 상세에 조각을 끼우는 티켓은 useReview()로 같은 값을 읽는다(조각마다 따로 부르지 않는다).
import { atom, useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { L } from '../../labels'
import { api, changedAtom, roleAtom, targetAtom } from '../../state'

type From = { source: string; file?: string | null; row?: number | null }
type Dot = { id: string; name: string }
/** at: 원본의 과거 결정에는 날짜가 없을 수 있다(미상) */
export type Decision = { kind: string; role: string; at: string | null; reason: { class?: string; memo?: string } | null; source: string }
export type Review = {
  review: { id: string; name: string; ym: string; status: string; marks: string[]; total: number; limit: number | null; approver: string; fixed: string | null } & From
  /** pays: 그 구성원의 이 귀속월 지급 전부(합산에 든 것). 없을 수 있다 */
  members: (Dot & { match: string[]; pays: ({ amount: number } & From)[] })[]
  relation: { left: Dot[]; mid: Dot[]; right: Dot[]; lines: [string, string][] }
  rules: ({ name: string; ver: number; value: number; clause: string; title: string; first: number; last: number; text: string } & From)[]
  /** 지금 역할이 할 수 있는 조치. reason은 사유(분류)가 필수인지 */
  actions: { kind: string; reason: boolean }[]
  history: Decision[]
}

const reviewAtom = atom(async (get) => {
  get(changedAtom)
  get(roleAtom)
  const t = get(targetAtom)
  return t?.kind === L.심사 ? api<Review>(`/reviews/${t.id}`).catch(() => null) : null
})
// 다시 읽는 동안에는 앞의 값을 그대로 둔다(조치 뒤에 화면이 비지 않게)
const latestAtom = unwrap(reviewAtom, (prev) => prev ?? null)

export function useReview() {
  const target = useAtomValue(targetAtom)
  const r = useAtomValue(latestAtom)
  return r && r.review.id === target?.id ? r : null
}

/** 결정에 붙일 사유. 사유 칸을 만드는 티켓이 채우고, 조치 버튼이 함께 보낸 뒤 비운다 */
export const reasonAtom = atom<{ class: string; memo?: string } | null>(null)
