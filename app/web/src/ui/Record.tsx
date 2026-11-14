// astryx template: detail-page — 기록 화면의 틀. 머리(PageHeader: ← 메뉴 / 제목 / 메타 한 줄(아이콘 + 글, 사이 점) / 오른쪽 조치 / 탭 + 오른쪽 칸 단추) · 본문(Section 카드가 gap 4로 쌓임) · 오른쪽 칸(RightPanel: 접는 묶음).
// 모든 기록 화면(심사 · 정황 · 소명 · 지급 · 추인 · 대리점 · 규정)이 이것 하나로 같은 꼴이 된다. 템플릿에서 벗어난 곳은 docs/design/components.md
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, Layout, LayoutContent, LayoutHeader, LayoutPanel, Section, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Token } from '@astryxdesign/core/Token'
import { Link } from '@astryxdesign/core/Link'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Heading, Text } from '@astryxdesign/core/Text'
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, QueueListIcon, SparklesIcon, ViewColumnsIcon } from '@heroicons/react/24/outline'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { isValidElement, type ReactNode, useState } from 'react'
import { State } from './Mark'
import { plain } from './status'
import { fail } from './status'
import { L } from '../labels'
import { menuAtom, navAtom, paneAtom, sideAtom, targetAtom, useData } from '../state'
import { AiBody } from '../AiPanel'
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
  const [pane, setPane] = useAtom(paneAtom)
  if (!target) return null
  return (
    <HStack gap={2} vAlign="center">
      {/* 목록 사이드바를 펴고 접는다(기록을 열면 접힌 채 시작) */}
      <Button label={L.목록} variant="ghost" size="sm" isIconOnly icon={<Icon icon={QueueListIcon} size="sm" />} onClick={() => setPane(!pane)} />
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

/** 메타 줄의 항목(detail-page): 보조 색 아이콘 + 글(사람 · 구성 · 날짜 …) */
export const Meta = ({ icon, children }: { icon: typeof ArrowLeftIcon; children: string }) => (
  <HStack gap={1} vAlign="center">
    <Icon icon={icon} size="sm" color="secondary" />
    <Text type="body" maxLines={1}>
      {children}
    </Text>
  </HStack>
)

/** 판단의 재료 타일(Card): 이름표(보조) · 값(large, 굵게) · 아래(막대 · 배지) · 옆(출처 표지) */
export type TileItem = { name: string; value: ReactNode; below?: ReactNode; aside?: ReactNode; dot?: 'neutral' | 'success' | 'warning' | 'error' }
/** 숫자 묶음(detail-page의 InvoiceCard): Section 하나에 MetadataList — 이름표 / (막대 · 출처 표지) · 값(굵게, 오른쪽) */
export function Tiles({ items }: { items: TileItem[] }) {
  return (
    <Section data-tour="tiles">
      <MetadataList>
        {items.map((t) => (
          <MetadataListItem key={t.name} label={t.name}>
            <HStack gap={2} vAlign="center">
              {t.dot && <StatusDot variant={t.dot} label={t.name} />}
              <StackItem size="fill">
                <VStack gap={1}>
                  {t.below}
                  {t.aside}
                </VStack>
              </StackItem>
              {typeof t.value === 'string' || typeof t.value === 'number' ? (
                <Text type="body" weight="bold" hasTabularNumbers className="whitespace-nowrap">
                  {t.value}
                </Text>
              ) : (
                t.value
              )}
            </HStack>
          </MetadataListItem>
        ))}
      </MetadataList>
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
export function RecordPage({ title, meta, actions, bad, tabs, props = [] }: { title: string; meta: ReactNode[]; actions?: ReactNode; bad?: string | null; tabs: RecordTab[]; props?: [string, ReactNode][] }) {
  const [tab, setTab] = useState(tabs[0]?.value)
  const [side, setSide] = useAtom(sideAtom)
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
                <VStack gap={0}>
                  <Back />
                  <Heading level={1} maxLines={2}>
                    {title}
                  </Heading>
                  {/* 메타 줄(detail-page): 상태 Badge · 표시 · 사람 · 출처 표지, 사이에 점 */}
                  <HStack gap={1} vAlign="center" wrap="wrap">
                    {meta.filter((f) => f && !(isValidElement<{ word?: string | null }>(f) && f.type === State && plain(f.props.word))).map((f, i) => (
                      <HStack key={i} gap={1} vAlign="center">
                        {i > 0 && <Bullet />}
                        {f}
                      </HStack>
                    ))}
                  </HStack>
                </VStack>
              </StackItem>
              {(actions || bad) && (
                <VStack gap={2} hAlign="end" data-tour="actions">
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
                {/* 보조 칸(요약 · AI 보고 · 대화)을 펴고 접는다(work-item-detail의 Hide details) */}
                <Button label={L.요약} variant="ghost" size="md" isIconOnly icon={<Icon icon={ViewColumnsIcon} size="sm" />} onClick={() => setSide(!side)} />
              </HStack>
            )}
          </VStack>
        </LayoutHeader>
      }
      content={
        // detail-page: 본문은 Section(카드)이 gap 4로 쌓인다
        <LayoutContent role="main">
          <VStack gap={4}>{body}</VStack>
        </LayoutContent>
      }
      end={
        side && (
          // 보조 칸(work-item-detail의 Details 레일): 접고 펴는 영역이 위에서 아래로 이어진다 — 요약 → AI 보고 → 대화. 칸 전체가 하나로 스크롤된다
          <LayoutPanel width={320} padding={4} role="complementary" isScrollable label={L.요약}>
            <VStack gap={4}>
              {props.length > 0 && (
                <Fold title={L.요약}>
                  <MetadataList>
                    {props.map(([k, v]) => (
                      <MetadataListItem key={k} label={k}>
                        {v}
                      </MetadataListItem>
                    ))}
                  </MetadataList>
                </Fold>
              )}
              <AiFold />
            </VStack>
          </LayoutPanel>
        )
      }
    />
  )
}

/** 보조 칸의 영역 하나: 제목을 누르면 접고 편다(열린 채 시작) */
function Fold({ title, icon, children }: { title: string; icon?: typeof SparklesIcon; children: ReactNode }) {
  return (
    // detail-page의 RightPanel: 제목(Heading 4)을 누르면 접고 펴는 묶음
    <Collapsible
      trigger={
        <HStack gap={2} vAlign="center">
          {icon && <Icon icon={icon} size="sm" color="accent" />}
          <Heading level={4}>{title}</Heading>
        </HStack>
      }
      defaultIsOpen
    >
      <VStack gap={3}>{children}</VStack>
    </Collapsible>
  )
}

/** AI 보고 영역: AI가 쓴 것이 있을 때만 */
function AiFold() {
  const body = AiBody()
  return body ? (
    <Fold title={`${L.AI} ${L.보고}`} icon={SparklesIcon}>
      {body}
    </Fold>
  ) : null
}

