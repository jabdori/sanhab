// astryx template: detail-page — 이력은 TimelineSection 꼴(16-경위의 Step)
// 06 반려: 반려된 심사의 재상신(조치는 pages/Review의 페이지 조치, 사유는 그 확인 창)과 이력(결정과 재상신을 일어난 순서대로).
import { atom, useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { L } from '../../labels'
import { type ApiError, type Load, api, changedAtom, roleAtom, targetAtom } from '../../state'
import { Pending } from '../../ui/Pending'
import { Steps, why } from '../16-경위'
import type { Decision } from '../04-심사/review'

/** can: 지금 역할이 재상신할 수 있는지. classes: 재상신의 사유에 고를 수 있는 분류. lines: 결정과 재상신 */
export type Resubmit = State
type State = { id: string; can: boolean; classes: string[]; lines: (Decision & { was?: string | null })[] }

// 열어 둔 심사의 재상신. 기록 화면의 조치와 이력이 같은 값을 읽고, 조치 뒤에 저절로 다시 읽힌다
const stateAtom = atom(async (get) => {
  get(changedAtom)
  get(roleAtom)
  const t = get(targetAtom)
  return t?.kind === L.심사 ? api<Omit<State, 'id'>>(`/reviews/${t.id}/resubmit`).then((s) => ({ ...s, id: t.id }), (error: ApiError) => ({ id: t.id, error })) : null
})
const latestAtom = unwrap(stateAtom, (prev) => prev ?? null)

/** 열어 둔 심사의 재상신: 읽는 중 · 실패 · 값(ui/Pending이 읽는 꼴) */
export function useResubmitLoad(): Load<State> {
  const target = useAtomValue(targetAtom)
  const s = useAtomValue(latestAtom)
  if (target?.kind !== L.심사) return { loading: false }
  if (!s || s.id !== target.id) return { loading: true }
  return 'error' in s ? { error: s.error, loading: false } : { data: s, loading: false }
}

export const useResubmit = () => useResubmitLoad().data ?? null

/** 이력: detail-page의 TimelineSection 꼴(16-경위의 Step) — 역할 아이콘 · 결정(굵게) / 사유의 분류 · 메모 / 날짜(원본의 과거 결정은 미상) */
export function History() {
  const q = useResubmitLoad()
  if (!q.data) return <Pending of={q} />
  return (
    <Steps
      list={q.data.lines.map((d) => ({
        // 그룹이 바뀌어 옮겨 온 옛 심사의 줄(13, D56)은 그 심사의 이름을 앞에 단다
        title: [d.was, d.kind, d.role].filter(Boolean).join(' · '),
        text: why(d),
        at: d.at,
      }))}
    />
  )
}
