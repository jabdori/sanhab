// 02 대리점: 대리점 화면(pages/Dealers · pages/Dealer)의 본문 영역 — 등록, 지급 — 과 이름 줄. 목록과 머리·조치·요약은 pages가 그린다.
import { Badge } from '@astryxdesign/core/Badge'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { useAtomValue, useSetAtom } from 'jotai'
import { L } from '../../labels'
import { targetAtom, useLoad, type Load } from '../../state'
import { Pending } from '../../ui/Pending'
import { Mark, State } from '../../ui/Mark'
import { Region } from '../../ui/Region'
import { Source } from '../../ui/Source'
import { num } from '../../ui/status'

type From = { source: string; file?: string; row?: number }
export type Row = { id: string; name: string; rep: string[]; address: string[]; account: string[] } & Record<string, unknown>
export type Registered = { item: string; value: string; same?: string; since: string; until: string | null; last?: string | null; known: string | null; via: string; excluded?: boolean } & From & Record<string, unknown>
export type Payout = { ym: string; amount: number; status: string; state?: string; state_source?: string; review?: { id: string; name: string; marks: string[] } | null } & From & Record<string, unknown>
export type Detail = {
  dealer: { id: string; name: string } & From
  /** until: 다음 값으로 바뀐 날(13의 변경). 있으면 이전 값이고 last가 유효했던 마지막 날(그 전날)이다 */
  registered: Registered[]
  /** review: 그 지급의 심사(과거의 결정이거나 승인된 것). 누르면 그 심사가 열린다 */
  payouts: Payout[]
}

// 앱에서 사람이 넣은 변경(출처 시연)에 표지가 없는 것은 Source가 정한다(ui/Source.tsx 한 곳)
const src = (f: From) => <Source kind={f.source} file={f.file} row={f.row} />

/** 이름(누르면 열린다, 굵게). 대리점 번호(D-011)는 화면에 두지 않는다 — 원본의 식별자라 출처 설명 칸에서만(review.md 2-1) */
export const Dealer = ({ name, onOpen }: { name: string; id?: string; onOpen: () => void }) => (
  <HStack gap={2} vAlign="center">
    <Link weight="semibold" onClick={onOpen}>
      {name}
    </Link>
  </HStack>
)

/** 열어 둔 대리점의 상세. 읽기 전이거나 다른 대리점의 것이면 undefined */
export function useDetailLoad(): Load<Detail> {
  const target = useAtomValue(targetAtom)
  const q = useLoad<Detail>(target && `/dealers/${target.id}`)
  // 앞 대리점의 값이 남아 있으면 지금 연 것으로 보지 않는다
  return q.data?.dealer.id === target?.id ? q : { ...q, data: undefined, loading: q.loading || !q.error }
}
export const useDetail = () => useDetailLoad().data

/** 등록: 식별자마다 값(덧말: 동일인 · 제외 · 이전)과 변경일 · 인지일 · 경로(출처). 이전 값은 `이전 ~마지막 날` */
export function RegisteredRegion() {
  const q = useDetailLoad()
  const d = q.data
  if (!d) return <Pending of={q} />
  return (
    <Region title={L.등록}>
      <Table<Registered>
        data={d.registered}
        idKey={(r) => `${r.item}/${r.value}/${r.since}`}
        density="balanced"
        columns={[
          { key: 'item', header: L.식별자, width: pixel(88), renderCell: (r) => <Text weight="semibold" maxLines={1}>{r.item}</Text> },
          {
            key: 'value',
            header: L.값,
            width: proportional(2, { minWidth: 96 }),
            renderCell: (r) => (
              <VStack gap={0}>
                <Text hasTabularNumbers maxLines={1}>{r.value}</Text>
                {r.same && (
                  <Text type="supporting" color="secondary">
                    {L.동일인} {r.same}
                  </Text>
                )}
                {r.excluded && (
                  <HStack gap={2} vAlign="center">
                    <Text type="supporting" color="secondary">
                      {L.제외}
                    </Text>
                    <Source kind={L.소명} rows={[[L.상태, L.제외]]} />
                  </HStack>
                )}
                {r.until && (
                  <Text type="supporting" color="secondary">
                    {L.이전} ~{r.last}
                  </Text>
                )}
              </VStack>
            ),
          },
          { key: 'since', header: L.변경일, width: pixel(128), renderCell: (r) => <Text hasTabularNumbers textWrap="nowrap">{r.since}</Text> },
          { key: 'known', header: L.인지일, width: pixel(128), renderCell: (r) => (r.known ? <Text hasTabularNumbers textWrap="nowrap">{r.known}</Text> : <Text color="secondary">{L.미상}</Text>) },
          {
            key: 'via',
            header: L.경로,
            width: pixel(120),
            renderCell: (r) => (
              <HStack gap={2} vAlign="center">
                <Text>{r.via}</Text>
                {src(r)}
              </HStack>
            ),
          },
        ]}
      />
    </Region>
  )
}

/** 지급: 귀속월 · 금액 · 상태 · 심사(누르면 그 심사가 열린다) · 출처. 이 앱이 상태를 준 지급은 그 상태와 출처, 손대지 않은 지급은 원본의 값 그대로 */
export function Payouts() {
  const q = useDetailLoad()
  const d = q.data
  const setTarget = useSetAtom(targetAtom)
  if (!d) return <Pending of={q} />
  return (
    <Region title={L.지급} aside={<Badge variant="neutral" label={String(d.payouts.length)} />}>
      <Table<Payout>
        data={d.payouts}
        idKey={(p) => `${p.ym}/${p.amount}/${p.row ?? ''}`}
        density="balanced"
        columns={[
          { key: 'ym', header: L.귀속월, width: pixel(96), renderCell: (p) => <Text hasTabularNumbers>{p.ym}</Text> },
          { key: 'amount', header: L.금액, align: 'end', width: pixel(96), renderCell: (p) => <Text weight="semibold" hasTabularNumbers>{num(p.amount)}</Text> },
          { key: 'status', header: L.상태, width: pixel(72), // 원본의 상태(승인 · 미지급 · 반려)는 글자로, 앱이 정한 지급 상태(재심사 등)만 표지로 — 줄마다 초록이 깔리지 않게
          renderCell: (p) => (p.state ? <State word={p.state} /> : <Text color="secondary">{p.status}</Text>) },
          {
            key: 'review',
            header: L.심사,
            width: proportional(2, { minWidth: 96 }),
            renderCell: (p) =>
              p.review && (
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <Link weight="semibold" onClick={() => setTarget({ kind: L.심사, id: p.review!.id })}>
                    {p.review.name}
                  </Link>
                  {p.review.marks?.map((m) => (
                    <Mark key={m}>{m}</Mark>
                  ))}
                </HStack>
              ),
          },
          // 어느 쪽이든 출처 표지는 원본의 행을 연다
          { key: 'source', header: L.출처, align: 'end', width: pixel(88), renderCell: (p) => src(p.state ? { ...p, source: p.state_source ?? p.source } : p) },
        ]}
      />
    </Region>
  )
}

