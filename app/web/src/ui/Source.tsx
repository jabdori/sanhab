import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Markdown } from '@astryxdesign/core/Markdown'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Popover } from '@astryxdesign/core/Popover'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { type ReactNode, useState } from 'react'
import { L } from '../labels'
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

/** 서버의 출처 → 화면의 표지. 서버의 '시연'(사람의 시연 조작·모의 회신으로 생긴 값)은 모의로 보인다. 시연으로 넣은 값(D58의 호실)은 부르는 쪽이 kind={L.합성}을 준다 */
const shown = (kind: string) => (kind === L.시연 ? L.모의 : kind)
const base = (file: string) => file.split('/').at(-1)

/**
 * 출처 표지. **원본이 아닌 값에만** 작은 표지(Token)가 붙는다: 계산 · 가정 · 합성 · AI · 모의.
 * 머물거나 초점을 주면 한 줄(`가정 D30 · 지연`), 누르면 설명 칸이 열린다.
 * - 원본: 표지가 없다. `file`·`row`가 있으면 조용한 행 번호(`7행`)만 남아 누르면 원본 파일의 그 행이 열린다. children만 있으면 조용한 `원본`이 그 내용을 연다
 * - 가정·합성: `of`(값의 낱말)로 결정 번호를 찾아 그 결정의 제목·본문·스펙의 줄·쓰임을 보인다. children은 그 아래에 붙는다
 * - 그 밖: `rows`(이름표와 값의 줄 — 계산이면 `[[L.합산, L['귀속월 지급의 합, 반려 제외']]]`)가 설명이다. 줄로 쓸 수 없는 글(조항의 원문)만 children에
 * `tip`은 한 줄 설명의 뒷말(없으면 `of`). `side`는 설명 칸이 열리는 쪽
 */
export function Source({ kind, file, row, side, of, tip, rows, children }: { kind: string; file?: string; row?: number; side?: 'right' | 'top'; of?: string; tip?: string; rows?: [string, ReactNode][]; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState<Row>()
  const [spec, setSpec] = useState<Spec | null>()
  const name = shown(kind)
  const id = of ? DECISION[of] : undefined
  const isOrigin = name === L.원본
  if (isOrigin && !(file && row) && !children && !rows) return null
  const line = isOrigin && file && row ? `${L.원본} · ${base(file)} ${row}${L.행}` : [[name, id].filter(Boolean).join(' '), tip ?? of].filter(Boolean).join(' · ')
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
        setSpec(list.find((s) => s.id === id) ?? null)
        setOpen(true)
      }, () => {})
    setOpen(true)
  }
  const content = (
    <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
      <Text weight="semibold">{line}</Text>
      {origin && file && row && <Origin file={file} row={row} o={origin} />}
      {spec && <Decision s={spec} />}
      {rows && (
        <MetadataList label={{ width: 72 }}>
          {rows.map(([k, v]) => (
            <MetadataListItem key={k} label={k}>
              {v}
            </MetadataListItem>
          ))}
        </MetadataList>
      )}
      {children && <div className="flex flex-col gap-2 text-sm">{children}</div>}
    </div>
  )
  const trigger = isOrigin ? (
    <button type="button" className="shrink-0 cursor-pointer rounded-sm px-0.5 text-sm whitespace-nowrap text-secondary tabular-nums hover:text-primary hover:underline">
      {file && row ? `${row}${L.행}` : L.원본}
    </button>
  ) : (
    // Token은 onClick이 있으면 안에 단추를 둔다(설명 칸이 그 단추에 붙는다)
    <Token label={name} size="sm" onClick={() => {}} />
  )
  return (
    <Popover content={content} label={line} isOpen={open} onOpenChange={toggle} width={400} placement={side === 'right' ? 'end' : side === 'top' ? 'above' : 'below'}>
      <Tooltip content={line} hasHoverIndication={false}>
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
  const why = <Markdown density="compact">{s.body}</Markdown>
  return (
    <MetadataList label={{ width: 72 }}>
      <MetadataListItem label={L.번호}>{s.id}</MetadataListItem>
      <MetadataListItem label={L.내용}>{s.text.replace(/^-\s*/, '')}</MetadataListItem>
      <MetadataListItem label={L['적용 시점']}>
        <span className="tabular-nums">{s.since} ~</span>
      </MetadataListItem>
      <MetadataListItem label={L.위치}>
        <span className="break-all">
          {s.file} {s.row}
          {L.행}
        </span>
      </MetadataListItem>
      <MetadataListItem label={L.이유}>
        {s.body.length > LONG ? (
          <Collapsible trigger={<Text weight="medium">{s.title}</Text>} defaultIsOpen={false}>
            {why}
          </Collapsible>
        ) : (
          <div className="flex flex-col gap-1">
            <Text weight="medium">{s.title}</Text>
            {why}
          </div>
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
        <span className="break-all">
          {file} {row}
          {L.행}
        </span>
      </MetadataListItem>
      {o.cells.map(([k, v]) => (
        <MetadataListItem key={k} label={k}>
          <span className="tabular-nums">{v}</span>
        </MetadataListItem>
      ))}
      <MetadataListItem label={L.해시}>
        <span className="break-all text-secondary">{o.sha}</span>
      </MetadataListItem>
    </MetadataList>
  )
}
