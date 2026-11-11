// 02 대리점: 메뉴 "대리점"의 목록과, 한 곳을 열었을 때 가운데의 등록·지급. 오른쪽에 채우는 것은 없다.
import { useAtom, useAtomValue } from 'jotai'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { targetAtom, useData } from '../../state'
import { Pill } from '../../ui/Pill'
import { Source } from '../../ui/Source'
import { label } from '../../ui/styles'
import { Table, num } from '../../ui/Table'
import { Title } from '../../ui/Title'

type From = { source: string; file?: string; row?: number }
type Row = { id: string; name: string; rep: string[]; address: string[]; account: string[] }
type Detail = {
  dealer: { id: string; name: string } & From
  registered: ({ item: string; value: string; same?: string; since: string; known: string | null; via: string } & From)[]
  payouts: ({ ym: string; amount: number; status: string } & From)[]
}

const src = (f: From) => <Source kind={f.source} file={f.file} row={f.row} />

function List() {
  const list = useData<Row[]>('/dealers')
  const [target, setTarget] = useAtom(targetAtom)
  if (!list) return null
  return (
    <Table
      head={target ? [L.대리점] : [L.대리점, L.대표자, L.주소, L.계좌]}
      current={list.findIndex((r) => r.id === target?.id)}
      rows={list.map((r) => {
        const name = (
          <span className="flex items-center gap-2">
            <button className="cursor-pointer text-action hover:text-action-hover" onClick={() => setTarget({ kind: L.대리점, id: r.id })}>
              {r.name}
            </button>
            <span className="text-text-sub">{r.id}</span>
          </span>
        )
        return target ? [name] : [name, r.rep.join(' '), r.address.join(' '), r.account.join(' ')]
      })}
    />
  )
}

function Fact() {
  const target = useAtomValue(targetAtom)
  const d = useData<Detail>(target && `/dealers/${target.id}`)
  if (!d || d.dealer.id !== target?.id) return null
  return (
    <div className="flex flex-col gap-4">
      <Title name={d.dealer.name} sub={d.dealer.id}>
        {src(d.dealer)}
      </Title>
      <section className="flex flex-col gap-2">
        <h2 className={label}>{L.등록}</h2>
        <Table
          head={[L.식별자, '', L.출처, L.변경일, L.인지일, L.경로]}
          rows={d.registered.map((r) => [
            r.item,
            <span className="flex items-center gap-2">
              {r.value}
              {r.same && (
                <span className={label}>
                  {L.동일인} {r.same}
                </span>
              )}
            </span>,
            src(r),
            r.since,
            r.known ?? L.미상,
            r.via,
          ])}
        />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className={label}>{L.지급}</h2>
        <Table
          head={[L.귀속월, L.금액, L.상태, L.출처]}
          right={[1]}
          rows={d.payouts.map((p) => [
            p.ym,
            num(p.amount),
            // 원본의 값 그대로. 승인·반려가 아닌 값(미지급)은 대기의 색
            <Pill tone={p.status === L.승인 ? 'good' : p.status === L.반려 ? 'bad' : 'wait'}>{p.status}</Pill>,
            src(p),
          ])}
        />
      </section>
    </div>
  )
}

export default [
  { slot: 'list', menu: L.대리점, View: List },
  { slot: 'fact', kind: L.대리점, View: Fact },
] satisfies Piece[]
