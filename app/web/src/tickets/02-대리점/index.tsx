// 02 대리점: 메뉴 "대리점"의 목록과, 한 곳을 열었을 때 가운데의 등록·지급. 오른쪽에 채우는 것은 없다.
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Fragment } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { targetAtom, useData } from '../../state'
import { Mark } from '../../ui/Mark'
import { Pill } from '../../ui/Pill'
import { Region } from '../../ui/Region'
import { Source } from '../../ui/Source'
import { Table, num } from '../../ui/Table'
import { Title } from '../../ui/Title'

type From = { source: string; file?: string; row?: number }
type Row = { id: string; name: string; rep: string[]; address: string[]; account: string[] }
type Detail = {
  dealer: { id: string; name: string } & From
  /** until: 다음 값으로 바뀐 날(13의 변경). 있으면 이전 값이고 last가 유효했던 마지막 날(그 전날)이다 */
  registered: ({ item: string; value: string; same?: string; since: string; until: string | null; last?: string | null; known: string | null; via: string; excluded?: boolean } & From)[]
  /** review: 그 지급의 심사(과거의 결정이거나 승인된 것). 누르면 그 심사가 열린다 */
  payouts: ({ ym: string; amount: number; status: string; state?: string; state_source?: string; review?: { id: string; name: string; marks: string[] } | null } & From)[]
}

// 앱에서 사람이 넣은 변경(출처 시연)에 표지가 없는 것은 Source가 정한다(ui/Source.tsx 한 곳)
const src = (f: From) => <Source kind={f.source} file={f.file} row={f.row} />

/** 이름(누르면 열린다) + 식별자(보조). 대리점을 가리키는 곳마다 같은 모양 */
export const Dealer = ({ name, id, onOpen }: { name: string; id: string; onOpen: () => void }) => (
  <span className="flex items-baseline gap-2">
    <Link color="primary" weight="medium" onClick={onOpen}>
      {name}
    </Link>
    <Text type="supporting">{id}</Text>
  </span>
)

function List() {
  const list = useData<Row[]>('/dealers')
  const [target, setTarget] = useAtom(targetAtom)
  if (!list) return null
  const open = (id: string) => setTarget({ kind: L.대리점, id })
  return (
    <Table
      head={target ? [L.대리점] : [L.대리점, L.대표자, L.주소, L.계좌]}
      current={list.findIndex((r) => r.id === target?.id)}
      onRow={(y) => open(list[y].id)}
      rows={list.map((r) => {
        const name = <Dealer name={r.name} id={r.id} onOpen={() => open(r.id)} />
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

/** 머리: 대리점 이름과 식별자, 원본의 행 */
function Head() {
  const d = useDetail()
  if (!d) return null
  return (
    <Title name={d.dealer.name} sub={d.dealer.id}>
      {src(d.dealer)}
    </Title>
  )
}

function Registered() {
  const d = useDetail()
  if (!d) return null
  return (
    <Region title={L.등록}>
      <Table
        // 값(주소·계좌)은 좁으면 띄어쓰기에서 줄을 바꾸고, 출처(원본의 행 번호)는 경로 옆에 둔다(경로가 원본이면 그 행)
        head={[L.식별자, L.값, L.변경일, L.인지일, L.경로]}
        wrap={[1]}
        rows={d.registered.map((r) => [
          <Text weight="medium">{r.item}</Text>,
          // 값 아래에 덧말(동일인·제외·이전)을 보조 줄로 둔다
          <span className="flex flex-col">
            {/* 줄은 띄어쓰기에서만 바꾼다(계좌번호의 - 에서 끊기지 않게) */}
            <span>
              {r.value.split(' ').map((w, i) => (
                <Fragment key={i}>
                  {i > 0 && ' '}
                  <span className="whitespace-nowrap">{w}</span>
                </Fragment>
              ))}
            </span>
            {r.same && (
              <Text type="supporting">
                {L.동일인} {r.same}
              </Text>
            )}
            {r.excluded && (
              <span className="flex items-center gap-2">
                <Text type="supporting">{L.제외}</Text>
                <Source kind={L.소명} rows={[[L.상태, L.제외]]} />
              </span>
            )}
            {r.until && (
              <Text type="supporting">
                {L.이전} ~{r.last}
              </Text>
            )}
          </span>,
          r.since,
          r.known ?? L.미상,
          <span className="flex items-center gap-2">
            {r.via}
            {src(r)}
          </span>,
        ])}
      />
    </Region>
  )
}

function Payouts() {
  const d = useDetail()
  const setTarget = useSetAtom(targetAtom)
  if (!d) return null
  return (
    <Region title={L.지급}>
      <Table
        head={[L.귀속월, L.금액, L.상태, L.심사, L.출처]}
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
          p.review && (
            <span className="flex items-center gap-2">
              <Link color="primary" weight="medium" onClick={() => setTarget({ kind: L.심사, id: p.review!.id })}>
                {p.review.name}
              </Link>
              {p.review.marks.map((m) => (
                <Mark key={m}>{m}</Mark>
              ))}
            </span>
          ),
          src(p.state ? { ...p, source: p.state_source ?? p.source } : p),
        ])}
      />
    </Region>
  )
}

// 머리는 slot 'head'. 가운데의 순서: 등록 100, 지급 300. 사이와 뒤에 다른 티켓이 끼운다(관계 200)
export default [
  { slot: 'list', menu: L.대리점, View: List },
  { slot: 'head', kind: L.대리점, View: Head },
  { slot: 'fact', kind: L.대리점, order: 100, View: Registered },
  { slot: 'fact', kind: L.대리점, order: 300, View: Payouts },
] satisfies Piece[]
