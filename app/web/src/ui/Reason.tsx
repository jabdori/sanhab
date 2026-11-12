import { Selector, type SelectorOptionType } from '@astryxdesign/core/Selector'
import { TextInput } from '@astryxdesign/core/TextInput'
import { L } from '../labels'

/** 쓰고 있는 사유. `of`는 그 분류가 속한 조치 */
export type Draft = { of: string; class: string; memo: string }
export const blank: Draft = { of: '', class: '', memo: '' }

/** 보낼 수 있는 사유인지: 분류를 골랐고, 기타이면 메모까지 썼다 */
export const filled = (d: Draft) => !!d.class && (d.class !== L.기타 || !!d.memo.trim())
/** 그 조치를 누를 수 있는지: 사유를 쓰지 않았으면 필수가 아닐 때만, 썼으면 그 조치의 분류이고 다 채웠을 때만 */
export const ready = (of: string, must: boolean, d: Draft) => (d.class ? d.of === of && filled(d) : !must)
/** 결정에 실어 보낼 모양 */
export const sent = (d: Draft) => (filled(d) ? { class: d.class, ...(d.memo.trim() && { memo: d.memo.trim() }) } : null)

/** 사유: 분류(astryx Selector)와 메모(TextInput). `groups`는 조치마다의 분류 목록이고, 조치가 하나면 조치 이름(묶음의 제목)을 적지 않는다. 지우기(×)가 `없음`이다 */
export function Reason({ groups, value, onChange }: { groups: { of: string; classes: string[] }[]; value: Draft; onChange: (d: Draft) => void }) {
  const many = groups.length > 1
  // 목록에서는 조치가 묶음의 제목이라 분류만, 고른 값은 `보류 · 소명`처럼 조치까지
  const option = (g: { of: string }, c: string) => ({ value: `${g.of}/${c}`, label: c })
  return (
    <div className="flex flex-col gap-2">
      <Selector
        label={L.분류}
        isLabelHidden
        placeholder={L.분류}
        width="100%"
        hasClear
        value={value.class ? `${value.of}/${value.class}` : null}
        options={(many ? groups.map((g) => ({ type: 'section', title: g.of, options: g.classes.map((c) => option(g, c)) })) : (groups[0]?.classes ?? []).map((c) => option(groups[0], c))) as SelectorOptionType[]}
        renderValue={(o) => (many ? o.value.replace('/', ' · ') : o.label)}
        onChange={(k: string | null) => {
          const [of = '', c = ''] = k?.split('/') ?? []
          onChange({ ...value, of, class: c })
        }}
      />
      <TextInput label={L.메모} isLabelHidden placeholder={L.메모} width="100%" value={value.memo} onChange={(memo) => onChange({ ...value, memo })} />
    </div>
  )
}
