import type { ReactNode } from 'react'

/** 제목 줄: 대상 이름 + 덧붙는 값(귀속월, 번호) + 상태 표지·덧표시(children). 한 줄 */
export const Title = ({ name, sub, children }: { name: string; sub?: string; children?: ReactNode }) => (
  <div className="flex items-center gap-2">
    <h1 className="text-title">{name}</h1>
    {sub && <span className="text-body text-text-sub tabular-nums">{sub}</span>}
    {children}
  </div>
)
