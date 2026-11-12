// 기록 화면의 틀(astryx detail-page 템플릿): 머리(← 메뉴 · n/전체 · 앞 뒤 / 제목 / 메타 한 줄 / 오른쪽 위 페이지 조치 / 탭) → 바탕 위의 카드 본문.
// 모든 기록 화면(심사 · 정황 · 소명 · 지급 · 추인 · 대리점 · 규정)이 이것 하나로 같은 꼴이 된다. 내용(카드 · 타일)만 화면이 채운다.
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, Layout, LayoutContent, LayoutHeader, Section, StackItem, VStack } from '@astryxdesign/core/Layout'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Token } from '@astryxdesign/core/Token'
import { Link } from '@astryxdesign/core/Link'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Heading, Text } from '@astryxdesign/core/Text'
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { useAtom, useAtomValue } from 'jotai'
import { Fragment, type ReactNode, useState } from 'react'
import { fail } from './status'
import { L } from '../labels'
import { menuAtom, navAtom, targetAtom, useData } from '../state'
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
  const opened = useAtomValue(navAtom)
  const [target, setTarget] = useAtom(targetAtom)
  const menu = useAtomValue(menuAtom)
  // 조치로 끝난 작업은 목록에서 빠진다: 지금 남아 있는 작업(과 지금 연 기록)만 센다
  const live = useData<{ mine: { view: string; target: string }[]; going: { view: string; target: string }[] }>(opened.length ? '/tasks' : null)
  const left = live ? new Set([...live.mine, ...live.going].map((t) => `${t.view}/${t.target}`)) : null
  const nav = opened.filter((t) => !left || left.has(`${t.kind}/${t.id}`) || (t.kind === target?.kind && t.id === target?.id))
  const at = nav.findIndex((t) => t.kind === target?.kind && t.id === target?.id)
  // 메뉴가 바로 그 기록을 보일 때(조항이 하나뿐인 규정)는 돌아갈 목록이 없다
  if (!target) return null
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

/** 칩 줄의 항목: 아이콘 + 값의 색 없는 Token(사람 · 구성 · 날짜 …) */
export const Meta = ({ icon, children }: { icon: typeof ArrowLeftIcon; children: string }) => <Token size="sm" icon={<Icon icon={icon} size="sm" />} label={children} />

/** 판단의 재료 타일(Card): 이름표(보조) · 값(large, 굵게) · 아래(막대 · 배지) · 옆(출처 표지) */
export type TileItem = { name: string; value: ReactNode; below?: ReactNode; aside?: ReactNode; dot?: 'neutral' | 'success' | 'warning' | 'error' }
/** 숫자 타일(dashboard-alert-rail의 KPI): 이 앱에서 Card를 쓰는 곳. 흰 면 위 Section 한 칸에 놓인다 */
export function Tiles({ items }: { items: TileItem[] }) {
  return (
    <Section variant="transparent" padding={6}>
      <Grid columns={{ minWidth: 120, max: 5 }} gap={4}>
      {items.map((t) => (
        <Card key={t.name}>
          <VStack gap={2}>
            <HStack gap={2} vAlign="center">
              {t.dot && <StatusDot variant={t.dot} label={t.name} />}
              <StackItem size="fill">
                <Text type="supporting" color="secondary">
                  {t.name}
                </Text>
              </StackItem>
              {t.aside}
            </HStack>
            {typeof t.value === 'string' || typeof t.value === 'number' ? (
              <Text type="large" weight="semibold" hasTabularNumbers className="whitespace-nowrap">
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
    </Section>
  )
}

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
 * 기록 화면 하나(work-item-detail 머리). `title`은 Heading 1, `meta`는 칩 줄(상태 Badge · 표시 · 사람 · 출처 표지), `actions`는 오른쪽 위(주 버튼은 맨 끝),
 * `bad`는 서버가 거절한 낱말(조치 아래 error Badge). 탭이 하나뿐이면 탭 줄을 두지 않는다.
 * 레일은 두지 않는다: 요약은 머리의 메타 · 타일과 겹치고, AI 보고는 오른쪽 AI 구역(대화 칸 위, AiPanel)에 있다
 */
export function RecordPage({ title, meta, actions, bad, tabs }: { title: string; meta: ReactNode[]; actions?: ReactNode; bad?: string | null; tabs: RecordTab[] }) {
  const [tab, setTab] = useState(tabs[0]?.value)
  const body = (tabs.find((t) => t.value === tab) ?? tabs[0])?.body
  return (
    <Layout
      height="fill"
      contentWidth={1000}
      header={
        <LayoutHeader hasDivider padding={6} paddingBlockEnd={tabs.length > 1 ? 0 : 6}>
          <VStack gap={4}>
            <HStack gap={4} vAlign="start">
              <StackItem size="fill">
                <VStack gap={2}>
                  <Back />
                  <Heading level={1} maxLines={2}>
                    {title}
                  </Heading>
                  {/* 칩 줄(work-item-detail): 상태 Badge · 표시 · 사람 · 출처 표지. 사이 기호 없이 칩끼리 */}
                  <HStack gap={1} vAlign="center" wrap="wrap">
                    {meta.filter(Boolean).map((f, i) => (
                      <Fragment key={i}>{f}</Fragment>
                    ))}
                  </HStack>
                </VStack>
              </StackItem>
              {(actions || bad) && (
                <VStack gap={2} hAlign="end">
                  {actions}
                  {bad && <Badge variant={fail} label={bad} />}
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
              </HStack>
            )}
          </VStack>
        </LayoutHeader>
      }
      content={
        // 흰 면 하나: 숫자 타일과 영역(Section, 위 구분선)이 차례로 쌓인다(work-item-detail)
        <LayoutContent role="main" padding={0}>
          <VStack gap={0}>{body}</VStack>
        </LayoutContent>
      }
    />
  )
}
