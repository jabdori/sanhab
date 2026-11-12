// 04 심사: 심사 기록(pages/Review)의 본문 영역 — 구성, 관계, 규정 — 과 결정 한 줄. 데이터는 review.ts의 useReview().
// 작업 목록은 pages/Work, 머리·조치·요약은 pages/Review가 그린다.
import { Badge } from '@astryxdesign/core/Badge'
import { HStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { useSetAtom } from 'jotai'
import { L } from '../../labels'
import { menuAtom, targetAtom } from '../../state'
import { Empty } from '../../ui/Empty'
import { Line as Row } from '../../ui/Line'
import { Region } from '../../ui/Region'
import { Relation } from '../../ui/Relation'
import { Source } from '../../ui/Source'
import {  } from '../../ui/status'
import { num } from '../../ui/status'
import { type Decision, type Review, useReview } from './review'

type Pay = { key: string; id: string; name: string; match: string[]; amount: number | null; source?: string; file?: string | null; row?: number | null } & Record<string, unknown>

/** 구성: 지급마다 한 줄(금액의 합이 합산과 같다. 지급이 없는 구성원도 한 줄). 이름은 굵게 + 보조 id, 일치는 종류마다 색 Token, 금액은 굵게 오른쪽, 출처는 조용히 */
export function Members() {
  const r = useReview()
  const setTarget = useSetAtom(targetAtom)
  if (!r) return null
  const data: Pay[] = r.members.flatMap((m) =>
    (m.pays.length ? m.pays : [null]).map((p, i) => ({ key: `${m.id}/${i}`, id: m.id, name: m.name, match: m.match, amount: p?.amount ?? null, source: p?.source, file: p?.file, row: p?.row })),
  )
  return (
    <Region title={L.구성} aside={<Badge variant="neutral" label={`${r.members.length}${L.곳}`} />}>
      <Table<Pay>
        data={data}
        idKey="key"
        density="balanced"
        columns={[
          {
            key: 'name',
            header: L.대리점,
            width: proportional(2, { minWidth: 100 }),
            renderCell: (p) => (
              <HStack gap={2} vAlign="center">
                <Link weight="semibold" onClick={() => setTarget({ kind: L.대리점, id: p.id })}>
                  {p.name}
                </Link>
                <Text type="supporting" color="secondary">
                  {p.id}
                </Text>
              </HStack>
            ),
          },
          {
            key: 'match',
            header: L.일치,
            width: proportional(2, { minWidth: 80 }),
            renderCell: (p) =>
              p.match.length ? (
                <HStack gap={1} wrap="wrap">
                  {p.match.map((k) => (
                    <Token key={k} size="sm" label={k} />
                  ))}
                </HStack>
              ) : (
                <Text color="secondary">{L.없음}</Text>
              ),
          },
          { key: 'amount', header: L.금액, align: 'end', width: pixel(112), renderCell: (p) => p.amount != null && <Text weight="semibold" hasTabularNumbers>{num(p.amount)}</Text> },
          { key: 'source', header: L.출처, align: 'end', width: pixel(88), renderCell: (p) => p.source && <Source kind={p.source} file={p.file ?? undefined} row={p.row ?? undefined} /> },
        ]}
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
type Rule = Review['rules'][number] & Record<string, unknown>

export function Rules() {
  const r = useReview()
  const setMenu = useSetAtom(menuAtom)
  const setTarget = useSetAtom(targetAtom)
  if (!r) return null
  return (
    <Region title={L.규정}>
      <Table<Rule>
        data={r.rules as Rule[]}
        idKey={(x) => `${x.clause}/${x.name}`}
        density="balanced"
        columns={[
          {
            key: 'title',
            header: L.조항,
            width: proportional(2, { minWidth: 100 }),
            renderCell: (x) => (
              <Link onClick={() => (setMenu(L.규정), setTarget({ kind: L.규정, id: x.clause }))}>
                {x.title}
              </Link>
            ),
          },
          { key: 'name', header: L.규칙, width: pixel(96), renderCell: (x) => <Text hasTabularNumbers>{`${x.name} v${x.ver}`}</Text> },
          {
            key: 'source',
            header: L.출처,
            align: 'end',
            width: pixel(96),
            renderCell: (x) => (
              <Source kind={x.source} tip={x.title} place={`${x.first}–${x.last}${L.행}`} rows={[[L.위치, `${x.file} ${x.first}–${x.last}${L.행}`]]}>
                {x.text}
              </Source>
            ),
          },
        ]}
      />
    </Region>
  )
}

/** 결정 한 줄: 결정(굵게) · 사람 · 날짜 · 사유의 분류. 메모는 그 아래에 따로. 앱에서 사람이 내린 결정은 제품의 동작이므로 출처 표지를 달지 않는다 */
export const Line = ({ d }: { d: Decision }) => (
  <Row kind={d.kind} parts={[d.role, d.at ?? L.미상, d.reason?.class ?? `${L.사유} ${L.없음}${d.source === L.원본 ? `(${L.원본})` : ''}`]} memo={d.reason?.memo} />
)

