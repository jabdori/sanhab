import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack } from '@astryxdesign/core/HStack'
import { VStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { type ReactNode, useState } from 'react'
import { L } from '../labels'

/**
 * 확인을 거치는 조치(일괄 승인, 지급, 회신, 발송, 변경, 초기화): 버튼 → 확인 창(astryx Dialog). 창의 버튼은 결과의 낱말(`승인` / `취소`)이고
 * "정말 하시겠습니까"를 쓰지 않는다. `variant`는 여는 버튼과 창의 실행 버튼의 등급(components.md의 버튼 등급). `title`이 없으면 `label`.
 * 몸통은 어느 창이나 같은 꼴: 제목(조치 + 대상) 아래 `rows`(이름표와 값 — 무엇이 어떻게 바뀌는지)의 MetadataList. 표·큰 숫자·소제목을 따로 짜지 않는다.
 * children은 rows로 쓸 수 없는 것(입력 칸)만. `onConfirm`이 끝나야 창이 닫히고, 그동안 실행 버튼은 다시 눌리지 않는다
 */
export function Confirm({ label, trigger, title, rows, variant = 'secondary', isDisabled, onConfirm, canConfirm = true, children }: {
  label: string
  /** 여는 버튼의 낱말(없으면 label). 창의 실행 버튼은 항상 label(결과의 낱말) */
  trigger?: string
  title?: ReactNode
  /** 창의 몸통: 이름표와 값의 줄 */
  rows?: [string, ReactNode][]
  variant?: 'primary' | 'secondary' | 'destructive'
  isDisabled?: boolean
  onConfirm: () => unknown
  canConfirm?: boolean
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button label={trigger ?? label} variant={variant} isDisabled={isDisabled} onClick={() => setOpen(true)} />
      <Dialog isOpen={open} onOpenChange={setOpen} purpose={children ? 'form' : 'info'}>
        <Layout
          header={<DialogHeader title={title ?? label} hasDivider={false} />}
          content={
            (rows || children) && (
              <LayoutContent>
                <VStack gap={3}>
                  {rows && (
                    <MetadataList label={{ width: 72 }}>
                      {rows.map(([k, v]) => (
                        <MetadataListItem key={k} label={k}>
                          <Text hasTabularNumbers>{v}</Text>
                        </MetadataListItem>
                      ))}
                    </MetadataList>
                  )}
                  {children}
                </VStack>
              </LayoutContent>
            )
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label={L.취소} onClick={() => setOpen(false)} />
                <Button label={label} variant={variant} isDisabled={!canConfirm} clickAction={async () => {
                    await onConfirm()
                    setOpen(false)
                  }}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  )
}
