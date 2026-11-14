import { AiCard } from '../ui/AiCard'
import { AiReport } from '../tickets/17-보고'
import { useReport } from '../tickets/17-보고/report'
// 정황 기록: 머리(← 작업 · n/전체 / 정황 이름 / 메타 한 줄 / 페이지 조치 / 탭) → 본문(근거 · 관계 · 가설 · 소명 영역) → 오른쪽 레일(AI 보고 · 요약).
// 요청 · 기각은 내부 감시의 페이지 조치(누르면 확인 창에서 사유). AI 보고는 이 정황을 판단하는 가장 큰 재료라 레일에서 처음부터 펼쳐 둔다.
import { HStack } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { BuildingStorefrontIcon, FlagIcon } from '@heroicons/react/24/outline'
import { type ReactNode, useState } from 'react'
import { State } from '../ui/Mark'
import { L } from '../labels'
import { api, changedAtom, store } from '../state'
import { Act, Meta, RecordPage, Tiles, byGrade } from '../ui/Record'
import { Region } from '../ui/Region'
import { DECISION, Source } from '../ui/Source'
import { num, plain } from '../ui/status'
import { Evidence, History, Links } from '../tickets/11-정황'
import { type Signal as Data, useSignal } from '../tickets/11-정황/signal'
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
        <Act key={a.kind} kind={a.kind} classes={a.classes} must={a.reason} target={d.signal.name} rows={[[L.대리점, d.signal.dealers.map((x) => x.name).join(' · ')]]} send={(reason) => (onBad(null), api('/rule', { id: d.signal.id, kind: a.kind, reason: reason ?? undefined }).catch(fail))} />
      ))}
    </HStack>
  )
}

/** 판단의 재료 타일: 근거 · 대리점 · 기준(그 종류를 찾는 기준 — 근접 · 지연은 가정이라 결정 번호의 표지) */
/** 이 정황의 기준(이름표 · 값 · 출처 표지): 보조 칸의 요약에 둔다 */
function basisOf(d: Data): [string, string, ReactNode] {
  const s = d.signal
  // 기준: 이름표와 값(문장 금지). 계좌는 회수의 계좌가 다른 대리점의 계좌와 일치, 동명은 대표자만 일치, 대사는 비교가 불일치
  const basis: Record<string, [string, string]> = {
    [L.계좌]: [L.일치, `${L.회수} · ${L.계좌}`],
    [L.동명]: [L.일치, L.대표자],
    [L.근접]: [L.근접, d.near.map(num).join(' – ')],
    [L.지연]: [L.지연, `${d.delay}${L.일}`],
    [L.대사]: [L.비교, L.불일치],
  }
  const [k, v] = basis[s.kind] ?? [s.kind, L.없음]
  const src = DECISION[s.kind] ? <Source kind={L.가정} of={s.kind} tip={`${k} ${v}`} rows={[[k, v]]} /> : <Source kind={s.source} tip={`${k} ${v}`} rows={[[k, v]]} />
  return [k, v, src]
}

/** 숫자 타일: 근거 · 대리점(지표만 — 기준 같은 글은 보조 칸의 요약으로) */
function SignalTiles({ d }: { d: Data }) {
  return <Tiles items={[{ name: L.근거, value: d.evidence.length }, { name: L.대리점, value: d.signal.dealers.length }]} />
}


/** 이 정황의 AI 보고 카드(관계 영역 바로 아래, D63). 보고가 없으면 없음 */
function SignalAi() {
  const d = useReport()
  if (!d) return null
  return (
    <AiCard title={`${L.AI} ${L.보고}`}>
      <AiReport />
    </AiCard>
  )
}

export function Signal() {
  const d = useSignal()
  const [bad, setBad] = useState<{ id: string; word: string } | null>(null)
  if (!d) return null
  const s = d.signal
  const dealers = s.dealers.map((x) => x.name).join(' · ')
  const [k, v, src] = basisOf(d)
  return (
    <RecordPage
      props={[
        [L.상태, plain(s.state) ? s.state : <State word={s.state} />],
        [L.종류, s.kind],
        [L.대리점, dealers],
        [k, <HStack gap={2} vAlign="center"><Text>{v}</Text>{src}</HStack>],
        // 다시 올라온 정황(D57): 앞선 기각과 그 사유를 함께 보인다(시나리오 4의 4)
        ...d.history.filter((h) => h.kind === L.기각).slice(-1).map((h): [string, ReactNode] => [L.기각, [h.reason?.class, h.reason?.memo, h.at].filter(Boolean).join(' · ')]),
      ]}
      title={s.name}
      meta={[
        <State word={s.state} />,
        <Meta icon={FlagIcon}>{s.kind}</Meta>,
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
              <SignalTiles d={d} />
              <Evidence />
              <Links />
              <SignalAi />
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
