// 추인 기록: 심사 기록(Review)과 같은 틀. 대상은 그룹 × 귀속월 묶음. 머리(묶음 · 귀속월 / 표시 · 승인권자) → 본문(타일 · 재검토 · 심사) → 레일(요약).
// 탭: 내용 | 경위 | 이력. 조치(추인 · 거부 · 종결 · 이견)는 오른쪽 위, 누르면 확인 창에서 사유를 받는다.
import { BuildingStorefrontIcon, UserIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { L } from '../labels'
import { Mark } from '../ui/Mark'
import { Meta, RecordPage } from '../ui/Record'
import { Region } from '../ui/Region'
import { Again, Past, RatifyActions, RatifyHistory, RatifyTiles, useBundle } from '../tickets/10-추인'
import { Picture, Timeline } from '../tickets/16-경위'

export function Ratify() {
  const b = useBundle()
  const [bad, setBad] = useState<string | null>(null)
  if (!b) return null
  const r = b.ratify
  return (
    <RecordPage
      title={`${r.name} · ${r.ym}`}
      meta={[
        ...r.marks.map((m) => <Mark>{m}</Mark>),
        <Meta icon={UserIcon}>{r.approver}</Meta>,
        <Meta icon={BuildingStorefrontIcon}>{`${b.members.length}${L.곳}`}</Meta>,
      ]}
      actions={<RatifyActions onBad={setBad} />}
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
