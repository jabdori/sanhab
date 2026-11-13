// 지급 기록: 심사 기록(Review)과 같은 틀. 머리(대리점 · 귀속월 / 상태 · 표시) → 본문(타일 · 대사 · 재심사) → 레일(요약).
// 탭: 내용 | 경위 | 이력(지급 표시와 회신을 일어난 순서대로). 조치는 지급 하나(회신은 시연 서랍).
import { useState } from 'react'
import { Link } from '@astryxdesign/core/Link'
import { store, targetAtom } from '../state'
import { State } from '../ui/Mark'
import { L } from '../labels'
import { Source } from '../ui/Source'
import { Meta, RecordPage } from '../ui/Record'
import { BuildingStorefrontIcon, UserIcon } from '@heroicons/react/24/outline'
import { Region } from '../ui/Region'
import { PayActions } from '../tickets/07-지급'
import { usePay } from '../tickets/07-지급/pay'
import { PayGroup, PayTiles } from '../tickets/07-지급'
import { History, Recon } from '../tickets/08-대사'
import { Why } from '../tickets/14-재심사'
import { Picture, Timeline } from '../tickets/16-경위'


export function Pay() {
  const p = usePay()
  const [bad, setBad] = useState<string | null>(null)
  if (!p) return null
  const { pay } = p
  return (
    <RecordPage
      title={`${pay.name} · ${pay.ym}`}
      meta={[
        <State word={pay.state} />,
        <Meta icon={BuildingStorefrontIcon}>{pay.name}</Meta>,
        <Meta icon={UserIcon}>{p.role}</Meta>,
        <Source kind={pay.source} file={pay.file} row={pay.row} />,
      ]}
      actions={<PayActions onBad={setBad} />}
      // 보조 칸의 요약: 상태 · 대리점 · 귀속월 · 계좌(지금 등록된 것) · 심사(누르면 열린다) · 담당
      props={[
        [L.상태, pay.state],
        [L.대리점, pay.name],
        [L.귀속월, pay.ym],
        [L.계좌, p.accounts.length ? p.accounts.map((a) => a.value).join(' · ') : L.없음],
        [L.심사, <Link onClick={() => store.set(targetAtom, { kind: L.심사, id: pay.review.id })}>{pay.review.name}</Link>],
        [L.담당, p.role],
      ]}
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
              <PayGroup />
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
    />
  )
}
