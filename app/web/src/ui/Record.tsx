// astryx template: detail-page — 기록 화면의 틀. 머리(PageHeader: ← 메뉴 / 제목 / 메타 한 줄(아이콘 + 글, 사이 점) / 오른쪽 조치 / 탭 + 오른쪽 칸 단추) · 본문(Section 카드가 gap 4로 쌓임) · 오른쪽 칸(RightPanel: 접는 묶음).
// 모든 기록 화면(심사 · 정황 · 소명 · 지급 · 추인 · 대리점 · 규정)이 이것 하나로 같은 꼴이 된다. 템플릿에서 벗어난 곳은 docs/design/components.md
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, Layout, LayoutContent, LayoutHeader, LayoutPanel, Section, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Pagination } from '@astryxdesign/core/Pagination'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Link } from '@astryxdesign/core/Link'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Heading, Text } from '@astryxdesign/core/Text'
import { ArrowLeftIcon, QueueListIcon, ViewColumnsIcon } from '@heroicons/react/24/outline'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { isValidElement, type ReactNode, useState } from 'react'
import { Kind, Mark, State } from './Mark'
import { fail, plain } from './status'
import { L } from '../labels'
import { backAtom, menuAtom, navAtom, paneAtom, sideAtom, stepAtom, targetAtom, useData } from '../state'
import { useMediaQuery } from '@astryxdesign/core/hooks'
import { type Draft, Reason, blank, ready, sent } from './Reason'
import { Confirm } from './Confirm'
import { grade } from './grade'

const Bullet = () => (
  <Text type="supporting" color="secondary">
    {'・'}
  </Text>
)

/** ← (지금 메뉴) · n/전체 ‹ ›(Pagination compact): 작업 목록에서 열었으면 그 순서를 따라 앞뒤로 간다 */
function Back() {
  const [opened, setNav] = useAtom(navAtom)
  const [target, setTarget] = useAtom(targetAtom)
  const [menu, setMenu] = useAtom(menuAtom)
  const [back, setBack] = useAtom(backAtom)
  const step = useSetAtom(stepAtom)
  // 조치로 끝난 작업은 목록에서 빠진다: 지금 남아 있는 작업(과 지금 연 기록)만 센다
  const live = useData<{ mine: { view: string; target: string }[]; going: { view: string; target: string }[] }>(opened.length ? '/tasks' : null)
  const left = live ? new Set([...live.mine, ...live.going].map((t) => `${t.view}/${t.target}`)) : null
  const nav = opened.filter((t) => t.kind === L.대리점 || !left || left.has(`${t.kind}/${t.id}`) || (t.kind === target?.kind && t.id === target?.id))
  const at = nav.findIndex((t) => t.kind === target?.kind && t.id === target?.id)
  const [pane, setPane] = useAtom(paneAtom)
  if (!target) return null
  return (
    <HStack gap={2} vAlign="center">
      {/* 목록 사이드바를 펴고 접는다(기록을 열면 접힌 채 시작) */}
      <Button label={L.목록} variant="ghost" size="sm" isIconOnly icon={<Icon icon={QueueListIcon} size="sm" />} onClick={() => setPane(!pane)} />
      {/* 다른 기록에서 건너왔으면 그 기록으로(낱말은 그 기록의 종류), 아니면 목록으로(메뉴) */}
      <Link color="secondary" onClick={() => {
          const b = back.at(-1)
          if (!b) return setTarget(null)
          setBack(back.slice(0, -1))
          setMenu(b.menu)
          setNav(b.nav)
          step(b.target)
        }}>
        <HStack gap={1} vAlign="center">
          <Icon icon={ArrowLeftIcon} size="sm" color="inherit" />
          {back.at(-1)?.target.kind ?? menu}
        </HStack>
      </Link>
      {at >= 0 && nav.length > 1 && <Pagination variant="compact" size="sm" label={L.목록} page={at + 1} totalPages={nav.length} onChange={(p) => step(nav[p - 1])} />}
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
            {/* MetadataList는 이름표와 값을 글자 기준선으로 맞춘다: 막대 · 출처 표지가 없는 줄에 빈 칸(StackItem)을 앞에 두면 기준선이 그 빈 칸의 바닥이 되어 값이 내려간다(줄 간격이 줄마다 달라짐) — 없으면 빈 칸 없이 오른쪽 맞춤 */}
            <HStack gap={2} vAlign="center" hAlign="end">
              {t.dot && <StatusDot variant={t.dot} label={t.name} />}
              {(t.below || t.aside) && (
                <StackItem size="fill">
                  <VStack gap={1}>
                    {t.below}
                    {t.aside}
                  </VStack>
                </StackItem>
              )}
              {typeof t.value === 'string' || typeof t.value === 'number' ? (
                <Text type="body" weight="bold" hasTabularNumbers textWrap="nowrap">
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
 * 확인 창의 제목은 `조치 · 대리점`(target — 대리점이나 그룹의 이름 하나. 여럿이면 비우고 rows에 줄마다), 몸통은 `rows`(무엇이 어떻게 바뀌는지 — 귀속월 · 상태 · 금액 …, 값 하나에 사실 하나 review.md 2-1)
 */
export function Act({ kind, classes = [], must = false, target, rows, send, isDisabled, children }: { kind: string; classes?: string[]; must?: boolean; target?: string; rows?: [string, string][]; send: (reason: object | null) => Promise<unknown>; isDisabled?: boolean; children?: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(blank)
  // 사유를 고르거나 값을 넣는 창만 Dialog form, 나머지는 AlertDialog(ui/Confirm)
  const input = (classes.length > 0 || children) && (
    <>
      {classes.length > 0 && <Reason groups={[{ of: kind, classes }]} value={draft} onChange={setDraft} />}
      {children}
    </>
  )
  return (
    <Confirm label={kind} variant={grade(kind)} title={target ? `${kind} · ${target}` : kind} rows={rows} canConfirm={ready(kind, must, draft)} isDisabled={isDisabled}
      onConfirm={() => send(sent(draft)).finally(() => setDraft(blank))}
    >
      {input || undefined}
    </Confirm>
  )
}

/** 정렬: 보조 조치가 앞, 주 버튼(grade primary)이 맨 끝 */
export const byGrade = <T extends { kind: string }>(list: T[]) => [...list].sort((a, b) => (grade(a.kind) === 'primary' ? 1 : 0) - (grade(b.kind) === 'primary' ? 1 : 0))

export type RecordTab = { value: string; label: string; body: ReactNode }

/**
 * 기록 화면 하나(detail-page + work-item-detail 머리). `title`은 Heading 1, `meta`는 메타 줄(상태 Badge · 표시 · 사람 · 출처 표지, 사이 점 — 기본 상태의 State는 걸러진다),
 * `actions`는 오른쪽 위(주 버튼은 맨 끝, 좁으면 메타 아래 한 줄), `bad`는 서버가 거절한 낱말(조치 아래 error Badge).
 * 탭 줄은 탭이 하나여도 둔다(오른쪽 끝에 요약 칸 단추). `props`는 오른쪽 칸(요약)의 이름표와 값 — 좁으면 본문 맨 위 Section(D63).
 * 값을 아직 받지 못했으면 이것 대신 `<Pending of={q} page />`(ui/Pending)
 */
export function RecordPage({ title, meta, actions, bad, tabs, props = [] }: { title: string; meta: ReactNode[]; actions?: ReactNode; bad?: string | null; tabs: RecordTab[]; props?: [string, ReactNode][] }) {
  const [tab, setTab] = useState(tabs[0]?.value)
  const [side, setSide] = useAtom(sideAtom)
  const target = useAtomValue(targetAtom)
  // detail-page의 isNarrow. 대화 칸(360)까지 있어 기준은 1024가 아니라 1440(D63)
  const narrow = useMediaQuery('(max-width: 1439px)')
  // 칩 순서는 한 규칙: 기록 종류(색 아이콘 + 글자) → 상태 Badge → 표시(Mark) → 사람 · 구성 · 링크. 기본 상태의 State는 걸러진다
  const rank = (f: ReactNode) => (isValidElement(f) ? (f.type === Kind ? -1 : f.type === State ? 0 : f.type === Mark ? 1 : 2) : 2)
  const metaLine = [target && <Kind key="kind" of={target.kind} label />, ...meta].filter((f) => f && !(isValidElement<{ word?: string | null }>(f) && f.type === State && plain(f.props.word))).sort((a, b) => rank(a) - rank(b))
  const body = (tabs.find((t) => t.value === tab) ?? tabs[0])?.body
  const summary = props.length > 0 && (
    <MetadataList columns={narrow ? 'multi' : undefined}>
      {props.map(([k, v]) => (
        <MetadataListItem key={k} label={k}>
          {v}
        </MetadataListItem>
      ))}
    </MetadataList>
  )
  const act = (actions || bad) && (
    <VStack gap={2} hAlign="end" data-tour="actions">
      <HStack gap={2} wrap="wrap">
        {actions}
      </HStack>
      {bad && <Badge variant={fail} label={bad} />}
    </VStack>
  )
  return (
    <Layout
      height="fill"
      contentWidth={1000}
      defaultHasDividers
      header={
        <LayoutHeader hasDivider padding={4} paddingBlockEnd={0}>
          <VStack gap={3}>
            <HStack gap={4} vAlign="start">
              <StackItem size="fill">
                <VStack gap={0}>
                  <Back />
                  <VStack gap={0}>
                    <Heading level={1} maxLines={2}>
                      {title}
                    </Heading>
                    <HStack gap={1} vAlign="center" wrap="wrap">
                      {metaLine.map((f, i) => (
                        <HStack key={i} gap={1} vAlign="center">
                          {i > 0 && <Bullet />}
                          {f}
                        </HStack>
                      ))}
                    </HStack>
                  </VStack>
                </VStack>
              </StackItem>
              {act}
            </HStack>
            <HStack vAlign="center">
              <StackItem size="fill">
                <TabList value={tab} onChange={setTab} size="lg" isFullBleed>
                  {tabs.map((t) => (
                    <Tab key={t.value} value={t.value} label={t.label} />
                  ))}
                </TabList>
              </StackItem>
              {/* 오른쪽 칸(요약)을 펴고 접는다(detail-page의 Hide panel). 좁은 화면은 요약이 본문 맨 위라 단추가 없다 */}
              {!narrow && summary && <Button label={L.요약} variant="ghost" size="md" isIconOnly icon={<Icon icon={ViewColumnsIcon} size="sm" />} onClick={() => setSide(!side)} />}
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent role="main">
          <VStack gap={4}>
            {narrow && summary && (
              <Section data-tour="props">
                <VStack gap={4}>
                  <Heading level={2}>{L.요약}</Heading>
                  {summary}
                </VStack>
              </Section>
            )}
            {body}
          </VStack>
        </LayoutContent>
      }
      end={
        !narrow && side && summary ? (
          // detail-page의 RightPanel: 접는 묶음(Collapsible + Heading 4) 하나 — 요약
          <LayoutPanel width={320} padding={4} role="complementary" isScrollable label={L.요약}>
            <Collapsible trigger={<Heading level={4}>{L.요약}</Heading>} defaultIsOpen>
              {summary}
            </Collapsible>
          </LayoutPanel>
        ) : undefined
      }
    />
  )
}
