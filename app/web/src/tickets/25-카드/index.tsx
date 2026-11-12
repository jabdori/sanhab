// 25 조치 카드: 대화 안에 그려지는 조치의 제안. AI는 카드의 내용(대상, 조치, 사유)만 내고, 모양과 버튼은 이 부품으로 고정이다.
// 사유는 사람이 말한 것을 옮겨 적은 것이라 여기서 고칠 수 있고, 사유가 필수인 조치는 채우기 전에는 실행이 눌리지 않는다.
// 실행은 사람이 누른다: 화면에서 직접 한 조치와 같은 경로를 그 사람의 세션으로 부르므로 이력과 경위에 똑같이 남는다. 누른 뒤 끝날 때까지 다시 눌리지 않는다.
// 인정은 되돌리기 어려워 20의 조치처럼 제외될 선과 기간을 보이는 확인 창을 거친다.
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, useData } from '../../state'
import { Pill } from '../../ui/Pill'
import { Reason, ready, sent, type Draft } from '../../ui/Reason'
import { button, floating, label } from '../../ui/styles'
import { Table } from '../../ui/Table'

/** 서버가 `data-card`로 보내는 카드: 대상(종류, 이름), 조치, 사유가 필수인지와 고를 수 있는 분류, 옮겨 적은 사유, 실행이 부를 경로 */
export type CardData = {
  kind: string
  id: string
  name: string
  action: string
  must: boolean
  classes: string[]
  class: string | null
  memo: string | null
  run: { path: string; body: Record<string, unknown> }
}

// 실행한 뒤의 결과 표지: 다른 화면의 상태 표지와 같은 색(tokens.md)
const tones = { [L.승인]: 'good', [L.추인]: 'good', [L.인정]: 'good', [L.보류]: 'hold', [L.보완]: 'hold', [L.반려]: 'bad', [L.거부]: 'bad', [L.불인정]: 'bad', [L.요청]: 'wait', [L.기각]: 'wait' } as const

/** 인정의 확인 창: 제외될 선과 기간(20의 결과 경로가 주는 값) */
function Excluded({ id }: { id: string }) {
  const v = useData<{ span: [string, string] | null; lines: { item: string; value: string }[] }>(`/clarifies/${encodeURIComponent(id)}/verdict`)
  if (!v) return null
  return (
    <>
      <p className={label}>{L.제외}</p>
      {v.lines.length ? <Table head={[L.종류, L.식별자]} rows={v.lines.map((l) => [l.item, l.value])} /> : <p className="text-base">{L['제외 없음']}</p>}
      <dl className="flex items-baseline gap-2">
        <dt className={label}>{L.기간}</dt>
        <dd className="text-base tabular-nums">{v.span ? `${v.span[0]} ~ ${v.span[1]}` : L.미상}</dd>
      </dl>
    </>
  )
}

export function Card({ card }: { card: CardData }) {
  const [draft, setDraft] = useState<Draft>({ of: card.action, class: card.class ?? '', memo: card.memo ?? '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [bad, setBad] = useState<string | null>(null)
  const go = () => {
    setBusy(true)
    setBad(null)
    api(card.run.path, { ...card.run.body, reason: sent(draft) ?? undefined }).then(
      () => setDone(true),
      (e: Error) => {
        setBad(e.message)
        setBusy(false)
      },
    )
  }
  const off = busy || !ready(card.action, card.must, draft)
  return (
    <section aria-label={L['조치 카드']} className="flex w-full flex-col gap-2 rounded-box border border-line bg-bg p-3">
      <span className={label}>{L['조치 카드']}</span>
      <dl className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <dt className={label}>{L.대상}</dt>
          <dd className="text-base wrap-anywhere">
            {card.kind} {card.name}
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className={label}>{L.조치}</dt>
          <dd className="text-base">{card.action}</dd>
        </div>
      </dl>
      {done ? (
        <Pill tone={tones[card.action as keyof typeof tones] ?? 'wait'}>{card.action}</Pill>
      ) : (
        <>
          <Reason groups={[{ of: card.action, classes: card.classes }]} value={draft} onChange={setDraft} />
          <div className="flex flex-wrap items-center gap-2">
            {card.action === L.인정 ? (
              <AlertDialog.Root>
                <AlertDialog.Trigger className={button} disabled={off}>
                  {L.실행}
                </AlertDialog.Trigger>
                <AlertDialog.Portal>
                  <AlertDialog.Popup className={`${floating} fixed top-1/2 left-1/2 flex w-list -translate-x-1/2 -translate-y-1/2 flex-col gap-4 p-6`}>
                    <AlertDialog.Title className="flex items-baseline gap-2 text-title wrap-anywhere">
                      {card.action}
                      <span>{card.name}</span>
                    </AlertDialog.Title>
                    <Excluded id={card.id} />
                    <div className="flex justify-end gap-2">
                      <AlertDialog.Close className={button}>{L.취소}</AlertDialog.Close>
                      <AlertDialog.Close className={button} onClick={go}>
                        {card.action}
                      </AlertDialog.Close>
                    </div>
                  </AlertDialog.Popup>
                </AlertDialog.Portal>
              </AlertDialog.Root>
            ) : (
              <button className={button} disabled={off} onClick={go}>
                {L.실행}
              </button>
            )}
            {bad && <Pill tone="bad">{bad}</Pill>}
          </div>
        </>
      )}
    </section>
  )
}

// 카드는 대화 안에서만 그려진다(24가 data-card 파트를 이 부품으로 그린다). 끼우는 조각은 없다
export default [] satisfies Piece[]
