import { Select } from '@base-ui/react/select'
import { L } from '../labels'
import { button, floating, label } from './styles'

/** 쓰고 있는 사유. `of`는 그 분류가 속한 조치 */
export type Draft = { of: string; class: string; memo: string }
export const blank: Draft = { of: '', class: '', memo: '' }

/** 보낼 수 있는 사유인지: 분류를 골랐고, 기타이면 메모까지 썼다 */
export const filled = (d: Draft) => !!d.class && (d.class !== L.기타 || !!d.memo.trim())
/** 그 조치를 누를 수 있는지: 사유를 쓰지 않았으면 필수가 아닐 때만, 썼으면 그 조치의 분류이고 다 채웠을 때만 */
export const ready = (of: string, must: boolean, d: Draft) => (d.class ? d.of === of && filled(d) : !must)
/** 결정에 실어 보낼 모양 */
export const sent = (d: Draft) => (filled(d) ? { class: d.class, ...(d.memo.trim() && { memo: d.memo.trim() }) } : null)

const item = 'flex h-head cursor-pointer items-center px-3 text-body outline-none data-highlighted:bg-surface data-selected:text-figure'

/** 사유: 분류(고르기)와 메모. `groups`는 조치마다의 분류 목록이고, 조치가 하나면 조치 이름을 적지 않는다 */
export function Reason({ groups, value, onChange }: { groups: { of: string; classes: string[] }[]; value: Draft; onChange: (d: Draft) => void }) {
  const many = groups.length > 1
  return (
    <div className="flex flex-col gap-2">
      <Select.Root
        value={value.class ? `${value.of}/${value.class}` : null}
        onValueChange={(k: string | null) => {
          const [of = '', c = ''] = k?.split('/') ?? []
          onChange({ ...value, of, class: c })
        }}
      >
        <Select.Trigger aria-label={L.분류} className={`${button} flex items-center justify-between gap-2`}>
          <Select.Value>{(k: string | null) => (k ? (many ? k.replace('/', ' · ') : value.class) : <span className="text-text-mute">{L.분류}</span>)}</Select.Value>
          <Select.Icon aria-hidden>▾</Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner sideOffset={4} align="start" alignItemWithTrigger={false} className="z-10 outline-none">
            <Select.Popup className={`${floating} max-h-(--available-height) min-w-(--anchor-width) overflow-y-auto py-1`}>
              <Select.Item value={null} className={`${item} text-text-mute`}>
                <Select.ItemText>{L.없음}</Select.ItemText>
              </Select.Item>
              {groups.map((g) => (
                <Select.Group key={g.of}>
                  {many && <Select.GroupLabel className={`flex h-head items-center px-3 ${label}`}>{g.of}</Select.GroupLabel>}
                  {g.classes.map((c) => (
                    <Select.Item key={c} value={`${g.of}/${c}`} className={item}>
                      <Select.ItemText>{c}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Group>
              ))}
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
      <input
        aria-label={L.메모}
        placeholder={L.메모}
        className="h-head rounded-box border border-line bg-bg px-3 text-body outline-none placeholder:text-text-mute focus:border-action"
        value={value.memo}
        onChange={(e) => onChange({ ...value, memo: e.target.value })}
      />
    </div>
  )
}
