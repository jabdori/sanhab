import { useAtom, useAtomValue } from 'jotai'
import { Band } from './Band'
import { Enter } from './Enter'
import { L } from './labels'
import { type Slot, SlotView, usePieces } from './pieces'
import { MENUS, menuAtom, roleAtom, rolesAtom, targetAtom } from './state'
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
        <section className={`overflow-auto p-4 ${wide ? 'flex-1' : 'w-list shrink-0 border-r border-line'}`}>
          <SlotView slot="list" />
        </section>
        {!wide && (
          <>
            <main className="min-w-0 flex-1 overflow-auto p-4">
              <SlotView slot="fact" />
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
