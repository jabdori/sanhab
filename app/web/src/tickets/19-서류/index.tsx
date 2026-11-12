// 19 서류: 소명 상세의 가운데(왼쪽 원본, 오른쪽 값 표 — 항목, 판독, 등록, 비교), 오른쪽 보고의 정리(AI), 영업지원의 조치(서류 접수).
// 가운데에는 AI의 글이 없다: 판독은 글자 인식이 읽은 그대로, 등록은 원본(호실은 시연), 비교는 코드다. 값의 줄과 원본의 위치(판독의 위치 상자)가 서로 강조된다.
// 판독이나 정리가 아직 없으면(멈춰 있으면) 원본만 보이고 값은 없음이다. 그동안 몇 초마다 다시 읽는다.
import { Button } from '@astryxdesign/core/Button'
import { FileInput } from '@astryxdesign/core/FileInput'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { ToggleButton } from '@astryxdesign/core/ToggleButton'
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { menuAtom, targetAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { Figures } from '../../ui/Figures'
import { grade } from '../../ui/grade'
import { Pill } from '../../ui/Pill'
import { Region } from '../../ui/Region'
import { Source } from '../../ui/Source'
import { Table } from '../../ui/Table'
import { pill } from '../18-발송'
import { bin, type Doc, pick, pickAtom, range, seeAtom, tickAtom, useDoc, useDocs } from './docs'

const tones = { [L.일치]: 'good', [L.불일치]: 'bad', [L.누락]: 'bad' } as const

/** 판독·정리를 기다리는 서류가 있으면 몇 초마다 다시 읽는다 */
function useWaiting(d: Doc | null) {
  const bump = useSetAtom(tickAtom)
  const waiting = !!d && (!d.words || !d.tidy)
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => bump((n) => n + 1), 3000)
    return () => clearInterval(t)
  }, [waiting, bump])
}

/** 원본: 이미지는 판독의 위치 상자를 겹쳐 그린다(값의 줄이 가리킨 낱말. 누르면 그 줄이 강조된다). PDF는 그대로 보인다 */
function Original({ d }: { d: Doc }) {
  const [url, setUrl] = useState<string>()
  const picked = useAtomValue(pickAtom)
  useEffect(() => {
    let live = true
    let made: string | undefined
    bin(`/docs/${encodeURIComponent(d.id)}/file`)
      .then((r) => r.blob())
      .then((b) => {
        made = URL.createObjectURL(b)
        if (live) setUrl(made)
      }, () => {})
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [d.id])
  if (!url) return <Empty />
  if (d.mime === 'application/pdf') return <object data={url} type={d.mime} aria-label={d.name} className="aspect-3/4 w-full rounded-md border border-border" />
  const boxes = d.rows.flatMap((r) => r.words.map((i) => ({ item: r.item, w: d.words?.[i] })).filter((b) => b.w))
  return (
    <div className="relative rounded-md border border-border">
      <img src={url} alt={d.name} className="block w-full rounded-md" />
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {boxes.map(({ item, w }, i) => (
          <rect
            key={i}
            x={w!.box[0]}
            y={w!.box[1]}
            width={w!.box[2] - w!.box[0]}
            height={w!.box[3] - w!.box[1]}
            vectorEffect="non-scaling-stroke"
            onClick={() => pick(item)}
            className={`cursor-pointer stroke-2 ${item === picked ? 'fill-yellow-subtle/60 stroke-primary' : 'fill-transparent stroke-border'}`}
          >
            <title>{item}</title>
          </rect>
        ))}
      </svg>
    </div>
  )
}

/** 등록 값의 출처 표지(출처 열): 원본이면 그 행 번호만, 시연으로 넣은 등록 호실(D58)이면 합성 — 설명은 스펙의 D58에서 온다 */
const RegSource = ({ r }: { r: Doc['rows'][number] }) =>
  r.reg && (r.reg.source === L.시연 ? <Source kind={L.합성} of={L.호실} /> : <Source kind={r.reg.source} file={r.reg.file} row={r.reg.row} />)

/** 가운데: 서류 이름과 출처(판독의 모델·날짜), 서류가 여럿이면 번호, 왼쪽 원본 / 오른쪽 값 표(누락·불일치가 위)와 누락·불일치의 수 */
function Center() {
  const all = useDocs()
  const d = useDoc()
  const setSee = useSetAtom(seeAtom)
  const picked = useAtomValue(pickAtom)
  const target = useAtomValue(targetAtom)
  useEffect(() => setSee(null), [target?.id, setSee])
  useWaiting(d)
  if (!all?.docs.length || !d) return null
  const at = all.docs.indexOf(d)
  return (
    <Region
      title={L.서류}
      aside={
        <>
          <Text className="wrap-anywhere">{d.name}</Text>
          {/* 판독은 글자 인식(AI)이 읽은 값이다 */}
          <Source kind={L.AI} tip={L.판독} rows={[[L.접수, [d.role, d.at].join(' · ')], [L.판독, d.read_model ?? L.없음]]} />
          {all.docs.length > 1 &&
            all.docs.map((x, i) => <ToggleButton key={x.id} label={String(i + 1)} size="sm" isPressed={i === at} onPressedChange={() => setSee(i)} />)}
        </>
      }
    >
      <div className="grid grid-cols-3 items-start gap-4">
        <div className="min-w-0">
          <Original d={d} />
        </div>
        {/* 판독 전에는 값이 없다: 표도 숫자 줄도 그리지 않는다 */}
        {d.rows.length > 0 && (
          <div className="col-span-2 flex min-w-0 flex-col gap-3">
            <Table
              head={[L.항목, L.판독, L.등록, L.비교, L.출처]}
              mark={picked ? d.rows.findIndex((r) => r.item === picked) : undefined}
              rows={d.rows.map((r) => [
                <Link color="primary" weight="medium" onClick={() => pick(r.item)}>
                  {r.item}
                </Link>,
                r.read ? range(r.read) : <Empty />,
                r.reg?.value ? range(r.reg.value) : <Empty />,
                r.result ? <Pill tone={tones[r.result as keyof typeof tones] ?? 'wait'}>{r.result}</Pill> : <Empty />,
                <RegSource r={r} />,
              ])}
            />
            <Figures
                items={[
                  [L.누락, d.counts[L.누락] ?? 0],
                  [L.불일치, d.counts[L.불일치] ?? 0],
                ]}
              >
                <Source kind={L.계산} tip={`${L.누락} · ${L.불일치}`} rows={[[L.누락, d.counts[L.누락] ?? 0], [L.불일치, d.counts[L.불일치] ?? 0]]} />
              </Figures>
          </div>
        )}
      </div>
    </Region>
  )
}

/** 오른쪽 보고의 정리(AI가 다듬은 값): 항목마다 값과 연결(↗ — 누르면 가운데의 판독 줄과 원본의 위치가 강조된다). 정리가 없으면 대기 */
function Tidy() {
  const d = useDoc()
  const all = useDocs()
  // 소명의 보고 칸에는 이 조각뿐이라 서류가 없으면 없음을 적는다
  if (!d) return all ? <Empty /> : null
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Text weight="medium">{L.정리}</Text>
        <Source kind={L.AI} rows={[[L.모델, d.tidy_model ?? L.없음]]} />
        {!d.tidy && <Pill tone="wait">{L.대기}</Pill>}
      </div>
      {d.tidy ? (
        <Table
          head={[L.항목, L.값, '']}
          rows={d.tidy.map((t) => [
            <Text weight="medium">{t.item}</Text>,
            t.value ? range(t.value) : <Empty />,
            t.words.length > 0 && (
              <Link aria-label={t.item} onClick={() => pick(t.item)}>
                ↗
              </Link>
            ),
          ])}
        />
      ) : (
        <Empty />
      )}
    </div>
  )
}

/** 접수할 파일. 조치 칸(Upload)의 파일 입력과 시연 서랍의 시연 서류(Samples)가 함께 채운다 */
const fileAtom = atom<File | null>(null)

/** 시연 서랍(slot 'demo'): 시연 서류를 골라 조치 칸의 접수할 파일로 둔다. 제품의 조작이 아니므로 소명 화면에는 없다. 그렇게 올린 서류는 출처가 모의다 */
function Samples() {
  const d = useDocs()
  const samples = useData<{ id: string; name: string; dealer: string; source: string }[]>(d?.can ? '/samples' : null)
  const [file, setFile] = useAtom(fileAtom)
  if (!d?.can || !samples?.length) return null
  const choose = (id: string, name: string) =>
    bin(`/samples/${id}`)
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

/** 조치(영업지원, 올릴 수 있을 때): 파일(이미지·PDF)을 골라 접수(주 버튼). 누른 뒤 요청이 끝날 때까지 다시 눌리지 않고, 서버가 거절하면 그 낱말을 보인다 */
function Upload() {
  const d = useDocs()
  const target = useAtomValue(targetAtom)
  const [file, setFile] = useAtom(fileAtom)
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState<string | null>(null)
  useEffect(() => {
    setFile(null)
    setBad(null)
  }, [target?.id, setFile])
  if (!d?.can || !target) return null
  const go = () => {
    if (!file) return
    setBusy(true)
    setBad(null)
    bin(`/clarifies/${encodeURIComponent(target.id)}/docs`, file, `?name=${encodeURIComponent(file.name)}`)
      .then(() => setFile(null), (e: Error) => setBad(e.message))
      .finally(() => setBusy(false))
  }
  return (
    <div className="flex flex-col gap-3">
      <FileInput label={L.서류} isLabelHidden placeholder={L.서류} width="100%" accept={d.kinds.join(',')} value={file} onChange={(f) => setFile(f as File | null)} />
      <div className="flex flex-wrap items-center gap-2">
        <Button label={L.접수} variant={grade(L.접수)} isDisabled={!file || busy} onClick={go} />
        {bad && <Pill tone="bad">{bad}</Pill>}
      </div>
    </div>
  )
}

/** 대리점 상세의 "소명": 그 대리점의 소명. 누르면 작업 메뉴에서 그 소명이 열린다(발송한 뒤 영업지원이 서류를 올리러 가는 길). 없으면 보이지 않는다 */
function OfDealer() {
  const target = useAtomValue(targetAtom)
  const list = useData<{ id: string; name: string; state: string }[]>(target?.kind === L.대리점 ? `/dealers/${encodeURIComponent(target.id)}/clarifies` : null)
  const setTarget = useSetAtom(targetAtom)
  const setMenu = useSetAtom(menuAtom)
  if (!list?.length) return null
  return (
    <Region title={L.소명}>
      <Table
        head={[L.소명, L.상태]}
        rows={list.map((c) => [
          <Link color="primary" weight="medium"
            onClick={() => {
              setMenu(L.작업)
              setTarget({ kind: L.소명, id: c.id })
            }}
          >
            {c.name}
          </Link>,
          pill(c.state),
        ])}
      />
    </Region>
  )
}

export default [
  { slot: 'fact', kind: L.소명, View: Center },
  { slot: 'report', kind: L.소명, View: Tidy },
  { slot: 'action', kind: L.소명, View: Upload },
  { slot: 'demo', kind: L.소명, View: Samples },
  { slot: 'fact', kind: L.대리점, order: 450, View: OfDealer },
] satisfies Piece[]
