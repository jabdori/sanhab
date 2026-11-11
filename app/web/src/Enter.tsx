import { useAtomValue, useSetAtom } from 'jotai'
import { useState } from 'react'
import { L } from './labels'
import { api, roleAtom, rolesAtom } from './state'
import { Pill } from './ui/Pill'
import { button, label } from './ui/styles'

/** 접속 패스워드 → 역할 고르기 */
export function Enter() {
  const roles = useAtomValue(rolesAtom)
  const setRole = useSetAtom(roleAtom)
  const [bad, setBad] = useState(false)
  return (
    <main className="flex h-screen items-center justify-center bg-bg">
      <div className="flex w-list flex-col gap-4 rounded-box border border-line bg-bg p-6">
        <h1 className="text-title">{L.합산}</h1>
        {roles.length === 0 ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              api('/enter', { pass: new FormData(e.currentTarget).get('pass') }).then(() => setBad(false), () => setBad(true))
            }}
          >
            <label className="flex flex-col gap-1">
              <span className={label}>{L['접속 패스워드']}</span>
              <input name="pass" type="password" required autoFocus className="h-head rounded-box border border-line px-2 text-body outline-action" />
            </label>
            <div className="flex items-center gap-2">
              <button className={button}>{L.접속}</button>
              {bad && <Pill tone="bad">{L.불일치}</Pill>}
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-1">
            <span className={label}>{L.역할}</span>
            {roles.map((r) => (
              <button key={r.role} className={`${button} text-left`} onClick={() => setRole(r.role)}>
                {r.role}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
