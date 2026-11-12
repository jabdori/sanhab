// 17 보고: 정황의 오른쪽 "보고" 칸. AI가 쓴 글은 여기에만 있다(가운데에는 없다).
// 머리에 AI(누르면 실행 기록)와 상태. 사실의 문장은 코드가 가리킨 기록에서 값을 채운 것이고 끝의 연결(↗)을 누르면 가운데 근거 표의 그 줄이 강조된다.
// 미확인은 펼쳐져 있고 의견·반론은 접혀 있다. 확신을 숫자로 적지 않는다. 채택·불채택은 조치와 따로 남는다.
import { Button } from '@astryxdesign/core/Button'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { useAtom, useSetAtom } from 'jotai'
import { type ReactNode, useEffect, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, store } from '../../state'
import { Empty } from '../../ui/Empty'
import { grade } from '../../ui/grade'
import { Pill } from '../../ui/Pill'
import { blank, ready, sent as filled } from '../../ui/Reason'
import { Source } from '../../ui/Source'
import { Line } from '../04-심사'
import { markAtom, reasonAtom, useSignal } from '../11-정황/signal'
import { tickAtom, useReport } from './report'

// 상태의 색(tokens.md): 대기·검토는 대기, 채택은 좋음, 오류·불채택은 아님
const tones = { [L.대기]: 'wait', [L.검토]: 'wait', [L.채택]: 'good', [L.오류]: 'bad', [L.불채택]: 'bad' } as const
/** AI가 쓴 글: 줄을 어디서든 바꾼다(긴 글이 칸을 넘지 않게) */
const text = 'break-keep wrap-anywhere text-base'

/** 근거 연결: 누르면 가운데 근거 표의 그 줄이 1.2초 동안 강조된다 */
function show(ref: string) {
  store.set(markAtom, ref)
  setTimeout(() => store.get(markAtom) === ref && store.set(markAtom, null), 1200)
}

const Part = ({ name, children }: { name: string; children: ReactNode }) => (
  <section className="flex flex-col gap-1">
    <Text type="supporting" weight="medium">
      {name}
    </Text>
    {children}
  </section>
)
const Lines = ({ list }: { list: string[] }) =>
  list.length ? (
    <ul className="flex flex-col gap-1">
      {list.map((t, i) => (
        <li key={i} className={text}>
          {t}
        </li>
      ))}
    </ul>
  ) : (
    <Empty />
  )

/** 머리: AI 표지(누르면 실행 기록), 상태 표지, 조사(내부 감시에게. 요청이 끝날 때까지 다시 눌리지 않는다) */
function Head() {
  const d = useReport()
  const signal = useSignal()
  const bump = useSetAtom(tickAtom)
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState<string | null>(null)
  const id = signal?.signal.id
  // 보고가 아직 없거나 대기이면 AI가 쓰는 동안이다
  const waiting = !!d && (!d.report || d.report.state === L.대기)
  useEffect(() => setBad(null), [id])
  // 대기인 보고는 AI가 쓰는 동안 몇 초마다 다시 읽는다
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => bump((n) => n + 1), 3000)
    return () => clearInterval(t)
  }, [waiting, bump])
  if (!d || !id) return null
  const r = d.report
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Source
        kind={L.AI}
        tip={r?.model ?? undefined}
        rows={[
          [L.모델, r?.model ?? L.없음],
          [L.날짜, r?.at ?? L.없음],
          [L.조회, String(r?.reads ?? L.없음)],
        ]}
      />
      <Pill tone={tones[(r?.state ?? L.대기) as keyof typeof tones]}>{r?.state ?? L.대기}</Pill>
      {d.run && (
        <Button
          label={L.조사}
          variant="secondary"
          isDisabled={busy}
          onClick={() => {
            setBusy(true)
            setBad(null)
            api('/investigate', { id }).then(
              () => undefined,
              (e: Error) => setBad(e.message),
            ).finally(() => setBusy(false))
          }}
        />
      )}
      {bad && <Pill tone="bad">{bad}</Pill>}
    </div>
  )
}

/** 사실 / 추정 / 미확인 / 의견·반론. 올라와 있는(검토·채택·불채택) 보고에만 내용이 있다 */
function Body() {
  const d = useReport()
  const r = d?.report
  if (!d || !r || !r.facts.length) return null
  return (
    <>
      <Part name={L.사실}>
        <ol className="flex flex-col gap-1">
          {r.facts.map((f, i) => (
            <li key={i} className={text}>
              {f.parts.map(([t, v], j) => (v ? <span key={j} className="whitespace-nowrap">{t}</span> : t))}{' '}
              <Link aria-label={L.근거} color="primary" onClick={() => show(f.ref)}>
                ↗
              </Link>
            </li>
          ))}
        </ol>
      </Part>
      <Part name={L.추정}>
        <Lines list={r.guess} />
      </Part>
      <Part name={L.미확인}>
        <Lines list={r.unknown} />
      </Part>
      <Collapsible trigger={<Text type="supporting" weight="medium">{L.의견}</Text>} defaultIsOpen={false} isDisabled={!d.opened}>
        <div className="flex flex-col gap-2">
          {r.opinion && (
            <>
              <div className="flex items-baseline gap-2">
                <Text type="supporting">{L.조치}</Text>
                <Text weight="semibold">{r.opinion.action}</Text>
              </div>
              <p className={text}>{r.opinion.text}</p>
            </>
          )}
          {r.counter && (
            <Part name={L.반론}>
              <p className={text}>{r.counter}</p>
            </Part>
          )}
        </div>
      </Collapsible>
    </>
  )
}

/** 채택 · 불채택: 같은 무게의 버튼. 사유는 사유 칸에서 고르고, 불채택은 분류가 필수다. 누른 뒤 요청이 끝날 때까지 다시 눌리지 않는다.
 * 결정이 남으면 결정 한 줄과, AI의 의견과 정황의 조치(그때까지 내린 것)를 이름표와 값으로 보인다 */
function Decide() {
  const d = useReport()
  const [reason, setReason] = useAtom(reasonAtom)
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState<string | null>(null)
  const id = d?.report?.id
  useEffect(() => setBad(null), [id])
  if (!d || !d.report) return null
  const { decision: x, actions } = d
  return (
    <>
      {actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((a) => (
            <Button
              key={a.kind}
              label={a.kind}
              variant={grade(a.kind)}
              isDisabled={busy || !ready(a.kind, a.reason, reason)}
              onClick={() => {
                setBusy(true)
                setBad(null)
                api('/adopt', { id, kind: a.kind, reason: filled(reason) ?? undefined })
                  .then(
                    () => setReason(blank),
                    (e: Error) => setBad(e.message),
                  )
                  .finally(() => setBusy(false))
              }}
            />
          ))}
          {bad && <Pill tone="bad">{bad}</Pill>}
        </div>
      )}
      {x && (
        <div className="flex flex-col gap-1">
          <Line d={x} />
          <div className="flex items-baseline gap-2">
            <Text type="supporting">{L.의견}</Text>
            <Text weight="medium">{x.opinion ?? L.없음}</Text>
            <Text type="supporting">{L.조치}</Text>
            <Text weight="medium">{x.acted ?? L.없음}</Text>
          </div>
        </div>
      )}
    </>
  )
}

function Report() {
  const d = useReport()
  if (!d) return null
  return (
    <div className="flex flex-col gap-3">
      <Head />
      <Body />
      <Decide />
    </div>
  )
}

export default [{ slot: 'report', kind: L.정황, View: Report }] satisfies Piece[]
