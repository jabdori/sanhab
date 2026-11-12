// 23 모의: 규정 화면에서 영업임원과 내부 감시가 한도를 넣어 보면, 코드가 모든 심사를 그 한도로 다시 따져 승인권자가 달라지는 심사를 세어 보인다.
// 값은 모두 코드가 계산한 것이고 출처는 가정이다. 심사의 상태·승인권자·작업은 바뀌지 않는다(저장하지 않는 계산).
// 오른쪽(조치)에서 넣고, 가운데(규정 조각 아래)에 결과를 둔다. 결과는 두 조각이 나눠 쓰는 atom에 있다.
import { Input } from '@base-ui/react/input'
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, menuAtom, roleAtom, targetAtom, useData } from '../../state'
import { Compare } from '../../ui/Compare'
import { Figures } from '../../ui/Figures'
import { Pill } from '../../ui/Pill'
import { Source } from '../../ui/Source'
import { button, label } from '../../ui/styles'
import { Table, num } from '../../ui/Table'

type Mock = {
  limit: number
  total: number
  changed: number
  /** [영업지원, 영업임원]인 심사의 수 */
  now: [number, number]
  mock: [number, number]
  rows: { id: string; name: string; ym: string; total: number; approver: [string, string] }[]
}

/** 마지막 모의의 결과와, 어느 역할이 얻은 것인지(역할이 바뀌면 보이지 않는다) */
const resultAtom = atom<{ role: string; mock: Mock } | null>(null)

const MAX = 1_000_000_000
/** 지금 역할이 모의를 할 수 있는지와 승인권자의 낱말(서버가 정한다) */
type Info = { can: boolean; approvers: [string, string] }

/** 오른쪽 조치: 한도를 넣고 모의. 요청이 끝날 때까지 다시 눌리지 않는다. 서버가 거절하면 그 낱말을 보인다 */
function Action() {
  const role = useAtomValue(roleAtom)
  const info = useData<Info>('/mock')
  const setResult = useSetAtom(resultAtom)
  const [text, setText] = useState('1,500,000')
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState<string | null>(null)
  if (!info?.can) return null
  const won = /^[\d,]+$/.test(text.trim()) ? Number(text.replace(/,/g, '')) : 0
  const go = () => {
    setBusy(true)
    setBad(null)
    api<Mock>('/mock', { limit: won })
      .then((mock) => setResult({ role: role!, mock }))
      .catch((e: Error) => setBad(e.message))
      .finally(() => setBusy(false))
  }
  return (
    <div className="flex flex-col gap-2">
      <h2 className={label}>{L.모의}</h2>
      <label className="flex items-center gap-2">
        <span className={`w-8 shrink-0 ${label}`}>{L.한도}</span>
        <Input
          inputMode="numeric"
          className="h-head min-w-0 flex-1 rounded-box border border-line bg-bg px-2 text-right text-body tabular-nums outline-none focus:border-text-sub"
          value={text}
          onValueChange={setText}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button className={button} disabled={busy || won < 1 || won > MAX} onClick={go}>
          {L.모의}
        </button>
        {bad && <Pill tone="bad">{bad}</Pill>}
      </div>
    </div>
  )
}

/** 가운데: 한도와 변동 수, 현재 / 모의 두 열, 달라지는 심사의 목록. 심사 이름을 누르면 그 심사가 열린다 */
function Result() {
  const [r] = useAtom(resultAtom)
  const role = useAtomValue(roleAtom)
  const info = useData<Info>('/mock')
  const setMenu = useSetAtom(menuAtom)
  const setTarget = useSetAtom(targetAtom)
  const box = useRef<HTMLElement>(null)
  // 가정 목록 아래에 놓이므로 결과가 새로 오면 화면에 보이게 한다
  useEffect(() => { box.current?.scrollIntoView({ block: 'start' }) }, [r]) // 값을 돌려주지 않는다: 어떤 브라우저는 scrollIntoView가 Promise를 돌려주고 React가 그것을 정리 함수로 불러 화면이 비었다
  if (!r || !info || r.role !== role) return null
  const m = r.mock
  return (
    <section ref={box} className="mb-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className={label}>{L.모의}</h2>
        <Source kind={L.가정}>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1 tabular-nums">
            <dt className={label}>{L.한도}</dt>
            <dd>{num(m.limit)}</dd>
          </dl>
        </Source>
      </div>
      <Figures
        items={[
          [L.한도, num(m.limit)],
          [L.변동, `${m.changed} / ${m.total}`],
        ]}
      />
      <Compare
        head={[L.현재, L.모의]}
        rows={[
          [info.approvers[0], String(m.now[0]), String(m.mock[0])],
          [info.approvers[1], String(m.now[1]), String(m.mock[1])],
        ]}
      />
      <Table
        head={[L.심사, L.귀속월, L.합산, L.현재, L.모의]}
        right={[2]}
        rows={m.rows.map((x) => [
          <button
            className="cursor-pointer text-action hover:text-action-hover"
            onClick={() => {
              setMenu(L.작업)
              setTarget({ kind: L.심사, id: x.id })
            }}
          >
            {x.name}
          </button>,
          x.ym,
          num(x.total),
          x.approver[0],
          x.approver[1],
        ])}
      />
    </section>
  )
}

export default [
  { slot: 'fact', kind: L.규정, View: Result },
  { slot: 'action', kind: L.규정, View: Action },
] satisfies Piece[]
