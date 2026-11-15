// 22 규정: 규정 화면(pages/Rules · pages/Rule)의 본문 영역 — 조항 원문, 규칙 버전, 가정, AI — 과 데이터. 대상은 { kind: L.규정, id: 조항의 id }.
// 목록과 머리·조치(모의는 23)는 pages가 그린다.
import { Badge } from '@astryxdesign/core/Badge'
import { HStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Markdown } from '@astryxdesign/core/Markdown'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { useAtomValue, useSetAtom } from 'jotai'
import { DOCS, L } from '../../labels'
import { fileLine } from '../../ui/Source'
import { menuAtom, targetAtom, useLoad, type Load } from '../../state'
import { Pending } from '../../ui/Pending'
import { Region } from '../../ui/Region'
import { Source } from '../../ui/Source'
import { num } from '../../ui/status'

export type Clause = { id: string; title: string; file: string; sha: string; first: number; last: number; text: string; source: string }
type Rule = { id: string; name: string; ver: number; value: number; clause: string; since: string | null; until: string | null; prev: { name: string; ver: number } | null; source: string } & Record<string, unknown>
/** used: 쓰인 곳. id가 있으면 그 기록(kind)으로 갈 수 있고, 없으면 글자뿐이다 */
type Assume = { id: string; title: string; text: string; file: string; row: number; used: { view: string; kind: string | null; id: string | null }[]; source: string } & Record<string, unknown>
export type Data = { clauses: Clause[]; rules: Rule[]; assumes: Assume[] }

const none = <Text color="secondary">{L.없음}</Text>
export const where = (c: Clause) => fileLine(c.file, c.first, c.last)
/** 화면에 보이는 위치: 문서 이름 · 행(파일 경로는 출처 설명 칸의 where에만) */
export const place = (c: Clause) => `${DOCS[c.file] ?? L.원본} · ${c.first}–${c.last}${L.행}`

/** 규정 전체의 읽기 */
export const useRules = () => useLoad<Data>('/rules')

/** 열어 둔 조항과 그 규칙(읽는 중 · 실패 · 없는 조항은 Load의 상태로) */
export function useClause(): Load<{ d: Data; clause: Clause; rules: Rule[] }> {
  const q = useRules()
  const target = useAtomValue(targetAtom)
  const d = q.data
  // 조항이 하나뿐이면 목록 없이 그 조항이 열린 것으로 본다(메뉴 규정 → 바로 그 조항)
  const clause = d?.clauses.find((x) => x.id === target?.id) ?? (!target && d?.clauses.length === 1 ? d.clauses[0] : undefined)
  if (d && clause) return { ...q, data: { d, clause, rules: d.rules.filter((r) => r.clause === clause.id) } }
  // 읽었는데 그 조항이 없으면 없는 기록(404)
  return { ...q, data: undefined, error: q.error ?? (d ? Object.assign(new Error(L.없음), { status: 404 }) : undefined) }
}

/** 조항: 원문. 첫 줄(`## 제목`)은 화면 제목이 이미 보인다 */
export function Original() {
  const q = useClause()
  const c = q.data
  if (!c) return <Pending of={q} />
  return (
    <Region title={L.조항} aside={<Source kind={c.clause.source} tip={where(c.clause)} place={`${c.clause.first}–${c.clause.last}${L.행}`} rows={[[L.위치, where(c.clause)], [L.해시, c.clause.sha]]} />}>
      <Markdown density="default">{c.clause.text.replace(/^#+ .*\n/, '')}</Markdown>
    </Region>
  )
}

/** 규칙: 버전마다 값 · 시행 · 이전 · 출처 */
export function Versions() {
  const q = useClause()
  const c = q.data
  if (!c) return <Pending of={q} />
  const { clause, rules } = c
  return (
    <Region title={L.규칙} aside={<Badge variant="neutral" label={String(rules.length)} />}>
      <Table<Rule>
        data={rules}
        idKey="id"
        density="balanced"
        columns={[
          { key: 'name', header: L.규칙, width: proportional(2, { minWidth: 96 }), renderCell: (r) => <Text weight="semibold">{r.name}</Text> },
          { key: 'ver', header: L.버전, align: 'end', width: pixel(64), renderCell: (r) => <Text hasTabularNumbers>{r.ver}</Text> },
          { key: 'value', header: L.값, align: 'end', width: pixel(104), renderCell: (r) => <Text hasTabularNumbers maxLines={1}>{r.name === L.합산 ? `${L.일치} ${r.value}` : num(r.value)}</Text> },
          // 값이 하나도 없는 칸은 두지 않는다(시행 · 이전은 규칙이 바뀐 적이 있을 때만)
          ...(rules.some((r) => r.since || r.until) ? [{ key: 'since', header: L.시행, width: proportional(1, { minWidth: 80 }), renderCell: (r: Rule) => (r.since || r.until ? <Text hasTabularNumbers>{`${r.since ?? ''} ~ ${r.until ?? ''}`.trim()}</Text> : none) }] : []),
          ...(rules.some((r) => r.prev) ? [{ key: 'prev', header: L.이전, width: proportional(1, { minWidth: 96 }), renderCell: (r: Rule) => (r.prev ? <Text>{`${r.prev.name} ${L.버전} ${r.prev.ver}`}</Text> : none) }] : []),
          {
            key: 'source',
            header: L.출처,
            align: 'end',
            width: pixel(88),
            renderCell: (r) => (
              <Source kind={r.source} tip={clause.title} place={`${clause.first}–${clause.last}${L.행}`} rows={[[L.위치, where(clause)]]}>
                {clause.text}
              </Source>
            ),
          },
        ]}
      />
    </Region>
  )
}

/** 가정: 표 전체가 가정이라 줄마다 표지를 달지 않는다. 출처 표지를 누르면 설명 칸(번호는 거기에만), 쓰임을 누르면 그 기록 */
export function Assumes() {
  const q = useClause()
  const c = q.data
  const setMenu = useSetAtom(menuAtom)
  const setTarget = useSetAtom(targetAtom)
  if (!c) return <Pending of={q} />
  const { assumes } = c.d
  return (
    <Region title={L.가정} aside={<Badge variant="neutral" label={String(assumes.length)} />}>
      <Table<Assume>
        data={assumes}
        idKey="id"
        density="balanced"
        columns={[
          { key: 'title', header: L.가정, width: proportional(3, { minWidth: 160 }), renderCell: (a) => <Text weight="semibold">{a.title}</Text> },
          {
            key: 'used',
            header: L.쓰임,
            width: proportional(2, { minWidth: 120 }),
            renderCell: (a) =>
              a.used.length ? (
                <HStack gap={2} wrap="wrap">
                  {a.used.map((u) =>
                    u.kind && u.id ? (
                      <Link
                        key={u.view}
                        onClick={() => {
                          setMenu(L.작업)
                          setTarget({ kind: u.kind!, id: u.id! })
                        }}
                      >
                        {u.view}
                      </Link>
                    ) : (
                      <Text key={u.view}>{u.view}</Text>
                    ),
                  )}
                </HStack>
              ) : (
                none
              ),
          },
          // 결정 번호는 표에 두지 않는다(review.md 2-1): 출처 표지를 누르면 설명 칸에 번호
          { key: 'source', header: L.출처, align: 'end', width: pixel(96), renderCell: (a) => <Source kind={a.source} decision={a.id} line={a.row} tip={a.title} /> },
        ]}
      />
    </Region>
  )
}

type Use = { use: string; of: string | null } & Record<string, unknown>
const USES: Use[] = [
  { use: L.조사, of: L.정황 },
  { use: L.요청서, of: L.소명 },
  { use: L.정리, of: L.서류 },
  { use: L.설명, of: L.사건 },
  { use: L.결정, of: null },
]

/** AI: 쓰임과 대상(결정에는 쓰지 않는다) */
export function Uses() {
  return (
    <Region title={L.AI}>
      <Table<Use>
        data={USES}
        idKey="use"
        density="balanced"
        columns={[
          { key: 'use', header: L.쓰임, width: proportional(1, { minWidth: 96 }), renderCell: (r) => <Text weight="semibold">{r.use}</Text> },
          { key: 'of', header: L.대상, width: proportional(1, { minWidth: 96 }), renderCell: (r) => (r.of ? <Text>{r.of}</Text> : none) },
        ]}
      />
    </Region>
  )
}

