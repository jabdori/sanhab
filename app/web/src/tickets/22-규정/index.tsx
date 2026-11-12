// 22 규정: 규정 화면(pages/Rules · pages/Rule)의 본문 영역 — 조항 원문, 규칙 버전, 가정, AI — 과 데이터. 대상은 { kind: L.규정, id: 조항의 id }.
// 목록과 머리·조치(모의는 23)는 pages가 그린다.
import { Badge } from '@astryxdesign/core/Badge'
import { HStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Markdown } from '@astryxdesign/core/Markdown'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { useAtomValue, useSetAtom } from 'jotai'
import { L } from '../../labels'
import { menuAtom, targetAtom, useData } from '../../state'
import { Region } from '../../ui/Region'
import { Source } from '../../ui/Source'
import { num } from '../../ui/status'

export type Clause = { id: string; title: string; file: string; sha: string; first: number; last: number; text: string; source: string }
type Rule = { id: string; name: string; ver: number; value: number; clause: string; since: string | null; until: string | null; prev: { name: string; ver: number } | null; source: string } & Record<string, unknown>
/** used: 쓰인 곳. id가 있으면 그 기록(kind)으로 갈 수 있고, 없으면 글자뿐이다 */
type Assume = { id: string; title: string; text: string; file: string; row: number; used: { view: string; kind: string | null; id: string | null }[]; source: string } & Record<string, unknown>
export type Data = { clauses: Clause[]; rules: Rule[]; assumes: Assume[] }

const none = <Text color="secondary">{L.없음}</Text>
export const where = (c: Clause) => `${c.file} ${c.first}–${c.last}${L.행}`

/** 규정 전체의 읽기 */
export const useRules = () => useData<Data>('/rules')

/** 열어 둔 조항과 그 규칙(읽기 전이거나 없으면 undefined) */
export function useClause() {
  const d = useRules()
  const target = useAtomValue(targetAtom)
  const clause = d?.clauses.find((x) => x.id === target?.id)
  return d && clause ? { d, clause, rules: d.rules.filter((r) => r.clause === clause.id) } : undefined
}

/** 조항: 원문. 첫 줄(`## 제목`)은 화면 제목이 이미 보인다 */
export function Original() {
  const c = useClause()
  if (!c) return null
  return (
    <Region title={L.조항} aside={<Source kind={c.clause.source} tip={where(c.clause)} place={`${c.clause.first}–${c.clause.last}${L.행}`} rows={[[L.위치, where(c.clause)], [L.해시, c.clause.sha]]} />}>
      <Markdown density="compact">{c.clause.text.replace(/^#+ .*\n/, '')}</Markdown>
    </Region>
  )
}

/** 규칙: 버전마다 값 · 시행 · 이전 · 출처 */
export function Versions() {
  const c = useClause()
  if (!c) return null
  const { clause, rules } = c
  return (
    <Region title={L.규칙} aside={<Badge variant="neutral" label={String(rules.length)} />}>
      <Table<Rule>
        data={rules}
        idKey="id"
        density="compact"
        columns={[
          { key: 'name', header: L.규칙, width: proportional(2, { minWidth: 96 }), renderCell: (r) => <Text weight="semibold">{`${r.name} v${r.ver}`}</Text> },
          { key: 'value', header: L.값, align: 'end', width: pixel(88), renderCell: (r) => <Text hasTabularNumbers>{r.name === L.합산 ? `${L.일치} ${r.value}` : num(r.value)}</Text> },
          { key: 'since', header: L.시행, width: proportional(1, { minWidth: 80 }), renderCell: (r) => (r.since || r.until ? <Text hasTabularNumbers>{`${r.since ?? ''} ~ ${r.until ?? ''}`.trim()}</Text> : none) },
          { key: 'prev', header: L.이전, width: proportional(1, { minWidth: 96 }), renderCell: (r) => (r.prev ? <Text>{`${r.prev.name} v${r.prev.ver}`}</Text> : none) },
          {
            key: 'source',
            header: L.출처,
            align: 'end',
            width: pixel(76),
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

/** 가정: 표 전체가 가정이라 줄마다 표지를 달지 않는다. 번호(조용한 출처)를 누르면 설명 칸, 쓰임을 누르면 그 기록 */
export function Assumes() {
  const c = useClause()
  const setMenu = useSetAtom(menuAtom)
  const setTarget = useSetAtom(targetAtom)
  if (!c) return null
  const { assumes } = c.d
  return (
    <Region title={L.가정} aside={<Badge variant="neutral" label={String(assumes.length)} />}>
      <Table<Assume>
        data={assumes}
        idKey="id"
        density="compact"
        columns={[
          { key: 'id', header: L.번호, width: pixel(72), renderCell: (a) => <Source kind={a.source} decision={a.id} line={a.row} tip={a.title} quiet place={a.id} /> },
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
        density="compact"
        columns={[
          { key: 'use', header: L.쓰임, width: proportional(1, { minWidth: 96 }), renderCell: (r) => <Text weight="semibold">{r.use}</Text> },
          { key: 'of', header: L.대상, width: proportional(1, { minWidth: 96 }), renderCell: (r) => (r.of ? <Text>{r.of}</Text> : none) },
        ]}
      />
    </Region>
  )
}

