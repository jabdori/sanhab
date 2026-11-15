// astryx block: AlertDialogAsyncAction(입력 없는 확인) · DialogFormDialog(입력이 있는 확인 — 사유 · 값)
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Text } from '@astryxdesign/core/Text'
import { type ReactNode, useState } from 'react'
import { L } from '../labels'

/**
 * 확인을 거치는 조치(승인, 지급, 회신, 발송, 변경, 초기화 …): 버튼 → 확인 창. 창의 버튼은 결과의 낱말(`승인` / `취소`)이고
 * "정말 하시겠습니까"를 쓰지 않는다. `variant`는 여는 버튼과 창의 실행 버튼의 등급(components.md의 버튼 등급). `title`이 없으면 `label`.
 * `rows`(이름표와 값 — 무엇이 어떻게 바뀌는지)는 창의 몸통이다.
 * - 입력(children)이 없으면 AlertDialog: rows는 설명 한 줄(`이름표 값 / 이름표 값`)
 * - 입력이 있으면 Dialog form: rows는 MetadataList, 그 아래 입력
 * `onConfirm`이 끝나야 창이 닫히고, 그동안 실행 버튼은 도는 표지로 다시 눌리지 않는다
 */
export function Confirm({ label, trigger, title, rows, variant = 'secondary', isDisabled, onConfirm, canConfirm = true, children }: {
  label: string
  /** 여는 버튼의 낱말(없으면 label). 창의 실행 버튼은 항상 label(결과의 낱말) */
  trigger?: string
  title?: string
  /** 창의 몸통: 이름표와 값의 줄 */
  rows?: [string, string][]
  variant?: 'primary' | 'secondary' | 'destructive'
  isDisabled?: boolean
  onConfirm: () => unknown
  canConfirm?: boolean
  /** 입력 칸(사유 · 값). 있으면 Dialog form */
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try {
      await onConfirm()
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }
  // 입력 없는 확인(AlertDialog)에는 실행 버튼을 막는 길이 없다: 실행할 수 없으면 여는 버튼을 막는다
  const opener = <Button label={trigger ?? label} variant={variant} isDisabled={isDisabled || (!children && !canConfirm)} onClick={() => setOpen(true)} />
  if (!children)
    return (
      <>
        {opener}
        <AlertDialog
          isOpen={open}
          onOpenChange={setOpen}
          title={title ?? label}
          description={(rows ?? []).map(([k, v]) => `${k} ${v}`).join(' / ')}
          actionLabel={label}
          actionVariant={variant}
          cancelLabel={L.취소}
          isActionLoading={busy}
          onAction={go}
        />
      </>
    )
  return (
    <>
      {opener}
      <Dialog isOpen={open} onOpenChange={setOpen} purpose="form" width={480}>
        <Layout
          header={<DialogHeader title={title ?? label} onOpenChange={setOpen} />}
          content={
            <LayoutContent>
              <VStack gap={4}>
                {rows && (
                  <MetadataList>
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
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label={L.취소} variant="secondary" onClick={() => setOpen(false)} />
                <Button label={label} variant={variant} isDisabled={!canConfirm} isLoading={busy} onClick={go} />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  )
}
