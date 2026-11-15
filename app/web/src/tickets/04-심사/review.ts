// 열어 둔 심사. 심사 상세에 조각을 끼우는 티켓은 useReview()로 같은 값을 읽는다(조각마다 따로 부르지 않는다).
import { atom, useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { L } from '../../labels'
import { type ApiError, type Load, api, changedAtom, roleAtom, targetAtom } from '../../state'
import { type Draft, blank } from '../../ui/Reason'

type From = { source: string; file?: string | null; row?: number | null }
type Dot = { id: string; name: string }
/** at: 원본의 과거 결정에는 날짜가 없을 수 있다(미상) */
export type Decision = { kind: string; role: string; at: string | null; reason: { class?: string; memo?: string } | null; source: string }
export type Review = {
  review: { id: string; name: string; ym: string; status: string; marks: string[]; total: number; limit: number | null; approver: string; holder: string; fixed: string | null } & From
  /** pays: 그 구성원의 이 귀속월 지급 전부(합산에 든 것). 없을 수 있다 */
  members: (Dot & { match: string[]; pays: ({ amount: number } & From)[] })[]
  relation: { left: Dot[]; mid: Dot[]; right: Dot[]; lines: [string, string][] }
  rules: ({ name: string; ver: number; value: number; clause: string; title: string; first: number; last: number; text: string } & From)[]
  /** 지금 역할이 할 수 있는 조치. reason은 이 심사에서 사유(분류)가 필수인지, classes는 고를 수 있는 분류(05) */
  actions: { kind: string; reason: boolean; classes: string[] }[]
  history: Decision[]
  /** 일치 · 관계를 계산한 기간과 그 안에서 바뀐 식별자(D47: 그 귀속월에 하루라도 유효했던 식별자를 모두 본다) */
  basis?: { from: string; to: string; changes: { dealer: string; item: string; since: string }[] }
}

const reviewAtom = atom(async (get) => {
  get(changedAtom)
  get(roleAtom)
  const t = get(targetAtom)
  return t?.kind === L.심사 ? api<Review>(`/reviews/${t.id}`).then((data) => ({ of: t.id, data }), (error: ApiError) => ({ of: t.id, error })) : null
})
// 다시 읽는 동안에는 앞의 값을 그대로 둔다(조치 뒤에 화면이 비지 않게)
const latestAtom = unwrap(reviewAtom, (prev) => prev ?? null)

/** 열어 둔 심사의 읽는 중 · 실패 · 값(ui/Pending이 읽는 꼴) */
export function useReviewLoad(): Load<Review> {
  const target = useAtomValue(targetAtom)
  const r = useAtomValue(latestAtom)
  if (target?.kind !== L.심사) return { loading: false }
  if (!r || r.of !== target.id) return { loading: true }
  return 'error' in r ? { error: r.error, loading: false } : { data: r.data, loading: false }
}

export const useReview = () => useReviewLoad().data ?? null

/** 결정에 붙일 사유(쓰고 있는 것). 사유 칸(05)이 채우고, 조치 버튼이 `ready`로 눌릴 수 있는지를 보고 `sent`의 모양으로 보낸 뒤 비운다 */
export const reasonAtom = atom<Draft>(blank)

/** 한 건이 아니라 그룹 × 귀속월 묶음에 내리는 조치(D50). 한 건 화면에는 버튼을 두지 않는다 */
export const bundled: string[] = [L.추인, L.거부, L.종결, L.이견]
