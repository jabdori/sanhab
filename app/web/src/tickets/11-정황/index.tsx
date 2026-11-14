// 11 정황: 정황 기록(pages/Signal)의 본문 영역 — 근거, 관계 — 과 이력, 그리고 심사 기록의 "정황" 줄(Flags). 데이터는 signal.ts의 useSignal().
// 머리·조치·요약은 pages/Signal, AI 보고는 17, 가설은 12, 소명 줄은 18이 그린다. 값은 모두 코드가 기록에서 읽은 것이다(AI의 글은 17).
import { Badge } from '@astryxdesign/core/Badge'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { List, ListItem } from '@astryxdesign/core/List'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { useAtomValue, useSetAtom } from 'jotai'
import { Icon } from '@astryxdesign/core/Icon'
import { UserCircleIcon } from '@heroicons/react/24/outline'
import { L } from '../../labels'
import { targetAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { Mark, State } from '../../ui/Mark'
import { Region } from '../../ui/Region'
import { Relation } from '../../ui/Relation'
import { DECISION, Source } from '../../ui/Source'
import { caution, num, signalDot } from '../../ui/status'
import { useReview } from '../04-심사/review'
import { useReport } from '../17-보고/report'
import { type Evidence as Ev, markAtom, useSignal } from './signal'

type Row = Ev & Record<string, unknown>

/** 근거 표: 정황이 가리키는 기록마다 한 줄 — 무엇, 언제 또는 어느 대리점, 값(식별자 · 금액 · 대사에서 맞지 않은 항목), 출처.
 * 근거 연결(17 보고의 사실 ↗)이 가리킨 줄은 첫 칸에 theme.css의 `.mark`(잠깐 노랗게)를 건다 — astryx Table에 줄 강조가 없어 칸 안에서 보인다.
 * 날짜(귀속월)와 대리점은 뜻이 다르니 열을 나누고, 한쪽이 아예 없으면 그 열을 두지 않는다 */
export function Evidence() {
  const d = useSignal()
  const picked = useAtomValue(markAtom)
  if (!d) return null
  const rows = d.evidence as Row[]
  const nodes = rows.some((e) => e.node)
  const amounts = rows.every((e) => e.amount != null)
  const dated = (e: Ev) => e.at || e.ym
  const hasDate = rows.some(dated)
  const hasDealer = rows.some((e) => !dated(e) && e.dealer)
  const when = rows.filter(dated).every((e) => e.ym && !e.at) ? L.귀속월 : L.날짜
  return (
    <Region title={L.근거} aside={<Badge variant="neutral" label={String(rows.length)} />}>
      {rows.length ? (
        <Table<Row>
          data={rows}
          idKey="id"
          density="balanced"
          columns={[
            {
              key: 'item',
              header: L.근거,
              width: pixel(112),
              renderCell: (e) => (
                <HStack gap={2} vAlign="center" className={e.id === picked ? 'mark' : undefined}>
                  <Text weight="semibold" className="whitespace-nowrap">{e.item}</Text>
                  {d.fresh.includes(e.id) && <Mark>{L.새}</Mark>}
                </HStack>
              ),
            },
            // 날짜(귀속월)와 대리점은 뜻이 다르니 열을 나눈다. 한쪽이 아예 없으면 그 열을 두지 않는다
            ...(hasDate
              ? [
                  {
                    key: 'at',
                    header: when,
                    width: rows.some((e) => e.known) ? proportional(3, { minWidth: 168 }) : proportional(2, { minWidth: 104 }),
                    renderCell: (e: Row) =>
                      e.known ? (
                        <HStack gap={2} vAlign="center" wrap="wrap">
                          <Text hasTabularNumbers>{`${L.변경일} ${e.at}`}</Text>
                          <Text color="secondary" hasTabularNumbers>{`${L.인지일} ${e.known}`}</Text>
                          <Badge variant={caution} label={`${e.days}${L.일}`} />
                          <Source kind={L.계산} tip={`${L.지연} ${e.days}${L.일}`} rows={[[L.지연, `${e.days}${L.일}`]]} />
                        </HStack>
                      ) : (
                        <Text hasTabularNumbers>{dated(e)}</Text>
                      ),
                  },
                ]
              : []),
            ...(hasDealer ? [{ key: 'dealer', header: L.대리점, width: proportional(2, { minWidth: 96 }), renderCell: (e: Row) => !dated(e) && e.dealer && <Text>{e.dealer.name}</Text> }] : []),
            {
              key: 'value',
              header: nodes ? L.식별자 : amounts ? L.금액 : L.비교,
              align: !nodes && amounts ? 'end' : undefined,
              width: proportional(2, { minWidth: 128 }),
              renderCell: (e) =>
                // 대사: 무엇이 달랐는지 + 차액 + 돈이 들어간 계좌(누구의 등록 계좌인지)
                e.want && e.got ? (
                  <VStack gap={0.5}>
                    <Text hasTabularNumbers>{[e.value, e.got.amount !== e.want.amount ? `${L.차액} ${num(e.got.amount - e.want.amount)}` : null].filter(Boolean).join(' · ')}</Text>
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {`${L.회신} ${e.got.account} · ${e.got.owner ?? L['등록 없음']}`}
                    </Text>
                  </VStack>
                ) : (
                  <Text hasTabularNumbers>{e.node?.name ?? (e.amount == null ? e.value : num(e.amount))}</Text>
                ),
            },
            {
              key: 'source',
              header: L.출처,
              align: 'end',
              width: pixel(88),
              renderCell: (e) => (
                <Source
                  kind={e.source}
                  file={e.file ?? undefined}
                  row={e.row ?? undefined}
                  tip={e.value ?? undefined}
                  rows={e.want && e.got ? [[L.승인, [num(e.want.amount), ...e.want.accounts].join(' · ')], [L.회신, [num(e.got.amount), e.got.account].join(' · ')], [L.비교, e.value ?? '']] : undefined}
                />
              ),
            },
          ]}
        />
      ) : (
        <Empty />
      )}
    </Region>
  )
}

/** 관계 그림: 대상 대리점이 왼쪽, 근거의 사람·주소·계좌가 가운데. 점선은 등록이 아닌 이어짐(회수가 들어간 계좌). 같은 내용은 근거 표에 있다 */
export function Links() {
  const d = useSignal()
  if (!d) return null
  return <Region title={L.관계}>{d.relation.mid.length ? <Relation {...d.relation} /> : <Empty />}</Region>
}

/** 이력: 요청 · 기각과 보고의 채택 · 불채택(17)을 일어난 순서대로. 역할의 Avatar · 결정 / 사유 / 날짜 */
export function History() {
  const d = useSignal()
  const r = useReport()
  if (!d) return null
  const all = [...d.history.map((h) => ({ ...h, stamp: (h as { stamp?: string }).stamp ?? '' })), ...(r?.trail ?? [])].sort((a, b) => a.stamp.localeCompare(b.stamp))
  if (!all.length) return <Empty />
  return (
    <List density="spacious">
      {all.map((h, i) => (
        <ListItem
          key={i}
          align="start"
          startContent={<Icon icon={UserCircleIcon} size="md" color="secondary" />}
          label={`${h.kind} · ${h.role}`}
          description={[h.reason?.class ?? `${L.사유} ${L.없음}`, h.reason?.memo, h.source === L.원본 ? L.원본 : null].filter(Boolean).join(' · ')}
          endContent={h.at ? <Text type="supporting" color="secondary" hasTabularNumbers>{h.at}</Text> : <Text type="supporting" color="secondary">{L.미상}</Text>}
        />
      ))}
    </List>
  )
}

/** 심사 상세의 "정황": 그 심사의 구성원에 걸린 정황. 누르면 그 정황이 열린다. 표시가 붙은 심사에만 보인다 */
export function Flags() {
  const r = useReview()?.review
  const on = r?.marks.includes(L.정황)
  const list = useData<{ id: string; kind: string; name: string; state: string }[]>(r && on ? `/reviews/${r.id}/signals` : null)
  const setTarget = useSetAtom(targetAtom)
  if (!on || !list) return null
  // ItemWithMetadata 꼴: 주의 점 · 정황 이름 / 종류 · 상태 Badge. 누르면 그 정황이 열린다. 기준이 가정인 종류(근접 D51, 지연 D30)는 그 가정의 표지
  return (
    <Region title={L.정황} aside={<Badge variant="neutral" label={String(list.length)} />}>
      <List density="balanced" hasDividers>
        {list.map((s) => (
          <ListItem
            key={s.id}
            label={s.name}
            startContent={<StatusDot variant={signalDot(s.state)} label={s.state} />}
            endContent={
              <HStack gap={2} vAlign="center">
                {DECISION[s.kind] && <Source kind={L.가정} of={s.kind} />}
                <State word={s.state} />
              </HStack>
            }
            onClick={() => setTarget({ kind: L.정황, id: s.id })}
          />
        ))}
      </List>
    </Region>
  )
}

