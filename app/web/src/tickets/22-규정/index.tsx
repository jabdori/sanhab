// 22 규정: 메뉴 "규정". 목록은 조항이고(하나를 저절로 연다), 가운데에 그 조항의 원문 · 규칙 버전 · 가정 · AI를 차례로 둔다. 오른쪽에 채우는 것은 없다(모의는 23).
// 대상은 { kind: L.규정, id: 조항의 id }. 가운데의 조각은 order -10 하나이고, 뒤 티켓이 kind: L.규정으로 끼우는 조각은 order를 적지 않으면 그 아래에 놓인다.
import { Link } from '@astryxdesign/core/Link'
import { Markdown } from '@astryxdesign/core/Markdown'
import { Text } from '@astryxdesign/core/Text'
import { useAtom, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { menuAtom, targetAtom, useData } from '../../state'
import { Figures } from '../../ui/Figures'
import { Region } from '../../ui/Region'
import { Source } from '../../ui/Source'
import { Table, num } from '../../ui/Table'
import { Title } from '../../ui/Title'

type Clause = { id: string; title: string; file: string; sha: string; first: number; last: number; text: string; source: string }
type Rule = { id: string; name: string; ver: number; value: number; clause: string; since: string | null; until: string | null; prev: { name: string; ver: number } | null; source: string }
/** used: 쓰인 곳. id가 있으면 그 기록(kind)으로 갈 수 있고, 없으면 글자뿐이다 */
type Assume = { id: string; title: string; text: string; file: string; row: number; used: { view: string; kind: string | null; id: string | null }[]; source: string }
type Data = { clauses: Clause[]; rules: Rule[]; assumes: Assume[] }

const none = <Text color="secondary">{L.없음}</Text>
const where = (c: Clause) => `${c.file} ${c.first}–${c.last}${L.행}`

function List() {
  const d = useData<Data>('/rules')
  const [target, setTarget] = useAtom(targetAtom)
  const first = d?.clauses[0]?.id
  // 고를 것이 조항뿐이라 열어 둔 것이 없으면 첫 조항을 연다
  useEffect(() => {
    if (!target && first) setTarget({ kind: L.규정, id: first })
  }, [target, first, setTarget])
  if (!d || !target) return null
  const open = (id: string) => setTarget({ kind: L.규정, id })
  return (
    <Table
      head={[L.조항]}
      current={d.clauses.findIndex((c) => c.id === target.id)}
      onRow={(y) => open(d.clauses[y].id)}
      rows={d.clauses.map((c) => [
        <Link color="primary" weight="medium" onClick={() => open(c.id)}>
          {c.title}
        </Link>,
      ])}
    />
  )
}

/** 머리: 조항의 이름과 원문의 위치(문서와 행, 해시) */
function Head() {
  const d = useData<Data>('/rules')
  const [target] = useAtom(targetAtom)
  const c = d?.clauses.find((x) => x.id === target?.id)
  if (!c) return null
  return (
    <Title name={c.title}>
      <Source kind={c.source} tip={where(c)} rows={[[L.위치, where(c)], [L.해시, c.sha]]} />
    </Title>
  )
}

function Rules() {
  const d = useData<Data>('/rules')
  const [target, setTarget] = useAtom(targetAtom)
  const setMenu = useSetAtom(menuAtom)
  const c = d?.clauses.find((x) => x.id === target?.id)
  if (!d || !c) return null
  const rules = d.rules.filter((r) => r.clause === c.id)
  return (
    <>
      <Region title={L.조항}>
        {/* 원문의 첫 줄(`## 제목`)은 화면 제목이 이미 보인다 */}
        <Markdown density="compact">{c.text.replace(/^#+ .*\n/, '')}</Markdown>
      </Region>
      <Region title={L.규칙}>
        <Table
          head={[L.규칙, '', L.시행, L.이전, L.출처]}
          right={[1]}
          rows={rules.map((r) => [
            <Text weight="medium">{`${r.name} v${r.ver}`}</Text>,
            r.name === L.합산 ? `${L.일치} ${r.value}` : num(r.value),
            `${r.since ?? L.미상} – ${r.until ?? ''}`.trim(),
            r.prev ? `${r.prev.name} v${r.prev.ver}` : none,
            <Source kind={r.source} tip={c.title} rows={[[L.위치, where(c)]]}>
              <p className="whitespace-pre-wrap">{c.text}</p>
            </Source>,
          ])}
        />
      </Region>
      <Region
        title={L.가정}
        aside={
          <Text type="supporting" hasTabularNumbers>
            {d.assumes.length}
          </Text>
        }
      >
        {/* 줄의 출처 표지는 다른 화면의 가정과 같은 설명 칸(결정 번호·내용·적용 시점·위치·이유·쓰임) */}
        <Table
          head={[L.번호, L.가정, L.쓰임, L.출처]}
          rows={d.assumes.map((a) => [
            a.id,
            <Text weight="medium">{a.title}</Text>,
            a.used.length ? (
              <span className="flex gap-2">
                {a.used.map((u) =>
                  u.kind && u.id ? (
                    <Link key={u.view} color="primary" onClick={() => {
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
              </span>
            ) : (
              none
            ),
            <Source kind={a.source} decision={a.id} tip={a.title} />,
          ])}
        />
      </Region>
      <Region title={L.AI}>
        <Figures
          items={[
            [L.조사, L.정황],
            [L.요청서, L.소명],
            [L.정리, L.서류],
            [L.설명, L.사건],
            [L.결정, L.없음],
          ]}
        />
      </Region>
    </>
  )
}

export default [
  { slot: 'list', menu: L.규정, View: List },
  { slot: 'head', kind: L.규정, View: Head },
  { slot: 'fact', kind: L.규정, order: -10, View: Rules },
] satisfies Piece[]
