// astryx template: detail-page — 정황 기록
import { AiCard } from '../ui/AiCard'
import { Body as ReportBody, Decide as ReportDecide, Head as ReportHead } from '../tickets/17-보고'
import { useReportLoad } from '../tickets/17-보고/report'
// 정황 기록: 머리(← 작업 · n/전체 / 정황 이름 / 메타 한 줄 / 페이지 조치 / 탭) → 본문(근거 · 관계 · 가설 · 소명 영역) → 오른쪽 레일(AI 보고 · 요약).
// 요청 · 기각은 내부 감시의 페이지 조치(누르면 확인 창에서 사유). AI 보고는 이 정황을 판단하는 가장 큰 재료라 레일에서 처음부터 펼쳐 둔다.
import { HStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { BuildingStorefrontIcon, FlagIcon } from '@heroicons/react/24/outline'
import { type ReactNode, useState } from 'react'
import { State } from '../ui/Mark'
import { L } from '../labels'
import { api, changedAtom, store } from '../state'
import { Pending } from '../ui/Pending'
import { Act, Meta, RecordPage, byGrade } from '../ui/Record'
import { Region } from '../ui/Region'
import { DECISION, Source } from '../ui/Source'
import { num, plain } from '../ui/status'
import { Evidence, History, Links } from '../tickets/11-정황'
import { type Signal as Data, useSignalLoad } from '../tickets/11-정황/signal'
import { OfSignal } from '../tickets/12-가설'
import { Of } from '../tickets/18-발송'

/** 오른쪽 위 페이지 조치: 요청(주 버튼, 맨 끝) · 기각. 서버가 거절하면 `onBad`로 그 낱말 */
function Actions({ d, onBad }: { d: Data; onBad: (word: string | null) => void }) {
  const fail = (e: Error) => {
    onBad(e.message)
    store.set(changedAtom, (n) => n + 1)
  }
  return (
    <HStack gap={2}>
      {byGrade(d.actions).map((a) => (
        <Act key={a.kind} kind={a.kind} classes={a.classes} must={a.reason} target={one(d)} rows={facts(d)} send={(reason) => (onBad(null), api('/rule', { id: d.signal.id, kind: a.kind, reason: reason ?? undefined }).catch(fail))} />
      ))}
    </HStack>
  )
}

/** 확인 창의 제목에 붙는 대리점(하나일 때만 — 여럿이면 몸통의 줄로) */
const one = (d: Data) => (d.signal.dealers.length === 1 ? d.signal.dealers[0].name : undefined)
/** 확인 창의 몸통(값 하나에 사실 하나, review.md 2-1): 종류 · 대리점(여럿이면 줄마다) · 상태 */
const facts = (d: Data): [string, string][] => [
  [L.종류, d.signal.kind === L.추인 ? L.거부 : d.signal.kind],
  ...(d.signal.dealers.length > 1 ? d.signal.dealers.map((x): [string, string] => [L.대리점, x.name]) : []),
  [L.상태, d.signal.state],
]

/** 식별자(등록)의 근거 줄에서 실제로 일치한 종류(대표자 · 주소 · 계좌). 재접수로 근거가 늘면 그만큼 늘어 관계 그림과 같은 사실을 보인다 */
const matched = (d: Data) => [...new Set(d.evidence.map((e) => e.item).filter((i) => ([L.대표자, L.주소, L.계좌] as string[]).includes(i)))]

/** 이 정황의 기준(이름표 · 값 · 출처 표지): 보조 칸의 요약에 둔다. 숫자 타일은 두지 않는다(근거 수는 근거 영역 제목 옆, 대리점은 머리에 이미 있다) */
function basisOf(d: Data): [string, ReactNode, ReactNode] {
  const s = d.signal
  // 이름표와 값(문장 금지). 계좌는 회수가 들어간 계좌, 동명은 근거에 있는 식별자의 종류(관계 그림과 같은 사실), 지연은 근거의 실제 지연(기준 일수는 가정 표지 안에), 대사는 비교가 불일치
  const ids = matched(d).length ? matched(d) : [L.대표자]
  const late = Math.max(0, ...d.evidence.map((e) => e.days ?? 0))
  const basis: Record<string, [string, ReactNode, string]> = {
    [L.계좌]: [L.일치, L.계좌, L.계좌],
    [L.동명]: [L.일치, <HStack gap={1} wrap="wrap">{ids.map((k) => <Token key={k} size="sm" label={k} />)}</HStack>, ids.join(' · ')],
    [L.근접]: [L.근접, d.near.map(num).join(' – '), d.near.map(num).join(' – ')],
    [L.지연]: [L.지연, `${late}${L.일}`, `${late}${L.일}`],
    [L.대사]: [L.비교, L.불일치, L.불일치],
  }
  const [k, v, tip] = basis[s.kind] ?? [s.kind, L.없음, L.없음]
  // 근접 · 지연의 기준(범위 · 일수)은 가정이라 그 결정의 표지(누르면 기준이 보인다)
  const src = DECISION[s.kind] ? <Source kind={L.가정} of={s.kind} tip={`${k} ${tip}`} /> : <Source kind={s.source} tip={`${k} ${tip}`} rows={[[k, tip]]} />
  return [k, v, src]
}


/** 이 정황의 AI 보고 카드(관계 영역 바로 아래, D63). 보고가 없으면 없음 */
function SignalAi({ s }: { s: Data }) {
  const q = useReportLoad()
  const d = q.data
  return (
    <AiCard aside={d && <ReportHead d={d} signal={s} />}>
      {!d ? (
        <Pending of={q} />
      ) : (
        <>
          {/* 남은 결정(채택 · 불채택)은 머리의 상태 Badge 바로 아래 이름표-값 줄 */}
          <ReportDecide d={d} />
          {/* AI가 응답하지 않았으면 빈 카드 대신 그렇다고 적는다(조사를 다시 누를 수 있다) */}
          {d.report?.state === L.오류 && !d.report.facts?.length ? <Text color="secondary">{L['AI 응답 없음']}</Text> : <ReportBody d={d} signal={s} />}
        </>
      )}
    </AiCard>
  )
}

/** 요약에 남는 결정(거부 · 기각): 결정 이름표에 날짜, 이어서 사유 · 메모 — 값마다 한 줄 */
const decided = (kind: string, x: { at?: string | null; reason?: { class?: string; memo?: string } | null }): [string, ReactNode][] => [
  [kind, x.at ?? L.미상],
  ...(x.reason?.class ? [[L.사유, x.reason.class] as [string, ReactNode]] : []),
  ...(x.reason?.memo ? [[L.메모, x.reason.memo] as [string, ReactNode]] : []),
]

export function Signal() {
  const q = useSignalLoad()
  const [bad, setBad] = useState<{ id: string; word: string } | null>(null)
  if (!q.data) return <Pending of={q} page />
  const d = q.data
  const s = d.signal
  const dealers = s.dealers.map((x) => x.name).join(' · ')
  const [k, v, src] = basisOf(d)
  return (
    <RecordPage
      props={[
        [L.상태, plain(s.state) ? s.state : <State word={s.state} />],
        [L.종류, s.kind === L.추인 ? L.거부 : s.kind],
        [L.대리점, dealers],
        [k, <HStack gap={2} vAlign="center">{typeof v === 'string' ? <Text>{v}</Text> : v}{src}</HStack>],
        // 거부된 추인의 정황: 그 거부(누가 · 사유 · 날짜)
        // 값 하나에 사실 하나(review.md 2-1): 결정의 날짜 · 사유 · 메모를 줄마다
        ...(d.refused ? decided(L.거부, d.refused) : []),
        // 다시 올라온 정황(D57): 앞선 기각과 그 사유를 함께 보인다(시나리오 4의 4)
        ...d.history.filter((h) => h.kind === L.기각).slice(-1).flatMap((h) => decided(L.기각, h)),
      ]}
      title={s.name}
      meta={[
        <State word={s.state} />,
        <Meta icon={FlagIcon}>{s.kind === L.추인 ? L.거부 : s.kind}</Meta>,
        <Meta icon={BuildingStorefrontIcon}>{dealers}</Meta>,
      ]}
      actions={<Actions d={d} onBad={(word) => setBad(word ? { id: s.id, word } : null)} />}
      bad={bad?.id === s.id ? bad.word : null}
      tabs={[
        {
          value: 'body',
          label: L.내용,
          body: (
            <>
              <Evidence />
              <Links />
              <SignalAi s={d} />
              <OfSignal />
              <Of />
            </>
          ),
        },
        {
          value: 'history',
          label: L.이력,
          body: (
            <Region title={L.이력}>
              <History />
            </Region>
          ),
        },
      ]}
    />
  )
}
