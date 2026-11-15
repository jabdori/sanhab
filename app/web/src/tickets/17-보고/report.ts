// 열어 둔 정황의 보고(가장 새것). 보고를 다루는 티켓(18, 20 …)과 사유 칸(11)은 useReport()로 같은 값을 읽는다.
import { atom, useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { L } from '../../labels'
import { type ApiError, type Load, api, changedAtom, roleAtom, targetAtom } from '../../state'
import type { Decision } from '../04-심사/review'

export type Report = {
  /** 아직 보고가 없으면 null */
  report: {
    id: string
    state: string
    model: string
    /** AI가 DB를 읽은 횟수 */
    reads: number
    at: string
    /** 사실: 가리킨 기록(근거 표의 줄과 같은 id)과, 코드가 그 기록에서 값을 채운 글. 오류·대기이면 비어 있다 */
    facts: { ref: string; text: string; parts: [string, boolean][] }[]
    guess: string[]
    unknown: string[]
    /** 의견: 고른 조치와 글. 조치를 내린 뒤에야 열리는 정황에서 조치 전에는 null */
    opinion: { action: string; text: string } | null
    counter: string | null
    /** 그 뒤로 정황의 근거가 달라졌다 */
    stale: boolean
  } | null
  /** 남은 결정. opinion은 그 보고의 의견이 고른 조치, acted는 그때까지 내부 감시가 정황에 내린 조치 */
  decision: (Decision & { opinion: string | null; acted: string | null; same: boolean | null }) | null
  /** 지금 역할이 할 수 있는 조치(채택 · 불채택) */
  actions: { kind: string; reason: boolean; classes: string[] }[]
  /** 그 정황의 보고에 남은 채택 · 불채택 전부(이력에 함께 보인다). stamp는 순서를 가리는 값 */
  trail: (Decision & { stamp: string })[]
  /** 의견이 열려 있는가 */
  opened: boolean
  /** 지금 역할이 조사를 누를 수 있는가 */
  run: boolean
}

/** 대기인 보고를 다시 읽는 때를 알린다 */
export const tickAtom = atom(0)

const reportAtom = atom(async (get) => {
  get(changedAtom)
  get(roleAtom)
  get(tickAtom)
  const t = get(targetAtom)
  if (t?.kind !== L.정황) return null
  return api<Report>(`/signals/${encodeURIComponent(t.id)}/report`).then((d) => ({ of: t.id, d }), (error: ApiError) => ({ of: t.id, error }))
})
// 다시 읽는 동안에는 앞의 값을 그대로 둔다(조치 뒤에 화면이 비지 않게)
const latestAtom = unwrap(reportAtom, (prev) => prev ?? null)

/** 열어 둔 정황의 보고: 읽는 중 · 실패 · 값(ui/Pending이 읽는 꼴) */
export function useReportLoad(): Load<Report> {
  const target = useAtomValue(targetAtom)
  const r = useAtomValue(latestAtom)
  if (target?.kind !== L.정황) return { loading: false }
  if (!r || r.of !== target.id) return { loading: true }
  return 'error' in r ? { error: r.error, loading: false } : { data: r.d, loading: false }
}

export const useReport = () => useReportLoad().data ?? null
