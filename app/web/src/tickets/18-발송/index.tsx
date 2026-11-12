// 18 발송: 소명 상세(가운데: 제목·숫자 줄, 서류 목록 / 오른쪽: 조치(요청서를 고쳐 발송), 이력)와 정황 상세의 "소명" 줄.
// 가운데의 값은 모두 코드가 정한 것이다(AI가 쓴 요청서 초안은 오른쪽 조치에 있다). 제목·숫자 줄은 머리(slot 'head')이고, 가운데의 조각은 order -30(서류 목록)이다.
// 뒤 티켓이 kind: L.소명으로 끼우는 조각은 order를 적지 않으면 서류 목록 아래에 놓인다(19의 서류, 20의 비교).
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { useSetAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, store, targetAtom, useData } from '../../state'
import { Confirm } from '../../ui/Confirm'
import { Empty } from '../../ui/Empty'
import { Figures } from '../../ui/Figures'
import { grade } from '../../ui/grade'
import { Pill } from '../../ui/Pill'
import { Region } from '../../ui/Region'
import { Source } from '../../ui/Source'
import { Table } from '../../ui/Table'
import { Title } from '../../ui/Title'
import { Line } from '../04-심사'
import { useSignal } from '../11-정황/signal'
import { tickAtom, useClarify } from './clarify'

// 소명의 상태와 그 색(tokens.md): 요청·접수는 대기, 인정은 좋음, 보완·미응답은 멈춤, 불인정은 아님
const tones = { [L.요청]: 'wait', [L.접수]: 'wait', [L.인정]: 'good', [L.보완]: 'hold', [L.미응답]: 'hold', [L.불인정]: 'bad' } as const
export const pill = (state: string) => <Pill tone={tones[state as keyof typeof tones] ?? 'wait'}>{state}</Pill>

const none = (v: string | null | undefined) => v ?? <Empty />

/** 머리(가운데 위에 고정): 제목 줄과 숫자 줄(대리점, 일치, 발송한 날, 기한). 출처 표지는 일치에 계산·소명의 출처, 기한에 가정(D32) */
function Head() {
  const d = useClarify()
  if (!d) return null
  const { clarify: c } = d
  const kinds = d.kinds.length ? d.kinds.join(' · ') : L.없음
  return (
    <>
      <Title name={c.name}>{pill(c.state)}</Title>
      <Figures
        items={[
          [L.대리점, c.dealer.name],
          [L.일치, d.kinds.length ? kinds : <Empty />],
          [L.발송, none(d.sent)],
          [
            L.기한,
            <span className="flex items-baseline gap-2">
              {none(d.due)}
              <Source kind={L.가정} of={L.기한} rows={[[L.발송, none(d.sent)], [L.기한, none(d.due)]]} />
            </span>,
          ],
        ]}
      >
        <Source kind={c.source} tip={`${L.정황} · ${L.일치}`} rows={[...(c.signal ? ([[L.정황, c.signal.name]] as [string, string][]) : []), [L.일치, kinds]]} />
      </Figures>
    </>
  )
}

/** 서류 목록(가정, D17): 일치 종류마다 정해진 서류. 요청서에는 항상 이 목록이 들어간다 */
function Docs() {
  const d = useClarify()
  if (!d) return null
  return (
    <Region title={L.요청서} aside={<Source kind={L.가정} of={L.서류} rows={[[L.일치, d.kinds.length ? d.kinds.join(' · ') : L.없음]]} />}>
      <Table head={[L.일치, L.서류]} rows={d.docs.map(([kind, doc]) => [kind, doc])} />
    </Region>
  )
}

/** 발송 한 줄: 발송 · 사람 · 날짜 */
const Sent = ({ h }: { h: { kind?: string; role: string; at: string | null } }) => (
  <Text weight="semibold" hasTabularNumbers>
    {[h.kind ?? L.발송, h.role, h.at ?? L.미상].join(' · ')}
  </Text>
)

/** 조치: 영업지원은 요청서(AI의 초안을 고친 글)를 쓰고 발송한다(주 버튼). 발송은 되돌릴 수 없으므로 확인 창을 거치고, 누른 뒤 새 값을 받을 때까지 다시 눌리지 않는다.
 * AI가 아직 초안을 쓰지 못했으면 대기 표지가 보이고(몇 초마다 다시 읽는다) 글 없이 목록만으로도 발송할 수 있다. 서버가 거절하면 그 낱말을 보인다.
 * 발송할 수 없는 역할에게는 발송한 요청서나 담당이 보인다 */
function Action() {
  const d = useClarify()
  const bump = useSetAtom(tickAtom)
  const [typed, setTyped] = useState<string | null>(null)
  const [sent, setSent] = useState<unknown>(null)
  const [bad, setBad] = useState<string | null>(null)
  const id = d?.clarify.id
  const waiting = !!d?.can && !d.draft
  useEffect(() => {
    setTyped(null)
    setBad(null)
  }, [id])
  // 초안이 아직 없으면 AI가 쓰는 동안 몇 초마다 다시 읽는다
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => bump((n) => n + 1), 3000)
    return () => clearInterval(t)
  }, [waiting, bump])
  if (!d) return null
  if (!d.can) {
    const h = d.history.filter((x) => x.kind === L.발송).at(-1)
    if (!h)
      return (
        <div className="flex items-baseline gap-2">
          <Text type="supporting">{L.담당}</Text>
          <Text weight="semibold">{d.role}</Text>
        </div>
      )
    return (
      <div className="flex flex-col gap-2">
        <Sent h={h} />
        {d.body ? (
          <p className="break-keep wrap-anywhere">
            <Text>{d.body}</Text>
          </p>
        ) : (
          <Empty />
        )}
      </div>
    )
  }
  const value = typed ?? d.draft?.text ?? ''
  const nothing = !d.docs.length && !value.trim()
  const go = () => {
    setSent(d)
    setBad(null)
    return api('/send', { id: d.clarify.id, body: value.trim() || undefined }).catch((e: Error) => {
      setBad(e.message)
      store.set(changedAtom, (n) => n + 1)
    })
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Text weight="medium">{L.요청서}</Text>
        <Source kind={L.AI} rows={[[L.모델, d.draft?.model ?? L.없음]]} />
        {!d.draft && <Pill tone="wait">{L.대기}</Pill>}
      </div>
      <TextArea label={L.요청서} isLabelHidden rows={6} width="100%" value={value} onChange={setTyped} />
      <div className="flex flex-wrap items-center gap-2">
        <Confirm label={L.발송} variant={grade(L.발송)} title={`${L.발송} ${d.clarify.dealer.name}`} isDisabled={sent === d || nothing} onConfirm={go}>
          <Table head={[L.일치, L.서류]} rows={d.docs.map(([kind, doc]) => [kind, doc])} />
        </Confirm>
        {bad && <Pill tone="bad">{bad}</Pill>}
      </div>
    </div>
  )
}

/** 이력: 요청(내부 감시), 발송(영업지원)을 일어난 순서대로 */
function History() {
  const d = useClarify()
  if (!d) return null
  return d.history.length ? (
    <div className="flex flex-col gap-3">
      {d.history.map((h, i) => (h.kind === L.발송 || h.kind === L.접수 ? <Sent key={i} h={h} /> : <Line key={i} d={h} />))}
    </div>
  ) : (
    <Empty />
  )
}

/** 정황 상세의 "소명": 그 정황에서 열린 소명. 누르면 그 소명이 열린다. 없으면 보이지 않는다 */
function Of() {
  const s = useSignal()
  const list = useData<{ id: string; name: string; state: string }[]>(s ? `/signals/${encodeURIComponent(s.signal.id)}/clarifies` : null)
  const setTarget = useSetAtom(targetAtom)
  if (!list?.length) return null
  return (
    <Region title={L.소명}>
      <Table
        head={[L.소명, L.상태]}
        rows={list.map((c) => [
          <Link color="primary" weight="medium" onClick={() => setTarget({ kind: L.소명, id: c.id })}>
            {c.name}
          </Link>,
          pill(c.state),
        ])}
      />
    </Region>
  )
}

export default [
  { slot: 'head', kind: L.소명, View: Head },
  { slot: 'fact', kind: L.소명, order: -30, View: Docs },
  { slot: 'action', kind: L.소명, View: Action },
  { slot: 'history', kind: L.소명, View: History },
  { slot: 'fact', kind: L.정황, order: -10, View: Of },
] satisfies Piece[]
