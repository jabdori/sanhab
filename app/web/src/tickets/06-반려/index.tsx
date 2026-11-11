// 06 반려: 심사 상세의 오른쪽에 재상신(반려된 심사를 연 영업지원에게만. 04의 조치 줄에 보이는 반려 결정과 사유의 아래), 재상신의 사유(필수, D55), 이력(결정과 재상신을 일어난 순서대로).
// 반려 버튼과 사유의 분류는 04·05가 조치(act)에서 읽어 그대로 보인다.
import { atom, useAtom, useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { useEffect, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, roleAtom, store, targetAtom } from '../../state'
import { Empty } from '../../ui/Empty'
import { Pill } from '../../ui/Pill'
import { type Draft, Reason, blank, ready, sent as filled } from '../../ui/Reason'
import { button } from '../../ui/styles'
import { Line } from '../04-심사'
import { type Decision, useReview } from '../04-심사/review'

/** can: 지금 역할이 재상신할 수 있는지. classes: 재상신의 사유에 고를 수 있는 분류. lines: 결정과 재상신 */
type State = { id: string; can: boolean; classes: string[]; lines: Decision[] }

// 열어 둔 심사의 재상신. 두 조각이 같은 값을 읽고, 조치 뒤에 저절로 다시 읽힌다
const stateAtom = atom(async (get) => {
  get(changedAtom)
  get(roleAtom)
  const t = get(targetAtom)
  return t?.kind === L.심사 ? api<Omit<State, 'id'>>(`/reviews/${t.id}/resubmit`).then((s) => ({ ...s, id: t.id }), () => null) : null
})
const latestAtom = unwrap(stateAtom, (prev) => prev ?? null)

/** 쓰고 있는 재상신의 사유. 사유 칸이 채우고 재상신 버튼이 함께 보낸 뒤 비운다 */
const draftAtom = atom<Draft>(blank)

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
  const [draft, setDraft] = useAtom(draftAtom)
  const id = s?.id
  const role = useAtomValue(roleAtom)
  useEffect(() => {
    setBad(null)
    setDraft(blank)
  }, [id, role, setDraft])
  if (!s || (!s.can && !bad)) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {s.can && (
        <button className={button} disabled={sent === s || !ready(L.재상신, true, draft)}
          onClick={() => {
            setSent(s)
            setBad(null)
            api('/resubmit', { id: s.id, reason: filled(draft) }).then(
              () => setDraft(blank),
              (e: Error) => {
                setBad(e.message)
                store.set(changedAtom, (n) => n + 1)
              },
            )
          }}
        >
          {L.재상신}
        </button>
      )}
      {bad && <Pill tone="bad">{bad}</Pill>}
    </div>
  )
}

/** 반려된 심사의 사유 자리(05의 사유 칸이 비켜 준다): 재상신할 수 있으면 재상신의 사유, 아니면 없음 */
function Why() {
  const s = useResubmit()
  const r = useReview()
  const [draft, setDraft] = useAtom(draftAtom)
  if (!s || r?.review.status !== L.반려) return null
  return s.can ? <Reason groups={[{ of: L.재상신, classes: s.classes }]} value={draft} onChange={setDraft} /> : <Empty />
}

function History() {
  const s = useResubmit()
  if (!s) return null
  return s.lines.length ? s.lines.map((d, i) => <Line key={i} d={d} />) : <Empty />
}

export default [
  { slot: 'action', kind: L.심사, View: Action },
  { slot: 'reason', kind: L.심사, View: Why },
  { slot: 'history', kind: L.심사, View: History },
] satisfies Piece[]
