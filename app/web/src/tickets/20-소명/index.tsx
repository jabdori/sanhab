// 20 소명: 서류가 접수된 소명을 내부 감시가 인정 · 불인정 · 보완으로 정한다(사유 필수). 인정하면 소명한 대리점의 선이 관련자 계산에서 빠진다.
// 가운데: 인정한 뒤의 "제외"(어느 선이 어느 기간 동안). 오른쪽: 조치 · 사유 · 보고의 "미확인"(코드가 찾은, 서류만으로 가를 수 없는 항목).
// 인정(주 버튼)은 되돌리기 어려워 확인 창을 거치고, 누른 뒤 새 값을 받을 때까지 다시 눌리지 않는다. 서버가 거절하면 그 낱말을 보인다.
import { Button } from '@astryxdesign/core/Button'
import { FileInput } from '@astryxdesign/core/FileInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Text } from '@astryxdesign/core/Text'
import { ToggleButton } from '@astryxdesign/core/ToggleButton'
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, menuAtom, roleAtom, store, targetAtom, useData } from '../../state'
import { Confirm } from '../../ui/Confirm'
import { Empty } from '../../ui/Empty'
import { grade } from '../../ui/grade'
import { Pill } from '../../ui/Pill'
import { Reason, blank, ready, sent as filled } from '../../ui/Reason'
import { Region } from '../../ui/Region'
import { Source } from '../../ui/Source'
import { Table } from '../../ui/Table'
import { useClarify } from '../18-발송/clarify'
import { bin, useDocs } from '../19-서류/docs'
import { reasonAtom, useVerdict } from './verdict'

/** 기간: 시작 ~ 끝. 둘 다 없으면 없음 */
const span = (since: string | null | undefined, until: string | null | undefined) => (since || until ? `${since ?? ''} ~ ${until ?? ''}` : null)

/** 가운데의 "제외": 인정한 뒤에 그 소명이 제외한 선(종류, 식별자, 효력 기간). 인정하지 않았으면 보이지 않는다 */
function Excluded() {
  const v = useVerdict()
  if (!v?.excluded.length) return null
  return (
    <Region title={L.제외} aside={<Source kind={L.계산} tip={L.기간} rows={[[L.기간, span(v.excluded[0]?.since, v.excluded[0]?.until) ?? L.미상]]} />}>
      <Table head={[L.종류, L.식별자, L.기간]} rows={v.excluded.map((e) => [e.item, e.value, span(e.since, e.until) ?? <Empty />])} />
    </Region>
  )
}

/** 오른쪽 보고의 "미확인": 가장 나중 서류에서 서류만으로 가를 수 없는 항목(누락, 호실까지 같아 추가 확인). 코드가 찾은 것이라 출처는 계산이다. 서류가 아직 없으면 보이지 않는다 */
function Unknown() {
  const v = useVerdict()
  const docs = useDocs()
  if (!v || !docs?.docs.length) return null
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Text weight="medium">{L.미확인}</Text>
        <Source kind={L.계산} tip={L.서류} rows={[[L.서류, docs.docs.at(-1)?.name ?? L.없음]]} />
      </div>
      <Table head={[L.항목, L.확인]} rows={v.unknown.map(([item, word]) => [<Text weight="medium">{item}</Text>, word])} />
    </div>
  )
}

/** 조치(내부 감시, 정할 수 있을 때): 인정(주 버튼) · 불인정 · 보완. 사유가 그 조치의 분류이고 다 채워졌을 때만 눌린다. 인정은 제외될 선과 기간을 보이는 확인 창을 거친다 */
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
    return api('/verdict', { id: v.id, kind, reason: filled(reason) ?? undefined }).then(
      () => setReason(blank),
      (e: Error) => {
        setBad(e.message)
        store.set(changedAtom, (n) => n + 1)
      },
    )
  }
  const off = (kind: string) => sentFor === v || !ready(kind, true, reason)
  return (
    <div className="flex flex-wrap items-center gap-2">
      {v.actions.map((a) =>
        a.kind === L.인정 ? (
          <Confirm
            key={a.kind}
            label={a.kind}
            variant={grade(a.kind)}
            title={`${a.kind} ${c.clarify.dealer.name}`}
            rows={[
              [L.제외, v.lines.length ? v.lines.map((l) => `${l.item} ${l.value}`).join(' · ') : L['제외 없음']],
              [L.기간, span(v.span?.[0], v.span?.[1]) ?? L.미상],
            ]}
            isDisabled={off(a.kind)}
            onConfirm={() => go(a.kind)}
          />
        ) : (
          <Button key={a.kind} label={a.kind} variant={grade(a.kind)} isDisabled={off(a.kind)} onClick={() => void go(a.kind)} />
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

type Near = { id: string; name: string; match: string[]; related: boolean }
type Rel = { id: string; can: boolean; near: Near[] }

/** 접수할 파일. 조치 칸(Intake)의 파일 입력과 시연 서랍의 시연 서류(IntakeSamples)가 함께 채운다 */
const intakeFileAtom = atom<File | null>(null)

/** 대리점 상세의 "접수"(영업지원, D59): 대리점이 먼저 낸 소명. 지금 일치가 있는 상대 대리점과 실제로 일치하는 종류를 고르고 서류(파일)를 올린다.
 * 요청서·발송은 없다 — 접수(주 버튼)하면 곧 내부 감시의 소명 작업이 된다. 되돌리기 어려워 확인 창을 거치고, 누른 뒤 요청이 끝날 때까지 다시 눌리지 않는다 */
function Intake() {
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
  useEffect(() => {
    setOther(null)
    setKind(null)
    setFile(null)
    setBad(null)
  }, [id, setFile])
  if (!id || rel?.id !== id) return null
  // 영업지원이 아니거나 일치하는 대리점이 없으면 조치가 없다
  if (!rel.can || !rel.near.length) return <Empty />
  const go = () => {
    if (!other || !kind || !file) return
    setBusy(true)
    setBad(null)
    return bin(`/dealers/${encodeURIComponent(id)}/clarify`, file, `?other=${encodeURIComponent(other.id)}&kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(file.name)}`)
      .then((r) => r.json())
      .then((r: { id: string }) => {
        setMenu(L.작업)
        setTarget({ kind: L.소명, id: r.id })
      })
      .catch((e: Error) => setBad(e.message))
      .finally(() => setBusy(false))
  }
  return (
    <div className="flex flex-col gap-3">
      <Text type="supporting">{L.접수}</Text>
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
      <div className="flex flex-wrap items-center gap-2">
        <Confirm
          label={L.접수}
          variant={grade(L.접수)}
          title={`${L.접수} ${kind ?? ''}`}
          rows={[
            [L.대리점, other?.name ?? ''],
            [L.일치, kind ?? ''],
            [L.서류, <span className="wrap-anywhere">{file?.name}</span>],
          ]}
          isDisabled={busy || !other || !kind || !file}
          onConfirm={go}
        />
        {bad && <Pill tone="bad">{bad}</Pill>}
      </div>
    </div>
  )
}

/** 시연 서랍(slot 'demo', 대리점을 열었을 때): 시연 서류를 골라 접수할 파일로 둔다. 제품의 조작이 아니므로 대리점 화면에는 없다 */
function IntakeSamples() {
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
      <div className="flex flex-col items-start gap-2">
        {samples.map((s) => (
          <ToggleButton key={s.id} label={`${s.name.replace(/\.\w+$/, '')} · ${s.dealer}`} size="sm" isPressed={file?.name === s.name} onPressedChange={() => choose(s.id, s.name)} />
        ))}
      </div>
    </Region>
  )
}

export default [
  { slot: 'fact', kind: L.소명, View: Excluded },
  { slot: 'report', kind: L.소명, View: Unknown },
  { slot: 'action', kind: L.소명, View: Action },
  { slot: 'reason', kind: L.소명, View: Box },
  { slot: 'action', kind: L.대리점, View: Intake },
  { slot: 'demo', kind: L.대리점, View: IntakeSamples },
] satisfies Piece[]
