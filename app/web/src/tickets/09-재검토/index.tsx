// 09 재검토: 재검토 표시가 붙은 심사의 가운데에 당시 / 현재를 나란히 둔다(04의 제목·숫자 줄 -40과 구성 -30 사이).
// 당시는 굳은 심사의 값 그대로이고 현재는 서버가 다시 계산해 준다. 과거의 심사는 대리점 상세의 지급 줄에서 연다(02의 조각).
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { useData } from '../../state'
import { Compare } from '../../ui/Compare'
import { Source } from '../../ui/Source'
import { label } from '../../ui/styles'
import { num } from '../../ui/Table'
import { useReview } from '../04-심사/review'

type Side = { total: number; approver: string }
type Again = {
  id: string
  then: Side & { members: number }
  now: Side & { members: { id: string; name: string }[]; limit: number; rules: { name: string; ver: number }[] }
  /** 현재의 구성을 만든 식별자의 인지일. 없으면 미상 */
  known: string | null
  source: string
}

const size = (n: number) => (n === 1 ? L.단독 : `${n}${L.곳}`)

function Then() {
  const r = useReview()?.review
  const on = !!r?.marks.includes(L.재검토)
  const d = useData<Again>(r && on ? `/reviews/${r.id}/again` : null)
  if (!r || !on || d?.id !== r.id) return null
  const rule = d.now.rules.find((x) => x.name === L.한도)
  return (
    <section className="mb-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className={label}>{L.재검토}</h2>
        <Source kind={d.source} side="right">
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
            <dt className={label}>{L.현재}</dt>
            <dd>{L['귀속월의 식별자, 규칙 버전']}</dd>
            <dt className={label}>{L.구성}</dt>
            <dd>{d.now.members.map((m) => m.name).join(' · ')}</dd>
            <dt className={label}>{L.한도}</dt>
            <dd className="tabular-nums">{[num(d.now.limit), rule && `${rule.name} v${rule.ver}`].filter(Boolean).join(' · ')}</dd>
            <dt className={label}>{L.재검토}</dt>
            <dd>{L['당시 영업지원, 현재 영업임원']}</dd>
          </dl>
        </Source>
      </div>
      <Compare
        head={[L.당시, L.현재]}
        rows={[
          [L.구성, size(d.then.members), size(d.now.members.length)],
          [L.합산, num(d.then.total), num(d.now.total)],
          [L.승인권자, d.then.approver, d.now.approver],
          [L.인지일, d.known ?? L.미상],
        ]}
      />
    </section>
  )
}

export default [{ slot: 'fact', kind: L.심사, order: -35, View: Then }] satisfies Piece[]
