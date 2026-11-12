// 20 소명: 서류가 접수된 소명을 내부 감시가 인정 · 불인정 · 보완으로 정한다(사유 필수). 인정하면 소명한 대리점의 선이 관련자 계산에서 빠진다.
// 가운데: 인정한 뒤의 "제외"(어느 선이 어느 기간 동안). 오른쪽: 조치 · 사유 · 보고의 "미확인"(코드가 찾은, 서류만으로 가를 수 없는 항목).
// 인정은 되돌리기 어려워 확인 창을 거치고, 누른 뒤 새 값을 받을 때까지 다시 눌리지 않는다. 서버가 거절하면 그 낱말을 보인다.
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { useAtom, useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, roleAtom, store, targetAtom } from '../../state'
import { Empty } from '../../ui/Empty'
import { Pill } from '../../ui/Pill'
import { Reason, blank, ready, sent as filled } from '../../ui/Reason'
import { Source } from '../../ui/Source'
import { button, floating, label } from '../../ui/styles'
import { Table } from '../../ui/Table'
import { useClarify } from '../18-발송/clarify'
import { useDocs } from '../19-서류/docs'
import { reasonAtom, useVerdict } from './verdict'

/** 기간: 시작 ~ 끝. 둘 다 없으면 없음 */
const span = (since: string | null | undefined, until: string | null | undefined) => (since || until ? `${since ?? ''} ~ ${until ?? ''}` : null)

/** 가운데의 "제외": 인정한 뒤에 그 소명이 제외한 선(종류, 식별자, 효력 기간). 인정하지 않았으면 보이지 않는다 */
function Excluded() {
  const v = useVerdict()
  if (!v?.excluded.length) return null
  return (
    <section className="mb-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className={label}>{L.제외}</h2>
        <Source kind={L.계산}>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1 tabular-nums">
            <dt className={label}>{L.기간}</dt>
            <dd>{span(v.excluded[0]?.since, v.excluded[0]?.until) ?? L.미상}</dd>
          </dl>
        </Source>
      </div>
      <Table head={[L.종류, L.식별자, L.기간]} rows={v.excluded.map((e) => [e.item, e.value, span(e.since, e.until) ?? <Empty />])} />
    </section>
  )
}

/** 오른쪽 보고의 "미확인": 가장 나중 서류에서 서류만으로 가를 수 없는 항목(누락, 호실까지 같아 추가 확인). 코드가 찾은 것이라 출처는 계산이다. 서류가 아직 없으면 보이지 않는다 */
function Unknown() {
  const v = useVerdict()
  const docs = useDocs()
  if (!v || !docs?.docs.length) return null
  return (
    <section className="mt-4 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <h3 className={label}>{L.미확인}</h3>
        <Source kind={L.계산}>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
            <dt className={label}>{L.서류}</dt>
            <dd className="wrap-anywhere">{docs.docs.at(-1)?.name}</dd>
          </dl>
        </Source>
      </div>
      {v.unknown.length ? (
        <dl className="flex flex-col gap-1">
          {v.unknown.map(([item, word]) => (
            <div key={item + word} className="flex items-baseline gap-2">
              <dt className={`shrink-0 ${label}`}>{item}</dt>
              <dd className="text-body">{word}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <Empty />
      )}
    </section>
  )
}

/** 조치(내부 감시, 정할 수 있을 때): 인정 · 불인정 · 보완. 사유가 그 조치의 분류이고 다 채워졌을 때만 눌린다. 인정은 제외될 선과 기간을 보이는 확인 창을 거친다 */
function Action() {
  const v = useVerdict()
  const c = useClarify()
  const [reason, setReason] = useAtom(reasonAtom)
  const [sentFor, setSent] = useState<unknown>(null)
  const [bad, setBad] = useState<string | null>(null)
  const id = v?.id
  useEffect(() => setBad(null), [id])
  if (!v?.can || !c) return null
  const go = (kind: string) => {
    setSent(v)
    setBad(null)
    api('/verdict', { id: v.id, kind, reason: filled(reason) ?? undefined }).then(
      () => setReason(blank),
      (e: Error) => {
        setBad(e.message)
        store.set(changedAtom, (n) => n + 1)
      },
    )
  }
  const off = (kind: string) => sentFor === v || !ready(kind, true, reason)
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {v.actions.map((a) =>
        a.kind === L.인정 ? (
          <AlertDialog.Root key={a.kind}>
            <AlertDialog.Trigger className={button} disabled={off(a.kind)}>
              {a.kind}
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Popup className={`${floating} fixed top-1/2 left-1/2 flex w-list -translate-x-1/2 -translate-y-1/2 flex-col gap-4 p-6`}>
                <AlertDialog.Title className="flex items-baseline gap-2 text-title wrap-anywhere">
                  {a.kind}
                  <span>{c.clarify.dealer.name}</span>
                </AlertDialog.Title>
                <p className={label}>{L.제외}</p>
                {v.lines.length ? <Table head={[L.종류, L.식별자]} rows={v.lines.map((l) => [l.item, l.value])} /> : <p className="text-body">{L['제외 없음']}</p>}
                <dl className="flex items-baseline gap-2">
                  <dt className={label}>{L.기간}</dt>
                  <dd className="text-body tabular-nums">{span(v.span?.[0], v.span?.[1]) ?? L.미상}</dd>
                </dl>
                <div className="flex justify-end gap-2">
                  <AlertDialog.Close className={button}>{L.취소}</AlertDialog.Close>
                  <AlertDialog.Close className={button} onClick={() => go(a.kind)}>
                    {a.kind}
                  </AlertDialog.Close>
                </div>
              </AlertDialog.Popup>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        ) : (
          <button key={a.kind} className={button} disabled={off(a.kind)} onClick={() => go(a.kind)}>
            {a.kind}
          </button>
        ),
      )}
      {bad && <Pill tone="bad">{bad}</Pill>}
    </div>
  )
}

/** 사유: 정할 수 없으면 보이지 않는다(18의 조치가 발송한 요청서나 담당을 보인다). 다른 소명을 열거나 역할이 바뀌거나 결과가 나면 쓰던 사유를 비운다 */
function Box() {
  const v = useVerdict()
  const role = useAtomValue(roleAtom)
  const target = useAtomValue(targetAtom)
  const [draft, setDraft] = useAtom(reasonAtom)
  useEffect(() => setDraft(blank), [target?.id, v?.can, role, setDraft])
  if (!v) return null
  if (!v.can) return <Empty />
  return <Reason groups={v.actions.map((a) => ({ of: a.kind, classes: a.classes }))} value={draft} onChange={setDraft} />
}

export default [
  { slot: 'fact', kind: L.소명, View: Excluded },
  { slot: 'report', kind: L.소명, View: Unknown },
  { slot: 'action', kind: L.소명, View: Action },
  { slot: 'reason', kind: L.소명, View: Box },
] satisfies Piece[]
