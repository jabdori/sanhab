// astryx template: detail-page — AI 보고는 사실 영역 아래 떠 있는 카드(AiCard, D63)
// 17 보고: 정황 기록(pages/Signal)의 레일 "AI 보고" 칸. AI가 쓴 글은 여기에만 있다(본문에는 없다).
// 머리에 AI(누르면 실행 기록)와 상태 Badge. 식별자(대표자 · 주소 · 계좌) 사실은 대리점끼리 비교 표, 나머지는 목록. 사실의 값은 코드가 가리킨 기록에서 값을 채운 것이고 끝의 연결(↗)을 누르면 본문 근거 표의 그 줄이 강조된다.
// 의견·반론도 처음부터 펼쳐 둔다(정황에 조치를 내리기 전에는 의견이 잠겨 있다). 확신을 숫자로 적지 않는다.
// 채택·불채택은 조치와 따로 남고 둘 다 secondary(같은 무게). 확인 창 없이 누르면 바로 결정 — 불채택은 사유 칸이 열리고 그 안에서 결정한다.
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { List, ListItem } from '@astryxdesign/core/List'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Table, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { useSetAtom } from 'jotai'
import { type ReactNode, useEffect, useState } from 'react'
import { Done, State } from '../../ui/Mark'
import { L } from '../../labels'
import { api, store } from '../../state'
import { Empty } from '../../ui/Empty'
import { grade } from '../../ui/grade'
import { Reason, blank, ready, sent } from '../../ui/Reason'
import { reveal } from '../../ui/Region'
import { Source } from '../../ui/Source'
import { fail } from '../../ui/status'
import { type Signal, markAtom } from '../11-정황/signal'
import { type Fact, type Report, tickAtom } from './report'

/** 근거 연결: 누르면 본문 근거 표의 그 줄로 가서 2.4초 동안 강조한다. 표에 없는 사실이면 근거 영역으로 */
function show(ref: string) {
  reveal(L.근거, ref)
  store.set(markAtom, ref)
  setTimeout(() => store.get(markAtom) === ref && store.set(markAtom, null), 2400)
}

const Part = ({ name, children }: { name: string; children: ReactNode }) => (
  <VStack gap={1}>
    <Text type="supporting" color="secondary" weight="medium">
      {name}
    </Text>
    {children}
  </VStack>
)

/** 줄마다 한 항목(긴 글이 칸을 넘지 않게 어디서든 줄을 바꾼다) */
const Lines = ({ list }: { list: string[] }) =>
  list.length ? (
    <List density="compact">
      {list.map((t, i) => (
        <ListItem key={i} label={<Text>{t}</Text>} />
      ))}
    </List>
  ) : (
    <Empty />
  )

/** 머리: AI 표지(누르면 실행 기록), 상태 Badge, 조사(내부 감시에게. 요청이 끝날 때까지 다시 눌리지 않는다). 대기인 보고는 AI가 쓰는 동안 몇 초마다 다시 읽는다 */
export function Head({ d, signal }: { d: Report; signal: Signal }) {
  const bump = useSetAtom(tickAtom)
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState<string | null>(null)
  const id = signal.signal.id
  const waiting = !d.report || d.report.state === L.대기
  useEffect(() => {
    setBad(null)
  }, [id])
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => bump((n) => n + 1), 3000)
    return () => clearInterval(t)
  }, [waiting, bump])
  const r = d.report
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      <Source kind={L.AI} tip={L.보고} rows={[[L.모델, r?.model ?? L.없음], [L.날짜, r?.at ?? L.없음], [L.조회, String(r?.reads ?? L.없음)]]} />
      <StackItem size="fill">
        <State word={r?.state ?? L.대기} />
      </StackItem>
      {d.run && (
        <Button
          label={L.조사}
          variant="secondary"
          size="sm"
          isDisabled={busy}
          onClick={() => {
            setBusy(true)
            setBad(null)
            api('/investigate', { id })
              .then(() => undefined, (e: Error) => setBad(e.message))
              .finally(() => setBusy(false))
          }}
        />
      )}
      {bad && <Badge variant={fail} label={bad} />}
    </HStack>
  )
}

/** 근거 연결(↗): 근거 표에 줄이 없는 사실(주소 · 계좌의 등록 등)은 가리킬 줄이 없어 연결을 두지 않는다 */
const Go = ({ f, signal }: { f: Fact; signal?: Signal }) =>
  signal?.evidence.some((e) => e.id === f.ref) ? (
    <Link aria-label={L.근거} color="primary" onClick={() => show(f.ref)}>
      ↗
    </Link>
  ) : null

const ITEMS: string[] = [L.대표자, L.주소, L.계좌]
type Row = { item: string; cells: Record<string, Fact> } & Record<string, unknown>

/** 사실: 식별자 기록(대표자 · 주소 · 계좌)을 가리킨 사실이 두 대리점 이상이면 비교 표(줄 = 항목, 열 = 대리점, 끝 열 일치 — 기록 값의 비교이지 AI 판단이 아니다).
 * 나머지 사실(지급 · 회수 · 변경 …)은 목록. 한 대리점의 같은 항목을 둘 가리켰으면 칸이 겹쳐 표로 묶지 않는다 */
function Facts({ facts, signal }: { facts: Fact[]; signal?: Signal }) {
  const ids = facts.filter((f) => f.id && ITEMS.includes(f.id.item))
  const dealers = [...new Map(ids.map((f) => [f.id!.dealer.id, f.id!.dealer])).values()]
  const rows: Row[] = ITEMS.map((item) => ({ item, cells: Object.fromEntries(ids.filter((f) => f.id!.item === item).map((f) => [f.id!.dealer.id, f])) })).filter((r) => Object.keys(r.cells).length)
  const table = ids.length >= 2 && dealers.length >= 2 && rows.reduce((n, r) => n + Object.keys(r.cells).length, 0) === ids.length
  const rest = table ? facts.filter((f) => !ids.includes(f)) : facts
  // 모든 대리점에 값이 있어야 비교한다(빠진 칸이 있으면 없음)
  const same = (r: Row) => {
    const v = dealers.map((d) => r.cells[d.id]?.id?.value)
    return v.some((x) => !x) ? null : v.every((x) => x === v[0])
  }
  return (
    <VStack gap={2}>
      {table && (
        // 표가 카드 안 줄 사이에 있다: Table은 상자의 첫 · 끝 자식이면 위아래로 카드 여백(spacing 4)만큼 번진다(앞의 이름표 · 뒤의 추정을 덮음). 같은 여백을 주어 번짐을 받아 낸다(옆으로는 카드 끝까지 번진 그대로)
        <VStack paddingBlock={4}>
          <Table<Row>
            data={rows}
            idKey="item"
            density="compact"
            columns={[
              { key: 'item', header: L.항목, width: proportional(1, { minWidth: 64 }), renderCell: (r) => <Text weight="semibold">{r.item}</Text> },
              ...dealers.map((d) => ({
                key: d.id,
                header: d.name,
                width: proportional(2, { minWidth: 96 }),
                renderCell: (r: Row) => {
                  const f = r.cells[d.id]
                  return f ? (
                    <HStack gap={1} vAlign="start">
                      <Text hasTabularNumbers>{f.id!.value ?? L.없음}</Text>
                      <Go f={f} signal={signal} />
                    </HStack>
                  ) : (
                    <Text color="secondary">{L.없음}</Text>
                  )
                },
              })),
              {
                key: 'same',
                header: L.일치,
                width: proportional(1, { minWidth: 64 }),
                renderCell: (r) => {
                  const s = same(r)
                  return s ? <Done word={L.같음} /> : <Text color="secondary">{s === null ? L.없음 : L.다름}</Text>
                },
              },
            ]}
          />
        </VStack>
      )}
      {rest.length > 0 && (
        <List density="compact">
          {rest.map((f, i) => (
            <ListItem key={i} label={<Text>{f.text}</Text>} endContent={<Go f={f} signal={signal} />} />
          ))}
        </List>
      )}
    </VStack>
  )
}

/** 사실 / 추정 / 미확인 / 의견·반론: 정황 기록과 심사 기록의 AI 카드가 같은 꼴로 쓴다. 올라와 있는(검토·채택·불채택) 보고에만 내용이 있다.
 * `signal`이 있으면(정황 기록) 사실 끝에 근거 연결(↗)이 있고, 채택 · 불채택 단추는 의견을 펼친 몸통 안에 있다. 없으면(심사 기록) 읽기만 */
export function Body({ d, signal }: { d: Report; signal?: Signal }) {
  const r = d.report
  // 올라오지 않은(오류 · 대기) 보고는 내용이 없다: 제목만 있는 카드 대신 빈 자리
  if (!r || !r.facts.length) return <Empty />
  return (
    <VStack gap={3}>
      <Part name={L.사실}>
        <Facts facts={r.facts} signal={signal} />
      </Part>
      <Part name={L.추정}>
        <Lines list={r.guess} />
      </Part>
      <Part name={L.미확인}>
        <Lines list={r.unknown} />
      </Part>
      {/* 의견이 열리면(조치 뒤) 펼친 채로 다시 그린다 */}
      <Collapsible key={String(d.opened)} trigger={<Text type="supporting" color="secondary" weight="medium">{L.의견}</Text>} defaultIsOpen={d.opened} isDisabled={!d.opened}>
        <VStack gap={3}>
          {r.opinion && (
            <VStack gap={1}>
              <HStack gap={2} vAlign="center">
                <Text type="supporting" color="secondary">{L.조치}</Text>
                <Text weight="semibold">{r.opinion.action}</Text>
              </HStack>
              <Text>{r.opinion.text}</Text>
            </VStack>
          )}
          {r.counter && (
            <Part name={L.반론}>
              <Text>{r.counter}</Text>
            </Part>
          )}
          {signal && <Adopt d={d} />}
        </VStack>
      </Collapsible>
    </VStack>
  )
}

/** 채택 · 불채택: 같은 무게의 버튼(둘 다 secondary), 확인 창 없이 바로 결정. 사유가 필수인 조치(불채택)는 누르면 사유 칸이 열리고 그 안의 단추로 결정한다. 서버가 거절하면 그 낱말 */
function Adopt({ d }: { d: Report }) {
  const [bad, setBad] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 사유 칸이 열린 조치와 쓰고 있는 사유
  const [open, setOpen] = useState<Report['actions'][number] | null>(null)
  const [draft, setDraft] = useState(blank)
  const id = d.report?.id
  useEffect(() => {
    setBad(null)
    setOpen(null)
    setDraft(blank)
  }, [id])
  if (!d.report || !d.actions.length) return null
  const go = (kind: string, reason: object | null) => {
    setBusy(true)
    setBad(null)
    api('/adopt', { id, kind, reason: reason ?? undefined })
      .then(() => (setOpen(null), setDraft(blank)), (e: Error) => setBad(e.message))
      .finally(() => setBusy(false))
  }
  return (
    <VStack gap={2}>
      {open ? (
        <VStack gap={2}>
          <Reason groups={[{ of: open.kind, classes: open.classes }]} value={draft} onChange={setDraft} />
          <HStack gap={2} hAlign="end">
            <Button label={L.취소} variant="secondary" isDisabled={busy} onClick={() => (setOpen(null), setDraft(blank))} />
            <Button label={open.kind} variant={grade(open.kind)} isLoading={busy} isDisabled={!ready(open.kind, true, draft)} onClick={() => go(open.kind, sent(draft))} />
          </HStack>
        </VStack>
      ) : (
        <HStack gap={2} vAlign="center" wrap="wrap">
          {d.actions.map((a) => (
            <Button key={a.kind} label={a.kind} variant={grade(a.kind)} isDisabled={busy} onClick={() => (a.reason ? (setDraft({ ...blank, of: a.kind }), setOpen(a)) : go(a.kind, null))} />
          ))}
        </HStack>
      )}
      {bad && <Badge variant={fail} label={bad} />}
    </VStack>
  )
}

/** 남은 결정(채택 · 불채택 — 결정 자체는 카드 머리의 상태 Badge): 이름표-값 줄 — AI 의견(보고의 의견이 고른 조치) · 조치(내부 감시가 정황에 내린 조치) · 일치(둘이 같은가) · 결정(한 역할) · 날짜, 사유가 있으면 사유 · 메모(값 하나에 사실 하나, review.md 2-1) */
export function Decide({ d }: { d: Report }) {
  const x = d.decision
  if (!d.report || !x) return null
  const rows: [string, string | null | undefined][] = [
    [`${L.AI} ${L.의견}`, x.opinion ?? L.없음],
    [L.조치, x.acted ?? L.없음],
    [L.일치, x.same == null ? L.없음 : x.same ? L.같음 : L.다름],
    [L.결정, x.role],
    [L.날짜, x.at ?? L.미상],
    [L.사유, x.reason?.class],
    [L.메모, x.reason?.memo],
  ]
  return (
    <MetadataList columns="single" label={{ position: 'start', width: 96 }}>
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <MetadataListItem key={k} label={k}>
          <Text hasTabularNumbers>{v}</Text>
        </MetadataListItem>
      ))}
    </MetadataList>
  )
}
