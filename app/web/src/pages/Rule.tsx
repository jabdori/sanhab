// 규정 기록: astryx detail-page 템플릿 꼴(ui/Record). 머리(← 규정 / 조항 / 위치 · 출처 / 모의) → 내용(모의 결과 · 조항 · 규칙 · 가정 · AI) → 레일(요약).
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Text } from '@astryxdesign/core/Text'
import { DocumentTextIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { L } from '../labels'
import { Meta, RailCard, RecordPage, Tiles } from '../ui/Record'
import { Source } from '../ui/Source'
import { Assumes, Original, Uses, Versions, useClause, where } from '../tickets/22-규정'
import { Result, Simulate } from '../tickets/23-모의'

export function Rule() {
  const c = useClause()
  const [bad, setBad] = useState<string | null>(null)
  if (!c) return null
  const { clause, rules, d } = c
  return (
    <RecordPage
      title={clause.title}
      meta={[
        <Meta icon={DocumentTextIcon}>{clause.file}</Meta>,
        <Source kind={clause.source} tip={where(clause)} place={`${clause.first}–${clause.last}${L.행}`} rows={[[L.위치, where(clause)], [L.해시, clause.sha]]} />,
      ]}
      actions={<Simulate target={clause.title} onBad={setBad} />}
      bad={bad}
      tabs={[
        {
          value: 'body',
          label: L.내용,
          body: (
            <>
              <Tiles items={[{ name: L.규칙, value: rules.length }, { name: L.가정, value: d.assumes.length }]} />
              <Result />
              <Original />
              <Versions />
              <Assumes />
              <Uses />
            </>
          ),
        },
      ]}
      rail={
        <RailCard title={L.요약}>
          <MetadataList columns="single" label={{ position: 'start', width: 72 }}>
            <MetadataListItem label={L.규칙}>{rules.map((r) => `${r.name} v${r.ver}`).join(' · ') || <Text color="secondary">{L.없음}</Text>}</MetadataListItem>
            <MetadataListItem label={L.위치}>{where(clause)}</MetadataListItem>
          </MetadataList>
        </RailCard>
      }
    />
  )
}
