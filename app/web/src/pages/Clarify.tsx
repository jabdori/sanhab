// 소명 기록: 머리(← 작업 · n/전체 / 소명 이름 / 메타 한 줄 / 페이지 조치 / 탭) → 본문(요청서 · 서류 · 원본 · 판독 · 접수 · 제외) → 오른쪽 레일(요약 · AI 정리 · 미확인).
// 페이지 조치: 영업지원은 발송(요청서를 고쳐), 내부 감시는 서류가 접수된 뒤 인정 · 불인정 · 보완. 모두 누르면 확인 창.
import { Badge } from '@astryxdesign/core/Badge'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { BuildingStorefrontIcon, CalendarIcon, ClockIcon } from '@heroicons/react/24/outline'
import { useAtomValue } from 'jotai'
import { useState } from 'react'
import { L } from '../labels'
import { api, changedAtom, store, targetAtom } from '../state'
import { Region } from '../ui/Region'
import { Act, Meta, RecordPage, Tiles } from '../ui/Record'
import { Source } from '../ui/Source'
import { badge } from '../ui/status'
import { Docs, ClarifyHistory, Letter, letterAtom } from '../tickets/18-발송'
import { type Clarify as Data, useClarify } from '../tickets/18-발송/clarify'
import { OriginalDoc, Read, Upload } from '../tickets/19-서류'
import { useDocs } from '../tickets/19-서류/docs'
import { Excluded, Verdicts } from '../tickets/20-소명'

/** 발송(영업지원, 주 버튼): 고친 요청서(없으면 AI 초안, 글 없이 목록만으로도 된다)를 보낸다. 되돌릴 수 없어 확인 창을 거친다 */
function Send({ d, onBad }: { d: Data; onBad: (word: string | null) => void }) {
  const typed = useAtomValue(letterAtom)
  const body = (typed ?? d.draft?.text ?? '').trim()
  const rows = d.docs.map(([kind, doc]): [string, string] => [kind, doc])
  return (
    <Act
      kind={L.발송}
      target={d.clarify.dealer.name}
      rows={rows}
      isDisabled={!d.docs.length && !body}
      send={() => (onBad(null), api('/send', { id: d.clarify.id, body: body || undefined }).catch((e: Error) => (onBad(e.message), store.set(changedAtom, (n) => n + 1))))}
    />
  )
}


export function Clarify() {
  const d = useClarify()
  const docs = useDocs()
  const [bad, setBad] = useState<{ id: string; word: string } | null>(null)
  if (!d) return null
  const c = d.clarify
  const onBad = (word: string | null) => setBad(word ? { id: c.id, word } : null)
  const read = docs?.docs.at(-1)?.rows.length
  return (
    <RecordPage
      title={c.name}
      meta={[
        <Badge variant={badge(c.state)} label={c.state} />,
        <Meta icon={BuildingStorefrontIcon}>{c.dealer.name}</Meta>,
        ...(c.signal ? [<Link onClick={() => store.set(targetAtom, { kind: L.정황, id: c.signal!.id })}>{c.signal.name}</Link>] : []),
        ...(d.kinds.length
          ? [
              <HStack gap={1} vAlign="center">
                {d.kinds.map((k) => (
                  <Token key={k} size="sm" label={k} />
                ))}
                {/* 일치는 계산(정황의 근거에서 고른 종류) */}
                <Source kind={c.source} tip={`${L.정황} · ${L.일치}`} rows={[...(c.signal ? ([[L.정황, c.signal.name]] as [string, string][]) : []), [L.일치, d.kinds.join(' · ')]]} />
              </HStack>,
            ]
          : []),
        ...(d.sent ? [<Meta icon={CalendarIcon}>{`${L.발송} ${d.sent}`}</Meta>] : []),
        ...(d.due
          ? [
              // 기한의 길이는 가정(D32). 발송 전에는 기한이 없으니 표지도 없다
              <HStack gap={1} vAlign="center">
                <Icon icon={ClockIcon} size="sm" color="secondary" />
                <Text>{`${L.기한} ${d.due}`}</Text>
                <Source kind={L.가정} of={L.기한} rows={[[L.발송, d.sent ?? L.없음], [L.기한, d.due]]} />
              </HStack>,
            ]
          : []),
      ]}
      actions={
        <HStack gap={2}>
          {d.can && <Send d={d} onBad={onBad} />}
          <Verdicts onBad={onBad} />
        </HStack>
      }
      bad={bad?.id === c.id ? bad.word : null}
      tabs={[
        {
          value: 'body',
          label: L.내용,
          body: (
            <>
              {/* 숫자 타일: 요청한 서류 · 접수한 서류, 판독했으면 누락 · 불일치(계산) */}
              <Tiles
                items={[
                  { name: L.서류, value: d.docs.length },
                  { name: L.접수, value: docs?.docs.length ?? 0 },
                  ...(read
                    ? [
                        { name: L.누락, value: docs?.docs.at(-1)?.counts[L.누락] ?? 0, aside: <Source kind={L.계산} tip={L.누락} rows={[[L.누락, docs?.docs.at(-1)?.counts[L.누락] ?? 0]]} /> },
                        { name: L.불일치, value: docs?.docs.at(-1)?.counts[L.불일치] ?? 0, aside: <Source kind={L.계산} tip={L.불일치} rows={[[L.불일치, docs?.docs.at(-1)?.counts[L.불일치] ?? 0]]} /> },
                      ]
                    : []),
                ]}
              />
              <Letter />
              <Docs />
              <Read />
              <OriginalDoc />
              <Upload />
              <Excluded />
            </>
          ),
        },
        {
          value: 'history',
          label: L.이력,
          body: (
            <Region title={L.이력}>
              <ClarifyHistory />
            </Region>
          ),
        },
      ]}
    />
  )
}
