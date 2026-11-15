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
/** 목록 사이드바: 기록을 열면 접힌 채 시작하고 기록 머리의 `목록` 단추로 편다 */
export const paneAtom = atom(false)
/** 보조 칸: 기록 화면 오른쪽(속성 · AI 보고 · 대화). 열린 채 시작한다 */
export const sideAtom = atom(true)
/** 조치(POST)가 끝날 때마다 오른다. useData가 이것을 보고 다시 읽는다 */
export const changedAtom = atom(0)

export const store = getDefaultStore()

/**
 * 안내(온보딩)의 예시: 켜져 있으면 화면이 서버 대신 이 응답(경로 → 값)을 받는다. 실제 서버 · DB는 건드리지 않는다.
 * 값이 null이면 `없음`(404)처럼, 목록에 없는 경로는 PASS만 서버에서 읽고 나머지는 `없음`. 조치(POST)는 실행하지 않는다
 */
export const exampleAtom = atom<Record<string, unknown> | null>(null)
const PASS = ['/state', '/chat/sessions?n=', '/change', '/mock', '/rules', '/samples']
const none = () => Object.assign(new Error(L.없음), { status: 404, data: null })
function example<T>(ex: Record<string, unknown>, raw: string): T {
  // 예시의 경로는 풀어 쓴 꼴(`/signals/계좌-X-A`)이다 — 화면은 id를 인코딩해 부른다
  const path = decodeURIComponent(raw)
  if (path in ex) {
    if (ex[path] == null) throw none()
    return structuredClone(ex[path]) as T
  }
  // 대화 칸의 문맥 이름: 예시 작업의 이름으로
  if (path.startsWith('/chat/names?items=')) {
    const items = JSON.parse(path.slice('/chat/names?items='.length)) as Target[]
    const rows = (ex['/tasks'] as { mine: { target: string; name: string; ym?: string }[]; going: { target: string; name: string; ym?: string }[] }) ?? { mine: [], going: [] }
    const all = [...rows.mine, ...rows.going]
    return { names: items.map((i) => { const t = all.find((r) => r.target === i.id); return t ? [t.name, t.ym].filter(Boolean).join(' · ') : i.id }) } as T
  }
  throw none()
}

/** GET(body 없음) 또는 POST(`method`로 PUT 등). 지금 역할의 토큰으로 부른다. 실패하면 { status, data }를 가진 Error */
export async function api<T = unknown>(path: string, body?: unknown, method?: string): Promise<T> {
  const ex = store.get(exampleAtom)
  if (ex && body !== undefined) return {} as T // 예시에서는 조치가 실행되지 않는다
  if (ex && !PASS.some((p) => path.startsWith(p))) return example<T>(ex, path)
  const role = store.get(roleAtom)
  const token = store.get(rolesAtom).find((r) => r.role === role)?.token
  const res = await fetch(`/api${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
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

/** 서버가 거절한 응답: status(404 …)와 data를 가진 Error */
export type ApiError = Error & { status?: number; data?: unknown }
/** 조회의 상태: 받은 값(data), 실패(error), 읽는 중(loading). 다시 읽는 동안에는 앞의 data가 남는다 */
export type Load<T> = { data?: T; error?: ApiError; loading: boolean }

/** 조회(상태까지). 역할이 바뀌거나 조치가 끝나면 다시 읽는다. 화면은 ui/Pending으로 읽는 중 · 실패를 그린다 */
export function useLoad<T>(path: string | null): Load<T> {
  const role = useAtomValue(roleAtom)
  const changed = useAtomValue(changedAtom)
  const ex = useAtomValue(exampleAtom)
  const [load, setLoad] = useState<Load<T>>({ loading: !!path })
  useEffect(() => {
    if (!path) return
    let live = true
    setLoad((l) => (l.loading && !l.error ? l : { data: l.data, loading: true }))
    api<T>(path).then(
      (data) => live && setLoad({ data, loading: false }),
      // 예시가 켜지거나 꺼지면 앞의 값을 지운다(예시와 실제가 섞여 보이지 않게)
      (error: ApiError) => live && setLoad((l) => ({ data: ex ? undefined : l.data, error, loading: false })),
    )
    return () => {
      live = false
    }
  }, [path, role, changed, ex])
  return load
}

/** 조회(값만). 읽기 전이나 실패하면 undefined — 읽는 중 · 실패를 그려야 하면 useLoad */
export const useData = <T>(path: string | null): T | undefined => useLoad<T>(path).data
