// 대리점 기록: astryx detail-page 템플릿 꼴(ui/Record). 머리(← 대리점 / 이름 / 식별자 · 그룹 · 출처 / 변경) → 내용(타일 · 등록 · 관계 · 지급 · 서류 · 접수) · 이력 → 레일(요약).
import { HStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { UserGroupIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { L } from '../labels'
import { useData } from '../state'
import { Meta, RecordPage, Tiles } from '../ui/Record'
import { Region } from '../ui/Region'
import { Source } from '../ui/Source'
import { num } from '../ui/status'
import { Payouts, RegisteredRegion, useDetail } from '../tickets/02-대리점'
import { Links, useRelated } from '../tickets/03-관련자'
import { Change, History } from '../tickets/13-변경'
import { OfDealer } from '../tickets/19-서류'
import { Intake } from '../tickets/20-소명'

/** 판단의 재료 타일: 관련자 · 지급 · 금액(지급의 합) */
function DealerTiles() {
  const d = useDetail()
  const rel = useRelated()
  if (!d) return null
  return (
    <Tiles
      items={[
        { name: L.관련자, value: rel ? rel.near.filter((n) => n.related).length : '', below: rel && rel.group.length > 1 && <Text type="supporting" color="secondary">{`${L.그룹} ${rel.group.length}`}</Text> },
        { name: L.지급, value: d.payouts.length },
        { name: L.금액, value: num(d.payouts.reduce((n, p) => n + p.amount, 0)) },
      ]}
    />
  )
}

/** 접수: 영업지원이 일치하는 대리점이 있을 때만(서버가 정한다) */
function IntakeRegion() {
  const d = useDetail()
  const rel = useData<{ id: string; can: boolean; near: unknown[] }>(d ? `/dealers/${encodeURIComponent(d.dealer.id)}/clarify` : null)
  if (!d || rel?.id !== d.dealer.id || !rel.can || !rel.near.length) return null
  // Intake 자체가 제목 달린 영역(Region)이다
  return <Intake />
}


export function Dealer() {
  const d = useDetail()
  const rel = useRelated()
  const [bad, setBad] = useState<string | null>(null)
  if (!d) return null
  const v = d.dealer
  return (
    <RecordPage
      title={v.name}
      meta={[
        <Text type="supporting" color="secondary" hasTabularNumbers>{v.id}</Text>,
        rel && rel.group.length > 1 && <Meta icon={UserGroupIcon}>{rel.group.map((g) => g.name).join(' · ')}</Meta>,
        <HStack gap={1}><Source kind={v.source} file={v.file} row={v.row} /></HStack>,
      ]}
      actions={<Change onBad={setBad} />}
      // 보조 칸의 요약: 지금 유효한 등록값(대표자 · 주소 · 계좌)과 그룹
      props={[
        ...[L.대표자, L.주소, L.계좌].map((k): [string, string] => [k, d.registered.filter((x) => x.item === k && !x.until).map((x) => x.value).join(' · ') || L.없음]),
        ...(rel && rel.group.length > 1 ? [[L.그룹, rel.group.map((g) => g.name).join(' · ')] as [string, string]] : []),
      ]}
      bad={bad}
      tabs={[
        {
          value: 'body',
          label: L.내용,
          body: (
            <>
              <DealerTiles />
              <RegisteredRegion />
              <Links />
              <Payouts />
              <OfDealer />
              <IntakeRegion />
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
