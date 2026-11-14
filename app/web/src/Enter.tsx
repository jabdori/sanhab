// astryx template: login-card — 접속. 가운데에 앱 아이콘 · 이름, 그 아래 Card 하나(머리 Heading 2) — 패스워드 → (맞으면) 같은 Card에서 역할 고르기(로그인 카드의 보조 단추 줄 꼴)
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
import { fail } from './ui/status'
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
          <Text type="body" weight="bold" size="lg">
            {APP}
          </Text>
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
                <VStack gap={1} hAlign="center">
                  <Heading level={2}>{L.접속}</Heading>
                </VStack>
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
                  status={bad ? { type: fail, message: L.불일치 } : undefined}
                />
                <Button type="submit" variant="primary" size="lg" label={L.접속} isLoading={busy} />
              </VStack>
            </form>
          ) : (
            <VStack gap={4} hAlign="stretch">
              <VStack gap={1} hAlign="center">
                <Heading level={2}>{L.역할}</Heading>
              </VStack>
              <VStack gap={3} hAlign="stretch">
                {roles.map((r) => (
                  <Button key={r.role} label={r.role} variant="secondary" size="lg" onClick={() => setRole(r.role)} />
                ))}
              </VStack>
            </VStack>
          )}
        </Card>
      </VStack>
    </Center>
  )
}
