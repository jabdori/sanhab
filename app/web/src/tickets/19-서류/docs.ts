// 열어 둔 소명의 서류(원본, 판독 낱말, 정리, 값 표). 조각마다 따로 부르지 않고 useDocs()로 같은 값을 읽는다
import { atom, useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { L } from '../../labels'
import { api, changedAtom, roleAtom, rolesAtom, store, targetAtom } from '../../state'

/** 판독 낱말: 글자와 위치(쪽의 폭·높이에 대한 0~1, [x0, y0, x1, y1]) */
export type Word = { text: string; box: [number, number, number, number] }
/** 등록 값과 그 출처(원본이면 파일과 행) */
export type Reg = { value: string; source: string; file?: string; row?: number }
/** 값 표의 줄: 항목, 판독(가리킨 낱말 그대로), 가리킨 낱말의 번호, 등록, 비교(일치·불일치·누락, 등록이 없으면 null) */
export type Row = { item: string; read: string | null; words: number[]; reg: Reg | null; result: string | null }
export type Doc = {
  id: string
  name: string
  mime: string
  size: number
  role: string
  at: string
  source: string
  /** 판독이 아직 없으면 null */
  words: Word[] | null
  read_model: string | null
  /** AI의 정리(찾지 못한 항목은 value가 없다). 아직 없으면 null */
  tidy: { item: string; value?: string; words: number[] }[] | null
  tidy_model: string | null
  rows: Row[]
  /** 누락·불일치의 수(낱말이 열쇠) */
  counts: Record<string, number>
}
export type Docs = { can: boolean; kinds: string[]; max: number; docs: Doc[] }

/** 판독·정리를 기다리는 동안 다시 읽는 때를 알린다 */
export const tickAtom = atom(0)
/** 고른 서류(번호). null이면 가장 나중 것 */
export const seeAtom = atom<number | null>(null)
/** 강조하는 항목(값의 줄 ↔ 원본의 위치). 1.2초 뒤 사라진다 */
export const pickAtom = atom<string | null>(null)
export function pick(item: string) {
  store.set(pickAtom, item)
  setTimeout(() => store.get(pickAtom) === item && store.set(pickAtom, null), 1200)
}

const docsAtom = atom(async (get) => {
  get(changedAtom)
  get(roleAtom)
  get(tickAtom)
  const t = get(targetAtom)
  if (t?.kind !== L.소명) return null
  const d = await api<Docs>(`/clarifies/${encodeURIComponent(t.id)}/docs`).catch(() => null)
  return d && { of: t.id, d }
})
const latestAtom = unwrap(docsAtom, (prev) => prev ?? null)

export function useDocs() {
  const target = useAtomValue(targetAtom)
  const c = useAtomValue(latestAtom)
  return c && target?.kind === L.소명 && c.of === target.id ? c.d : null
}
/** 지금 보는 서류 */
export function useDoc() {
  const d = useDocs()
  const see = useAtomValue(seeAtom)
  return d?.docs[see ?? d.docs.length - 1] ?? d?.docs.at(-1) ?? null
}

/** JSON이 아닌 것을 주고받는다(원본 파일, 서류 접수). 지금 역할의 토큰으로 부른다. 실패하면 서버의 낱말을 가진 Error */
export async function bin(path: string, body?: Blob, query = '') {
  const role = store.get(roleAtom)
  const token = store.get(rolesAtom).find((r) => r.role === role)?.token
  const res = await fetch(`/api${path}${query}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(token && { authorization: `Bearer ${token}` }), ...(body && { 'content-type': body.type }) },
    body,
  })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? String(res.status))
  if (body) store.set(changedAtom, (n) => n + 1)
  return res
}
