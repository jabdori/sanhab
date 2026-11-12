// 13 변경: 대리점 상세의 오른쪽 조치에 식별자 변경 입력(항목, 값, 변경일). 변경을 넣을 수 있는 역할(영업지원, 서버의 `can`)에게만 있고 다른 역할에게는 없음.
// 인지일(시스템의 오늘)·경로(신고)·출처(시연)는 서버가 찍는다. 되돌리기 어려운 조치라 확인 창을 거치고, 보낸 뒤 새 값을 받을 때까지는 다시 눌리지 않는다.
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Input } from '@base-ui/react/input'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, targetAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { Pill } from '../../ui/Pill'
import { button, floating, label } from '../../ui/styles'

const ITEMS = [L.대표자, L.주소, L.계좌] as const
const row = 'flex items-center gap-2'
const name = `w-12 shrink-0 ${label}`
const field = 'h-head min-w-0 flex-1 rounded-box border border-line bg-bg px-2 text-body tabular-nums outline-none focus:border-text-sub'

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
  const ok = value.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(since)
  return (
    <div className="flex flex-col gap-2">
      <div className={row}>
        <span className={name}>{L.항목}</span>
        <RadioGroup aria-label={L.항목} value={item} onValueChange={(v) => setItem(v as string)} className="flex gap-4">
          {ITEMS.map((v) => (
            <label key={v} className="flex cursor-pointer items-center gap-1 text-body">
              <Radio.Root value={v} className="flex size-4 items-center justify-center rounded-pill border border-text-sub bg-bg data-checked:border-action">
                <Radio.Indicator className="size-2 rounded-pill bg-action data-unchecked:hidden" />
              </Radio.Root>
              {v}
            </label>
          ))}
        </RadioGroup>
      </div>
      <label className={row}>
        <span className={name}>{L.값}</span>
        <Input className={field} maxLength={200} value={value} onValueChange={setValue} />
      </label>
      <label className={row}>
        <span className={name}>{L.변경일}</span>
        <input type="date" className={field} max={today} value={since} onChange={(e) => setSince(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <AlertDialog.Root>
          <AlertDialog.Trigger className={button} disabled={!ok || sent === d}>
            {L.변경}
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Popup className={`${floating} fixed top-1/2 left-1/2 flex w-list -translate-x-1/2 -translate-y-1/2 flex-col gap-4 p-6`}>
              <AlertDialog.Title className="flex flex-wrap items-baseline gap-2 text-title">
                {L.변경}
                <span>{d.dealer.name}</span>
                <span>{item}</span>
              </AlertDialog.Title>
              <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-body">
                <dt className={label}>{L.값}</dt>
                <dd className="break-keep">{value.trim()}</dd>
                <dt className={label}>{L.변경일}</dt>
                <dd className="tabular-nums">{since}</dd>
                <dt className={label}>{L.인지일}</dt>
                <dd className="tabular-nums">{today}</dd>
                <dt className={label}>{L.경로}</dt>
                <dd>{L.신고}</dd>
              </dl>
              <div className="flex justify-end gap-2">
                <AlertDialog.Close className={button}>{L.취소}</AlertDialog.Close>
                <AlertDialog.Close
                  className={button}
                  onClick={() => {
                    setSent(d)
                    setBad(null)
                    api('/change', { id, item, value: value.trim(), since }).then(
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
                  {L.변경}
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

function Action() {
  const can = useData<{ can: boolean }>('/change')?.can
  const target = useAtomValue(targetAtom)
  if (!target || can === undefined) return null
  if (!can) return <Empty />
  return <Form key={target.id} id={target.id} />
}

type Change = { kind: string; role: string; at: string; item: string; value: string; since: string }

/** 이력: 그 대리점에 들어온 변경을 일어난 순서대로. `변경 · 영업지원 · 2026-07-01` 아래에 `주소 고양시 중앙로 128 · 변경일 2026-02-01` */
function History() {
  const target = useAtomValue(targetAtom)
  const h = useData<Change[]>(target && `/dealers/${target.id}/changes`)
  if (!target || !h) return null
  if (!h.length) return <Empty />
  return h.map((x, i) => (
    <div key={i} className="text-body break-keep">
      <p className="tabular-nums">{[x.kind, x.role, x.at].join(' · ')}</p>
      <p className="text-text-sub wrap-anywhere tabular-nums">
        {x.item} {x.value} · {L.변경일} {x.since}
      </p>
    </div>
  ))
}

export default [
  { slot: 'action', kind: L.대리점, View: Action },
  { slot: 'history', kind: L.대리점, View: History },
] satisfies Piece[]
