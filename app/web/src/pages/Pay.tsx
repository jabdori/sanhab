// 지급 기록: 심사 기록(Review)과 같은 틀. 머리(대리점 · 귀속월 / 상태 · 표시) → 본문(타일 · 대사 · 재심사) → 레일(요약).
// 탭: 내용 | 경위 | 이력(지급 표시와 회신을 일어난 순서대로). 조치는 지급 하나(회신은 시연 서랍).
import { Badge } from '@astryxdesign/core/Badge'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Text } from '@astryxdesign/core/Text'
import { useState } from 'react'
import { L } from '../labels'
import { Source } from '../ui/Source'
import { RailCard, RecordPage } from '../ui/Record'
import { Region } from '../ui/Region'
import { badge } from '../ui/status'
import { PayActions } from '../tickets/07-지급'
import { usePay } from '../tickets/07-지급/pay'
import { PayTiles } from '../tickets/07-지급'
import { History, Recon, useRecon } from '../tickets/08-대사'
import { Why } from '../tickets/14-재심사'
import { Picture, Timeline } from '../tickets/16-경위'

/** 레일의 요약: 귀속월 · 담당 · 마지막 지급 표시 */
function Summary() {
  const p = usePay()
  const d = useRecon()
  if (!p) return null
  const last = d?.lines.at(-1)
  return (
    <MetadataList columns="single" label={{ position: 'start', width: 72 }}>
      <MetadataListItem label={L.귀속월}>{p.pay.ym}</MetadataListItem>
      <MetadataListItem label={L.담당}>{p.role}</MetadataListItem>
      <MetadataListItem label={L.결정}>{last ? <Text hasTabularNumbers>{[last.kind, last.at].join(' · ')}</Text> : L.없음}</MetadataListItem>
    </MetadataList>
  )
}

export function Pay() {
  const p = usePay()
  const [bad, setBad] = useState<string | null>(null)
  if (!p) return null
  const { pay } = p
  return (
    <RecordPage
      title={`${pay.name} · ${pay.ym}`}
      meta={[
        <Badge variant={badge(pay.state)} label={pay.state} />,
        <Source kind={pay.source} file={pay.file} row={pay.row} />,
      ]}
      actions={<PayActions onBad={setBad} />}
      bad={bad}
      tabs={[
        {
          value: 'body',
          label: L.내용,
          body: (
            <>
              <PayTiles />
              <Recon />
              <Why />
            </>
          ),
        },
        {
          value: 'trail',
          label: L.경위,
          body: (
            <>
              <Picture />
              <Region title={L.경위}>
                <Timeline />
              </Region>
            </>
          ),
        },
        {
          value: 'history',
          label: L.이력,
          body: (
            <Region title={L.이력}>
              <History />
            </Region>
          ),
        },
      ]}
      rail={
        <RailCard title={L.요약}>
          <Summary />
        </RailCard>
      }
    />
  )
}
