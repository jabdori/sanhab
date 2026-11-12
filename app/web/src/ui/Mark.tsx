import { Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { L } from '../labels'

/** 덧표시의 아이콘. 표시를 더하는 티켓이 여기에 한 줄을 더한다 */
const icons: Record<string, string> = { [L.정황]: '⚑', [L.재검토]: '↻', [L.정산]: '✓', [L.추인]: '◎', [L.거부]: '✕', [L.종결]: '■', [L.재심사]: '↺' }

/**
 * 덧표시: 아이콘 + 글자, 색 없음(심사의 표시 — 재검토, 정황 …). 상태 표지(색 있는 Badge)와 모양이 다르다.
 * `short`이면 아이콘만 보이고 낱말은 툴팁과 읽어 주는 이름으로 남는다(좁은 목록의 첫 열)
 */
export const Mark = ({ children, short }: { children: string; short?: boolean }) =>
  short && icons[children] ? (
    <Tooltip content={children} hasHoverIndication={false}>
      <span role="img" aria-label={children} tabIndex={0} className="cursor-default">
        {icons[children]}
      </span>
    </Tooltip>
  ) : (
    <Text type="supporting" color="primary" weight="medium">
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        {icons[children] && <span aria-hidden>{icons[children]}</span>}
        {children}
      </span>
    </Text>
  )
