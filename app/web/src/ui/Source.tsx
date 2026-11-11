import { Popover } from '@base-ui/react/popover'
import { type ReactNode, useState } from 'react'
import { L } from '../labels'
import { api } from '../state'
import { floating, label } from './styles'

/** 출처 표지: 테두리 글자. 누르면 어디서 왔는지 열린다(`side`로 열리는 쪽을 고른다. 없으면 아래). 원본이면 `file`·`row`만 주면 되고, 그 밖의 출처는 children에 내용을 넣는다 */
type Row = { sha: string; cells: [string, string][] }

/** 출처 표지: 테두리 글자. 누르면 어디서 왔는지 열린다(`side`로 열리는 쪽을 고른다. 없으면 아래). 원본이면 `file`·`row`만 주면 되고(행을 받은 뒤에 연다), 그 밖의 출처는 children에 내용을 넣는다 */
export function Source({ kind, file, row, side, children }: { kind: string; file?: string; row?: number; side?: 'right' | 'top'; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [o, setO] = useState<Row>()
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (!next || !file || !row || o) return setOpen(next)
        api<Row>(`/origin?file=${encodeURIComponent(file)}&row=${row}`).then((d) => {
          setO(d)
          setOpen(true)
        }, () => {})
      }}
    >
      <Popover.Trigger className={`shrink-0 cursor-pointer rounded-box border border-line px-1 whitespace-nowrap ${label}`}>{kind}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side={side} sideOffset={4} className="z-10">
          <Popover.Popup className={`${floating} flex w-list flex-col gap-2 p-3 text-table`}>
            {file && row && o ? <Origin file={file} row={row} o={o} /> : children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** 원본 파일의 한 행: 경로와 행 번호, 머리글과 값 그대로, 파일의 내용 해시 */
function Origin({ file, row, o }: { file: string; row: number; o: Row }) {
  return (
    <>
      <div className="flex justify-between gap-2">
        <span className="break-all">{file}</span>
        <span className="shrink-0 tabular-nums">
          {row}
          {L.행}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 border-t border-line pt-2">
        {o.cells.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className={label}>{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex gap-2 border-t border-line pt-2">
        <span className={`shrink-0 ${label}`}>{L.해시}</span>
        <span className="break-all text-label text-text-sub">{o.sha}</span>
      </div>
    </>
  )
}
