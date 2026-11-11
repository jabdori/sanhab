// 08 대사: 지급 상세의 가운데에 "대사" 표(승인 / 회신 / 비교, 지급 시도마다 줄), 오른쪽 조치에 은행 회신 입력(금액, 계좌, 결과), 이력에 회신 한 줄.
// 회신은 사람이 넣은 것(출처 시연), 비교는 코드가 맞춰 본 것(출처 계산)이다.
import { Input } from '@base-ui/react/input'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { atom, useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, roleAtom, store, targetAtom } from '../../state'
import { Pill } from '../../ui/Pill'
import { Source } from '../../ui/Source'
import { button, label } from '../../ui/styles'
import { Table, num } from '../../ui/Table'

type Recon = {
  id: string
  /** 지급의 상태 */
  state: string
  /** 대사를 담당하는 역할 */
  role: string
  /** 지금 역할이 회신을 넣을 수 있는지 */
  can: boolean
  /** 승인된 금액과 등록된 계좌(맞춰 본 뒤에는 그때의 값) */
  want: { amount: number; accounts: string[] }
  /** 지금 지급 시도의 회신. 실패한 회신이면 지급이 대기로 돌아가 있다 */
  reply?: { amount: number; account: string; result: string; role: string; at: string; source: string }
  /** 성공한 회신을 맞춰 본 결과. diff는 맞지 않은 항목(금액·계좌), verdict는 일치·불일치 */
  recon?: { diff: string[]; verdict: string; source: string }
  /** 지금까지의 회신 전부(실패한 것 포함) */
  history: { amount: number; account: string; result: string; role: string; at: string; source: string }[]
}

// 열어 둔 지급의 대사. 세 조각이 같은 값을 읽고, 조치 뒤에 저절로 다시 읽힌다
const reconAtom = atom(async (get) => {
  get(changedAtom)
  get(roleAtom)
  const t = get(targetAtom)
  return t?.kind === L.지급 ? api<Recon>(`/pays/${t.id}/recon`).catch(() => null) : null
})
const latestAtom = unwrap(reconAtom, (prev) => prev ?? null)

function useRecon() {
  const target = useAtomValue(targetAtom)
  const d = useAtomValue(latestAtom)
  return d && target?.kind === L.지급 && d.id === target.id ? d : null
}

const verdict = (v: string) => <Pill tone={v === L.일치 ? 'good' : 'bad'}>{v}</Pill>
const none = <span className="text-text-mute">{L.없음}</span>

/** 대사 표: 지급 시도마다 금액·계좌 두 줄에 승인 / 회신 / 비교. 실패한 시도의 비교는 실패, 성공한 시도는 항목마다 일치·불일치.
 *  아직 회신이 없는 시도(지급 전, 실패 뒤 다시 지급할 것 포함)는 승인 쪽만 채워져 있다. 맨 아래 줄은 열마다의 출처 */
function Fact() {
  const d = useRecon()
  if (!d) return null
  const { recon } = d
  const last = d.history.at(-1)
  // 일치·불일치가 난 뒤에는 더 올 회신이 없다
  const tries: (Recon['history'][number] | null)[] = recon ? d.history : [...d.history, null]
  const accounts = d.want.accounts.length ? d.want.accounts.join(' · ') : none
  const name = (i: number, item: string) => (
    <span className="flex items-baseline gap-2">
      {tries.length > 1 && <span className="text-text-sub">{i + 1}</span>}
      {item}
    </span>
  )
  const cmp = (r: Recon['history'][number] | null, item: string) => (!r ? none : r.result === L.실패 ? verdict(L.실패) : recon ? verdict(recon.diff.includes(item) ? L.불일치 : L.일치) : none)
  return (
    <section className="mb-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className={label}>{L.대사}</h2>
        {recon && verdict(recon.verdict)}
      </div>
      <Table
        head={['', L.승인, L.회신, L.비교]}
        right={[1, 2]}
        rows={[
          ...tries.flatMap((r, i) => [
            [name(i, L.금액), num(d.want.amount), r ? num(r.amount) : none, cmp(r, L.금액)],
            [name(i, L.계좌), accounts, r ? r.account : none, cmp(r, L.계좌)],
          ]),
          // 열마다의 출처: 회신은 사람이 넣은 것(누가 언제), 비교는 코드가 맞춰 본 것(무엇이 같으면 일치인지). 승인의 금액과 계좌는 위의 숫자 줄에 출처가 있다
          [
            L.출처,
            null,
            last ? (
              <Source kind={last.source} side="top">
                <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
                  <dt className={label}>{L.역할}</dt>
                  <dd>{last.role}</dd>
                  <dt className={label}>{L.날짜}</dt>
                  <dd className="tabular-nums">{last.at}</dd>
                </dl>
              </Source>
            ) : (
              none
            ),
            <Source kind={L.계산} side="top">
              <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
                <dt className={label}>{L.일치}</dt>
                <dd>{L['결과 성공, 금액과 계좌 같음']}</dd>
              </dl>
            </Source>,
          ],
        ]}
      />
    </section>
  )
}

/** 회신 한 줄: 회신 · 결과 · 사람 · 날짜 */
const Line = ({ r }: { r: { result: string; role: string; at: string } }) => <p className="text-body tabular-nums">{[L.회신, r.result, r.role, r.at].join(' · ')}</p>

const row = 'flex items-center gap-2'
const name = `w-8 shrink-0 ${label}`
const field = 'h-head min-w-0 flex-1 rounded-box border border-line bg-bg px-2 text-body tabular-nums outline-none focus:border-text-sub'

/** 은행 회신 입력: 금액, 계좌, 결과. 승인된 값이 미리 들어 있고 고쳐서 보낸다(모의 처리). 보낸 뒤 새 값을 받을 때까지는 다시 눌리지 않는다 */
function Form({ d }: { d: Recon }) {
  const [amount, setAmount] = useState(String(d.want.amount))
  const [account, setAccount] = useState(d.want.accounts[0] ?? '')
  const [result, setResult] = useState<string>(L.성공)
  const [sent, setSent] = useState<unknown>(null)
  const ok = /^\d+$/.test(amount.trim()) && account.trim() !== ''
  return (
    <div className="flex flex-col gap-2">
      <label className={row}>
        <span className={name}>{L.금액}</span>
        <Input inputMode="numeric" className={`${field} text-right`} value={amount} onValueChange={setAmount} />
      </label>
      <label className={row}>
        <span className={name}>{L.계좌}</span>
        <Input className={field} value={account} onValueChange={setAccount} />
      </label>
      <div className={row}>
        <span className={name}>{L.결과}</span>
        <RadioGroup aria-label={L.결과} value={result} onValueChange={(v) => setResult(v as string)} className="flex gap-4">
          {[L.성공, L.실패].map((v) => (
            <label key={v} className="flex cursor-pointer items-center gap-1 text-body">
              <Radio.Root value={v} className="flex size-4 items-center justify-center rounded-pill border border-text-sub bg-bg data-checked:border-action">
                <Radio.Indicator className="size-2 rounded-pill bg-action data-unchecked:hidden" />
              </Radio.Root>
              {v}
            </label>
          ))}
        </RadioGroup>
      </div>
      <button
        className={`${button} self-start`}
        disabled={!ok || sent === d}
        onClick={() => {
          setSent(d)
          api('/reply', { id: d.id, amount: Number(amount.trim()), account: account.trim(), result }).catch(() => store.set(changedAtom, (n) => n + 1))
        }}
      >
        {L.회신}
      </button>
    </div>
  )
}

/** 조치: 회신을 넣을 수 있으면 입력, 넣은 뒤에는 남긴 회신 한 줄(실패한 회신이면 그 위에 07의 지급 버튼이 다시 보인다), 지급은 끝났는데 담당이 아닌 역할에게는 누구 차례인지. 지급 전에는 07의 조치만 보인다 */
function Action() {
  const d = useRecon()
  if (!d) return null
  if (d.can) return <Form key={d.id} d={d} />
  if (d.reply) return <Line r={d.reply} />
  if (d.state !== L.완료) return null
  return (
    <div className="flex items-baseline gap-2">
      <span className={label}>{L.담당}</span>
      <span className="text-figure">{d.role}</span>
    </div>
  )
}

function History() {
  const d = useRecon()
  return d?.history.map((r, i) => <Line key={i} r={r} />) ?? null
}

export default [
  { slot: 'fact', kind: L.지급, View: Fact },
  { slot: 'action', kind: L.지급, View: Action },
  { slot: 'history', kind: L.지급, View: History },
] satisfies Piece[]
