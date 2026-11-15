// 열어 둔 소명의 결과(인정·불인정·보완)를 정하는 값. 조각마다 따로 부르지 않고 useVerdict()로 같은 값을 읽는다(조치 뒤에 저절로 다시 읽힌다).
import { atom } from 'jotai'
import { L } from '../../labels'
import { targetAtom } from '../../state'
import { sharedLoad } from '../load'
import { type Draft, blank } from '../../ui/Reason'
import { tickAtom } from '../19-서류/docs'

export type Verdict = {
  id: string
  /** 지금 역할이 정할 수 있는지, 그 조치와 사유의 분류 */
  can: boolean
  role: string
  actions: { kind: string; classes: string[] }[]
  /** 인정하면 효력이 미치는 기간(서류가 입증하는 기간). 서류에 없으면 null(제한 없음) */
  span: [string, string] | null
  /** 인정하면 제외될 선 */
  lines: { item: string; value: string }[]
  /** 이 소명이 이미 제외한 선과 그 기간 */
  excluded: { item: string; value: string; since: string | null; until: string | null }[]
  /** 가장 나중 서류에서 서류만으로 가를 수 없는 항목 `[항목, 누락 | 추가 확인]` */
  unknown: [string, string][]
  /** 요청한 서류 가운데 받은 서류에 없는 것(서류 종류로 가른다). 요청한 종류가 모두 빠졌으면 인정이 없다 */
  lacking?: string[]
}

// 판독·정리를 기다리는 동안 19의 서류가 다시 읽을 때 같이 다시 읽는다(미확인이 채워진다)
export const useVerdict = sharedLoad<Verdict>((get) => {
  const t = get(targetAtom)
  return t?.kind === L.소명 ? `/clarifies/${encodeURIComponent(t.id)}/verdict` : null
}, [tickAtom])

/** 쓰고 있는 사유 */
export const reasonAtom = atom<Draft>(blank)
