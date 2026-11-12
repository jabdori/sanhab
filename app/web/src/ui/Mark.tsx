import { Badge } from '@astryxdesign/core/Badge'
import { Icon } from '@astryxdesign/core/Icon'
import { Token } from '@astryxdesign/core/Token'
import { caution, mark } from './status'

/** 표시(정황 · 재검토 · 추인 …): 아이콘 + 글자. 주의가 필요한 정황만 warning Badge, 나머지는 색 없는 Token(tokens.md의 색 표) */
export const Mark = ({ children }: { children: string }) => {
  const m = mark(children)
  return m.caution ? <Badge variant={caution} icon={<Icon icon={m.icon} size="sm" />} label={children} /> : <Token size="sm" icon={<Icon icon={m.icon} size="sm" />} label={children} />
}
