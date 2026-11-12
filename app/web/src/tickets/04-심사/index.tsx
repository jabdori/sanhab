// 04 심사: 심사 기록(pages/Review)의 본문 영역 — 구성, 관계, 규정 — 과 결정 한 줄. 데이터는 review.ts의 useReview().
// 작업 목록은 pages/Work, 머리·조치·요약은 pages/Review가 그린다.
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { useSetAtom } from 'jotai'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { menuAtom, targetAtom } from '../../state'
import { Empty } from '../../ui/Empty'
import { Line as Row } from '../../ui/Line'
import { Region } from '../../ui/Region'
import { Relation } from '../../ui/Relation'
import { Source } from '../../ui/Source'
import { Table, num } from '../../ui/Table'
import { type Decision, useReview } from './review'

export function Members() {
  const r = useReview()
  if (!r) return null
  return (
    <Region title={L.구성}>
      <Table
        head={[L.대리점, L.금액, L.일치, L.출처]}
        right={[1]}
        rows={r.members.flatMap((m) =>
          // 지급마다 한 줄(금액의 합이 합산과 같다). 지급이 없는 구성원도 한 줄
          (m.pays.length ? m.pays : [null]).map((p) => [
            <span className="flex items-baseline gap-2">
              <Text weight="medium">{m.name}</Text>
              <Text type="supporting">{m.id}</Text>
            </span>,
            p ? num(p.amount) : '',
            m.match.length ? m.match.join(' · ') : <Text color="secondary">{L.없음}</Text>,
            p && <Source kind={p.source} file={p.file ?? undefined} row={p.row ?? undefined} />,
          ]),
        )}
      />
    </Region>
  )
}

/** 관계 그림. 같은 내용은 구성 표의 "일치" 열에 글자로 있다. 이웃이 없으면(단독) 접힌 `관계 없음` */
export function Links() {
  const r = useReview()
  if (!r) return null
  return (
    <Region
      title={L.관계}
      aside={
        r.relation.right.length > 0 && (
          <Source
            kind={L.계산}
            side="right"
            tip={`${L.관련자} · ${L.그룹}`}
            rows={[
              [L.관련자, L['식별자 일치 2 이상']],
              [L.그룹, L['관련자의 전이']],
            ]}
          />
        )
      }
    >
      {r.relation.right.length ? <Relation {...r.relation} /> : <Empty />}
    </Region>
  )
}

/** 규정 줄. 조항을 누르면 메뉴 "규정"의 그 조항이 열린다(22) */
export function Rules() {
  const r = useReview()
  const setMenu = useSetAtom(menuAtom)
  const setTarget = useSetAtom(targetAtom)
  if (!r) return null
  return (
    <Region title={L.규정}>
      <Table
        head={[L.조항, L.규칙, L.출처]}
        rows={r.rules.map((x) => [
          <Link onClick={() => {
              setMenu(L.규정)
              setTarget({ kind: L.규정, id: x.clause })
            }}
          >
            {x.title}
          </Link>,
          `${x.name} v${x.ver}`,
          <Source kind={x.source} tip={x.title} place={`${x.first}–${x.last}${L.행}`} rows={[[L.위치, `${x.file} ${x.first}–${x.last}${L.행}`]]}>
            {x.text}
          </Source>,
        ])}
      />
    </Region>
  )
}

/** 결정 한 줄: 결정(굵게) · 사람 · 날짜 · 사유의 분류. 메모는 그 아래에 따로. 앱에서 사람이 내린 결정은 제품의 동작이므로 출처 표지를 달지 않는다 */
export const Line = ({ d }: { d: Decision }) => (
  <Row kind={d.kind} parts={[d.role, d.at ?? L.미상, d.reason?.class ?? `${L.사유} ${L.없음}${d.source === L.원본 ? `(${L.원본})` : ''}`]} memo={d.reason?.memo} />
)

export default [] satisfies Piece[]
