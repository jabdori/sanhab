// 열어 둔 지급. 지급 상세에 조각을 끼우는 티켓은 usePay()로 같은 값을 읽는다(조각마다 따로 부르지 않고, 조치 뒤에 저절로 다시 읽힌다).
import { L } from '../../labels'
import { targetAtom } from '../../state'
import { sharedLoad } from '../load'

type From = { source: string; file?: string; row?: number }
export type Pay = {
  /** state는 지급의 상태(대기·재심사·완료). 원본의 값(승인·미지급·반려)이 아니다 */
  pay: { id: string; name: string; dealer: string; ym: string; amount: number; state: string; review: { id: string; name: string } } & From
  /** 대리점에 지금 등록된 계좌 */
  accounts: ({ value: string } & From)[]
  /** 지급을 담당하는 역할 */
  role: string
  /** 지금 역할이 지급으로 표시할 수 있는지 */
  can: boolean
  history: { role: string; at: string; source: string }[]
}

export const usePay = sharedLoad<Pay>((get) => {
  const t = get(targetAtom)
  return t?.kind === L.지급 ? `/pays/${t.id}` : null
})
