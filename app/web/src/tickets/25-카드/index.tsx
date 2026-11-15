// 25 조치 카드: 대화 안에 그려지는 조치의 제안. AI는 카드의 내용(대상, 조치, 사유)만 내고, 모양과 버튼은 이 부품으로 고정이다.
// 사유는 사람이 말한 것을 옮겨 적은 것이라 여기서 고칠 수 있고, 사유가 필수인 조치는 채우기 전에는 실행이 눌리지 않는다.
// 실행은 사람이 누른다: 화면에서 직접 한 조치와 같은 경로를 그 사람의 세션으로 부르므로 이력과 경위에 똑같이 남는다. 누른 뒤 끝날 때까지 다시 눌리지 않는다.
// 인정은 되돌리기 어려워 20의 조치처럼 제외될 선과 기간을 보이는 확인 창을 거친다.
// 화면 부품(Surface): AI가 show 도구로 낸 A2UI v0.8 표면을 앱의 부품 목록(catalog) 그대로 astryx로 그린다. 보기만 한다 — 단추와 조치는 위의 카드에만 있다.
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Card as Box } from '@astryxdesign/core/Card'
import { List, ListItem } from '@astryxdesign/core/List'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Table, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { useState, type ReactNode } from 'react'
import { State } from '../../ui/Mark'
import { L } from '../../labels'
import { api, store, targetAtom, useData, type Target } from '../../state'
import { Confirm } from '../../ui/Confirm'
import { Reason, ready, sent, type Draft } from '../../ui/Reason'
import { fail } from '../../ui/status'

/** 서버가 `data-card`로 보내는 카드: 대상(종류, 이름), 조치, 사유가 필수인지와 고를 수 있는 분류, 옮겨 적은 사유, 실행이 부를 경로 */
export type CardData = {
  kind: string
  id: string
  name: string
  action: string
  must: boolean
  classes: string[]
  class: string | null
  memo: string | null
  run: { path: string; body: Record<string, unknown> }
}

/** 인정의 확인 창: 제외될 선과 기간(20의 결과 경로가 주는 값) */
function Excluded({ id }: { id: string }) {
  const v = useData<{ span: [string, string] | null; lines: { item: string; value: string }[] }>(`/clarifies/${encodeURIComponent(id)}/verdict`)
  if (!v) return null
  return (
    <VStack gap={3}>
      <Text type="supporting">{L.제외}</Text>
      <MetadataList label={{ width: 72 }}>
        {v.lines.length ? (
          v.lines.map((l, i) => (
            <MetadataListItem key={i} label={l.item}>
              {l.value}
            </MetadataListItem>
          ))
        ) : (
          <MetadataListItem label={L.제외}>{L['제외 없음']}</MetadataListItem>
        )}
        <MetadataListItem label={L.기간}>
          <Text hasTabularNumbers>{v.span ? `${v.span[0]} ~ ${v.span[1]}` : L.미상}</Text>
        </MetadataListItem>
      </MetadataList>
    </VStack>
  )
}

export function Card({ card }: { card: CardData }) {
  const [draft, setDraft] = useState<Draft>({ of: card.action, class: card.class ?? '', memo: card.memo ?? '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [bad, setBad] = useState<string | null>(null)
  const go = () => {
    setBusy(true)
    setBad(null)
    api(card.run.path, { ...card.run.body, reason: sent(draft) ?? undefined }).then(
      () => setDone(true),
      (e: Error) => {
        setBad(e.message)
        setBusy(false)
      },
    )
  }
  const off = busy || !ready(card.action, card.must, draft)
  return (
      <Box variant="muted" padding={3} width="100%" aria-label={L['조치 카드']}>
        <VStack gap={3}>
          <Text type="supporting">{L['조치 카드']}</Text>
          <MetadataList label={{ width: 72 }}>
            <MetadataListItem label={L.대상}>
              <Text>
                {card.kind} {card.name}
              </Text>
            </MetadataListItem>
            <MetadataListItem label={L.조치}>{card.action}</MetadataListItem>
          </MetadataList>
          {done ? (
            <HStack>
              <State word={card.action} />
            </HStack>
          ) : (
            <>
              <Reason groups={[{ of: card.action, classes: card.classes }]} value={draft} onChange={setDraft} />
              <HStack gap={2} vAlign="center" wrap="wrap">
                {card.action === L.인정 ? (
                  // 인정은 되돌리기 어려워 제외될 선과 기간을 보이는 확인 창을 거친다. 창의 실행 버튼은 결과의 낱말
                  <Confirm trigger={L.실행} label={card.action} variant="primary" title={`${card.action} ${card.name}`} isDisabled={off} onConfirm={go}>
                    <Excluded id={card.id} />
                  </Confirm>
                ) : (
                  <Button label={L.실행} variant="primary" isDisabled={off} onClick={go} />
                )}
                {bad && <Badge variant={fail} label={bad} />}
              </HStack>
            </>
          )}
        </VStack>
      </Box>
  )
}

/** 앱의 A2UI 부품 목록(서버 t25_card.rs의 CATALOG와 같다). 서버가 검사해 허락한 칸만 온다 */
type Part = {
  Column?: { children: { explicitList: string[] } }
  Text?: { text: { literalString: string } }
  Facts?: { title: string | null; items: { label: string; value: string }[] }
  Table?: { title: string | null; columns: string[]; rows: string[][] }
  Records?: { title: string | null; items: { record: string; name: string; go: Target | null }[] }
}
/** 서버가 `data-a2ui`로 보내는 A2UI v0.8 메시지(surfaceUpdate · beginRendering) */
export type A2ui = { surfaceUpdate?: { surfaceId: string; components: { id: string; component: Part }[] }; beginRendering?: { surfaceId: string; root: string } }

/** 부품 위의 이름(조치 카드의 이름 줄과 같은 꼴) */
const titled = (key: string, title: string | null, body: ReactNode) => (
  <VStack key={key} gap={2}>
    {title && <Text type="supporting">{title}</Text>}
    {body}
  </VStack>
)

/** A2UI 표면: Column → VStack · Text → Text · Facts → MetadataList · Table → Table(ui/Compare 꼴: 첫 열 굵게, 수는 고른 폭) · Records → List(누르면 그 기록을 연다) */
export function Surface({ messages }: { messages: A2ui[] }) {
  const parts = new Map(messages.flatMap((m) => m.surfaceUpdate?.components ?? []).map((c) => [c.id, c.component]))
  const draw = (id: string): ReactNode => {
    const c = parts.get(id)
    if (c?.Column) return <VStack key={id} gap={3}>{c.Column.children.explicitList.map(draw)}</VStack>
    if (c?.Text) return <Text key={id}>{c.Text.text.literalString}</Text>
    if (c?.Facts)
      return titled(
        id,
        c.Facts.title,
        <MetadataList label={{ width: 72 }}>
          {c.Facts.items.map((i, n) => (
            <MetadataListItem key={n} label={i.label}>
              <Text hasTabularNumbers>{i.value}</Text>
            </MetadataListItem>
          ))}
        </MetadataList>,
      )
    if (c?.Table) {
      const t = c.Table
      const data = t.rows.map((r, n) => ({ n, ...Object.fromEntries(r.map((v, i) => [`c${i}`, v])) }) as Record<string, string | number>)
      return titled(
        id,
        t.title,
        <Table<Record<string, string | number>>
          data={data}
          idKey="n"
          density="balanced"
          columns={t.columns.map((h, i) => ({ key: `c${i}`, header: h, width: proportional(1, { minWidth: 80 }), renderCell: (r) => <Text weight={i === 0 ? 'semibold' : undefined} hasTabularNumbers>{r[`c${i}`]}</Text> }))}
        />,
      )
    }
    if (c?.Records)
      return titled(
        id,
        c.Records.title,
        <List hasDividers>
          {c.Records.items.map((i) => {
            const go = i.go
            return <ListItem key={i.record} label={i.name || i.record} description={go?.kind} onClick={go ? () => store.set(targetAtom, go) : undefined} />
          })}
        </List>,
      )
    return null
  }
  const root = messages.find((m) => m.beginRendering)?.beginRendering?.root
  return root ? draw(root) : null
}
