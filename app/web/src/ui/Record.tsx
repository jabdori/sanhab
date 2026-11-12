// 기록 화면의 틀(astryx detail-page 템플릿): 머리(← 메뉴 · n/전체 · 앞 뒤 / 제목 / 메타 한 줄 / 오른쪽 위 페이지 조치 / 탭) → 바탕 위의 카드 본문 → 오른쪽 레일(320, 좁으면 본문 아래).
// 모든 기록 화면(심사 · 정황 · 소명 · 지급 · 추인 · 대리점 · 규정)이 이것 하나로 같은 꼴이 된다. 내용(카드 · 타일 · 레일 칸)만 화면이 채운다.
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Grid } from '@astryxdesign/core/Grid'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, Layout, LayoutContent, LayoutHeader, LayoutPanel, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Heading, Text } from '@astryxdesign/core/Text'
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, ViewColumnsIcon } from '@heroicons/react/24/outline'
import { useAtom, useAtomValue } from 'jotai'
import { Fragment, type ReactNode, useState } from 'react'
import { L } from '../labels'
import { menuAtom, navAtom, targetAtom } from '../state'
import { type Draft, Reason, blank, ready, sent } from './Reason'
import { Confirm } from './Confirm'
import { grade } from './grade'

const Bullet = () => (
  <Text type="supporting" color="secondary">
    {'・'}
  </Text>
)

/** ← (지금 메뉴) · n/전체 · ‹ › : 작업 목록에서 열었으면 그 순서를 따라 앞뒤로 간다 */
function Back() {
  const nav = useAtomValue(navAtom)
  const [target, setTarget] = useAtom(targetAtom)
  const menu = useAtomValue(menuAtom)
  const at = nav.findIndex((t) => t.kind === target?.kind && t.id === target?.id)
  return (
    <HStack gap={2} vAlign="center">
      <Link color="secondary" onClick={() => setTarget(null)}>
        <HStack gap={1} vAlign="center">
          <Icon icon={ArrowLeftIcon} size="sm" color="inherit" />
          {menu}
        </HStack>
      </Link>
      {at >= 0 && (
        <>
          <Bullet />
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {at + 1}/{nav.length}
          </Text>
          <Button label={L.앞} variant="ghost" size="sm" isIconOnly icon={<Icon icon={ChevronLeftIcon} size="sm" />} isDisabled={at === 0} onClick={() => setTarget(nav[at - 1])} />
          <Button label={L.뒤} variant="ghost" size="sm" isIconOnly icon={<Icon icon={ChevronRightIcon} size="sm" />} isDisabled={at === nav.length - 1} onClick={() => setTarget(nav[at + 1])} />
        </>
      )}
    </HStack>
  )
}

/** 메타 한 줄의 항목: 아이콘 + 값 */
export const Meta = ({ icon, children }: { icon: typeof ArrowLeftIcon; children: ReactNode }) => (
  <HStack gap={1} vAlign="center">
    <Icon icon={icon} size="sm" color="secondary" />
    <Text>{children}</Text>
  </HStack>
)

/** 판단의 재료 타일(Card): 이름표(보조) · 값(large, 굵게) · 아래(막대 · 배지) · 옆(출처 표지) */
export type TileItem = { name: string; value: ReactNode; below?: ReactNode; aside?: ReactNode }
export function Tiles({ items }: { items: TileItem[] }) {
  return (
    <Grid columns={Math.min(items.length, 4)} gap={4}>
      {items.map((t) => (
        <Card key={t.name}>
          <VStack gap={2}>
            <HStack gap={2} vAlign="center">
              <StackItem size="fill">
                <Text type="supporting" color="secondary">
                  {t.name}
                </Text>
              </StackItem>
              {t.aside}
            </HStack>
            {typeof t.value === 'string' || typeof t.value === 'number' ? (
              <Text type="large" weight="semibold" hasTabularNumbers>
                {t.value}
              </Text>
            ) : (
              t.value
            )}
            {t.below}
          </VStack>
        </Card>
      ))}
    </Grid>
  )
}

/** 레일의 칸 하나: 카드 + 접히는 제목 */
export const RailCard = ({ title, icon, isOpen = true, children }: { title: string; icon?: ReactNode; isOpen?: boolean; children: ReactNode }) => (
  <Card>
    <Collapsible
      trigger={
        <HStack gap={2} vAlign="center">
          {icon}
          <Heading level={4}>{title}</Heading>
        </HStack>
      }
      defaultIsOpen={isOpen}
    >
      {children}
    </Collapsible>
  </Card>
)

/**
 * 페이지 조치 하나: 누르면 확인 창. 분류(classes)가 있으면 창에서 사유를 고르고(must면 고를 때까지 실행이 눌리지 않는다). `send`에 사유(없으면 null)가 간다.
 * 확인 창의 제목은 `조치 · 대상`, 몸통은 `rows`(무엇이 어떻게 바뀌는지)
 */
export function Act({ kind, classes = [], must = false, target, rows, send, isDisabled, children }: { kind: string; classes?: string[]; must?: boolean; target: string; rows?: [string, ReactNode][]; send: (reason: object | null) => Promise<unknown>; isDisabled?: boolean; children?: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(blank)
  return (
    <Confirm label={kind} variant={grade(kind)} title={`${kind} · ${target}`} rows={rows} canConfirm={ready(kind, must, draft)} isDisabled={isDisabled}
      onConfirm={() => send(sent(draft)).finally(() => setDraft(blank))}
    >
      {classes.length > 0 && <Reason groups={[{ of: kind, classes }]} value={draft} onChange={setDraft} />}
      {children}
    </Confirm>
  )
}

/** 정렬: 보조 조치가 앞, 주 버튼(grade primary)이 맨 끝 */
export const byGrade = <T extends { kind: string }>(list: T[]) => [...list].sort((a, b) => (grade(a.kind) === 'primary' ? 1 : 0) - (grade(b.kind) === 'primary' ? 1 : 0))

export type RecordTab = { value: string; label: string; body: ReactNode }

/**
 * 기록 화면 하나. `title`은 Heading 1, `meta`는 `・`로 잇는 한 줄(상태 Badge · 아이콘 값 · 표시 Token · 출처 표지), `actions`는 오른쪽 위(주 버튼은 맨 끝),
 * `bad`는 서버가 거절한 낱말(조치 아래 error Badge). 탭이 하나뿐이면 탭 줄을 두지 않는다. `rail`은 레일 칸(RailCard)들
 */
export function RecordPage({ title, meta, actions, bad, tabs, rail }: { title: string; meta: ReactNode[]; actions?: ReactNode; bad?: string | null; tabs: RecordTab[]; rail?: ReactNode }) {
  const [tab, setTab] = useState(tabs[0]?.value)
  const [showRail, setShowRail] = useState(true)
  // 1440(메뉴 · 대화 380)에서는 본문과 레일이 나란히, 그보다 좁으면 레일이 본문 아래로
  const narrow = useMediaQuery('(max-width: 1400px)')
  const body = (tabs.find((t) => t.value === tab) ?? tabs[0])?.body
  return (
    <Layout
      height="fill"
      contentWidth={1000}
      defaultHasDividers
      header={
        <LayoutHeader hasDivider padding={4} paddingBlockEnd={tabs.length > 1 ? 0 : 4}>
          <VStack gap={3}>
            <HStack gap={4} vAlign="start">
              <StackItem size="fill">
                <VStack gap={1}>
                  <Back />
                  <Heading level={1} maxLines={1}>
                    {title}
                  </Heading>
                  <HStack gap={1} vAlign="center" wrap="wrap">
                    {meta.filter(Boolean).map((f, i) => (
                      <Fragment key={i}>
                        {i > 0 && <Bullet />}
                        {f}
                      </Fragment>
                    ))}
                  </HStack>
                </VStack>
              </StackItem>
              {(actions || bad) && (
                <VStack gap={2} hAlign="end">
                  {actions}
                  {bad && <Badge variant="error" label={bad} />}
                </VStack>
              )}
            </HStack>
            {tabs.length > 1 && (
              <HStack vAlign="center">
                <StackItem size="fill">
                  <TabList value={tab} onChange={setTab} size="lg" isFullBleed>
                    {tabs.map((t) => (
                      <Tab key={t.value} value={t.value} label={t.label} />
                    ))}
                  </TabList>
                </StackItem>
                {rail && !narrow && <Button label={L.요약} variant="ghost" icon={<Icon icon={ViewColumnsIcon} size="sm" />} isIconOnly onClick={() => setShowRail(!showRail)} />}
              </HStack>
            )}
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent role="main" className="bg-body">
          <VStack gap={4}>
            {body}
            {rail && narrow && rail}
          </VStack>
        </LayoutContent>
      }
      end={
        rail && !narrow && showRail ? (
          <LayoutPanel width={320} padding={4} role="complementary" className="bg-body">
            <VStack gap={4}>{rail}</VStack>
          </LayoutPanel>
        ) : undefined
      }
    />
  )
}
