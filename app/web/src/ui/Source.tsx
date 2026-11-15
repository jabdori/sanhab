import { Collapsible } from '@astryxdesign/core/Collapsible'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Markdown } from '@astryxdesign/core/Markdown'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Popover } from '@astryxdesign/core/Popover'
import { Text } from '@astryxdesign/core/Text'
import { Icon } from '@astryxdesign/core/Icon'
import { BeakerIcon, CalculatorIcon, InformationCircleIcon, LightBulbIcon, SparklesIcon, Square2StackIcon, AcademicCapIcon } from '@heroicons/react/24/outline'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { type ReactNode, useState } from 'react'
import { COLS, DOCS, L } from '../labels'
import { api } from '../state'

/**
 * 값 → 스펙의 결정 번호. 출처가 가정·합성인 값의 설명(번호, 제목, 결정의 본문, 스펙의 줄, 쓰임)은 /api/rules의 assumes·synths 한 곳에서 읽고,
 * 화면에는 이 대응만 둔다. 새 가정을 쓰는 화면은 여기에 한 줄을 더하고 <Source kind={L.가정} of={L.낱말} />로 부른다
 */
export const DECISION: Record<string, string> = {
  [L.기한]: 'D32',
  [L.지연]: 'D30',
  [L.근접]: 'D51',
  [L.서류]: 'D17',
  [L.호실]: 'D58',
  [L.가설]: 'D8',
}

type Row = { sha: string; cells: [string, string][] }
type Spec = { id: string; title: string; text: string; body: string; file: string; row: number; used: { view: string }[]; source: string; since: string }

// 가정·합성의 목록은 바뀌지 않는다(스펙에서 모은다). 처음 열 때 한 번만 읽는다
let specs: Promise<Spec[]> | null = null
const readSpecs = () =>
  (specs ??= api<{ assumes: Spec[]; synths: Spec[] }>('/rules').then(
    (d) => [...d.assumes, ...d.synths],
    (e) => {
      specs = null
      throw e
    },
  ))

/** 출처 표지의 아이콘: 계산 · 가정 · 합성 · AI · 모의 */
const ICON: Record<string, typeof SparklesIcon> = { [L.예시]: AcademicCapIcon, [L.계산]: CalculatorIcon, [L.가정]: LightBulbIcon, [L.합성]: Square2StackIcon, [L.AI]: SparklesIcon, [L.모의]: BeakerIcon }

/**
 * 출처 표지. **원본이 아닌 값에만** 작은 표지(Token)가 붙는다: 계산 · 가정 · 합성 · AI · 모의.
 * 머물거나 초점을 주면 한 줄(`가정 D30 · 지연`), 누르면 설명 칸이 열린다.
 * - 원본: 표지가 없다. `file`·`row`가 있으면 조용한 행 번호(`7행`)만 남아 누르면 원본 파일의 그 행이 열린다. children만 있으면 조용한 `원본`이 그 내용을 연다
 * - 가정·합성: `of`(값의 낱말)로 결정 번호를 찾아 그 결정의 제목·본문·스펙의 줄·쓰임을 보인다. children은 그 아래에 붙는다
 * - 그 밖: `rows`(이름표와 값의 줄 — 계산이면 `[[L.합산, L['귀속월 지급의 합, 반려 제외']]]`)가 설명이다. 줄로 쓸 수 없는 글(조항의 원문)만 children에
 * - `decision`은 결정 번호를 바로 준다(규정 화면의 가정 목록). 한 결정에 가정 줄이 여럿이면(D46의 표) `line`(스펙의 행)으로 그 줄을 고른다
 * - `quiet`이면 표지 대신 조용한 글자(`place`)가 설명 칸을 연다 — 표 전체가 같은 출처라 줄마다 표지를 다는 것이 군더더기일 때(규정의 가정 목록: 번호가 연다)
 * 원본의 조용한 글자는 언제나 행 번호다: csv는 `row`(`7행`), 문서의 여러 행은 `place`(`41–45행`)를 준다. 표의 출처 열이나 숫자 줄 값 옆에 둔다(값의 칸 안에 섞지 않는다).
 * `tip`은 한 줄 설명의 뒷말(없으면 `of`). `side`는 설명 칸이 열리는 쪽
 */
/** 출처 설명 칸의 위치 줄(파일 경로 · 행). 파일 경로는 이 칸에서만 화면에 나온다(review.md 2-1) */
export const fileLine = (file: string, first: number, last: number) => `${file} ${first}–${last}${L.행}`

export function Source({ kind, file, row, place, quiet, plain, side, of, decision, line: at, tip, rows, children }: { kind: string; file?: string; row?: number; place?: string; quiet?: boolean; plain?: boolean; side?: 'right' | 'top'; of?: string; decision?: string; line?: number; tip?: string; rows?: [string, ReactNode][]; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState<Row>()
  const [spec, setSpec] = useState<Spec | null>()
  // 서버의 출처 `시연`은 사람이 제품에서 한 조치(변경·결정·요청 …)로 생긴 값이다 — 제품의 동작이라 표지가 없다(누가 언제는 이력에).
  // `모의`는 시연 서랍에서 만든 값(모의 회신, 시연 서류, 넘긴 날짜)에만, 부르는 쪽이 kind={L.모의}로 준다. 이 판정은 여기 한 곳이다
  if (kind === L.시연) return null
  const name = kind
  const id = decision ?? (of ? DECISION[of] : undefined)
  const isOrigin = name === L.원본
  if (isOrigin && !(file && row) && !children && !rows) return null
  const line = isOrigin && file && row ? `${L.원본} · ${DOCS[file] ?? L.원본} ${row}${L.행}` : [[name, id].filter(Boolean).join(' '), tip ?? of].filter(Boolean).join(' · ')
  // 열기 전에 내용을 받아 둔다(빈 칸이 먼저 열렸다 채워지지 않게)
  const toggle = (next: boolean) => {
    if (!next) return setOpen(false)
    if (isOrigin && file && row && !origin)
      return void api<Row>(`/origin?file=${encodeURIComponent(file)}&row=${row}`).then((d) => {
        setOrigin(d)
        setOpen(true)
      }, () => {})
    if (id && spec === undefined)
      return void readSpecs().then((list) => {
        setSpec(list.find((s) => s.id === id && (!at || s.row === at)) ?? null)
        setOpen(true)
      }, () => {})
    setOpen(true)
  }
  const content = (
    <VStack gap={3}>
      <Text weight="semibold">{line}</Text>
      {origin && file && row && <Origin file={file} row={row} o={origin} />}
      {spec && <Decision s={spec} />}
      {rows && (
        <MetadataList label={{ width: 72 }}>
          {/* 같은 이름표가 여러 줄일 수 있다(계좌 여럿 — 값 하나에 사실 하나) */}
          {rows.map(([k, v], i) => (
            <MetadataListItem key={i} label={k}>
              {v}
            </MetadataListItem>
          ))}
        </MetadataList>
      )}
      {/* 글(조항의 원문 등 마크다운)은 그려서 보인다(## · ** 원문이 그대로 나오지 않게) */}
      {typeof children === 'string' ? <Markdown density="compact" headingLevelStart={5}>{children}</Markdown> : children && <VStack gap={2}>{children}</VStack>}
    </VStack>
  )
  const trigger = isOrigin || quiet ? (
    // 원본은 표지 없이 조용한 행 번호(보조 색 Link)
    <Link type={plain ? undefined : 'supporting'} color="secondary" onClick={() => {}}>
      {file && row ? `${row}${L.행}` : (place ?? L.원본)}
    </Link>
  ) : (
    // 표지는 상태 Badge(채운 알약)와 다른 꼴: 종류 아이콘 + 보조 색 글자의 Link(누르면 설명 칸)
    <Link type="supporting" color="secondary" onClick={() => {}}>
      <HStack gap={0.5} vAlign="center">
        <Icon icon={ICON[name] ?? InformationCircleIcon} size="sm" color="inherit" />
        {name}
      </HStack>
    </Link>
  )
  return (
    <Popover content={content} label={line} isOpen={open} onOpenChange={toggle} width={400} placement={side === 'right' ? 'end' : side === 'top' ? 'above' : 'below'}>
      <Tooltip content={line} placement="below" hasHoverIndication={false}>
        {trigger}
      </Tooltip>
    </Popover>
  )
}

/** 이유(결정의 본문)가 이보다 길면 접어 두고 결정 제목을 눌러 펼친다 */
const LONG = 160

/**
 * 가정·합성의 설명(A05 §6: 추가한 값의 식별자·적용 시점·원본 연결·생성 이유): 번호 · 내용(스펙의 그 줄) · 적용 시점(기준일부터) · 위치(문서와 행) · 이유(결정의 본문, 길면 접힘) · 쓰임
 */
function Decision({ s }: { s: Spec }) {
  const why = <Markdown density="compact" headingLevelStart={5}>{s.body}</Markdown>
  return (
    <MetadataList label={{ width: 72 }}>
      <MetadataListItem label={L.번호}>{s.id}</MetadataListItem>
      <MetadataListItem label={L.내용}>
        {/* 스펙의 표 한 줄(D46의 "숫자가 기대는 가정")은 칸마다 한 줄로 푼다 */}
        {s.text.includes(' | ') ? (
          <VStack gap={1}>
            {s.text.split(' | ').map((c, i) => (
              <Text key={i}>{c.trim()}</Text>
            ))}
          </VStack>
        ) : (
          // 스펙 줄의 글머리(`- `, `4. `)와 맨 앞의 `가정 —`는 떼고 내용만
          s.text.replace(/^(-|\d+\.)\s*/, '').replace(new RegExp(`^${L.가정}\\s*—\\s*`), '')
        )}
      </MetadataListItem>
      <MetadataListItem label={L['적용 시점']}>
        <Text hasTabularNumbers>{s.since} ~</Text>
      </MetadataListItem>
      <MetadataListItem label={L.위치}>
        <Text>
          {s.file} {s.row}
          {L.행}
        </Text>
      </MetadataListItem>
      <MetadataListItem label={L.이유}>
        {s.body.length > LONG ? (
          <Collapsible trigger={<Text weight="medium">{s.title}</Text>} defaultIsOpen={false}>
            {why}
          </Collapsible>
        ) : (
          <VStack gap={1}>
            <Text weight="medium">{s.title}</Text>
            {why}
          </VStack>
        )}
      </MetadataListItem>
      {s.used.length > 0 && <MetadataListItem label={L.쓰임}>{s.used.map((u) => u.view).join(' · ')}</MetadataListItem>}
    </MetadataList>
  )
}

/** 원본 파일의 한 행: 경로와 행 번호, 머리글과 값 그대로, 파일의 내용 해시 */
function Origin({ file, row, o }: { file: string; row: number; o: Row }) {
  return (
    <MetadataList>
      <MetadataListItem label={L.원본}>
        <Text>
          {file} {row}
          {L.행}
        </Text>
      </MetadataListItem>
      {o.cells.map(([k, v]) => (
        // 열 이름은 사람이 읽는 이름으로, 원래 열 이름은 보조 글로(원본을 추적할 수 있게). 빈 값(NONE · 빈칸)은 없음
        <MetadataListItem key={k} label={COLS[k] ?? k}>
          <VStack gap={0}>
            <Text hasTabularNumbers>{v && v !== 'NONE' ? v : L.없음}</Text>
            {COLS[k] && <Text type="supporting" color="secondary">{k}</Text>}
          </VStack>
        </MetadataListItem>
      ))}
      <MetadataListItem label={L.해시}>
        {/* 64자 해시는 앞부분만(머물면 전체) — 설명 칸이 가로로 밀리지 않게 */}
        <Tooltip content={o.sha}>
          <Text color="secondary" hasTabularNumbers>
            {o.sha.slice(0, 16)}…
          </Text>
        </Tooltip>
      </MetadataListItem>
    </MetadataList>
  )
}
