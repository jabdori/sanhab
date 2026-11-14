// 열어 둔 소명의 결과(인정·불인정·보완)를 정하는 값. 조각마다 따로 부르지 않고 useVerdict()로 같은 값을 읽는다(조치 뒤에 저절로 다시 읽힌다).
import { atom, useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { L } from '../../labels'
import { api, changedAtom, roleAtom, targetAtom } from '../../state'
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

const verdictAtom = atom(async (get) => {
  get(changedAtom)
  get(roleAtom)
  get(tickAtom) // 판독·정리를 기다리는 동안 19의 서류가 다시 읽을 때 같이 다시 읽는다(미확인이 채워진다)
  const t = get(targetAtom)
  if (t?.kind !== L.소명) return null
  const d = await api<Verdict>(`/clarifies/${encodeURIComponent(t.id)}/verdict`).catch(() => null)
  return d && { of: t.id, d }
})
// 다시 읽는 동안에는 앞의 값을 그대로 둔다(조치 뒤에 화면이 비지 않게)
const latestAtom = unwrap(verdictAtom, (prev) => prev ?? null)

export function useVerdict() {
  const target = useAtomValue(targetAtom)
  const v = useAtomValue(latestAtom)
  return v && target?.kind === L.소명 && v.of === target.id ? v.d : null
}

/** 쓰고 있는 사유 */
export const reasonAtom = atom<Draft>(blank)
