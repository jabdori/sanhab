// 19 서류: 소명 상세의 가운데(왼쪽 원본, 오른쪽 값 표 — 항목, 판독, 등록, 비교), 오른쪽 보고의 정리(AI), 영업지원의 조치(서류 접수).
// 가운데에는 AI의 글이 없다: 판독은 글자 인식이 읽은 그대로, 등록은 원본(호실은 시연), 비교는 코드다. 값의 줄과 원본의 위치(판독의 위치 상자)가 서로 강조된다.
// 판독이나 정리가 아직 없으면(멈춰 있으면) 원본만 보이고 값은 없음이다. 그동안 몇 초마다 다시 읽는다.
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { menuAtom, targetAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { Figures } from '../../ui/Figures'
import { Pill } from '../../ui/Pill'
import { Source } from '../../ui/Source'
import { button, label } from '../../ui/styles'
import { Table } from '../../ui/Table'
import { pill } from '../18-발송'
import { bin, type Doc, pick, pickAtom, seeAtom, tickAtom, useDoc, useDocs } from './docs'

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
  if (d.mime === 'application/pdf') return <object data={url} type={d.mime} aria-label={d.name} className="aspect-3/4 w-full rounded-box border border-line" />
  const boxes = d.rows.flatMap((r) => r.words.map((i) => ({ item: r.item, w: d.words?.[i] })).filter((b) => b.w))
  return (
    <div className="relative rounded-box border border-line">
      <img src={url} alt={d.name} className="block w-full rounded-box" />
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
            className={`cursor-pointer stroke-2 ${item === picked ? 'fill-mark/60 stroke-action' : 'fill-transparent stroke-line'}`}
          >
            <title>{item}</title>
          </rect>
        ))}
      </svg>
    </div>
  )
}

/** 등록 값과 출처 표지(원본이면 그 행, 시연이면 이름표와 값) */
const Registered = ({ r }: { r: Doc['rows'][number] }) =>
  r.reg ? (
    <span className="flex items-baseline gap-2">
      {r.reg.value}
      {/* 시연으로 넣은 등록 호실(D58)은 합성: 설명은 스펙의 D58에서 온다 */}
      <Source kind={r.reg.source === L.시연 ? L.합성 : r.reg.source} of={r.reg.source === L.시연 ? L.호실 : undefined} file={r.reg.file} row={r.reg.row}>
        <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
          <dt className={label}>{r.item}</dt>
          <dd>{r.reg.value}</dd>
          <dt className={label}>{L.출처}</dt>
          <dd>{r.reg.source}</dd>
          {r.reg.source === L.시연 && (
            <>
              <dt className={label}>{L.원본}</dt>
              <dd>{L.미상}</dd>
            </>
          )}
        </dl>
      </Source>
    </span>
  ) : (
    <Empty />
  )

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
    <section className="mb-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={label}>{L.서류}</h2>
        <span className="text-base wrap-anywhere">{d.name}</span>
        <Source kind={d.source}>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1 tabular-nums">
            <dt className={label}>{L.접수}</dt>
            <dd>{[d.role, d.at].join(' · ')}</dd>
            <dt className={label}>{L.판독}</dt>
            <dd className="wrap-anywhere">{d.read_model ?? L.없음}</dd>
          </dl>
        </Source>
        {all.docs.length > 1 &&
          all.docs.map((x, i) => (
            <button key={x.id} aria-pressed={i === at} onClick={() => setSee(i)} className={`${button} aria-pressed:bg-line`}>
              {i + 1}
            </button>
          ))}
      </div>
      <div className="grid grid-cols-3 items-start gap-4">
        <div className="min-w-0">
          <Original d={d} />
        </div>
        <div className="col-span-2 flex min-w-0 flex-col gap-2">
          <Table
            head={[L.항목, L.판독, L.등록, L.비교]}
            mark={picked ? d.rows.findIndex((r) => r.item === picked) : undefined}
            rows={d.rows.map((r) => [
              <button className="cursor-pointer text-left text-action hover:text-action-hover" onClick={() => pick(r.item)}>
                {r.item}
              </button>,
              r.read ?? <Empty />,
              <Registered r={r} />,
              r.result ? <Pill tone={tones[r.result as keyof typeof tones] ?? 'wait'}>{r.result}</Pill> : <Empty />,
            ])}
          />
          {d.rows.length > 0 && (
            <Figures
              items={[
                [L.누락, d.counts[L.누락] ?? 0],
                [L.불일치, d.counts[L.불일치] ?? 0],
              ]}
            >
              <Source kind={L.계산}>
                <dl className="grid grid-cols-2 gap-x-2 gap-y-1 tabular-nums">
                  <dt className={label}>{L.누락}</dt>
                  <dd>{d.counts[L.누락] ?? 0}</dd>
                  <dt className={label}>{L.불일치}</dt>
                  <dd>{d.counts[L.불일치] ?? 0}</dd>
                </dl>
              </Source>
            </Figures>
          )}
        </div>
      </div>
    </section>
  )
}

/** 오른쪽 보고의 정리(AI가 다듬은 값): 항목마다 값과 연결(↗ — 누르면 가운데의 판독 줄과 원본의 위치가 강조된다). 정리가 없으면 대기 */
function Tidy() {
  const d = useDoc()
  const all = useDocs()
  // 소명의 보고 칸에는 이 조각뿐이라 서류가 없으면 없음을 적는다
  if (!d) return all ? <Empty /> : null
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <h3 className={label}>{L.정리}</h3>
        <Source kind={L.AI}>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
            <dt className={label}>{L.모델}</dt>
            <dd className="tabular-nums wrap-anywhere">{d.tidy_model ?? L.없음}</dd>
          </dl>
        </Source>
        {!d.tidy && <Pill tone="wait">{L.대기}</Pill>}
      </div>
      {d.tidy ? (
        <dl className="flex flex-col gap-1">
          {d.tidy.map((t) => (
            <div key={t.item} className="flex items-baseline gap-2">
              <dt className={`shrink-0 ${label}`}>{t.item}</dt>
              <dd className="text-base wrap-anywhere">{t.value ?? <Empty />}</dd>
              <dd className="shrink-0">
                {t.words.length > 0 && (
                  <button aria-label={t.item} onClick={() => pick(t.item)} className="cursor-pointer text-action hover:text-action-hover">
                    ↗
                  </button>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <Empty />
      )}
    </section>
  )
}

/** 조치(영업지원, 올릴 수 있을 때): 파일(이미지·PDF)이나 시연 서류를 골라 접수. 누른 뒤 요청이 끝날 때까지 다시 눌리지 않고, 서버가 거절하면 그 낱말을 보인다 */
/** 접수할 파일. 조치 칸(Upload)의 파일 고르기와 시연 서랍의 시연 서류(Samples)가 함께 채운다 */
const fileAtom = atom<File | null>(null)

/** 시연 서랍(slot 'demo'): 시연 서류를 골라 조치 칸의 접수할 파일로 둔다. 제품의 조작이 아니므로 소명 화면에는 없다 */
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
    <section className="flex flex-col gap-2">
      <span className={label}>{L.서류}</span>
      <div className="flex flex-wrap items-center gap-2">
        {samples.map((s) => (
          <button key={s.id} aria-label={s.name} onClick={() => choose(s.id, s.name)} aria-pressed={file?.name === s.name} className={`${button} aria-pressed:bg-line`}>
            {s.id} {s.dealer}
          </button>
        ))}
      </div>
    </section>
  )
}

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
    <div className="mt-4 flex flex-col gap-2">
      <label className={`${button} self-start content-center`}>
        {L.서류}
        <input type="file" accept={d.kinds.join(',')} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="sr-only" />
      </label>
      {file && <span className="text-base wrap-anywhere">{file.name}</span>}
      <div className="flex flex-wrap items-center gap-2">
        <button className={button} disabled={!file || busy} onClick={go}>
          {L.접수}
        </button>
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
    <section className="mb-4 flex flex-col gap-2">
      <h2 className={label}>{L.소명}</h2>
      <Table
        head={[L.소명, L.상태]}
        rows={list.map((c) => [
          <button
            className="cursor-pointer text-left text-action hover:text-action-hover"
            onClick={() => {
              setMenu(L.작업)
              setTarget({ kind: L.소명, id: c.id })
            }}
          >
            {c.name}
          </button>,
          pill(c.state),
        ])}
      />
    </section>
  )
}

export default [
  { slot: 'fact', kind: L.소명, View: Center },
  { slot: 'report', kind: L.소명, View: Tidy },
  { slot: 'action', kind: L.소명, View: Upload },
  { slot: 'demo', kind: L.소명, View: Samples },
  { slot: 'fact', kind: L.대리점, order: 450, View: OfDealer },
] satisfies Piece[]
