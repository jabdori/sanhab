import { Drawer, DrawerHeader } from '@astryxdesign/core/Drawer'
import { HStack, Layout, LayoutContent, VStack } from '@astryxdesign/core/Layout'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { useSetAtom } from 'jotai'
import { useState } from 'react'
import { L } from './labels'
import { Reply } from './tickets/08-대사'
import { Samples } from './tickets/19-서류'
import { IntakeSamples } from './tickets/20-소명'
import { api, targetAtom, useData } from './state'
import { useAtomValue } from 'jotai'
import { Confirm } from './ui/Confirm'
import { Region } from './ui/Region'

/** 시연 서랍(astryx Drawer, 막지 않음 hasScrim={false}): 메뉴 바닥의 `시연`이 연다. 시연 조작을 하며 뒤 화면의 변화를 같이 본다. 제품이 아닌 시연 조작만 모은다 */
export function DemoDrawer({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange} label={L.시연} width={360} hasScrim={false}>
      <Layout header={<DrawerHeader title={L.시연} onOpenChange={onOpenChange} />} content={<LayoutContent><Demo /></LayoutContent>} />
    </Drawer>
  )
}

/**
 * 시연 서랍의 몸통: 제품이 아닌 시연 조작(날짜 넘기기, 초기화)과 티켓이 끼우는 시연 조각(slot 'demo' — 시연 서류, 모의 회신 …).
 * 이 조작으로 생긴 값은 제품 화면에 출처 표지 `모의`로만 남는다
 */
/** 시스템의 첫날(서버 t01의 START). 초기화하면 날짜가 여기로 돌아간다 */
const START = '2026-07-01'
/** YYYY-MM-DD에 날수를 더한다(UTC로 계산해 시간대에 흔들리지 않게) */
const plus = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

function Demo() {
  const setTarget = useSetAtom(targetAtom)
  const today = useData<{ today: string }>('/state')?.today ?? START
  const target = useAtomValue(targetAtom)
  // 열어 둔 기록에 딸린 시연 조작: 지급 → 모의 회신(08), 소명 → 시연 서류(19), 대리점 → 접수 시연(20)
  const Extra = target ? { [L.지급]: Reply, [L.소명]: Samples, [L.대리점]: IntakeSamples }[target.kind] : undefined
  const [days, setDays] = useState<number | null>(15)
  const ok = days !== null && Number.isInteger(days) && days >= 1 && days <= 365
  return (
    <VStack gap={4}>
      <Region title={L.날짜}>
        <HStack gap={2} vAlign="end">
          <NumberInput label={L.일} isLabelHidden value={days} onChange={setDays} min={1} max={365} isIntegerOnly units={L.일} width={120} />
          <Confirm label={L.넘기기} title={`${L.넘기기} ${days ?? ''}${L.일}`} rows={[[L.날짜, `${today} → ${ok ? plus(today, days) : ''}`]]} isDisabled={!ok} onConfirm={() => api('/advance', { days }).catch(() => {})} />
        </HStack>
      </Region>
      {Extra && <Extra />}
      <Region title={L.초기화}>
        <HStack>
          <Confirm
            label={L.초기화}
            variant="destructive"
            rows={[
              // 사람이 앱에서 만든 기록 전부가 지워지고 원본만 남는다
              [L.대상, [L.결정, L.변경, L.정황, L.소명, L.서류, L.지급, L.회신, L.보고].join(' · ')],
              [L.날짜, `${today} → ${START}`],
            ]}
            onConfirm={() => api('/reset', {}).then(() => setTarget(null), () => {})}
          />
        </HStack>
      </Region>
    </VStack>
  )
}
