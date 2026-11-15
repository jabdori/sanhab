// 19 서류: 소명 기록(pages/Clarify)의 본문 영역 — 원본(서류 그림), 판독(항목 · 판독 · 등록 · 비교), 접수(영업지원의 서류 올리기) — 과 레일의 "AI 정리", 대리점 기록의 "소명" 줄(OfDealer).
// 본문에는 AI의 글이 없다: 판독은 글자 인식이 읽은 그대로, 등록은 원본(호실은 시연), 비교는 코드다. 값의 줄과 원본의 위치(판독의 위치 상자)가 서로 강조된다.
// 판독이나 정리가 아직 없으면(멈춰 있으면) 원본만 보이고 값은 없음이다. 그동안 몇 초마다 다시 읽는다.
import { Badge } from '@astryxdesign/core/Badge'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Button } from '@astryxdesign/core/Button'
import { FileInput } from '@astryxdesign/core/FileInput'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { ToggleButton } from '@astryxdesign/core/ToggleButton'
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { State } from '../../ui/Mark'
import { L } from '../../labels'
import { menuAtom, targetAtom, useData } from '../../state'
import { Empty } from '../../ui/Empty'
import { Region } from '../../ui/Region'
import { Source } from '../../ui/Source'
import { Confirm } from '../../ui/Confirm'
import { fail, plain } from '../../ui/status'
import { bin, type Doc, pick, pickAtom, range, seeAtom, tickAtom, useDoc, useDocs } from './docs'

type Row = Doc['rows'][number] & Record<string, unknown>
type Tidy = { item: string; value?: string; words: number[] } & Record<string, unknown>

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
    // 상자를 겹치려면 그림 위에 같은 크기의 층이 필요해 relative 묶음이 하나 있다
    <VStack className="relative w-full max-w-md rounded-md border border-border">
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
    </VStack>
  )
}

/** 등록 값의 출처 표지(출처 열): 원본이면 그 행 번호만, 시연으로 넣은 등록 호실(D58)이면 합성 — 설명은 스펙의 D58에서 온다 */
const RegSource = ({ r }: { r: Doc['rows'][number] }) =>
  r.reg && (r.reg.source === L.시연 ? <Source kind={L.합성} of={L.호실} /> : <Source kind={r.reg.source} file={r.reg.file} row={r.reg.row} />)

/** 서류 선택(서류가 여럿일 때 번호 단추)과 이름 · 출처(판독의 모델 · 날짜) */
function Aside() {
  const all = useDocs()
  const d = useDoc()
  const setSee = useSetAtom(seeAtom)
  const target = useAtomValue(targetAtom)
  useEffect(() => {
    setSee(null)
  }, [target?.id, setSee])
  if (!all || !d) return null
  const at = all.docs.indexOf(d)
  return (
    <>
      <Text type="supporting" color="secondary">{d.name}</Text>
      {/* 시연 서랍에서 넣은 서류는 가상 입력(A05 §6) */}
      {/* 시연용으로 만든 서류(내용이 시연 서류와 같다)는 어느 길로 올렸든 합성 — 사람이 올린 실제 파일에는 표지가 없다 */}
      {d.sample && <Source kind={L.합성} tip={L.서류} rows={[[L.종류, L.서류], [L.대상, d.name], [L.이유, L.시연]]} />}
      {all.docs.length > 1 && all.docs.map((x, i) => <ToggleButton key={x.id} label={String(i + 1)} size="sm" isPressed={i === at} onPressedChange={() => setSee(i)} />)}
    </>
  )
}

/** 이미지 영역: 접수한 서류의 그림 */
export function OriginalDoc() {
  const all = useDocs()
  const d = useDoc()
  useWaiting(d)
  if (!all?.docs.length || !d) return null
  return (
    // 접수한 서류의 그림. 출처의 낱말 `원본`과 겹치지 않게 영역 이름은 `이미지`
    <Region title={L.이미지} aside={<Aside />}>
      <Original d={d} />
    </Region>
  )
}

/** 판독 영역: 항목마다 판독 · 등록 · 비교(누락 · 불일치가 위). 항목을 누르면 그 줄과 원본의 위치가 강조된다. 판독 전에는 값이 없다 */
export function Read() {
  const all = useDocs()
  const d = useDoc()
  const picked = useAtomValue(pickAtom)
  const rows = (d?.rows ?? []) as Row[]
  // 판독이 아직 없으면 영역을 두지 않는다(원본만 보이고, 기다리는 표시는 레일의 AI 정리에 있다)
  if (!all?.docs.length || !d || !rows.length) return null
  return (
    // 판독은 글자 인식(AI)이 읽은 값이다: AI 표지는 이 영역에
    <Region title={L.판독} aside={<Source kind={L.AI} tip={L.판독} rows={[[L.접수, [d.role, d.at].join(' · ')], [L.판독, d.read_model ?? L.없음]]} />}>
      <Table<Row>
          data={rows}
          idKey="item"
          density="balanced"
          columns={[
            {
              key: 'item',
              header: L.항목,
              width: proportional(2, { minWidth: 64 }),
              // 강조: 줄 전체에 상태가 없어 첫 칸에 theme.css의 `.mark`를 건다
              renderCell: (r) => (
                <HStack className={r.item === picked ? 'mark' : undefined}>
                  <Link weight="semibold" onClick={() => pick(r.item)}>
                    {r.item}
                  </Link>
                </HStack>
              ),
            },
            { key: 'read', header: L.판독, width: proportional(3, { minWidth: 96 }), renderCell: (r) => (r.read ? <Text hasTabularNumbers className="whitespace-nowrap">{range(r.read)}</Text> : <Text color="secondary">{L.없음}</Text>) },
            { key: 'reg', header: L.등록, width: proportional(3, { minWidth: 96 }), renderCell: (r) => (r.reg?.value ? <Text hasTabularNumbers className="whitespace-nowrap">{range(r.reg.value)}</Text> : <Text color="secondary">{L.없음}</Text>) },
            // 비교가 모두 기본 상태(일치)면 칸째 두지 않는다
            ...(rows.some((r) => !plain(r.result)) ? [{ key: 'result', header: L.비교, width: pixel(80), renderCell: (r: Row) => <State word={r.result} /> }] : []),
            { key: 'source', header: L.출처, align: 'end', width: pixel(88), renderCell: (r) => <RegSource r={r} /> },
          ]}
        />
    </Region>
  )
}

/** 레일 "AI 정리"의 몸통: 항목마다 값과 연결(↗ — 누르면 본문의 판독 줄과 원본의 위치가 강조된다). 정리가 없으면 대기 */
export function Tidy() {
  const d = useDoc()
  const all = useDocs()
  if (!d) return all ? <Empty /> : null
  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center">
        <Source kind={L.AI} rows={[[L.모델, d.tidy_model ?? L.없음]]} />
        {!d.tidy && <Spinner size="sm" aria-label={L.대기} />}
      </HStack>
      {d.tidy && (
        <Table<Tidy>
          data={d.tidy as Tidy[]}
          idKey="item"
          density="balanced"
          columns={[
            { key: 'item', header: L.항목, width: proportional(2, { minWidth: 56 }), renderCell: (t) => <Text weight="semibold">{t.item}</Text> },
            { key: 'value', header: L.값, width: proportional(3, { minWidth: 88 }), renderCell: (t) => (t.value ? <Text hasTabularNumbers>{range(t.value)}</Text> : <Text color="secondary">{L.없음}</Text>) },
            {
              key: 'go',
              header: '',
              align: 'end',
              width: pixel(48),
              renderCell: (t) =>
                t.words.length > 0 && (
                  <Link aria-label={t.item} onClick={() => pick(t.item)}>
                    ↗
                  </Link>
                ),
            },
          ]}
        />
      )}
    </VStack>
  )
}

/** 접수할 파일. 조치 칸(Upload)의 파일 입력과 시연 서랍의 시연 서류(Samples)가 함께 채운다 */
export const fileAtom = atom<File | null>(null)

/** 시연 서랍(slot 'demo'): 시연 서류를 골라 조치 칸의 접수할 파일로 둔다. 제품의 조작이 아니므로 소명 화면에는 없다. 그렇게 올린 서류는 출처가 모의다 */
export function Samples() {
  const d = useDocs()
  const samples = useData<{ id: string; name: string; dealer: string; source: string }[]>(d?.can ? '/samples' : null)
  const [file, setFile] = useAtom(fileAtom)
  if (!d?.can || !samples?.length) return null
  const choose = (id: string, name: string) =>
    bin(`/samples/${id}`)
      .then((r) => r.blob())
      .then((b) => {
        setFile(new File([b], name, { type: b.type }))
        // 고른 서류가 담긴 접수 영역을 보이게(서랍은 뒤를 막지 않는다)
        document.querySelector(`[data-region="${L.접수}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }, () => {})
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

/** 접수 영역(영업지원, 올릴 수 있을 때): 파일(이미지 · PDF)을 골라 접수(주 버튼, 영역 조치). 누른 뒤 요청이 끝날 때까지 다시 눌리지 않고, 서버가 거절하면 그 낱말을 보인다 */
export function Upload() {
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
    if (!file) return Promise.resolve()
    setBusy(true)
    setBad(null)
    return bin(`/clarifies/${encodeURIComponent(target.id)}/docs`, file, `?name=${encodeURIComponent(file.name)}`)
      .then(() => setFile(null), (e: Error) => setBad(e.message))
      .finally(() => setBusy(false))
  }
  return (
    <Region
      title={L.접수}
      aside={bad ? <Badge variant={fail} label={bad} /> : undefined}
      // 대리점 화면의 접수와 같은 꼴: 확인 창에서 무엇을 올리는지 보이고 실행(서류를 받으면 소명이 접수가 된다)
      actions={<Confirm label={L.접수} variant="primary" title={L.접수} rows={[[L.서류, file?.name ?? '']]} isDisabled={!file || busy} onConfirm={go} />}
    >
      <FileInput label={L.서류} isLabelHidden placeholder={L.서류} width="100%" accept={d.kinds.join(',')} value={file} onChange={(f) => setFile(f as File | null)} />
    </Region>
  )
}

/** 대리점 기록의 "소명": 그 대리점의 소명. 누르면 작업 메뉴에서 그 소명이 열린다(발송한 뒤 영업지원이 서류를 올리러 가는 길). 없으면 보이지 않는다 */
export function OfDealer() {
  const target = useAtomValue(targetAtom)
  const list = useData<{ id: string; name: string; state: string }[]>(target?.kind === L.대리점 ? `/dealers/${encodeURIComponent(target.id)}/clarifies` : null)
  const setTarget = useSetAtom(targetAtom)
  const setMenu = useSetAtom(menuAtom)
  if (!list?.length) return null
  type C = { id: string; name: string; state: string } & Record<string, unknown>
  return (
    <Region title={L.소명}>
      <Table<C>
        data={list as C[]}
        idKey="id"
        density="balanced"
        columns={[
          {
            key: 'name',
            header: L.소명,
            width: proportional(3, { minWidth: 120 }),
            renderCell: (c) => (
              <Link
                weight="semibold"
                onClick={() => {
                  setMenu(L.작업)
                  setTarget({ kind: L.소명, id: c.id })
                }}
              >
                {c.name}
              </Link>
            ),
          },
          { key: 'state', header: L.상태, align: 'end', width: proportional(1, { minWidth: 72 }), renderCell: (c) => <HStack hAlign="end"><State word={c.state} /></HStack> },
        ]}
      />
    </Region>
  )
}

