// 08 대사: 지급 상세의 가운데에 "대사" 표(승인 / 회신 / 비교, 지급 시도마다 줄), 오른쪽 조치에 은행 회신 입력(금액, 계좌, 결과), 이력에 지급 표시와 회신을 일어난 순서대로.
// 회신은 사람이 넣은 것(출처 시연), 비교는 코드가 맞춰 본 것(출처 계산)이다.
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { atom, useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, roleAtom, store, targetAtom } from '../../state'
import { Confirm } from '../../ui/Confirm'
import { Empty } from '../../ui/Empty'
import { grade } from '../../ui/grade'
import { Line as Row } from '../../ui/Line'
import { Pill } from '../../ui/Pill'
import { Region } from '../../ui/Region'
import { Source } from '../../ui/Source'
import { Table, num } from '../../ui/Table'

type Recon = {
  id: string
  /** 대리점 이름 */
  name: string
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
  /** 이력: 지급 표시와 회신을 일어난 순서대로. result는 회신에만 있다 */
  lines: { kind: string; result: string | null; role: string; at: string }[]
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
const none = <Text color="secondary">{L.없음}</Text>

/** 대사 표: 지급 시도마다 금액·계좌 두 줄에 승인 / 회신 / 비교. 실패한 시도의 비교는 실패, 성공한 시도는 항목마다 일치·불일치.
 *  아직 회신이 없는 시도(지급 전, 실패 뒤 다시 지급할 것 포함)는 승인 쪽만 채워져 있다. 맨 아래 줄은 열마다의 출처 */
function Fact() {
  const d = useRecon()
  if (!d) return null
  const { recon } = d
  const last = d.history.at(-1)
  // 회신을 기다리는 시도(지급 전 포함)에만 빈 줄을 둔다. 실패한 뒤 아직 다시 지급하지 않았으면 다음 줄은 없다
  const waits = d.state === L.이체 || (!recon && !d.history.length)
  const tries: (Recon['history'][number] | null)[] = waits ? [...d.history, null] : d.history
  const accounts = d.want.accounts.length ? d.want.accounts.join(' · ') : none
  const name = (i: number, item: string) => (
    <span className="flex items-baseline gap-2">
      {tries.length > 1 && <Text type="supporting">{i + 1}</Text>}
      <Text weight="medium">{item}</Text>
    </span>
  )
  const cmp = (r: Recon['history'][number] | null, item: string) => (!r ? none : r.result === L.실패 ? verdict(L.실패) : recon ? verdict(recon.diff.includes(item) ? L.불일치 : L.일치) : none)
  // 열의 출처는 영역 제목 옆에(표 안에 출처 줄을 두지 않는다): 회신은 시연 서랍에서 넣은 모의 회신, 비교는 계산
  const sources = (
    <>
      {recon && verdict(recon.verdict)}
      {last && (
        // 모의 회신(시연 서랍에서 넣은 가상의 은행 회신, A05 §6): 종류 · 대상 · 넣은 값 · 역할 · 날짜 · 이유
        <Source
          kind={L.모의}
          tip={L.회신}
          rows={[
            [L.종류, L.회신],
            [L.대상, d.name],
            [L.값, [num(last.amount), last.account, last.result].join(' · ')],
            [L.역할, last.role],
            [L.날짜, last.at],
            [L.이유, L.시연],
          ]}
        />
      )}
      <Source
        kind={L.계산}
        tip={L.비교}
        rows={[
          [L.일치, L['결과 성공, 금액과 계좌 같음']],
          [L.불일치, L['결과 성공, 금액이나 계좌 다름']],
          [L.실패, L['결과 실패']],
        ]}
      />
    </>
  )
  return (
    <Region title={L.대사} aside={sources}>
      <Table
        head={['', L.승인, L.회신, L.비교]}
        right={[1, 2]}
        rows={[
          ...tries.flatMap((r, i) => [
            [name(i, L.금액), num(d.want.amount), r ? num(r.amount) : none, cmp(r, L.금액)],
            [name(i, L.계좌), accounts, r ? r.account : none, cmp(r, L.계좌)],
          ]),
        ]}
      />
    </Region>
  )
}

/** 이력 한 줄: 지급 · 사람 · 날짜 / 회신 · 결과 · 사람 · 날짜. 앞의 낱말이 굵다 */
const Line = ({ r }: { r: { kind?: string; result?: string | null; role: string; at: string } }) => <Row kind={r.kind ?? L.회신} parts={[r.result, r.role, r.at]} />

/** 은행 회신 입력: 금액, 계좌, 결과. 승인된 값이 미리 들어 있고 고쳐서 보낸다(모의 처리). 고칠 수 없는 조치라 확인 창을 거치고, 보낸 뒤 새 값을 받을 때까지는 다시 눌리지 않는다 */
function Form({ d }: { d: Recon }) {
  const [amount, setAmount] = useState(num(d.want.amount))
  const [account, setAccount] = useState(d.want.accounts[0] ?? '')
  const [result, setResult] = useState<string>(L.성공)
  const [sent, setSent] = useState<unknown>(null)
  // 금액은 쉼표가 있는 꼴로 보이고 받는다. 보낼 때 쉼표를 뺀다. 1 이상이어야 한다
  const won = /^[\d,]+$/.test(amount.trim()) ? Number(amount.replace(/,/g, '')) : 0
  const ok = won >= 1 && account.trim() !== ''
  return (
    <>
      <TextInput label={L.금액} inputMode="numeric" width="100%" value={amount} onChange={setAmount} />
      <TextInput label={L.계좌} width="100%" value={account} onChange={setAccount} />
      <RadioList label={L.결과} orientation="horizontal" value={result} onChange={setResult}>
        {[L.성공, L.실패].map((v) => (
          <RadioListItem key={v} value={v} label={v} />
        ))}
      </RadioList>
      <div>
        <Confirm
          label={L.회신}
          variant={grade(L.회신)}
          title={`${L.회신} ${d.name}`}
          rows={[
            [L.금액, ok ? num(won) : ''],
            [L.계좌, account.trim()],
            [L.결과, result],
          ]}
          isDisabled={!ok || sent === d}
          onConfirm={() => {
            setSent(d)
            return api('/reply', { id: d.id, amount: won, account: account.trim(), result }).catch(() => store.set(changedAtom, (n) => n + 1))
          }}
        />
      </div>
    </>
  )
}

/** 조치: 남긴 회신 한 줄(실패한 회신이면 그 위에 07의 지급 버튼이 다시 보인다), 회신을 기다리는 동안은 누구 차례인지. 지급 전에는 07의 조치만 보인다.
 * 회신의 입력은 모의 회신이라 시연 서랍에 있다(Reply) */
function Action() {
  const d = useRecon()
  if (!d) return null
  if (d.reply) return <Line r={d.reply} />
  if (d.state !== L.이체) return null
  return (
    <div className="flex items-baseline gap-2">
      <Text type="supporting">{L.담당}</Text>
      <Text weight="semibold">{d.role}</Text>
    </div>
  )
}

/** 시연 서랍(slot 'demo'): 은행 회신을 넣는다(모의 회신 — 실제 은행이 없다). 넣은 회신은 지급 화면에 출처 모의로 남는다 */
function Reply() {
  const d = useRecon()
  return d?.can ? (
    // 어느 지급의 회신인지 영역 제목 옆에(서랍은 화면과 떨어져 있다)
    <Region title={L.회신} aside={<Text color="secondary">{d.name}</Text>}>
      <Form key={d.id} d={d} />
    </Region>
  ) : null
}

function History() {
  const d = useRecon()
  if (!d) return null
  return d.lines.length ? d.lines.map((r, i) => <Line key={i} r={r} />) : <Empty />
}

export default [
  { slot: 'fact', kind: L.지급, View: Fact },
  { slot: 'action', kind: L.지급, View: Action },
  { slot: 'demo', kind: L.지급, View: Reply },
  { slot: 'history', kind: L.지급, View: History },
] satisfies Piece[]
