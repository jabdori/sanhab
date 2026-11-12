// 25 조치 카드: 대화 안에 그려지는 조치의 제안. AI는 카드의 내용(대상, 조치, 사유)만 내고, 모양과 버튼은 이 부품으로 고정이다.
// 사유는 사람이 말한 것을 옮겨 적은 것이라 여기서 고칠 수 있고, 사유가 필수인 조치는 채우기 전에는 실행이 눌리지 않는다.
// 실행은 사람이 누른다: 화면에서 직접 한 조치와 같은 경로를 그 사람의 세션으로 부르므로 이력과 경위에 똑같이 남는다. 누른 뒤 끝날 때까지 다시 눌리지 않는다.
// 인정은 되돌리기 어려워 20의 조치처럼 제외될 선과 기간을 보이는 확인 창을 거친다.
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Card as Box } from '@astryxdesign/core/Card'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Text } from '@astryxdesign/core/Text'
import { useState } from 'react'
import { L } from '../../labels'
import { api, useData } from '../../state'
import { Confirm } from '../../ui/Confirm'
import { Reason, ready, sent, type Draft } from '../../ui/Reason'
import { badge, fail } from '../../ui/status'

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
              <Text className="wrap-anywhere">
                {card.kind} {card.name}
              </Text>
            </MetadataListItem>
            <MetadataListItem label={L.조치}>{card.action}</MetadataListItem>
          </MetadataList>
          {done ? (
            <HStack>
              <Badge variant={badge(card.action)} label={card.action} />
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

