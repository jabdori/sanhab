// 열어 둔 지급. 지급 상세에 조각을 끼우는 티켓은 usePay()로 같은 값을 읽는다(조각마다 따로 부르지 않고, 조치 뒤에 저절로 다시 읽힌다).
import { atom, useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { L } from '../../labels'
import { api, changedAtom, roleAtom, targetAtom } from '../../state'

type From = { source: string; file?: string; row?: number }
export type Pay = {
  /** state는 지급의 상태(대기·재심사·완료). 원본의 값(승인·미지급·반려)이 아니다 */
  pay: { id: string; name: string; dealer: string; ym: string; amount: number; state: string; review: { id: string; name: string } } & From
  /** 대리점에 지금 등록된 계좌 */
  accounts: ({ value: string } & From)[]
  /** 지금 역할이 지급으로 표시할 수 있는지 */
  can: boolean
  history: { role: string; at: string; source: string }[]
}

const payAtom = atom(async (get) => {
  get(changedAtom)
  get(roleAtom)
  const t = get(targetAtom)
  return t?.kind === L.지급 ? api<Pay>(`/pays/${t.id}`).catch(() => null) : null
})
// 다시 읽는 동안에는 앞의 값을 그대로 둔다(조치 뒤에 화면이 비지 않게)
const latestAtom = unwrap(payAtom, (prev) => prev ?? null)

export function usePay() {
  const target = useAtomValue(targetAtom)
  const p = useAtomValue(latestAtom)
  return p && target?.kind === L.지급 && p.pay.id === target.id ? p : null
}
