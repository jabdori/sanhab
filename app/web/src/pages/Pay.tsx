import { useRecon } from '../tickets/08-대사'
// 지급 기록: 심사 기록(Review)과 같은 틀. 머리(대리점 · 귀속월 / 상태 · 표시) → 본문(타일 · 대사 · 재심사) → 레일(요약).
// 탭: 내용 | 경위 | 이력(지급 표시와 회신을 일어난 순서대로). 조치는 지급 하나(회신은 시연 서랍).
import { type ReactNode, useState } from 'react'
import { Link } from '@astryxdesign/core/Link'
import { store, targetAtom } from '../state'
import { State } from '../ui/Mark'
import { plain } from '../ui/status'
import { L } from '../labels'
import { Meta, RecordPage } from '../ui/Record'
import { BuildingStorefrontIcon, UserIcon } from '@heroicons/react/24/outline'
import { Pending } from '../ui/Pending'
import { Region } from '../ui/Region'
import { PayActions } from '../tickets/07-지급'
import { usePay } from '../tickets/07-지급/pay'
import { PayGroup, PayTiles } from '../tickets/07-지급'
import { History, Recon } from '../tickets/08-대사'
import { Why } from '../tickets/14-재심사'
import { Picture, Timeline } from '../tickets/16-경위'


export function Pay() {
  const pq = usePay()
  const rc = useRecon().data
  const [bad, setBad] = useState<string | null>(null)
  const p = pq.data
  if (!p) return <Pending of={pq} page />
  const { pay } = p
  // 돈은 나갔어도(완료) 대사가 불일치면 머리 · 요약은 불일치(오류)로 — 초록 완료로 끝난 것처럼 보이지 않게
  const off = rc?.recon?.verdict === L.불일치
  const shown = off ? L.불일치 : pay.state
  return (
    <RecordPage
      title={`${pay.name} · ${pay.ym}`}
      meta={[
        <State word={shown} />,
        <Meta icon={BuildingStorefrontIcon}>{pay.name}</Meta>,
        <Meta icon={UserIcon}>{p.role}</Meta>,
      ]}
      actions={<PayActions onBad={setBad} />}
      // 보조 칸의 요약: 상태 · 대리점 · 귀속월 · 계좌(지금 등록된 것) · 심사(누르면 열린다) · 담당
      props={[
        // 대사 불일치: 상태는 불일치 하나로(돈이 나갔다는 것은 대사 표의 회신에)
        [L.상태, plain(shown) ? shown : <State word={shown} />],
        [L.대리점, pay.name],
        [L.귀속월, pay.ym],
        [L.계좌, p.accounts?.length ? p.accounts.map((a) => a.value).join(' · ') : L.없음],
        // 심사를 볼 수 없는 역할에는 심사 줄 자체가 오지 않는다
        ...(pay.review ? [[L.심사, <Link onClick={() => store.set(targetAtom, { kind: L.심사, id: pay.review.id })}>{pay.review.name}</Link>] as [string, ReactNode]] : []),
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
