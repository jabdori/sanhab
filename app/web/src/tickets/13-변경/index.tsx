// 13 변경: 대리점 상세의 오른쪽 조치에 식별자 변경 입력(항목, 값, 변경일). 변경을 넣을 수 있는 역할(영업지원, 서버의 `can`)에게만 있고 다른 역할에게는 없음.
// 인지일(시스템의 오늘)·경로(신고)·출처(시연)는 서버가 찍는다. 되돌리기 어려운 조치라 확인 창을 거치고, 보낸 뒤 새 값을 받을 때까지는 다시 눌리지 않는다.
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, targetAtom, useData } from '../../state'
import { Confirm } from '../../ui/Confirm'
import { Empty } from '../../ui/Empty'
import { grade } from '../../ui/grade'
import { Pill } from '../../ui/Pill'
import { Region } from '../../ui/Region'

const ITEMS = [L.대표자, L.주소, L.계좌] as const

/** 달력에 있는 YYYY-MM-DD인가(2026-02-30은 아니다) */
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !!new Date(`${s}T00:00:00Z`).toJSON()?.startsWith(s)

function Form({ id }: { id: string }) {
  const d = useData<{ dealer: { id: string; name: string } }>(`/dealers/${id}`)
  const today = useData<{ today: string }>('/state')?.today
  const [item, setItem] = useState<string>(L.주소)
  const [value, setValue] = useState('')
  const [since, setSince] = useState('')
  // 보낸 때의 상세. 새 값을 받을 때까지(또는 거절될 때까지) 다시 누를 수 없다
  const [sent, setSent] = useState<unknown>(null)
  const [bad, setBad] = useState<string | null>(null)
  useEffect(() => setBad(null), [id])
  if (d?.dealer.id !== id) return null
  const ok = value.trim() !== '' && isDay(since)
  return (
    <div className="flex flex-col gap-3">
      <RadioList label={L.항목} orientation="horizontal" value={item} onChange={setItem}>
        {ITEMS.map((v) => (
          <RadioListItem key={v} label={v} value={v} />
        ))}
      </RadioList>
      <TextInput label={L.값} width="100%" value={value} onChange={setValue} />
      <TextInput label={L.변경일} width="100%" placeholder="YYYY-MM-DD" inputMode="numeric" value={since} onChange={setSince} />
      <div className="flex flex-wrap items-center gap-2">
        <Confirm label={L.변경} variant={grade(L.변경)} isDisabled={!ok || sent === d}
          title={`${L.변경} ${d.dealer.name} ${item}`}
          onConfirm={() => {
            setSent(d)
            setBad(null)
            return api('/change', { id, item, value: value.trim(), since }).then(
              () => {
                setValue('')
                setSince('')
              },
              (e: Error) => {
                setBad(e.message)
                setSent(null)
              },
            )
          }}
        >
          <MetadataList label={{ width: 72 }}>
            <MetadataListItem label={L.값}>{value.trim()}</MetadataListItem>
            <MetadataListItem label={L.변경일}>{since}</MetadataListItem>
            <MetadataListItem label={L.인지일}>{today}</MetadataListItem>
            <MetadataListItem label={L.경로}>{L.신고}</MetadataListItem>
          </MetadataList>
        </Confirm>
        {bad && <Pill tone="bad">{bad}</Pill>}
      </div>
    </div>
  )
}

function Action() {
  const can = useData<{ can: boolean }>('/change')?.can
  const target = useAtomValue(targetAtom)
  if (!target || can === undefined) return null
  if (!can) return <Empty />
  return (
    <Region title={L.변경}>
      <Form key={target.id} id={target.id} />
    </Region>
  )
}

type Change = { kind: string; role: string; at: string; item: string; value: string; since: string }

/** 이력: 그 대리점에 들어온 변경을 일어난 순서대로. 결정 한 줄(04의 Line)과 같은 모양: `변경`(굵게) · 사람 · 날짜, 아래에 `주소 고양시 중앙로 128 · 변경일 2026-02-01` */
function History() {
  const target = useAtomValue(targetAtom)
  const h = useData<Change[]>(target && `/dealers/${target.id}/changes`)
  if (!target || !h) return null
  if (!h.length) return <Empty />
  return h.map((x, i) => (
    <div key={i} className="flex flex-col gap-0.5 break-keep">
      <div className="flex flex-wrap items-center gap-x-2 tabular-nums">
        <Text weight="semibold">{x.kind}</Text>
        <Text color="secondary">{[x.role, x.at].join(' · ')}</Text>
      </div>
      <p className="wrap-anywhere text-secondary tabular-nums">
        {x.item} {x.value} · {L.변경일} {x.since}
      </p>
    </div>
  ))
}

export default [
  { slot: 'action', kind: L.대리점, View: Action },
  { slot: 'history', kind: L.대리점, View: History },
] satisfies Piece[]
