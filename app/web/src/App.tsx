import { AppShell } from '@astryxdesign/core/AppShell'
import { Layout, LayoutContent, LayoutHeader, LayoutPanel } from '@astryxdesign/core/Layout'
import { SideNav, SideNavItem } from '@astryxdesign/core/SideNav'
import { useAtom, useAtomValue } from 'jotai'
import { useEffect } from 'react'
import { Band } from './Band'
import { Enter } from './Enter'
import { L } from './labels'
import { type Slot, SlotView, usePieces } from './pieces'
import { chatOpenAtom, listOpenAtom, MENUS, menuAtom, roleAtom, rolesAtom, targetAtom, trailOpenAtom, useData } from './state'
import { Region } from './ui/Region'

/** 오른쪽(판단)의 칸. 순서 고정 */
const RIGHT: [Slot, string][] = [
  ['action', L.조치],
  ['reason', L.사유],
  ['report', L.보고],
  ['trail', L.경위],
  ['history', L.이력],
]

export function App() {
  const roles = useAtomValue(rolesAtom)
  const role = useAtomValue(roleAtom)
  return roles.some((r) => r.role === role) ? <Shell /> : <Enter />
}

/**
 * 전체 틀(astryx AppShell): 띠(TopNav) / 메뉴(SideNav) · 목록 · 가운데(사실) · 오른쪽(판단) · 대화.
 * 가운데는 머리(제목·숫자 줄, 고정)와 몸통(사실의 영역들, 스크롤)으로 나뉜다. 오른쪽은 다섯 칸이 선으로 나뉜 회색 바탕이다
 */
function Shell() {
  const [menu, setMenu] = useAtom(menuAtom)
  const [target, setTarget] = useAtom(targetAtom)
  const chat = usePieces('chat')
  const head = usePieces('head')
  // 고를 목록이 있고 아무것도 열지 않았으면 목록이 나머지를 다 쓴다. 목록이 없는 메뉴는 가운데와 오른쪽이 바로 보인다
  const wide = usePieces('list').length > 0 && !target
  // 규정은 모의(23)를 할 수 있는 역할에게만 판단할 것이 있다. 없으면 오른쪽(판단) 칸을 두지 않는다
  const mock = useData<{ can: boolean }>(target?.kind === L.규정 ? '/mock' : null)
  const judge = !(target?.kind === L.규정 && mock?.can === false)
  // 소명을 열면 목록이 접힌다(서류에 폭을 준다, ux-plan). 접힌 자리의 손잡이를 누르면 펼쳐지고, 다른 대상을 열면 다시 접힌다
  const [listOpen, setListOpen] = useAtom(listOpenAtom)
  const [chatOpen, setChatOpen] = useAtom(chatOpenAtom)
  const [trailOpen, setTrailOpen] = useAtom(trailOpenAtom)
  useEffect(() => {
    setListOpen(false)
    setTrailOpen(false)
  }, [target, setListOpen, setTrailOpen])
  // 대화를 펼쳐도 목록이 나머지를 다 쓰고 있을 때(대상이 없을 때)는 접을 것이 없다
  // 경위 그림을 펼쳐도 목록이 접힌다(그림에 폭을 준다)
  const folded = (target?.kind === L.소명 || trailOpen || (chatOpen && !wide)) && !listOpen
  const list = (
    <div className="flex flex-col gap-4">
      <SlotView slot="list" />
    </div>
  )
  return (
    <AppShell
      variant="section"
      topNav={<Band />}
      sideNav={
        <SideNav className="w-menu">
          {MENUS.map((m) => (
            <SideNavItem key={m} label={m} isSelected={m === menu} onClick={() => {
                setMenu(m)
                setTarget(null)
              }}
            />
          ))}
        </SideNav>
      }
    >
      <Layout
        start={
          wide ? null : folded ? (
            <LayoutPanel width="var(--spacing-chat)" padding={0} hasDivider>
              <button className="w-full cursor-pointer pt-3 text-sm text-secondary hover:text-primary" aria-expanded={false}
                onClick={() => {
                  setListOpen(true)
                  setChatOpen(false) // 목록과 대화는 둘 중 하나만 펼쳐진다
                }}
              >
                {menu}
              </button>
            </LayoutPanel>
          ) : (
            <LayoutPanel width="var(--spacing-list)" padding={6} hasDivider label={menu}>
              {list}
            </LayoutPanel>
          )
        }
        content={
          wide ? (
            <LayoutContent padding={6} label={menu}>
              {list}
            </LayoutContent>
          ) : (
            <LayoutContent padding={0}>
              <Layout
                header={
                  head.length > 0 ? (
                    <LayoutHeader hasDivider padding={6}>
                      <div className="flex flex-col gap-4">
                        <SlotView slot="head" />
                      </div>
                    </LayoutHeader>
                  ) : null
                }
                content={
                  <LayoutContent padding={6}>
                    <div className="flex flex-col gap-8">
                      <SlotView slot={trailOpen ? 'map' : 'fact'} />
                    </div>
                  </LayoutContent>
                }
              />
            </LayoutContent>
          )
        }
        end={
          <div className="flex h-full">
            {!wide && judge && (
              <LayoutPanel width="var(--spacing-right)" padding={0} hasDivider label={L.조치}>
                <div className="min-h-full bg-body">
                  {RIGHT.map(([slot, name]) => (
                    <Region key={slot} title={name} className="border-b border-border p-6">
                      <SlotView slot={slot} />
                    </Region>
                  ))}
                </div>
              </LayoutPanel>
            )}
            {chat.length ? (
              <SlotView slot="chat" />
            ) : (
              <aside className="w-chat shrink-0 border-l border-border pt-3 text-center text-sm text-secondary">{L.대화}</aside>
            )}
          </div>
        }
      />
    </AppShell>
  )
}
