// astryx template: shell-side-nav — 틀(AppShellSideNavOnly의 메뉴 묶음 + table-grouped의 폭 조절 상세 칸을 대화 칸으로). 벗어난 곳은 docs/design/components.md
import { AppShell } from '@astryxdesign/core/AppShell'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutContent, LayoutPanel } from '@astryxdesign/core/Layout'
import { NavIcon } from '@astryxdesign/core/NavIcon'
import { ResizeHandle, useResizable } from '@astryxdesign/core/Resizable'
import { Button } from '@astryxdesign/core/Button'
import { Selector } from '@astryxdesign/core/Selector'
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'
import { BeakerIcon, BookOpenIcon, BuildingStorefrontIcon, CalculatorIcon, CalendarIcon, InboxStackIcon, QuestionMarkCircleIcon, UserCircleIcon } from '@heroicons/react/24/outline'
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
import { Help } from './ui/Help'
import { Tour } from './ui/Tour'

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
 * 틀: 메뉴(SideNav, 아이콘 줄로 접힌 채 시작 — 머리에 앱 이름, 그 아래 역할, 바닥에 날짜 · 도움말 · 시연) | 목록 사이드바(기록을 열면 접힌 채, `목록`으로 편다)
 * | 본문(목록 화면, 또는 기록) | 대화(오른쪽 끝, 열린 채, 폭 조절 — table-grouped의 상세 칸과 같은 ResizeHandle + LayoutPanel).
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
    <AppShell contentPadding={0} sideNav={<Nav onDemo={() => setDemo(true)} />}>
      <Layout
        height="fill"
        start={
          Open && pane ? (
            <LayoutPanel width={300} hasDivider isScrollable padding={0} label={menu}>
              <Pane />
            </LayoutPanel>
          ) : undefined
        }
        // 본문의 main 표지는 각 화면(목록 · 기록)의 LayoutContent가 단다(템플릿대로)
        content={<LayoutContent padding={0}>{page}</LayoutContent>}
        end={
          <>
            {/* table-grouped: 선은 칸이 갖고(hasDivider) 손잡이는 선 없이 머물 때만 */}
            <ResizeHandle resizable={chat.props} isReversed isAlwaysVisible={false} label={L.대화} />
            <LayoutPanel hasDivider resizable={chat.props} padding={0} role="complementary" label={L.대화} isScrollable={false}>
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

/** 메뉴(SideNav): 머리에 앱 이름, 그 아래 역할, 메뉴 묶음, 바닥 묶음(날짜 · 도움말 · 시연). 접히면 역할은 아이콘 단추, 나머지는 아이콘만 */
function Nav({ onDemo }: { onDemo: () => void }) {
  const roles = useAtomValue(rolesAtom)
  const [role, setRole] = useAtom(roleAtom)
  const [menu, setMenu] = useAtom(menuAtom)
  const setTarget = useSetAtom(targetAtom)
  const today = useData<{ today: string }>('/state')?.today
  const [folded, setFolded] = useState(true)
  const [help, setHelp] = useState(false)
  return (
    <SideNav
      collapsible={{ isCollapsed: folded, onCollapsedChange: setFolded }}
      header={<SideNavHeading heading={APP} icon={<NavIcon icon={<Icon icon={CalculatorIcon} size="sm" />} />} />}
      topContent={
        // 접히면 지금 역할을 아이콘 단추로(누르면 메뉴가 펼쳐져 역할을 바꿀 수 있다)
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
        <SideNavSection title={L.시연} isHeaderHidden>
          {/* 날짜는 시연의 오늘이다: 누르면 날짜를 넘기는 시연 서랍이 열린다 */}
          {today && <SideNavItem label={today} icon={CalendarIcon} onClick={onDemo} />}
          <SideNavItem label={L.도움말} icon={QuestionMarkCircleIcon} onClick={() => setHelp(true)} />
          <SideNavItem label={L.시연} icon={BeakerIcon} onClick={onDemo} />
        </SideNavSection>
      }
    >
      <Help isOpen={help} onOpenChange={setHelp} />
      <SideNavSection title={L.목록} isHeaderHidden>
        {MENUS.map((m) => (
          <SideNavItem key={m} label={m} icon={ICONS[m]} isSelected={m === menu}
            onClick={() => {
              setMenu(m)
              setTarget(null)
            }}
          />
        ))}
      </SideNavSection>
    </SideNav>
  )
}
