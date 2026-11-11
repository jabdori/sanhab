// 18 발송: 소명 상세(가운데: 제목·숫자 줄, 서류 목록 / 오른쪽: 조치(요청서를 고쳐 발송), 이력)와 정황 상세의 "소명" 줄.
// 가운데의 값은 모두 코드가 정한 것이다(AI가 쓴 요청서 초안은 오른쪽 조치에 있다). 가운데의 조각은 order -40(제목·숫자 줄) · -30(서류 목록)이다.
// 뒤 티켓이 kind: L.소명으로 끼우는 조각은 order를 적지 않으면 서류 목록 아래에 놓인다(19의 서류, 20의 비교).
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { useSetAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, store, targetAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { Figures } from '../../ui/Figures'
import { Pill } from '../../ui/Pill'
import { Source } from '../../ui/Source'
import { button, floating, label } from '../../ui/styles'
import { Table } from '../../ui/Table'
import { Title } from '../../ui/Title'
import { Line } from '../04-심사'
import { useSignal } from '../11-정황/signal'
import { tickAtom, useClarify } from './clarify'

// 소명의 상태와 그 색(tokens.md): 요청·접수는 대기, 인정은 좋음, 보완·미응답은 멈춤, 불인정은 아님
const tones = { [L.요청]: 'wait', [L.접수]: 'wait', [L.인정]: 'good', [L.보완]: 'hold', [L.미응답]: 'hold', [L.불인정]: 'bad' } as const
export const pill = (state: string) => <Pill tone={tones[state as keyof typeof tones] ?? 'wait'}>{state}</Pill>
/** 요청서의 글: 줄을 어디서든 바꾼다(긴 글이 칸을 넘지 않게) */
const text = 'break-keep wrap-anywhere text-body'

const none = (v: string | null | undefined) => v ?? <Empty />

/** 제목 줄과 숫자 줄: 정황 · 대상 · 상태 / 대리점, 일치, 발송한 날, 기한. 출처 표지는 계산(말풍선은 그 소명이 가리키는 정황과 일치 종류), 기한에는 가정 */
function Head() {
  const d = useClarify()
  if (!d) return null
  const { clarify: c } = d
  return (
    <div className="mb-4 flex flex-col gap-2">
      <Title name={c.name}>{pill(c.state)}</Title>
      <Figures
        items={[
          [L.대리점, c.dealer.name],
          [L.일치, d.kinds.length ? d.kinds.join(' · ') : <Empty />],
          [L.발송, none(d.sent)],
          [
            L.기한,
            <span className="flex items-baseline gap-2">
              {none(d.due)}
              <Source kind={L.가정}>
                <dl className="grid grid-cols-2 gap-x-2 gap-y-1 tabular-nums">
                  <dt className={label}>{L.발송}</dt>
                  <dd>{none(d.sent)}</dd>
                  <dt className={label}>{L.기한}</dt>
                  <dd>{none(d.due)}</dd>
                </dl>
              </Source>
            </span>,
          ],
        ]}
      >
        <Source kind={c.source}>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
            <dt className={label}>{L.정황}</dt>
            <dd className="wrap-anywhere">{c.signal.name}</dd>
            <dt className={label}>{L.일치}</dt>
            <dd>{d.kinds.length ? d.kinds.join(' · ') : L.없음}</dd>
          </dl>
        </Source>
      </Figures>
    </div>
  )
}

/** 서류 목록(가정): 일치 종류마다 정해진 서류. 요청서에는 항상 이 목록이 들어간다 */
function Docs() {
  const d = useClarify()
  if (!d) return null
  return (
    <section className="mb-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className={label}>{L.서류}</h2>
        <Source kind={L.가정}>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
            <dt className={label}>{L.일치}</dt>
            <dd>{d.kinds.length ? d.kinds.join(' · ') : L.없음}</dd>
          </dl>
        </Source>
      </div>
      <Table head={[L.일치, L.서류]} rows={d.docs.map(([kind, doc]) => [kind, doc])} />
    </section>
  )
}

/** 발송 한 줄: 발송 · 사람 · 날짜 */
const Sent = ({ h }: { h: { role: string; at: string | null } }) => <p className="text-body tabular-nums">{[L.발송, h.role, h.at ?? L.미상].join(' · ')}</p>

/** 조치: 영업지원은 요청서(AI의 초안을 고친 글)를 쓰고 발송으로 표시한다. 발송은 되돌릴 수 없으므로 확인 창을 거치고, 누른 뒤 새 값을 받을 때까지 다시 눌리지 않는다.
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
          <span className={label}>{L.담당}</span>
          <span className="text-figure">{d.role}</span>
        </div>
      )
    return (
      <div className="flex flex-col gap-2">
        <Sent h={h} />
        {d.body ? <p className={text}>{d.body}</p> : <Empty />}
      </div>
    )
  }
  const value = typed ?? d.draft?.text ?? ''
  const nothing = !d.docs.length && !value.trim()
  const go = () => {
    setSent(d)
    setBad(null)
    api('/send', { id: d.clarify.id, body: value.trim() || undefined }).catch((e: Error) => {
      setBad(e.message)
      store.set(changedAtom, (n) => n + 1)
    })
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className={label}>{L.요청서}</h2>
        <Source kind={L.AI}>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
            <dt className={label}>{L.모델}</dt>
            <dd className="tabular-nums wrap-anywhere">{d.draft?.model ?? L.없음}</dd>
          </dl>
        </Source>
        {!d.draft && <Pill tone="wait">{L.대기}</Pill>}
      </div>
      <textarea
        aria-label={L.요청서}
        rows={6}
        value={value}
        onChange={(e) => setTyped(e.target.value)}
        className={`w-full rounded-box border border-line bg-bg p-2 outline-none focus:border-action ${text}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <AlertDialog.Root>
          <AlertDialog.Trigger className={button} disabled={sent === d || nothing}>
            {L.발송}
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Popup className={`${floating} fixed top-1/2 left-1/2 flex w-list -translate-x-1/2 -translate-y-1/2 flex-col gap-4 p-6`}>
              <AlertDialog.Title className="flex items-baseline gap-2 text-title wrap-anywhere">
                {L.발송}
                <span>{d.clarify.dealer.name}</span>
              </AlertDialog.Title>
              <Table head={[L.일치, L.서류]} rows={d.docs.map(([kind, doc]) => [kind, doc])} />
              <div className="flex justify-end gap-2">
                <AlertDialog.Close className={button}>{L.취소}</AlertDialog.Close>
                <AlertDialog.Close className={button} onClick={go}>
                  {L.발송}
                </AlertDialog.Close>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Portal>
        </AlertDialog.Root>
        {bad && <Pill tone="bad">{bad}</Pill>}
      </div>
    </div>
  )
}

/** 이력: 요청(내부 감시), 발송(영업지원)을 일어난 순서대로 */
function History() {
  const d = useClarify()
  if (!d) return null
  return d.history.length ? d.history.map((h, i) => (h.kind === L.발송 ? <Sent key={i} h={h} /> : <Line key={i} d={h} />)) : <Empty />
}

/** 정황 상세의 "소명": 그 정황에서 열린 소명. 누르면 그 소명이 열린다. 없으면 보이지 않는다 */
function Of() {
  const s = useSignal()
  const list = useData<{ id: string; name: string; state: string }[]>(s ? `/signals/${encodeURIComponent(s.signal.id)}/clarifies` : null)
  const setTarget = useSetAtom(targetAtom)
  if (!list?.length) return null
  return (
    <section className="mb-4 flex flex-col gap-2">
      <h2 className={label}>{L.소명}</h2>
      <Table
        head={[L.소명, L.상태]}
        rows={list.map((c) => [
          <button className="cursor-pointer text-left text-action hover:text-action-hover" onClick={() => setTarget({ kind: L.소명, id: c.id })}>
            {c.name}
          </button>,
          pill(c.state),
        ])}
      />
    </section>
  )
}

export default [
  { slot: 'fact', kind: L.소명, order: -40, View: Head },
  { slot: 'fact', kind: L.소명, order: -30, View: Docs },
  { slot: 'action', kind: L.소명, View: Action },
  { slot: 'history', kind: L.소명, View: History },
  { slot: 'fact', kind: L.정황, order: -10, View: Of },
] satisfies Piece[]
