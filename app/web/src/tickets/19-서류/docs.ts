// 열어 둔 소명의 서류(원본, 판독 낱말, 정리, 값 표). 조각마다 따로 부르지 않고 useDocs()로 같은 값을 읽는다
import { atom, useAtomValue } from 'jotai'
import { L } from '../../labels'
import { changedAtom, roleAtom, rolesAtom, store, targetAtom } from '../../state'
import { sharedLoad } from '../load'

/** 판독 낱말: 글자와 위치(쪽의 폭·높이에 대한 0~1, [x0, y0, x1, y1]) */
export type Word = { text: string; box: [number, number, number, number] }
/** 등록 값과 그 출처(원본이면 파일과 행) */
export type Reg = { value: string; source: string; file?: string; row?: number }
/** 값 표의 줄: 항목, 판독(가리킨 낱말 그대로), 가리킨 낱말의 번호, 등록, 비교(일치·불일치·누락, 등록이 없으면 null) */
export type Row = { item: string; read: string | null; words: number[]; reg: Reg | null; result: string | null }
export type Doc = {
  id: string
  name: string
  /** 시연용으로 만든 서류와 내용이 같은가(합성 표지) */
  sample?: boolean
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
/** 강조하는 항목(값의 줄 ↔ 원본의 위치). 2.4초 뒤 사라진다(화면이 그리로 가는 동안에도 보이게) */
export const pickAtom = atom<string | null>(null)
export function pick(item: string) {
  store.set(pickAtom, item)
  setTimeout(() => store.get(pickAtom) === item && store.set(pickAtom, null), 2400)
}

export const useDocs = sharedLoad<Docs>((get) => {
  const t = get(targetAtom)
  return t?.kind === L.소명 ? `/clarifies/${encodeURIComponent(t.id)}/docs` : null
}, [tickAtom])
/** 지금 보는 서류(서류를 읽는 동안 · 없으면 null) */
export function useDoc() {
  const d = useDocs().data
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

/** 날짜가 든 값은 `YYYY-MM-DD ~ YYYY-MM-DD` 하나로 보인다(판독의 `2026.02.01 ~ 2028.01.31`, 정리의 `2026-02-01~2028-01-31`) */
export const range = (v: string) =>
  v.replace(/(\d{4})[./](\d{1,2})[./](\d{1,2})/g, (_, y, m, d) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`).replace(/(\d{4}-\d{2}-\d{2})\s*~\s*(?=\d)/g, '$1 ~ ')
