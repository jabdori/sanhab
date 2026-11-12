// 접속: astryx login-card 템플릿 꼴. 가운데에 앱 아이콘 · 이름, 그 아래 Card 하나 — 패스워드 → (맞으면) 같은 Card에서 역할 고르기.
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Center } from '@astryxdesign/core/Center'
import { Icon } from '@astryxdesign/core/Icon'
import { VStack } from '@astryxdesign/core/Layout'
import { Heading, Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { BanknotesIcon } from '@heroicons/react/24/outline'
import { useAtomValue, useSetAtom } from 'jotai'
import { useState } from 'react'
import { APP, L } from './labels'
import { api, roleAtom, rolesAtom } from './state'

/** 접속 패스워드 → 역할 고르기 */
export function Enter() {
  const roles = useAtomValue(rolesAtom)
  const setRole = useSetAtom(roleAtom)
  const [pass, setPass] = useState('')
  const [bad, setBad] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <Center axis="both" padding={6} minHeight="100vh" className="bg-body">
      <VStack gap={4} hAlign="center" width="100%" maxWidth={400}>
        <VStack gap={2} hAlign="center">
          <Icon icon={BanknotesIcon} size="lg" />
          <Heading level={1}>{APP}</Heading>
        </VStack>
        <Card padding={8} width="100%">
          {roles.length === 0 ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setBusy(true)
                api('/enter', { pass })
                  .then(() => setBad(false), () => setBad(true))
                  .finally(() => setBusy(false))
              }}
            >
              <VStack gap={4} hAlign="stretch">
                <TextInput
                  type="password"
                  label={L['접속 패스워드']}
                  isLabelHidden
                  placeholder={L['접속 패스워드']}
                  size="lg"
                  value={pass}
                  onChange={(v: string) => {
                    setPass(v)
                    setBad(false)
                  }}
                  hasAutoFocus
                  htmlName="pass"
                  status={bad ? { type: 'error', message: L.불일치 } : undefined}
                />
                <Button type="submit" variant="primary" size="lg" label={L.접속} isLoading={busy} />
              </VStack>
            </form>
          ) : (
            <VStack gap={3} hAlign="stretch">
              <Text type="supporting" color="secondary">
                {L.역할}
              </Text>
              {roles.map((r) => (
                <Button key={r.role} label={r.role} size="lg" width="100%" onClick={() => setRole(r.role)} />
              ))}
            </VStack>
          )}
        </Card>
      </VStack>
    </Center>
  )
}
