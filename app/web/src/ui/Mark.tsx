import { Icon } from '@astryxdesign/core/Icon'
import { Token } from '@astryxdesign/core/Token'
import { mark } from './status'

/** 덧표시(심사의 표시 — 정황, 재검토 …): astryx Token에 그 표시의 색과 아이콘. 색 있는 상태 Badge와 모양(테두리 칩)으로 갈린다 */
export const Mark = ({ children }: { children: string }) => {
  const m = mark(children)
  return <Token size="sm" color={m.color} icon={<Icon icon={m.icon} size="sm" />} label={children} />
}
