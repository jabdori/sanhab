// 추인 기록: 심사 기록(Review)과 같은 틀. 대상은 그룹 × 귀속월 묶음. 머리(묶음 · 귀속월 / 표시 · 승인권자) → 본문(타일 · 재검토 · 심사) → 레일(요약).
// 탭: 내용 | 경위 | 이력. 조치(추인 · 거부 · 종결 · 이견)는 오른쪽 위, 누르면 확인 창에서 사유를 받는다.
import { BuildingStorefrontIcon, UserIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { L } from '../labels'
import { Mark, State } from '../ui/Mark'
import { Meta, RecordPage } from '../ui/Record'
import { Pending } from '../ui/Pending'
import { Region } from '../ui/Region'
import { Again, Past, RatifyActions, RatifyHistory, RatifyTiles, dissent, useBundle } from '../tickets/10-추인'
import { Picture, Timeline } from '../tickets/16-경위'
import { Names } from '../ui/Line'

export function Ratify() {
  const q = useBundle()
  const [bad, setBad] = useState<string | null>(null)
  const b = q.data
  if (!b) return <Pending of={q} page />
  const r = b.ratify
  return (
    <RecordPage
      title={`${r.name} · ${r.ym}`}
      meta={[
        // 묶음에는 상태가 없다: 이견이 남아 종결을 기다리면 그것이 상태(Badge)
        ...(dissent(b) ? [<State word={L.이견} />] : []),
        // 기록 종류(추인)와 같은 표시는 생략
        ...r.marks.filter((m) => m !== L.추인).map((m) => <Mark>{m}</Mark>),
        <Meta icon={UserIcon}>{r.approver}</Meta>,
        <Meta icon={BuildingStorefrontIcon}>{`${b.members.length}${L.곳}`}</Meta>,
      ]}
      actions={<RatifyActions onBad={setBad} />}
      props={[
        [L.승인권자, r.approver],
        [L.귀속월, r.ym],
        [L.구성, <Names list={b.members.map((m) => m.name)} unit={L.곳} />],
      ]}
      bad={bad}
      tabs={[
        {
          value: 'body',
          label: L.내용,
          body: (
            <>
              <RatifyTiles />
              <Again />
              <Past />
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
              <RatifyHistory />
            </Region>
          ),
        },
      ]}
    />
  )
}
