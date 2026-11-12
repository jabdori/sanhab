import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Text } from '@astryxdesign/core/Text'
import { useAtomValue, useSetAtom } from 'jotai'
import { useState } from 'react'
import { APP, L } from './labels'
import { api, roleAtom, rolesAtom } from './state'
import { Pill } from './ui/Pill'

/** 접속 패스워드 → 역할 고르기 */
export function Enter() {
  const roles = useAtomValue(rolesAtom)
  const setRole = useSetAtom(roleAtom)
  const [pass, setPass] = useState('')
  const [bad, setBad] = useState(false)
  return (
    <main className="flex h-screen items-center justify-center bg-body">
      <Card width={360} padding={6}>
        <div className="flex flex-col gap-4">
          <Heading level={1}>{APP}</Heading>
          {roles.length === 0 ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                api('/enter', { pass }).then(() => setBad(false), () => setBad(true))
              }}
            >
              <TextInput type="password" label={L['접속 패스워드']} value={pass} onChange={setPass} hasAutoFocus htmlName="pass" />
              <div className="flex items-center gap-2">
                <Button type="submit" variant="primary" label={L.접속} />
                {bad && <Pill tone="bad">{L.불일치}</Pill>}
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-2">
              <Text type="supporting">{L.역할}</Text>
              {roles.map((r) => (
                <Button key={r.role} label={r.role} width="100%" onClick={() => setRole(r.role)} />
              ))}
            </div>
          )}
        </div>
      </Card>
    </main>
  )
}
