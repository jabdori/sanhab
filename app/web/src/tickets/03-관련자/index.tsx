// 03 관련자: 대리점 상세의 가운데에 "관계"(그림과 같은 내용의 표, 그룹)를 끼운다. 값은 서버가 조회할 때 계산한다.
import { useAtom } from 'jotai'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { targetAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { Relation } from '../../ui/Relation'
import { Source } from '../../ui/Source'
import { label } from '../../ui/styles'
import { Table } from '../../ui/Table'

type Dealer = { id: string; name: string }
type Related = {
  id: string
  idents: { id: string; item: string; value: string }[]
  near: (Dealer & { match: string[]; related: boolean })[]
  lines: [string, string][]
  group: Dealer[]
  source: string
}

function Fact() {
  const [target, setTarget] = useAtom(targetAtom)
  const d = useData<Related>(target && `/dealers/${target.id}/related`)
  if (!d || d.id !== target?.id) return null
  const me = d.group.find((g) => g.id === d.id)
  return (
    <section className="mt-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className={label}>{L.관계}</h2>
        <Source kind={d.source}>{L['식별자 셋 중 둘 이상이 일치하면 관련자, 관련자를 이으면 그룹']}</Source>
      </div>
      {d.near.length === 0 || !me ? (
        <Empty />
      ) : (
        <>
          <Relation left={[me]} mid={d.idents.map((i) => ({ id: i.id, name: i.value }))} right={d.near} lines={d.lines} />
          <Table
            head={[L.대리점, L.일치, L.관련자]}
            rows={d.near.map((n) => [
              <span className="flex items-center gap-2">
                <button className="cursor-pointer text-action hover:text-action-hover" onClick={() => setTarget({ kind: L.대리점, id: n.id })}>
                  {n.name}
                </button>
                <span className="text-text-sub">{n.id}</span>
              </span>,
              n.match.join(' · '),
              n.related ? L.관련자 : <span className="text-text-mute">{L.없음}</span>,
            ])}
          />
          <div className="flex items-baseline gap-2">
            <span className={label}>{L.그룹}</span>
            {d.group.length > 1 ? <span>{d.group.map((g) => g.name).join(' · ')}</span> : <Empty />}
          </div>
        </>
      )}
    </section>
  )
}

export default [{ slot: 'fact', kind: L.대리점, View: Fact }] satisfies Piece[]
