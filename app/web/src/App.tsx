import { useAtom, useAtomValue } from 'jotai'
import { useEffect } from 'react'
import { Band } from './Band'
import { Enter } from './Enter'
import { L } from './labels'
import { type Slot, SlotView, usePieces } from './pieces'
import { chatOpenAtom, listOpenAtom, MENUS, menuAtom, roleAtom, rolesAtom, targetAtom, trailOpenAtom } from './state'
import { label } from './ui/styles'

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

/** 전체 틀: 띠 / 메뉴 · 목록 · 가운데(사실) · 오른쪽(판단) · 대화 */
function Shell() {
  const [menu, setMenu] = useAtom(menuAtom)
  const [target, setTarget] = useAtom(targetAtom)
  const chat = usePieces('chat')
  // 고를 목록이 있고 아무것도 열지 않았으면 목록이 나머지를 다 쓴다. 목록이 없는 메뉴는 가운데와 오른쪽이 바로 보인다
  const wide = usePieces('list').length > 0 && !target
  // 소명을 열면 목록이 접힌다(서류에 폭을 준다, ux-plan). 접힌 자리의 손잡이를 누르면 펼쳐지고, 다른 대상을 열면 다시 접힌다
  const [listOpen, setListOpen] = useAtom(listOpenAtom)
  const [chatOpen, setChatOpen] = useAtom(chatOpenAtom)
  useEffect(() => setListOpen(false), [target, setListOpen])
  const [trailOpen, setTrailOpen] = useAtom(trailOpenAtom)
  useEffect(() => setTrailOpen(false), [target, setTrailOpen])
  // 대화를 펼쳐도 목록이 나머지를 다 쓰고 있을 때(대상이 없을 때)는 접을 것이 없다
  const folded = (target?.kind === L.소명 || (chatOpen && !wide)) && !listOpen
  return (
    <div className="flex h-screen min-w-page flex-col text-body">
      <Band />
      <div className="flex min-h-0 flex-1">
        <nav className="w-menu shrink-0 border-r border-line bg-surface">
          {MENUS.map((m) => (
            <button
              key={m}
              aria-current={m === menu || undefined}
              className={`h-row w-full cursor-pointer px-4 text-left ${m === menu ? 'bg-bg text-figure' : 'text-body'}`}
              onClick={() => {
                setMenu(m)
                setTarget(null)
              }}
            >
              {m}
            </button>
          ))}
        </nav>
        {folded ? (
          <section className="w-chat shrink-0 border-r border-line bg-surface pt-3 text-center">
            <button className={`cursor-pointer ${label} hover:text-action`} aria-expanded={false}
              onClick={() => {
                setListOpen(true)
                setChatOpen(false) // 목록과 대화는 둘 중 하나만 펼쳐진다
              }}
            >
              {menu}
            </button>
          </section>
        ) : (
          <section className={`overflow-auto p-4 ${wide ? 'flex-1' : 'w-list shrink-0 border-r border-line'}`}>
            <SlotView slot="list" />
          </section>
        )}
        {!wide && (
          <>
            <main className="min-w-0 flex-1 overflow-auto px-2 py-4">
              <SlotView slot={trailOpen ? 'map' : 'fact'} />
            </main>
            <aside className="w-right shrink-0 overflow-auto border-l border-line bg-surface">
              {RIGHT.map(([slot, name]) => (
                <section key={slot} className="flex flex-col gap-2 border-b border-line p-4">
                  <h2 className={label}>{name}</h2>
                  <SlotView slot={slot} />
                </section>
              ))}
            </aside>
          </>
        )}
        {chat.length ? (
          <SlotView slot="chat" />
        ) : (
          <aside className="w-chat shrink-0 border-l border-line bg-surface pt-3 text-center">
            <span className={label}>{L.대화}</span>
          </aside>
        )}
      </div>
    </div>
  )
}
