import { Source } from '../ui/Source'
// 규정 기록: astryx detail-page 템플릿 꼴(ui/Record). 머리(← 규정 / 조항 / 위치 · 출처 / 모의) → 탭 내용(모의 결과 · 조항 · 규칙) | 가정(가정 · 쓰임).
import { DocumentTextIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { L } from '../labels'
import { Pending } from '../ui/Pending'
import { Meta, RecordPage, Tiles } from '../ui/Record'
import { Assumes, Original, Uses, Versions, useClause, place, where } from '../tickets/22-규정'
import { Result, Simulate } from '../tickets/23-모의'

export function Rule() {
  const q = useClause()
  const c = q.data
  const [bad, setBad] = useState<string | null>(null)
  if (!c) return <Pending of={q} page />
  const { clause, rules, d } = c
  return (
    <RecordPage
      title={clause.title}
      meta={[]}
      actions={<Simulate target={clause.title} onBad={setBad} />}
      props={[
        // 위치는 문서 이름 · 행. 누르면 원본(파일 경로 · 해시는 설명 칸에)
        [L.위치, <Source kind={clause.source} tip={clause.title} place={place(clause)} rows={[[L.위치, where(clause)], [L.해시, clause.sha]]} />],
        [L.규칙, rules.map((x) => x.name).join(' · ') || L.없음],
      ]}
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
            </>
          ),
        },
        {
          value: 'assume',
          label: L.가정,
          body: (
            <>
              <Assumes />
              <Uses />
            </>
          ),
        },
      ]}
    />
  )
}
