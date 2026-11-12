// 17 보고: 정황 기록(pages/Signal)의 레일 "AI 보고" 칸. AI가 쓴 글은 여기에만 있다(본문에는 없다).
// 머리에 AI(누르면 실행 기록)와 상태 Badge. 사실의 문장은 코드가 가리킨 기록에서 값을 채운 것이고 끝의 연결(↗)을 누르면 본문 근거 표의 그 줄이 강조된다.
// 미확인은 펼쳐져 있고 의견·반론은 접혀 있다. 확신을 숫자로 적지 않는다. 채택·불채택은 조치와 따로 남고 둘 다 secondary(같은 무게).
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { List, ListItem } from '@astryxdesign/core/List'
import { Text } from '@astryxdesign/core/Text'
import { useSetAtom } from 'jotai'
import { type ReactNode, useEffect, useState } from 'react'
import { L } from '../../labels'
import { api, store } from '../../state'
import { Empty } from '../../ui/Empty'
import { Act } from '../../ui/Record'
import { Source } from '../../ui/Source'
import { badge, fail } from '../../ui/status'
import { Line } from '../04-심사'
import { markAtom, useSignal } from '../11-정황/signal'
import { tickAtom, useReport } from './report'

/** 근거 연결: 누르면 본문 근거 표의 그 줄이 1.2초 동안 강조된다 */
function show(ref: string) {
  store.set(markAtom, ref)
  setTimeout(() => store.get(markAtom) === ref && store.set(markAtom, null), 1200)
}

const Part = ({ name, children }: { name: string; children: ReactNode }) => (
  <VStack gap={1}>
    <Text type="supporting" color="secondary" weight="medium">
      {name}
    </Text>
    {children}
  </VStack>
)

/** 줄마다 한 항목(긴 글이 칸을 넘지 않게 어디서든 줄을 바꾼다) */
const Lines = ({ list }: { list: string[] }) =>
  list.length ? (
    <List density="compact">
      {list.map((t, i) => (
        <ListItem key={i} label={<Text className="break-keep wrap-anywhere">{t}</Text>} />
      ))}
    </List>
  ) : (
    <Empty />
  )

/** 머리: AI 표지(누르면 실행 기록), 상태 Badge, 조사(내부 감시에게. 요청이 끝날 때까지 다시 눌리지 않는다). 대기인 보고는 AI가 쓰는 동안 몇 초마다 다시 읽는다 */
function Head() {
  const d = useReport()
  const signal = useSignal()
  const bump = useSetAtom(tickAtom)
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState<string | null>(null)
  const id = signal?.signal.id
  const waiting = !!d && (!d.report || d.report.state === L.대기)
  useEffect(() => {
    setBad(null)
  }, [id])
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => bump((n) => n + 1), 3000)
    return () => clearInterval(t)
  }, [waiting, bump])
  if (!d || !id) return null
  const r = d.report
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      <Source kind={L.AI} tip={r?.model ?? undefined} rows={[[L.모델, r?.model ?? L.없음], [L.날짜, r?.at ?? L.없음], [L.조회, String(r?.reads ?? L.없음)]]} />
      <StackItem size="fill">
        <Badge variant={badge(r?.state ?? L.대기)} label={r?.state ?? L.대기} />
      </StackItem>
      {d.run && (
        <Button
          label={L.조사}
          variant="secondary"
          size="sm"
          isDisabled={busy}
          onClick={() => {
            setBusy(true)
            setBad(null)
            api('/investigate', { id })
              .then(() => undefined, (e: Error) => setBad(e.message))
              .finally(() => setBusy(false))
          }}
        />
      )}
      {bad && <Badge variant={fail} label={bad} />}
    </HStack>
  )
}

/** 사실 / 추정 / 미확인 / 의견·반론. 올라와 있는(검토·채택·불채택) 보고에만 내용이 있다 */
function Body() {
  const d = useReport()
  const r = d?.report
  if (!d || !r || !r.facts.length) return null
  return (
    <VStack gap={3}>
      <Part name={L.사실}>
        <List density="compact">
          {r.facts.map((f, i) => (
            <ListItem
              key={i}
              label={<Text className="break-keep wrap-anywhere">{f.text}</Text>}
              endContent={
                <Link aria-label={L.근거} color="primary" onClick={() => show(f.ref)}>
                  ↗
                </Link>
              }
            />
          ))}
        </List>
      </Part>
      <Part name={L.추정}>
        <Lines list={r.guess} />
      </Part>
      <Part name={L.미확인}>
        <Lines list={r.unknown} />
      </Part>
      <Collapsible trigger={<Text type="supporting" color="secondary" weight="medium">{L.의견}</Text>} defaultIsOpen={false} isDisabled={!d.opened}>
        <VStack gap={2}>
          {r.opinion && (
            <>
              <HStack gap={2} vAlign="center">
                <Text type="supporting" color="secondary">{L.조치}</Text>
                <Text weight="semibold">{r.opinion.action}</Text>
              </HStack>
              <Text className="break-keep wrap-anywhere">{r.opinion.text}</Text>
            </>
          )}
          {r.counter && (
            <Part name={L.반론}>
              <Text className="break-keep wrap-anywhere">{r.counter}</Text>
            </Part>
          )}
        </VStack>
      </Collapsible>
    </VStack>
  )
}

/** 채택 · 불채택: 같은 무게의 버튼(둘 다 secondary). 누르면 확인 창에서 사유(분류 · 메모)를 받는다 — 불채택은 분류 필수. 서버가 거절하면 그 낱말.
 * 결정이 남으면 결정 한 줄과, AI의 의견과 정황의 조치(그때까지 내린 것)를 이름표와 값으로 보인다 */
function Decide() {
  const d = useReport()
  const signal = useSignal()
  const [bad, setBad] = useState<string | null>(null)
  const id = d?.report?.id
  useEffect(() => {
    setBad(null)
  }, [id])
  if (!d || !d.report || !signal) return null
  const { decision: x, actions } = d
  return (
    <VStack gap={2}>
      {actions.length > 0 && (
        <HStack gap={2} vAlign="center" wrap="wrap">
          {actions.map((a) => (
            <Act key={a.kind} kind={a.kind} classes={a.classes} must={a.reason} target={signal.signal.name} send={(reason) => (setBad(null), api('/adopt', { id, kind: a.kind, reason: reason ?? undefined }).catch((e: Error) => setBad(e.message)))} />
          ))}
          {bad && <Badge variant={fail} label={bad} />}
        </HStack>
      )}
      {x && (
        <VStack gap={1}>
          <Line d={x} />
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text type="supporting" color="secondary">{L.의견}</Text>
            <Text weight="medium">{x.opinion ?? L.없음}</Text>
            <Text type="supporting" color="secondary">{L.조치}</Text>
            <Text weight="medium">{x.acted ?? L.없음}</Text>
          </HStack>
        </VStack>
      )}
    </VStack>
  )
}

/** 레일 칸의 몸통(RailCard 안): 머리 · 본문 · 채택/불채택 */
export function AiReport() {
  if (!useReport()) return null
  return (
    <VStack gap={3}>
      <Head />
      <Body />
      <Decide />
    </VStack>
  )
}

