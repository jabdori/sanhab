import { AppShell } from '@astryxdesign/core/AppShell'
import { Button } from '@astryxdesign/core/Button'
import { Layout, LayoutContent, LayoutPanel } from '@astryxdesign/core/Layout'
import { ResizeHandle, useResizable } from '@astryxdesign/core/Resizable'
import { Selector } from '@astryxdesign/core/Selector'
import { SideNav, SideNavHeading, SideNavItem } from '@astryxdesign/core/SideNav'
import { Text } from '@astryxdesign/core/Text'
import { BookOpenIcon, BuildingStorefrontIcon, InboxStackIcon } from '@heroicons/react/24/outline'
import { useAtom, useAtomValue } from 'jotai'
import { useState } from 'react'
import { DemoDrawer } from './Demo'
import { Enter } from './Enter'
import { APP, L } from './labels'
import { LegacyList, LegacyRecord } from './pages/Legacy'
import { Review } from './pages/Review'
import { Work } from './pages/Work'
import { MENUS, menuAtom, roleAtom, rolesAtom, targetAtom, useData } from './state'
import { Chat } from './tickets/24-대화'

const ICONS = { [L.작업]: InboxStackIcon, [L.대리점]: BuildingStorefrontIcon, [L.규정]: BookOpenIcon }

export function App() {
  const roles = useAtomValue(rolesAtom)
  const role = useAtomValue(roleAtom)
  return roles.some((r) => r.role === role) ? <Shell /> : <Enter />
}

/**
 * 틀(astryx docs layout/scaffold: 콘솔은 SideNav): 메뉴(머리에 앱 이름과 역할, 바닥에 날짜와 시연) | 본문 | 대화(380, 폭 조절).
 * 본문은 메뉴와 연 기록으로 정해진다: 작업 목록 · 심사 기록 · 아직 옮기지 않은 화면(pages/Legacy)
 */
function Shell() {
  const roles = useAtomValue(rolesAtom)
  const [role, setRole] = useAtom(roleAtom)
  const [menu, setMenu] = useAtom(menuAtom)
  const [target, setTarget] = useAtom(targetAtom)
  const today = useData<{ today: string }>('/state')?.today
  const [demo, setDemo] = useState(false)
  const chat = useResizable({ defaultSize: 380, minSize: 320, maxSize: 560, autoSaveId: 'chat' })
  const page = target?.kind === L.심사 ? <Review /> : target ? <LegacyRecord /> : menu === L.작업 ? <Work /> : <LegacyList />
  return (
    <AppShell
      sideNav={
        <SideNav
          className="w-menu"
          header={<SideNavHeading heading={APP} />}
          topContent={
            <Selector label={L.역할} isLabelHidden size="sm" width="100%" value={role ?? undefined} options={roles.map((r) => r.role)}
              onChange={(v: string) => {
                setRole(v)
                setTarget(null)
              }}
            />
          }
          footer={
            <div className="flex items-center gap-2">
              <Text type="supporting" color="secondary">
                {L.날짜}
              </Text>
              <Text type="supporting" weight="medium" hasTabularNumbers>
                {today ?? ''}
              </Text>
              <span className="flex-1" />
              <Button label={L.시연} size="sm" variant="secondary" onClick={() => setDemo(true)} />
            </div>
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
      }
    >
      <Layout
        height="fill"
        content={<LayoutContent padding={0}>{page}</LayoutContent>}
        end={
          <>
            <ResizeHandle direction="horizontal" resizable={chat.props} isReversed hasDivider isAlwaysVisible={false} label={L.대화} />
            <LayoutPanel width={chat.size} padding={0} label={L.대화}>
              <Chat />
            </LayoutPanel>
          </>
        }
      />
      <DemoDrawer isOpen={demo} onOpenChange={setDemo} />
    </AppShell>
  )
}
