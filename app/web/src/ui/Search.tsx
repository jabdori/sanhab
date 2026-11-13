// 목록의 검색칸: 글자를 치면 바로 걸러진다(이름 · 귀속월 · 대표자 …의 어느 칸에든 든 줄). PowerSearch(필드 고르기 → 값)는 목록 하나를 거르기에 단계가 많고 기본 문구가 문장이라 쓰지 않는다
import { TextInput } from '@astryxdesign/core/TextInput'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { L } from '../labels'

export function Search({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <TextInput type="search" label={L.검색} isLabelHidden placeholder={L.검색} startIcon={MagnifyingGlassIcon} value={value} onChange={(v) => onChange(v)} />
}

/** 검색어가 줄의 어느 칸에든 들어 있는가(대소문자 · 앞뒤 빈칸 무시) */
export const hit = (q: string, ...cells: (string | number | null | undefined)[]) => {
  const k = q.trim().toLowerCase()
  return !k || cells.some((c) => c != null && String(c).toLowerCase().includes(k))
}
