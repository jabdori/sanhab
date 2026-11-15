// table-page 템플릿의 useFlushEdges: 표 양끝 칸의 안쪽 여백을 0으로 — 위의 제목 · 사실 묶음(여백 0)과 가장자리가 맞는다.
// 템플릿 원본이 칸의 inline style(htmlProps.style)로 하는 것을 그대로 옮겼다(JSX의 style= 속성이 아니다).
import type { CSSProperties } from 'react'
import type { TablePlugin } from '@astryxdesign/core/Table'

const edge = (i: number, n: number): CSSProperties | undefined => (i === 0 ? { paddingInlineStart: 0 } : i === n - 1 ? { paddingInlineEnd: 0 } : undefined)

/** 칸 안쪽 여백만 만지므로 줄의 꼴에 상관없다. 모듈 상수라 렌더마다 새로 만들지 않는다 */
const plugin: TablePlugin<any> = {  // eslint-disable-line @typescript-eslint/no-explicit-any
  transformHeaderCell: (props, _c, i, cols) => {
    const s = edge(i, cols.length)
    return s ? { ...props, htmlProps: { ...props.htmlProps, style: { ...props.htmlProps.style, ...s } } } : props
  },
  transformBodyCell: (props, _c, _r, i, cols) => {
    const s = edge(i, cols.length)
    return s ? { ...props, htmlProps: { ...props.htmlProps, style: { ...props.htmlProps.style, ...s } } } : props
  },
}

export const flushEdges = <T extends Record<string, unknown>>() => plugin as TablePlugin<T>
