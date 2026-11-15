// astryx block: DialogScrollingContent — 도움말(메뉴 바닥의 물음표): 둘러보기 다시 보기와, 둘러보기에서 뺀 도메인 설명(판매장려금 · 이 역할의 일 · 낱말). 내용은 labels.ts의 HELP(= docs/도움말.md)
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout'
import { List, ListItem } from '@astryxdesign/core/List'
import { Heading, Text } from '@astryxdesign/core/Text'
import { useAtomValue, useSetAtom } from 'jotai'
import { HELP, L } from '../labels'
import { roleAtom } from '../state'
import { tourAtom } from './Tour'

export function Help({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  const role = useAtomValue(roleAtom)
  const setTour = useSetAtom(tourAtom)
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={520}>
      <Layout
        header={<DialogHeader title={L.도움말} onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <VStack gap={6}>
              <VStack gap={2}>
                <Heading level={3}>{L.판매장려금}</Heading>
                <Text>{HELP.intro}</Text>
              </VStack>
              {role && HELP.roles[role] && (
                <VStack gap={2}>
                  <Heading level={3}>{role}</Heading>
                  <Text>{HELP.roles[role]}</Text>
                </VStack>
              )}
              <VStack gap={2}>
                <Heading level={3}>{L.낱말}</Heading>
                <List hasDividers>
                  {HELP.words.map(([w, d]) => (
                    <ListItem key={w} label={w} description={d} />
                  ))}
                </List>
              </VStack>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              {/* 둘러보기 다시 보기 */}
              <Button label={L.안내} variant="primary" onClick={() => (onOpenChange(false), setTour(true))} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
