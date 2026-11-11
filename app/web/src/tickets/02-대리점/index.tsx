// 02 대리점: 메뉴 "대리점"의 목록과, 한 곳을 열었을 때 가운데의 등록·지급. 오른쪽에 채우는 것은 없다.
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { targetAtom, useData } from '../../state'
import { Mark } from '../../ui/Mark'
import { Pill } from '../../ui/Pill'
import { Source } from '../../ui/Source'
import { label } from '../../ui/styles'
import { Table, num } from '../../ui/Table'
import { Title } from '../../ui/Title'

type From = { source: string; file?: string; row?: number }
type Row = { id: string; name: string; rep: string[]; address: string[]; account: string[] }
type Detail = {
  dealer: { id: string; name: string } & From
  /** until: 다음 값으로 바뀐 날(13의 변경). 있으면 이전 값이다 */
  registered: ({ item: string; value: string; same?: string; since: string; until: string | null; known: string | null; via: string } & From)[]
  /** review: 그 지급의 심사(과거의 결정이거나 승인된 것). 누르면 그 심사가 열린다 */
  payouts: ({ ym: string; amount: number; status: string; state?: string; state_source?: string; review?: { id: string; name: string; marks: string[] } | null } & From)[]
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

/** 열어 둔 대리점의 상세. 읽기 전이거나 다른 대리점의 것이면 undefined */
function useDetail() {
  const target = useAtomValue(targetAtom)
  const d = useData<Detail>(target && `/dealers/${target.id}`)
  return d?.dealer.id === target?.id ? d : undefined
}

function Registered() {
  const d = useDetail()
  if (!d) return null
  return (
    <div className="mb-4 flex flex-col gap-4">
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
              {r.until && <span className={label}>{L.이전}</span>}
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
    </div>
  )
}

function Payouts() {
  const d = useDetail()
  const setTarget = useSetAtom(targetAtom)
  if (!d) return null
  return (
    <section className="mb-4 flex flex-col gap-2">
      <h2 className={label}>{L.지급}</h2>
      <Table
        head={[L.귀속월, L.금액, L.상태, L.출처, L.심사]}
        right={[1]}
        rows={d.payouts.map((p) => [
          p.ym,
          num(p.amount),
          // 이 앱이 상태를 준 지급은 그 상태(대기·재심사·이체·완료)와 그 상태의 출처, 아직 손대지 않은 지급은 원본의 값 그대로(승인·반려가 아닌 미지급은 대기의 색).
          // 어느 쪽이든 출처 표지는 원본의 행을 연다
          p.state ? (
            <Pill tone={p.state === L.완료 ? 'good' : p.state === L.재심사 ? 'again' : 'wait'}>{p.state}</Pill>
          ) : (
            <Pill tone={p.status === L.승인 ? 'good' : p.status === L.반려 ? 'bad' : 'wait'}>{p.status}</Pill>
          ),
          src(p.state ? { ...p, source: p.state_source ?? p.source } : p),
          p.review && (
            <span className="flex items-center gap-2">
              <button className="cursor-pointer text-action hover:text-action-hover" onClick={() => setTarget({ kind: L.심사, id: p.review!.id })}>
                {p.review.name}
              </button>
              {p.review.marks.map((m) => (
                <Mark key={m}>{m}</Mark>
              ))}
            </span>
          ),
        ])}
      />
    </section>
  )
}

// 가운데의 순서: 등록 100, 지급 300. 사이와 뒤에 다른 티켓이 끼운다(관계 200)
export default [
  { slot: 'list', menu: L.대리점, View: List },
  { slot: 'fact', kind: L.대리점, order: 100, View: Registered },
  { slot: 'fact', kind: L.대리점, order: 300, View: Payouts },
] satisfies Piece[]
