// 심사 기록: astryx detail-page 템플릿에서 출발한 화면. 머리(← 작업 · n/전체 · 앞 뒤 / 제목 / 메타 한 줄 / 페이지 조치 / 탭) → 본문(바탕 위의 카드들) → 오른쪽 레일(요약 · AI 보고 카드).
// 좁으면(본문이 레일과 나란히 설 수 없으면) 레일이 본문 아래로 간다. 조치는 누를 때 확인 창에서 사유(분류 · 메모)를 받는다.
import { Badge } from '@astryxdesign/core/Badge'
import { Citation } from '@astryxdesign/core/Citation'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, Section, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { List, ListItem } from '@astryxdesign/core/List'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Text } from '@astryxdesign/core/Text'
import { BuildingStorefrontIcon, UserIcon } from '@heroicons/react/24/outline'
import { useSetAtom } from 'jotai'
import { useState } from 'react'
import { L } from '../labels'
import { api, changedAtom, store, targetAtom, useData } from '../state'
import { Empty } from '../ui/Empty'
import { Mark, State } from '../ui/Mark'
import { Act, Meta, RecordPage, Tiles, byGrade } from '../ui/Record'
import { Region } from '../ui/Region'
import { Source } from '../ui/Source'
import { caution, fail, meter, num, plain } from '../ui/status'
import { Links, Members, Rules } from '../tickets/04-심사'
import { bundled, useReview } from '../tickets/04-심사/review'
import { History, useResubmit } from '../tickets/06-반려'
import { Then } from '../tickets/09-재검토'
import { Way, useWay } from '../tickets/10-추인'
import { Flags } from '../tickets/11-정황'
import { OfReview } from '../tickets/12-가설'
import { Picture, Timeline } from '../tickets/16-경위'
import type { Report } from '../tickets/17-보고/report'

/** 오른쪽 위 페이지 조치: 보조 조치가 앞, 주 버튼(승인 · 재상신)이 맨 끝. 서버가 거절하면 `onBad`로 그 낱말 */
function Actions({ onBad }: { onBad: (word: string | null) => void }) {
  const r = useReview()
  const s = useResubmit()
  if (!r) return null
  const fail = (e: Error) => {
    onBad(e.message)
    store.set(changedAtom, (n) => n + 1)
  }
  const go = (path: string, body: object) => (onBad(null), api(path, body).catch(fail))
  const v = r.review
  const rows: [string, string][] = [[L.귀속월, v.ym], [L.합산, num(v.total)]]
  return (
    <HStack gap={2}>
      {byGrade(r.actions.filter((a) => !bundled.includes(a.kind))).map((a) => (
        <Act key={a.kind} kind={a.kind} classes={a.classes} must={a.reason} target={v.name} rows={rows} send={(reason) => go('/decide', { ids: [v.id], kind: a.kind, reason: reason ?? undefined })} />
      ))}
      {s?.can && <Act kind={L.재상신} classes={s.classes} must target={v.name} rows={rows} send={(reason) => go('/resubmit', { id: s.id, reason })} />}
    </HStack>
  )
}

/** 판단의 재료 세 타일: 합산(한도 대비 막대, 넘으면 오류 색) · 한도 · 승인권자. 합산 · 승인권자는 계산이라 출처 표지를 단다 */
function ReviewTiles() {
  const r = useReview()?.review
  if (!r) return null
  const over = r.limit !== null && r.total > r.limit
  return (
    <Tiles
      items={[
        {
          name: L.합산,
          value: num(r.total),
          below: r.limit !== null && (
            <ProgressBar label={L.한도} isLabelHidden value={Math.min(r.total, r.limit)} max={r.limit} variant={meter(over)} hasValueLabel formatValueLabel={() => `${Math.round((r.total / r.limit!) * 100)}%`} />
          ),
          aside: <Source kind={r.source} file={r.file ?? undefined} row={r.row ?? undefined} tip={L.합산} rows={[[L.합산, L['귀속월 지급의 합, 반려 제외']]]} />,
        },
        // 원본의 과거 승인에는 적용한 규칙의 기록이 없다(09)
        // 넘친 금액은 보조 글자로(합산 막대가 이미 빨갛다 — 같은 경고를 두 번 칠하지 않는다)
        { name: L.한도, value: r.limit === null ? L.미상 : num(r.limit), below: over && <Text type="supporting" color="secondary" hasTabularNumbers>{`+${num(r.total - r.limit!)}`}</Text> },
      ]}
    />
  )
}

/** 경위 탭: 그림과 같은 칸들의 시간 순 목록(incident-console의 Timeline 꼴) */
function Trail() {
  return (
    <>
      <Picture />
      <Region title={L.경위}>
        <Timeline />
      </Region>
    </>
  )
}


/** AI 보고 한 건: 그 정황의 가장 새 보고를 읽기로. 사실마다 근거(Citation), 추정 · 미확인은 목록 */
function SignalReport({ id, name }: { id: string; name: string }) {
  const d = useData<Report>(`/signals/${encodeURIComponent(id)}/report`)
  const setTarget = useSetAtom(targetAtom)
  const r = d?.report
  const lines = (list: string[]) => (
    <List density="balanced">
      {list.map((t, i) => (
        <ListItem key={i} label={<Text>{t}</Text>} />
      ))}
    </List>
  )
  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <StackItem size="fill">
          <Link weight="semibold" onClick={() => setTarget({ kind: L.정황, id })}>
            {name}
          </Link>
        </StackItem>
        <State word={r?.state ?? L.대기} />
        <Source kind={L.AI} tip={r?.model ?? undefined} rows={[[L.모델, r?.model ?? L.없음], [L.날짜, r?.at ?? L.없음], [L.조회, String(r?.reads ?? L.없음)]]} />
      </HStack>
      {r && r.facts.length > 0 && (
        <MetadataList columns="single" label={{ position: 'top' }}>
          <MetadataListItem label={L.사실}>
            <VStack gap={2}>
              {r.facts.map((f, i) => (
                <HStack key={i} gap={2} vAlign="start">
                  <Citation number={i + 1} variant="number" source={{ title: f.ref }} />
                  <Text>{f.text}</Text>
                </HStack>
              ))}
            </VStack>
          </MetadataListItem>
          {r.guess.length > 0 && <MetadataListItem label={L.추정}>{lines(r.guess)}</MetadataListItem>}
          {r.unknown.length > 0 && <MetadataListItem label={L.미확인}>{lines(r.unknown)}</MetadataListItem>}
        </MetadataList>
      )}
    </VStack>
  )
}

/** 레일의 AI 보고: 이 심사에 걸린 정황마다 그 보고. 정황이 없으면 없음 */
export function Reports() {
  const r = useReview()?.review
  const list = useData<{ id: string; name: string }[]>(r?.marks.includes(L.정황) ? `/reviews/${r.id}/signals` : null)
  if (r?.marks.includes(L.정황) && !list) return null // 읽는 중에는 비운다(없음이 깜박이지 않게)
  if (!r?.marks.includes(L.정황) || !list?.length) return <Empty />
  return (
    <VStack gap={4}>
      {list.map((s) => (
        <SignalReport key={s.id} id={s.id} name={s.name} />
      ))}
    </VStack>
  )
}

export function Review() {
  const r = useReview()
  const [bad, setBad] = useState<{ id: string; word: string } | null>(null)
  const way = useWay()
  if (!r) return null
  const v = r.review
  return (
    <RecordPage
      title={`${v.name} · ${v.ym}`}
      meta={[
        <State word={v.status} />,
        <Meta icon={UserIcon}>{v.holder ?? v.approver}</Meta>,
        <Meta icon={BuildingStorefrontIcon}>{`${r.members.length}${L.곳}`}</Meta>,
        ...v.marks.map((m) => <Mark>{m}</Mark>),
        // 이 심사가 든 추인 묶음(10): 있으면 그리로 가는 링크
        ...(way ? [<Way b={way} />] : []),
      ]}
      actions={<Actions onBad={(word) => setBad(word ? { id: v.id, word } : null)} />}
      bad={bad?.id === v.id ? bad.word : null}
      // 보조 칸의 요약: 상태 · 담당(실제로 결정하는 사람) · 승인권자(합산으로 정한 것, 가설로 올라갔으면 표시) · 귀속월 · 구성
      props={[
        [L.상태, plain(v.status) ? v.status : <State word={v.status} />],
        [L.담당, v.holder ?? v.approver],
        [L.승인권자, v.holder && v.holder !== v.approver ? <HStack gap={2} vAlign="center"><Text>{v.holder}</Text><Mark>{L.가설}</Mark></HStack> : v.approver],
        [L.귀속월, v.ym],
        [L.구성, r.members.map((m) => m.name).join(' · ')],
      ]}
      tabs={[
        {
          value: 'body',
          label: L.내용,
          body: (
            <>
              <ReviewTiles />
              <Then />
              <Members />
              <Links />
              <Rules />
              <Flags />
              <OfReview />
            </>
          ),
        },
        { value: 'trail', label: L.경위, body: <Trail /> },
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
