// 06 반려: 반려된 심사의 재상신(조치는 pages/Review의 페이지 조치, 사유는 그 확인 창)과 이력(결정과 재상신을 일어난 순서대로).
import { atom, useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, roleAtom, targetAtom } from '../../state'
import { Avatar } from '@astryxdesign/core/Avatar'
import { List, ListItem } from '@astryxdesign/core/List'
import { Text } from '@astryxdesign/core/Text'
import { Timestamp } from '@astryxdesign/core/Timestamp'
import { Empty } from '../../ui/Empty'
import type { Decision } from '../04-심사/review'

/** can: 지금 역할이 재상신할 수 있는지. classes: 재상신의 사유에 고를 수 있는 분류. lines: 결정과 재상신 */
type State = { id: string; can: boolean; classes: string[]; lines: (Decision & { was?: string | null })[] }

// 열어 둔 심사의 재상신. 기록 화면의 조치와 이력이 같은 값을 읽고, 조치 뒤에 저절로 다시 읽힌다
const stateAtom = atom(async (get) => {
  get(changedAtom)
  get(roleAtom)
  const t = get(targetAtom)
  return t?.kind === L.심사 ? api<Omit<State, 'id'>>(`/reviews/${t.id}/resubmit`).then((s) => ({ ...s, id: t.id }), () => null) : null
})
const latestAtom = unwrap(stateAtom, (prev) => prev ?? null)

export function useResubmit() {
  const target = useAtomValue(targetAtom)
  const s = useAtomValue(latestAtom)
  return s && target?.kind === L.심사 && s.id === target.id ? s : null
}

/** 이력: incident-console의 Timeline 꼴 — 역할의 Avatar · 결정(굵게) / 사유의 분류 · 메모 / 날짜(Timestamp, 원본의 과거 결정은 미상) */
export function History() {
  const s = useResubmit()
  if (!s) return null
  if (!s.lines.length) return <Empty />
  return (
    <List density="spacious">
      {s.lines.map((d, i) => (
        <ListItem
          key={i}
          align="start"
          startContent={<Avatar name={d.role} size="sm" />}
          // 그룹이 바뀌어 옮겨 온 옛 심사의 줄(13, D56)은 그 심사의 이름을 앞에 단다
          label={[d.was, d.kind, d.role].filter(Boolean).join(' · ')}
          description={[d.reason?.class ?? `${L.사유} ${L.없음}`, d.reason?.memo, d.source === L.원본 ? L.원본 : null].filter(Boolean).join(' · ')}
          endContent={d.at ? <Timestamp value={d.at} format="date" /> : <Text type="supporting" color="secondary">{L.미상}</Text>}
        />
      ))}
    </List>
  )
}

export default [] satisfies Piece[]
