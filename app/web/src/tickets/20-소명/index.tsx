// 20 소명: 서류가 접수된 소명을 내부 감시가 인정 · 불인정 · 보완으로 정한다(사유 필수, 페이지 조치 Verdicts). 인정하면 소명한 대리점의 선이 관련자 계산에서 빠진다.
// 본문: 인정한 뒤의 "제외"(어느 선이 어느 기간 동안). 레일: "미확인"(코드가 찾은, 서류만으로 가를 수 없는 항목). 대리점 기록의 "접수"(Intake)와 그 시연 서류(IntakeSamples)도 여기에 있다.
import { Badge } from '@astryxdesign/core/Badge'
import { FileInput } from '@astryxdesign/core/FileInput'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Selector } from '@astryxdesign/core/Selector'
import { Table, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { ToggleButton } from '@astryxdesign/core/ToggleButton'
import { Token } from '@astryxdesign/core/Token'
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { State } from '../../ui/Mark'
import { L } from '../../labels'
import { useDetail } from '../02-대리점'
import { api, changedAtom, menuAtom, store, targetAtom, useData } from '../../state'
import { Confirm } from '../../ui/Confirm'
import { Empty } from '../../ui/Empty'
import { Act, byGrade } from '../../ui/Record'
import { Region } from '../../ui/Region'
import { Source } from '../../ui/Source'
import { fail } from '../../ui/status'
import { useClarify } from '../18-발송/clarify'
import { bin, useDocs } from '../19-서류/docs'
import { type Verdict, useVerdict } from './verdict'

/** 기간: 시작 ~ 끝. 둘 다 없으면 없음 */
const span = (since: string | null | undefined, until: string | null | undefined) => (since || until ? `${since ?? ''} ~ ${until ?? ''}` : null)

/** 본문의 "제외": 인정한 뒤에 그 소명이 제외한 선(종류, 식별자, 효력 기간). 인정하지 않았으면 보이지 않는다 */
export function Excluded() {
  const v = useVerdict().data
  // 값이 없는 것이 정상(인정 전)이라 읽는 중에도 그리지 않는다
  if (!v?.excluded.length) return null
  type E = Verdict['excluded'][number] & Record<string, unknown>
  return (
    <Region title={L.제외} aside={<Source kind={L.계산} tip={L.기간} rows={[[L.기간, span(v.excluded[0]?.since, v.excluded[0]?.until) ?? L.미상]]} />}>
      <Table<E>
        data={v.excluded as E[]}
        idKey={(e) => `${e.item}/${e.value}`}
        density="balanced"
        columns={[
          { key: 'item', header: L.종류, width: proportional(1, { minWidth: 64 }), renderCell: (e) => <Token size="sm" label={e.item} /> },
          { key: 'value', header: L.식별자, width: proportional(2, { minWidth: 96 }), renderCell: (e) => <Text weight="semibold">{e.value}</Text> },
          { key: 'span', header: L.기간, width: proportional(2, { minWidth: 120 }), renderCell: (e) => <Text hasTabularNumbers>{span(e.since, e.until) ?? L.없음}</Text> },
        ]}
      />
    </Region>
  )
}

/** 레일 "미확인"의 몸통: 가장 나중 서류에서 서류만으로 가를 수 없는 항목(누락, 호실까지 같아 추가 확인). 코드가 찾은 것이라 출처는 계산이다. 서류가 아직 없으면 보이지 않는다 */
export function Unknown() {
  const v = useVerdict().data
  const docs = useDocs().data
  // 미확인이 없으면 그리지 않는다. 요청한 서류가 빠졌으면(서류 종류) 그 서류도 누락으로 맨 위에
  if (!v || !docs?.docs.length || !(v.unknown.length || v.lacking?.length)) return null
  type U = { item: string; word: string } & Record<string, unknown>
  const data: U[] = [...(v.lacking ?? []).map((item) => ({ item, word: L.누락 })), ...v.unknown.map(([item, word]) => ({ item, word }))]
  return (
    <VStack gap={2}>
      <Source kind={L.계산} tip={L.서류} rows={[[L.서류, docs.docs.at(-1)?.name ?? L.없음]]} />
      {data.length ? (
        <Table<U>
          data={data}
          idKey="item"
          density="balanced"
          columns={[
            { key: 'item', header: L.항목, width: proportional(1, { minWidth: 64 }), renderCell: (u) => <Text weight="semibold">{u.item}</Text> },
            { key: 'word', header: L.확인, width: proportional(1, { minWidth: 72 }), renderCell: (u) => <State word={u.word} /> },
          ]}
        />
      ) : (
        <Empty />
      )}
    </VStack>
  )
}

/** 결과 조치(내부 감시, 정할 수 있을 때): 인정(주 버튼, 맨 끝) · 불인정 · 보완. 누르면 확인 창에서 사유(분류 · 메모)를 받고, 모두 사유 필수다. 인정의 창은 제외될 선과 기간을 보인다.
 * 서버가 거절하면 `onBad`로 그 낱말 */
export function Verdicts({ onBad }: { onBad: (word: string | null) => void }) {
  const v = useVerdict().data
  const c = useClarify().data
  const docs = useDocs().data
  // 정할 수 있는 역할(내부 감시)에게만 조치가 있다
  if (!v?.can || !c) return null
  const go = (kind: string, reason: object | null) => {
    onBad(null)
    return api('/verdict', { id: v.id, kind, reason: reason ?? undefined }).catch((e: Error) => {
      onBad(e.message)
      store.set(changedAtom, (n) => n + 1)
    })
  }
  return (
    <HStack gap={2}>
      {byGrade(v.actions).map((a) => (
        <Act
          key={a.kind}
          kind={a.kind}
          classes={a.classes}
          must
          target={c.clarify.dealer.name}
          // 값 하나에 사실 하나(review.md 2-1): 제외하는 값은 항목을 이름표로 줄마다
          rows={a.kind !== L.인정 ? [[L.서류, docs?.docs.at(-1)?.name ?? L.없음], [L.접수, String(docs?.docs.length ?? 0)]] : [...(v.lines.length ? v.lines.map((l): [string, string] => [l.item, l.value]) : [[L.제외, L['제외 없음']] as [string, string]]), [L.기간, span(v.span?.[0], v.span?.[1]) ?? L.미상]]}
          send={(reason) => go(a.kind, reason)}
        />
      ))}
    </HStack>
  )
}

type Near = { id: string; name: string; match: string[]; related: boolean }
type Rel = { id: string; can: boolean; near: Near[] }

/** 접수할 파일. 조치 칸(Intake)의 파일 입력과 시연 서랍의 시연 서류(IntakeSamples)가 함께 채운다 */
const intakeFileAtom = atom<File | null>(null)

/** 대리점 상세의 "접수"(영업지원, D59): 대리점이 먼저 낸 소명. 대리점 화면에서 흐름을 앞으로 보내는 조치는 변경(13)이라 접수는 secondary. 지금 일치가 있는 상대 대리점과 실제로 일치하는 종류를 고르고 서류(파일)를 올린다.
 * 요청서·발송은 없다 — 접수(주 버튼)하면 곧 내부 감시의 소명 작업이 된다. 되돌리기 어려워 확인 창을 거치고, 누른 뒤 요청이 끝날 때까지 다시 눌리지 않는다 */
export function Intake() {
  const target = useAtomValue(targetAtom)
  const id = target?.kind === L.대리점 ? target.id : null
  const rel = useData<Rel>(id ? `/dealers/${encodeURIComponent(id)}/clarify` : null)
  const setTarget = useSetAtom(targetAtom)
  const setMenu = useSetAtom(menuAtom)
  const [other, setOther] = useState<Near | null>(null)
  const [kind, setKind] = useState<string | null>(null)
  const [file, setFile] = useAtom(intakeFileAtom)
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState<string | null>(null)
  const dealer = useDetail()
  useEffect(() => {
    setOther(null)
    setKind(null)
    setFile(null)
    setBad(null)
  }, [id, setFile])
  if (!id || rel?.id !== id) return null
  // 영업지원이 아니거나 일치하는 대리점이 없으면 접수가 없다(빈 자리는 13의 변경이 한 번만 보인다)
  if (!rel.can || !rel.near.length) return null
  const go = () => {
    if (!other || !kind || !file) return
    setBusy(true)
    setBad(null)
    return bin(`/dealers/${encodeURIComponent(id)}/clarify`, file, `?other=${encodeURIComponent(other.id)}&kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(file.name)}`)
      .then((r) => r.json())
      .then((r: { id: string }) => {
        setTarget({ kind: L.소명, id: r.id })
        setMenu(L.작업)
      })
      .catch((e: Error) => setBad(e.message))
      .finally(() => setBusy(false))
  }
  return (
    // 영역(Region) 한 장: 대리점 · 일치 · 서류를 고르고 접수(영역 조치). 화면의 주 버튼은 머리의 `변경` 하나라 이 영역의 접수는 보조(secondary)
    <Region
      title={L.접수}
      aside={bad ? <Badge variant={fail} label={bad} /> : undefined}
      actions={
        <Confirm
          label={L.접수}
          variant="secondary"
          title={`${L.접수} · ${dealer?.dealer.name ?? ''}`}
          rows={[
            [L.대리점, other?.name ?? ''],
            [L.일치, kind ?? ''],
            [L.서류, file?.name ?? ''],
          ]}
          isDisabled={busy || !other || !kind || !file}
          onConfirm={go}
        />
      }
    >
      <Selector
        label={L.대리점}
        isLabelHidden
        placeholder={L.대리점}
        hasClear
        width="100%"
        value={other?.id ?? null}
        options={rel.near.map((n) => ({ value: n.id, label: n.name }))}
        onChange={(k: string | null) => {
          const n = rel.near.find((x) => x.id === k) ?? null
          setOther(n)
          setKind(n && n.match.length === 1 ? (n.match[0] ?? null) : null)
        }}
      />
      {other && (
        <Selector label={L.일치} isLabelHidden hasClear placeholder={L.일치} width="100%" value={kind} options={other.match.map((m) => ({ value: m, label: m }))} onChange={(k: string | null) => setKind(k)} />
      )}
      <FileInput label={L.서류} isLabelHidden placeholder={L.서류} width="100%" accept="image/png,image/jpeg,application/pdf" value={file} onChange={(f) => setFile(f as File | null)} />
    </Region>
  )
}

/** 시연 서랍(slot 'demo', 대리점을 열었을 때): 시연 서류를 골라 접수할 파일로 둔다. 제품의 조작이 아니므로 대리점 화면에는 없다 */
export function IntakeSamples() {
  const target = useAtomValue(targetAtom)
  const id = target?.kind === L.대리점 ? target.id : null
  const rel = useData<Rel>(id ? `/dealers/${encodeURIComponent(id)}/clarify` : null)
  const samples = useData<{ id: string; name: string; dealer: string }[]>(rel?.can ? '/samples' : null)
  const [file, setFile] = useAtom(intakeFileAtom)
  if (!rel?.can || !rel.near.length || !samples?.length) return null
  const choose = (sid: string, name: string) =>
    bin(`/samples/${sid}`)
      .then((r) => r.blob())
      .then((b) => setFile(new File([b], name, { type: b.type })), () => {})
  return (
    // 시연 서랍의 다른 칸(날짜·초기화)과 같은 영역 제목. 단추는 서류 이름 · 그 서류를 낸 대리점
    <Region title={L.서류}>
      <VStack gap={2} hAlign="start">
        {samples.map((s) => (
          <ToggleButton key={s.id} label={`${s.name.replace(/\.\w+$/, '')} · ${s.dealer}`} size="sm" isPressed={file?.name === s.name} onPressedChange={() => choose(s.id, s.name)} />
        ))}
      </VStack>
    </Region>
  )
}

