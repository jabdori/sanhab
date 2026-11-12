import { Text } from '@astryxdesign/core/Text'
import { L } from '../labels'

/** 덧표시의 아이콘. 표시를 더하는 티켓이 여기에 한 줄을 더한다 */
const icons: Record<string, string> = { [L.정황]: '⚑', [L.재검토]: '↻', [L.정산]: '✓', [L.추인]: '◎', [L.거부]: '✕', [L.종결]: '■', [L.재심사]: '↺' }

/** 덧표시: 아이콘 + 글자, 색 없음(심사의 표시 — 재검토, 정황 …). 상태 표지(색 있는 Badge)와 모양이 다르다 */
export const Mark = ({ children }: { children: string }) => (
  <Text type="supporting" color="primary" weight="medium">
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {icons[children] && <span aria-hidden>{icons[children]}</span>}
      {children}
    </span>
  </Text>
)
