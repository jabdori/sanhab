import type { ReactNode } from 'react'
import { AiCard } from '../ui/AiCard'
import { Tidy } from '../tickets/19-서류'
import { Unknown } from '../tickets/20-소명'
import { useVerdict } from '../tickets/20-소명/verdict'
import { FlagIcon } from '@heroicons/react/24/outline'
import { Icon } from '@astryxdesign/core/Icon'
import { Token } from '@astryxdesign/core/Token'
// 소명 기록: 머리(← 작업 · n/전체 / 소명 이름 / 칩: 상태 · 대리점 · 정황 / 페이지 조치 / 탭) → 본문(숫자 타일 · 요청서 · 서류 · 원본 · 판독 · 접수 · 제외). AI 보고는 오른쪽 AI 구역.
// 페이지 조치: 영업지원은 발송(요청서를 고쳐), 내부 감시는 서류가 접수된 뒤 인정 · 불인정 · 보완. 모두 누르면 확인 창.
import { HStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { BuildingStorefrontIcon } from '@heroicons/react/24/outline'
import { useAtomValue } from 'jotai'
import { useState } from 'react'
import { State } from '../ui/Mark'
import { L } from '../labels'
import { api, changedAtom, store, targetAtom } from '../state'
import { Pending } from '../ui/Pending'
import { Region } from '../ui/Region'
import { Act, Meta, RecordPage, Tiles } from '../ui/Record'
import { Source } from '../ui/Source'
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


/** 서류의 AI 정리 카드(판독 영역 바로 아래, D63) + 미확인(코드가 찾은 것이라 사실 영역). 서류가 없으면 없음 */
function ClarifyAi() {
  const docs = useDocs().data
  // 접수한 서류가 없으면 AI 정리도 없다(값이 없는 것이 정상)
  if (!docs?.docs.length) return null
  return (
    <>
      <AiCard title={`${L.AI} ${L.정리}`}>
        <Tidy />
      </AiCard>
      <UnknownRegion />
    </>
  )
}
function UnknownRegion() {
  const v = useVerdict().data
  if (!v?.unknown.length && !v?.lacking?.length) return null
  return (
    <Region title={L.미확인}>
      <Unknown />
    </Region>
  )
}

export function Clarify() {
  const q = useClarify()
  const docs = useDocs().data
  const vd = useVerdict().data
  const [bad, setBad] = useState<{ id: string; word: string } | null>(null)
  const d = q.data
  if (!d) return <Pending of={q} page />
  const c = d.clarify
  const onBad = (word: string | null) => setBad(word ? { id: c.id, word } : null)
  const read = docs?.docs.at(-1)?.rows.length
  return (
    <RecordPage
      title={c.name}
      meta={[
        <State word={c.state} />,
        <Meta icon={BuildingStorefrontIcon}>{c.dealer.name}</Meta>,
        // 이 소명을 연 정황: 다른 칩과 같은 꼴(누르면 그 정황이 열린다)
        ...(c.signal ? [<Token size="sm" icon={<Icon icon={FlagIcon} size="sm" />} label={c.signal.name} onClick={() => store.set(targetAtom, { kind: L.정황, id: c.signal!.id })} />] : []),
      ]}
      actions={
        <HStack gap={2}>
          {d.can && <Send d={d} onBad={onBad} />}
          <Verdicts onBad={onBad} />
        </HStack>
      }
      bad={bad?.id === c.id ? bad.word : null}
      // 보조 칸의 요약: 상태 · 대리점 · 정황 · 발송 · 기한(가정 D32)
      props={[
        [L.상태, c.state],
        [L.대리점, c.dealer.name],
        ...(c.signal ? [[L.정황, c.signal.name] as [string, string]] : []),
        // 보완의 사유는 서류를 다시 받을 영업지원이 내용에서 바로 본다
        ...d.history.filter((h) => h.kind === L.보완).slice(-1).map((h): [string, ReactNode] => [L.보완, [h.reason?.class, h.reason?.memo].filter(Boolean).join(' · ') || L.없음]),
        [L.발송, d.sent ?? L.없음],
        [L.기한, d.due ? <HStack gap={2} vAlign="center"><Text>{d.due}</Text><Source kind={L.가정} of={L.기한} rows={[[L.발송, d.sent ?? L.없음], [L.기한, d.due]]} /></HStack> : L.없음],
      ]}
      tabs={[
        {
          value: 'body',
          label: L.내용,
          body: (
            <>
              {/* 숫자 타일: 요청한 서류 · 접수한 서류 · 기한, 판독했으면 누락 · 불일치(계산). 머리의 칩은 상태 · 대리점 · 정황만 */}
              <Tiles
                items={[
                  { name: L.서류, value: d.docs.length },
                  { name: L.접수, value: docs?.docs.length ?? 0 },
                  // 기한(발송일 아래). 기한의 길이는 가정(D32). 발송 전에는 기한이 없으니 타일도 없다
                  ...(read
                    ? [
                        // 누락 = 판독 표의 빠진 항목 + 요청한 종류인데 받지 못한 서류(D65)
                        { name: L.누락, value: (docs?.docs.at(-1)?.counts[L.누락] ?? 0) + (vd?.lacking?.length ?? 0), aside: <Source kind={L.계산} tip={L.누락} rows={[[L.누락, docs?.docs.at(-1)?.counts[L.누락] ?? 0], [L.서류, (vd?.lacking ?? []).join(' · ') || L.없음]]} /> },
                        { name: L.불일치, value: docs?.docs.at(-1)?.counts[L.불일치] ?? 0, aside: <Source kind={L.계산} tip={L.불일치} rows={[[L.불일치, docs?.docs.at(-1)?.counts[L.불일치] ?? 0]]} /> },
                      ]
                    : []),
                ]}
              />
              <Letter />
              <Docs />
              <Read />
              <ClarifyAi />
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
