// 열어 둔 소명. 소명을 다루는 티켓(19 서류 접수, 20 결정 …)은 useClarify()로 같은 값을 읽는다(조각마다 따로 부르지 않고, 조치 뒤에 저절로 다시 읽힌다).
import { atom } from 'jotai'
import { L } from '../../labels'
import { targetAtom } from '../../state'
import { sharedLoad } from '../load'
import type { Decision } from '../04-심사/review'

export type Clarify = {
  clarify: { id: string; name: string; state: string; source: string; dealer: { id: string; name: string }; signal: { id: string; kind: string; name: string; state: string } | null }
  /** 일치 종류와 서류 목록 `[종류, 서류]`(가정). 발송했으면 그때 남긴 목록 */
  kinds: string[]
  docs: [string, string][]
  /** 발송한 요청서의 글. 글 없이 목록만 보냈으면 null */
  body: string | null
  sent: string | null
  due: string | null
  /** AI가 쓴 초안(값 자리는 코드가 채웠다). AI가 아직 쓰지 못했으면 null. 발송한 뒤에는 null */
  draft: { text: string; model: string; source: string } | null
  /** 소명을 담당하는 역할과, 지금 역할이 발송할 수 있는지 */
  role: string
  can: boolean
  history: (Decision & { stamp: string })[]
}

/** AI가 초안을 쓰는 동안 다시 읽는 때를 알린다 */
export const tickAtom = atom(0)

export const useClarify = sharedLoad<Clarify>((get) => {
  const t = get(targetAtom)
  return t?.kind === L.소명 ? `/clarifies/${encodeURIComponent(t.id)}` : null
}, [tickAtom])
