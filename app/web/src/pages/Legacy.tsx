// 아직 옮기지 않은 화면(정황 · 소명 · 지급 · 추인 · 대리점 · 규정): 옛 조각(pieces.tsx의 자리)을 새 틀 안의 detail-page 모양에 임시로 담는다.
// 화면을 하나씩 pages/로 옮기면 그 kind의 조각이 여기서 빠진다. 다 옮기면 이 파일과 pieces.tsx를 지운다.
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, Layout, LayoutContent, LayoutHeader, LayoutPanel, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Heading } from '@astryxdesign/core/Text'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { L } from '../labels'
import { type Slot, SlotView, usePieces } from '../pieces'
import { menuAtom, targetAtom, trailOpenAtom } from '../state'
import { Region } from '../ui/Region'

const RAIL: [Slot, string][] = [
  ['action', L.조치],
  ['reason', L.사유],
  ['report', L.보고],
  ['trail', L.경위],
  ['history', L.이력],
]

/** 메뉴의 목록(대리점 · 규정) */
export function LegacyList() {
  const menu = useAtomValue(menuAtom)
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <Heading level={1}>{menu}</Heading>
        </LayoutHeader>
      }
      content={
        <LayoutContent>
          <SlotView slot="list" />
        </LayoutContent>
      }
    />
  )
}

/** 기록 하나: 머리(← 메뉴 / 옛 머리 조각) · 본문(사실, 경위를 펼치면 그림) · 레일(조치 · 사유 · 보고 · 경위 · 이력) */
export function LegacyRecord() {
  const menu = useAtomValue(menuAtom)
  const [target, setTarget] = useAtom(targetAtom)
  const trail = useAtomValue(trailOpenAtom)
  const setTrail = useSetAtom(trailOpenAtom)
  const head = usePieces('head')
  // 다른 기록을 열면 경위 그림을 접는다
  useEffect(() => {
    setTrail(false)
  }, [target, setTrail])
  return (
    <Layout
      key={`${target?.kind}/${target?.id}`}
      height="fill"
      defaultHasDividers
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={2}>
            <Link color="secondary" onClick={() => setTarget(null)}>
              <HStack gap={1} vAlign="center">
                <Icon icon={ArrowLeftIcon} size="sm" color="inherit" />
                {menu}
              </HStack>
            </Link>
            {head.length > 0 && <SlotView slot="head" />}
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent role="main" className="bg-body">
          <VStack gap={4}>
            <SlotView slot={trail ? 'map' : 'fact'} />
          </VStack>
        </LayoutContent>
      }
      end={
        <LayoutPanel width={320} padding={4} role="complementary" className="bg-body">
          <VStack gap={4}>
            {RAIL.map(([slot, name]) => (
              <Region key={slot} title={name}>
                <SlotView slot={slot} />
              </Region>
            ))}
          </VStack>
        </LayoutPanel>
      }
    />
  )
}
