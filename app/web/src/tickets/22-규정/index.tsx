// 22 규정: 메뉴 "규정". 목록은 조항이고(하나를 저절로 연다), 가운데에 그 조항의 원문 · 규칙 버전 · 가정 · AI를 차례로 둔다. 오른쪽에 채우는 것은 없다(모의는 23).
// 대상은 { kind: L.규정, id: 조항의 id }. 가운데의 조각은 order -10 하나이고, 뒤 티켓이 kind: L.규정으로 끼우는 조각은 order를 적지 않으면 그 아래에 놓인다.
import { useAtom, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { menuAtom, targetAtom, useData } from '../../state'
import { Figures } from '../../ui/Figures'
import { Source } from '../../ui/Source'
import { label } from '../../ui/styles'
import { Table, num } from '../../ui/Table'
import { Title } from '../../ui/Title'

type Clause = { id: string; title: string; file: string; sha: string; first: number; last: number; text: string; source: string }
type Rule = { id: string; name: string; ver: number; value: number; clause: string; since: string | null; until: string | null; prev: { name: string; ver: number } | null; source: string }
/** used: 쓰인 곳. id가 있으면 그 기록(kind)으로 갈 수 있고, 없으면 글자뿐이다 */
type Assume = { id: string; title: string; text: string; file: string; row: number; used: { view: string; kind: string | null; id: string | null }[]; source: string }
type Data = { clauses: Clause[]; rules: Rule[]; assumes: Assume[] }

const none = <span className="text-text-mute">{L.없음}</span>

/** 문서의 위치와 그 글. 출처 표지가 여는 것 */
const Where = ({ file, rows, text, sha }: { file: string; rows: string; text?: string; sha?: string }) => (
  <>
    <div className="flex justify-between gap-2">
      <span className="break-all">{file}</span>
      <span className="shrink-0 tabular-nums">
        {rows}
        {L.행}
      </span>
    </div>
    {text && <p className="border-t border-line pt-2 break-keep whitespace-pre-wrap">{text}</p>}
    {sha && (
      <div className="flex gap-2 border-t border-line pt-2">
        <span className={`shrink-0 ${label}`}>{L.해시}</span>
        <span className="break-all text-label text-text-sub">{sha}</span>
      </div>
    )}
  </>
)

function List() {
  const d = useData<Data>('/rules')
  const [target, setTarget] = useAtom(targetAtom)
  const first = d?.clauses[0]?.id
  // 고를 것이 조항뿐이라 열어 둔 것이 없으면 첫 조항을 연다
  useEffect(() => {
    if (!target && first) setTarget({ kind: L.규정, id: first })
  }, [target, first, setTarget])
  if (!d || !target) return null
  return (
    <Table
      head={[L.조항]}
      current={d.clauses.findIndex((c) => c.id === target.id)}
      rows={d.clauses.map((c) => [
        <button className="cursor-pointer text-action hover:text-action-hover" onClick={() => setTarget({ kind: L.규정, id: c.id })}>
          {c.title}
        </button>,
      ])}
    />
  )
}

function Rules() {
  const d = useData<Data>('/rules')
  const [target, setTarget] = useAtom(targetAtom)
  const setMenu = useSetAtom(menuAtom)
  const c = d?.clauses.find((x) => x.id === target?.id)
  if (!d || !c) return null
  const rows = `${c.first}–${c.last}`
  return (
    <>
      <section className="mb-4 flex flex-col gap-2">
        <Title name={c.title}>
          <Source kind={c.source}>
            <Where file={c.file} rows={rows} sha={c.sha} />
          </Source>
        </Title>
        <div className="flex flex-wrap gap-x-2 text-table text-text-sub tabular-nums">
          <span className="whitespace-nowrap">{c.file}</span>
          <span className="whitespace-nowrap">
            {rows}
            {L.행}
          </span>
        </div>
        <p className="text-base break-keep whitespace-pre-wrap">{c.text}</p>
      </section>
      <section className="mb-4 flex flex-col gap-2">
        <h2 className={label}>{L.규칙}</h2>
        <Table
          head={[L.규칙, '', L.시행, L.이전, L.출처]}
          right={[1]}
          rows={d.rules
            .filter((r) => r.clause === c.id)
            .map((r) => [
              `${r.name} v${r.ver}`,
              r.name === L.합산 ? `${L.일치} ${r.value}` : num(r.value),
              `${r.since ?? L.미상} – ${r.until ?? ''}`.trim(),
              r.prev ? `${r.prev.name} v${r.prev.ver}` : none,
              <Source kind={r.source}>
                <Where file={c.file} rows={rows} text={c.text} />
              </Source>,
            ])}
        />
      </section>
      <section className="mb-4 flex flex-col gap-2">
        <h2 className={`flex gap-2 ${label}`}>
          {L.가정}
          <span className="tabular-nums">{d.assumes.length}</span>
        </h2>
        <Table
          head={['', L.가정, L.쓰임, L.출처]}
          rows={d.assumes.map((a) => [
            a.id,
            a.title,
            a.used.length ? (
              <span className="flex gap-2">
                {a.used.map((u) =>
                  u.kind && u.id ? (
                    <button key={u.view} className="cursor-pointer text-action hover:text-action-hover" onClick={() => {
                        setMenu(L.작업)
                        setTarget({ kind: u.kind!, id: u.id! })
                      }}>
                      {u.view}
                    </button>
                  ) : (
                    <span key={u.view}>{u.view}</span>
                  ),
                )}
              </span>
            ) : (
              none
            ),
            <Source kind={a.source}>
              <Where file={a.file} rows={String(a.row)} text={a.text} />
            </Source>,
          ])}
        />
      </section>
      <section className="mb-4 flex flex-col gap-2">
        <h2 className={label}>{L.AI}</h2>
        <Figures
          items={[
            [L.조사, L.정황],
            [L.요청서, L.소명],
            [L.정리, L.서류],
            [L.설명, L.사건],
            [L.결정, L.없음],
          ]}
        />
      </section>
    </>
  )
}

export default [
  { slot: 'list', menu: L.규정, View: List },
  { slot: 'fact', kind: L.규정, order: -10, View: Rules },
] satisfies Piece[]
