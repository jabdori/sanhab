// 화면의 상태(jotai)와 서버를 부르는 길. 서버와는 /api 아래 JSON만 주고받는다.
import { atom, getDefaultStore, useAtomValue } from 'jotai'
import { atomWithStorage, createJSONStorage } from 'jotai/utils'
import { useEffect, useState } from 'react'
import { L } from './labels'

export const MENUS = [L.작업, L.대리점, L.규정] as const
export type Menu = (typeof MENUS)[number]
/** 열어 둔 대상. kind는 작업의 종류나 메뉴의 낱말(L.심사, L.대리점 …), id는 서버의 기록 id */
export type Target = { kind: string; id: string }

const session = <T>() => createJSONStorage<T>(() => sessionStorage)
/** 접속하면 받는 네 역할의 토큰. 비면 접속 화면 */
export const rolesAtom = atomWithStorage<{ role: string; token: string }[]>('roles', [], session(), { getOnInit: true })
export const roleAtom = atomWithStorage<string | null>('role', null, session(), { getOnInit: true })
export const menuAtom = atom<Menu>(MENUS[0])
export const targetAtom = atom<Target | null>(null)
/** 작업 목록에서 기록을 열 때의 목록 순서. 기록 화면의 `n/전체 · 앞 / 뒤`가 이것을 따른다 */
export const navAtom = atom<Target[]>([])
/** 조치(POST)가 끝날 때마다 오른다. useData가 이것을 보고 다시 읽는다 */
export const changedAtom = atom(0)

export const store = getDefaultStore()

/** GET(body 없음) 또는 POST. 지금 역할의 토큰으로 부른다. 실패하면 { status, data }를 가진 Error */
export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const role = store.get(roleAtom)
  const token = store.get(rolesAtom).find((r) => r.role === role)?.token
  const res = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token && { authorization: `Bearer ${token}` }), ...(body !== undefined && { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (res.status === 401 && path !== '/enter') {
    store.set(rolesAtom, [])
    store.set(roleAtom, null)
  }
  if (!res.ok) throw Object.assign(new Error(data?.error ?? String(res.status)), { status: res.status, data })
  // 접속과 초기화의 응답은 네 역할의 새 토큰을 담는다
  if (Array.isArray(data?.roles)) store.set(rolesAtom, data.roles)
  if (body !== undefined) store.set(changedAtom, (n) => n + 1)
  return data
}

/** 조회. 역할이 바뀌거나 조치가 끝나면 다시 읽는다. 읽기 전에는 undefined */
export function useData<T>(path: string | null): T | undefined {
  const role = useAtomValue(roleAtom)
  const changed = useAtomValue(changedAtom)
  const [data, setData] = useState<T>()
  useEffect(() => {
    if (!path) return
    let live = true
    api<T>(path).then((d) => live && setData(d), () => {})
    return () => {
      live = false
    }
  }, [path, role, changed])
  return data
}
