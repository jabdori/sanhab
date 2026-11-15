// 열어 둔 기록의 조회를 조각들이 함께 쓴다: 한 번만 부르고, 조치 · 역할 · 예시가 바뀌면 다시 읽는다(state.ts의 useLoad와 같은 Load를 돌려준다).
// 화면은 `if (!q.data) return <Pending of={q} />`(ui/Pending)로 읽는 중 · 실패를 그린다. 다시 읽는 동안에는 앞의 값이 남는다.
import { atom, type Atom, type Getter, useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { api, changedAtom, exampleAtom, roleAtom, type ApiError, type Load } from '../state'

/** pathOf: 열어 둔 대상으로 조회 경로를 정한다(그 종류가 아니면 null). also: 경로는 그대로인데 다시 읽을 때를 알리는 값(판독을 기다리는 tick) */
export function sharedLoad<T>(pathOf: (get: Getter) => string | null, also: Atom<unknown>[] = []) {
  const keyAtom = atom(pathOf)
  const base = atom(async (get): Promise<Load<T> & { key: string | null }> => {
    get(changedAtom)
    get(roleAtom)
    get(exampleAtom)
    also.forEach((a) => get(a))
    const key = get(keyAtom)
    if (!key) return { key, loading: false }
    return api<T>(key).then(
      (data) => ({ key, data, loading: false }),
      (error: ApiError) => ({ key, error, loading: false }),
    )
  })
  const latest = unwrap(base, (prev) => prev)
  return function useShared(): Load<T> {
    const key = useAtomValue(keyAtom)
    const l = useAtomValue(latest)
    // 다른 대상의 값이 남아 있으면 읽는 중으로(다른 기록이 비쳐 보이지 않게)
    return l && l.key === key ? l : { loading: !!key }
  }
}
