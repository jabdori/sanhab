// 18 발송: 소명 기록(pages/Clarify)의 본문 영역 — 요청서, 서류 목록 — 과 이력, 정황 기록의 "소명" 줄(Of).
// 값은 모두 코드가 정한 것이다(AI가 쓴 요청서 초안은 요청서 영역의 글 칸에 들어간다). 발송 조치는 페이지 조치(pages/Clarify)이고, 쓰고 있는 글은 letterAtom이 둘을 잇는다.
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { List, ListItem } from '@astryxdesign/core/List'
import { Table, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { atom, useAtom, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { Icon } from '@astryxdesign/core/Icon'
import { UserCircleIcon } from '@heroicons/react/24/outline'
import { State } from '../../ui/Mark'
import { L } from '../../labels'
import { targetAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { Region } from '../../ui/Region'
import { Source } from '../../ui/Source'
import { useSignal } from '../11-정황/signal'
import { tickAtom, useClarify } from './clarify'

/** 영업지원이 고친 요청서(null이면 AI 초안 그대로). 다른 소명을 열면 비운다 */
export const letterAtom = atom<string | null>(null)

/** 요청서 영역: 영업지원이 발송할 수 있으면 AI 초안을 고치는 글 칸, 아니면 발송한 요청서. 초안이 아직 없으면 대기 Badge(몇 초마다 다시 읽는다) — 글 없이 목록만으로도 발송한다 */
export function Letter() {
  const d = useClarify()
  const bump = useSetAtom(tickAtom)
  const [typed, setTyped] = useAtom(letterAtom)
  const id = d?.clarify.id
  const waiting = !!d?.can && !d.draft
  useEffect(() => {
    setTyped(null)
  }, [id, setTyped])
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => bump((n) => n + 1), 3000)
    return () => clearInterval(t)
  }, [waiting, bump])
  if (!d) return null
  if (!d.can && !d.body) return null
  return (
    <Region
      title={L.요청서}
      aside={
        <>
          {d.can && <Source kind={L.AI} rows={[[L.모델, d.draft?.model ?? L.없음]]} />}
          {waiting && <Spinner size="sm" aria-label={L.대기} />}
        </>
      }
    >
      {d.can ? (
        <TextArea label={L.요청서} isLabelHidden rows={6} width="100%" value={typed ?? d.draft?.text ?? ''} onChange={setTyped} />
      ) : (
        <Text className="break-keep wrap-anywhere">{d.body}</Text>
      )}
    </Region>
  )
}

/** 서류 목록(가정, D17): 일치 종류마다 정해진 서류. 요청서에는 항상 이 목록이 들어간다 */
export function Docs() {
  const d = useClarify()
  if (!d) return null
  type Row = { kind: string; doc: string } & Record<string, unknown>
  const data: Row[] = d.docs.map(([kind, doc]) => ({ kind, doc }))
  return (
    <Region title={L.서류} aside={<Source kind={L.가정} of={L.서류} rows={[[L.일치, d.kinds.length ? d.kinds.join(' · ') : L.없음]]} />}>
      {data.length ? (
        <Table<Row>
          data={data}
          idKey="kind"
          density="compact"
          columns={[
            { key: 'kind', header: L.일치, width: proportional(1, { minWidth: 80 }), renderCell: (r) => <Text weight="semibold">{r.kind}</Text> },
            { key: 'doc', header: L.서류, width: proportional(2, { minWidth: 120 }), renderCell: (r) => <Text>{r.doc}</Text> },
          ]}
        />
      ) : (
        <Empty />
      )}
    </Region>
  )
}

/** 이력: 요청(내부 감시), 발송(영업지원), 접수, 결과를 일어난 순서대로. 역할의 Avatar · 낱말 · 역할 / 사유 / 날짜 */
export function ClarifyHistory() {
  const d = useClarify()
  if (!d) return null
  if (!d.history.length) return <Empty />
  return (
    <List density="spacious">
      {d.history.map((h, i) => (
        <ListItem
          key={i}
          align="start"
          startContent={<Icon icon={UserCircleIcon} size="md" color="secondary" />}
          label={`${h.kind} · ${h.role}`}
          description={[h.reason?.class, h.reason?.memo].filter(Boolean).join(' · ') || undefined}
          endContent={h.at ? <Text type="supporting" color="secondary" hasTabularNumbers>{h.at}</Text> : <Text type="supporting" color="secondary">{L.미상}</Text>}
        />
      ))}
    </List>
  )
}

/** 정황 기록의 "소명": 그 정황에서 열린 소명. 누르면 그 소명이 열린다. 없으면 보이지 않는다 */
export function Of() {
  const s = useSignal()
  const list = useData<{ id: string; name: string; state: string }[]>(s ? `/signals/${encodeURIComponent(s.signal.id)}/clarifies` : null)
  const setTarget = useSetAtom(targetAtom)
  if (!list?.length) return null
  type Row = { id: string; name: string; state: string } & Record<string, unknown>
  return (
    <Region title={L.소명}>
      <Table<Row>
        data={list as Row[]}
        idKey="id"
        density="compact"
        columns={[
          {
            key: 'name',
            header: L.소명,
            width: proportional(3, { minWidth: 120 }),
            renderCell: (c) => (
              <Link weight="semibold" onClick={() => setTarget({ kind: L.소명, id: c.id })}>
                {c.name}
              </Link>
            ),
          },
          { key: 'state', header: L.상태, align: 'end', width: proportional(1, { minWidth: 72 }), renderCell: (c) => <HStack hAlign="end"><State word={c.state} /></HStack> },
        ]}
      />
    </Region>
  )
}

