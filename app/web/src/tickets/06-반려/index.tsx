// 06 반려: 심사 상세의 오른쪽에 재상신(반려된 심사를 연 영업지원에게만. 04의 조치 줄에 보이는 반려 결정과 사유의 아래)과 이력(결정과 재상신을 일어난 순서대로).
// 반려 버튼과 사유의 분류는 04·05가 조치(act)에서 읽어 그대로 보인다.
import { atom, useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { useEffect, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, roleAtom, store, targetAtom } from '../../state'
import { Empty } from '../../ui/Empty'
import { Pill } from '../../ui/Pill'
import { button } from '../../ui/styles'
import { Line } from '../04-심사'
import type { Decision } from '../04-심사/review'

/** can: 지금 역할이 재상신할 수 있는지. lines: 결정과 재상신 */
type State = { id: string; can: boolean; lines: Decision[] }

// 열어 둔 심사의 재상신. 두 조각이 같은 값을 읽고, 조치 뒤에 저절로 다시 읽힌다
const stateAtom = atom(async (get) => {
  get(changedAtom)
  get(roleAtom)
  const t = get(targetAtom)
  return t?.kind === L.심사 ? api<Omit<State, 'id'>>(`/reviews/${t.id}/resubmit`).then((s) => ({ ...s, id: t.id }), () => null) : null
})
const latestAtom = unwrap(stateAtom, (prev) => prev ?? null)

function useResubmit() {
  const target = useAtomValue(targetAtom)
  const s = useAtomValue(latestAtom)
  return s && target?.kind === L.심사 && s.id === target.id ? s : null
}

function Action() {
  const s = useResubmit()
  // 재상신을 보낸 때의 값. 새 값을 받을 때까지는 다시 누를 수 없다
  const [sent, setSent] = useState<unknown>(null)
  // 서버가 거절한 까닭의 낱말. 다른 대상을 열면 사라진다
  const [bad, setBad] = useState<string | null>(null)
  const id = s?.id
  useEffect(() => setBad(null), [id])
  if (!s || (!s.can && !bad)) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {s.can && (
        <button className={button} disabled={sent === s}
          onClick={() => {
            setSent(s)
            setBad(null)
            api('/resubmit', { id: s.id }).catch((e: Error) => {
              setBad(e.message)
              store.set(changedAtom, (n) => n + 1)
            })
          }}
        >
          {L.재상신}
        </button>
      )}
      {bad && <Pill tone="bad">{bad}</Pill>}
    </div>
  )
}

function History() {
  const s = useResubmit()
  if (!s) return null
  return s.lines.length ? s.lines.map((d, i) => <Line key={i} d={d} />) : <Empty />
}

export default [
  { slot: 'action', kind: L.심사, View: Action },
  { slot: 'history', kind: L.심사, View: History },
] satisfies Piece[]
