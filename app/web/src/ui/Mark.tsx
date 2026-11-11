import { L } from '../labels'

/** 덧표시의 아이콘. 표시를 더하는 티켓이 여기에 한 줄을 더한다 */
const icons: Record<string, string> = { [L.정황]: '⚑', [L.재검토]: '↻' }

/** 덧표시: 아이콘 + 글자, 색 없음(심사의 표시 — 재검토, 정황 …) */
export const Mark = ({ children }: { children: string }) => (
  <span className="inline-flex items-center gap-1 text-label text-text">
    {icons[children] && <span aria-hidden>{icons[children]}</span>}
    {children}
  </span>
)
