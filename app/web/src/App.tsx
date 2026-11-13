import { AppShell } from '@astryxdesign/core/AppShell'
import { Button } from '@astryxdesign/core/Button'
import { Layout, LayoutContent, LayoutPanel } from '@astryxdesign/core/Layout'
import { ResizeHandle, useResizable } from '@astryxdesign/core/Resizable'
import { Selector } from '@astryxdesign/core/Selector'
import { SideNav, SideNavHeading, SideNavItem } from '@astryxdesign/core/SideNav'
import { Icon } from '@astryxdesign/core/Icon'
import { Text } from '@astryxdesign/core/Text'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { UserCircleIcon, BeakerIcon, QuestionMarkCircleIcon, BookOpenIcon, CalendarIcon, BuildingStorefrontIcon, InboxStackIcon } from '@heroicons/react/24/outline'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { type ReactNode, useState } from 'react'
import { Pane } from './Pane'
import { DemoDrawer } from './Demo'
import { Enter } from './Enter'
import { APP, L } from './labels'
import { Clarify } from './pages/Clarify'
import { Dealer } from './pages/Dealer'
import { Dealers } from './pages/Dealers'
import { Pay } from './pages/Pay'
import { Ratify } from './pages/Ratify'
import { Review } from './pages/Review'
import { Rule } from './pages/Rule'
import { Rules } from './pages/Rules'
import { Signal } from './pages/Signal'
import { Work } from './pages/Work'
import { MENUS, type Menu, menuAtom, paneAtom, roleAtom, rolesAtom, targetAtom, useData } from './state'
import { Chat } from './tickets/24-대화'
import { Tour, tourAtom } from './ui/Tour'

/** 기록의 종류 → 화면. 메뉴 → 목록 화면 */
const RECORDS: Record<string, () => ReactNode> = { [L.심사]: Review, [L.정황]: Signal, [L.소명]: Clarify, [L.지급]: Pay, [L.추인]: Ratify, [L.대리점]: Dealer, [L.규정]: Rule }
const LISTS: Record<Menu, () => ReactNode> = { [L.작업]: Work, [L.대리점]: Dealers, [L.규정]: Rules }

const ICONS = { [L.작업]: InboxStackIcon, [L.대리점]: BuildingStorefrontIcon, [L.규정]: BookOpenIcon }

export function App() {
  const roles = useAtomValue(rolesAtom)
  const role = useAtomValue(roleAtom)
  return roles.some((r) => r.role === role) ? <Shell /> : <Enter />
}

/**
 * 틀: 메뉴 레일(아이콘, 머리에 역할 · 바닥에 날짜와 시연) | 목록 사이드바(기록을 열면 접힌 채, `목록`으로 편다) | 본문(목록 화면, 또는 기록 = 본문 + 보조 칸) | 대화(오른쪽 끝, 열린 채, 폭 조절).
 * 1440에서 목록을 접으면 본문은 약 740, 1280에서 약 580
 */
function Shell() {
  const menu = useAtomValue(menuAtom)
  const target = useAtomValue(targetAtom)
  const [demo, setDemo] = useState(false)
  const pane = useAtomValue(paneAtom)
  const chat = useResizable({ defaultSize: 360, minSize: 320, maxSize: 560, autoSaveId: 'chat' })
  const Open = target ? RECORDS[target.kind] : undefined
  const List = LISTS[menu]
  // 기록은 대상마다 새로 그린다(탭·사유 입력이 다른 기록으로 넘어가지 않게)
  const page = Open && target ? <Open key={`${target.kind}/${target.id}`} /> : <List />
  return (
    <AppShell
      // 메뉴는 아이콘 레일로 시작한다(접기 단추로 펼친다)
      sideNav={<Nav folded onDemo={() => setDemo(true)} />}
    >
      <Layout
        height="fill"
        start={
          Open && pane ? (
            <LayoutPanel width={300} hasDivider isScrollable padding={0} label={menu}>
              <Pane />
            </LayoutPanel>
          ) : undefined
        }
        content={<LayoutContent padding={0}>{page}</LayoutContent>}
        end={
          <>
            <ResizeHandle direction="horizontal" resizable={chat.props} isReversed hasDivider isAlwaysVisible={false} label={L.대화} />
            <LayoutPanel width={chat.size} padding={0} label={L.대화} isScrollable={false}>
              <Chat />
            </LayoutPanel>
          </>
        }
      />
      <DemoDrawer isOpen={demo} onOpenChange={setDemo} />
      <Tour />
    </AppShell>
  )
}

/** 메뉴(SideNav): 머리에 앱 이름, 그 아래 역할, 바닥에 날짜와 시연. 접히면 역할은 Avatar, 메뉴와 시연은 아이콘만 */
function Nav({ folded: start, onDemo }: { folded: boolean; onDemo: () => void }) {
  const roles = useAtomValue(rolesAtom)
  const [role, setRole] = useAtom(roleAtom)
  const [menu, setMenu] = useAtom(menuAtom)
  const setTarget = useSetAtom(targetAtom)
  const today = useData<{ today: string }>('/state')?.today
  const [folded, setFolded] = useState(start)
  const setTour = useSetAtom(tourAtom)
  // 안내 다시 보기: 시연 옆의 아이콘(펼치면 함께 있는 아이콘 단추)
  const guide = <Button label={L.안내} variant="ghost" isIconOnly size="sm" icon={<Icon icon={QuestionMarkCircleIcon} size="sm" />} onClick={() => setTour(true)} />
  return (
    <SideNav
      collapsible={{ isCollapsed: folded, onCollapsedChange: setFolded }}
      header={<SideNavHeading heading={APP} />}
      topContent={
        // 접히면 지금 역할을 아이콘 단추로(머물면 이름, 누르면 메뉴가 펼쳐져 역할을 바꿀 수 있다)
        folded ? (
          <Button label={role ?? L.역할} variant="ghost" isIconOnly icon={<Icon icon={UserCircleIcon} size="sm" />} onClick={() => setFolded(false)} />
        ) : (
          <Selector label={L.역할} isLabelHidden size="sm" width="100%" value={role ?? undefined} options={roles.map((r) => r.role)}
            onChange={(v: string) => {
              setRole(v)
              setTarget(null)
              setFolded(true) // 역할을 고르면 다시 레일로 접는다(펴 둔 채면 본문이 좁아진다)
            }}
          />
        )
      }
      footer={
        !folded && (
          <HStack gap={2} vAlign="center">
            <StackItem size="fill">
              <HStack gap={2} vAlign="center">
                <Icon icon={CalendarIcon} size="sm" color="secondary" />
                {today && <Text type="supporting" weight="medium" hasTabularNumbers>{today}</Text>}
              </HStack>
            </StackItem>
            {guide}
            <Button label={L.시연} size="sm" variant="secondary" icon={<Icon icon={BeakerIcon} size="sm" />} onClick={onDemo} />
          </HStack>
        )
      }
      footerIcons={
        folded && (
          <>
            <Button label={L.안내} variant="ghost" isIconOnly icon={<Icon icon={QuestionMarkCircleIcon} size="sm" />} onClick={() => setTour(true)} />
            <Button label={L.시연} variant="ghost" isIconOnly icon={<Icon icon={BeakerIcon} size="sm" />} onClick={onDemo} />
          </>
        )
      }
    >
      {MENUS.map((m) => (
        <SideNavItem key={m} label={m} icon={ICONS[m]} isSelected={m === menu}
          onClick={() => {
            setMenu(m)
            setTarget(null)
          }}
        />
      ))}
    </SideNav>
  )
}
