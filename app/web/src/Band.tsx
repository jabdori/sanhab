import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Select } from '@base-ui/react/select'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { L } from './labels'
import { api, roleAtom, rolesAtom, targetAtom, useData } from './state'
import { button, floating, label } from './ui/styles'

/** 띠: 앱 이름, 역할, 날짜, 초기화. 항상 보인다 */
export function Band() {
  const roles = useAtomValue(rolesAtom)
  const [role, setRole] = useAtom(roleAtom)
  const setTarget = useSetAtom(targetAtom)
  const state = useData<{ today: string }>('/state')
  return (
    <header className="flex h-band shrink-0 items-center gap-6 border-b border-line bg-surface px-4">
      <span className="text-title">{L.합산}</span>
      <div className="flex items-center gap-2">
        <span className={label}>{L.역할}</span>
        <Select.Root
          value={role}
          onValueChange={(v) => {
            setRole(v)
            setTarget(null)
          }}
        >
          <Select.Trigger aria-label={L.역할} className="flex cursor-pointer items-center gap-1 text-body text-action hover:text-action-hover">
            <Select.Value />
            <Select.Icon>▾</Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner sideOffset={4} alignItemWithTrigger={false} className="z-10 outline-none">
              <Select.Popup className={`${floating} py-1`}>
                {roles.map((r) => (
                  <Select.Item
                    key={r.role}
                    value={r.role}
                    className="flex h-head cursor-pointer items-center px-3 text-body outline-none data-highlighted:bg-surface data-selected:text-figure"
                  >
                    <Select.ItemText>{r.role}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </div>
      <div className="flex items-center gap-2">
        <span className={label}>{L.날짜}</span>
        <span className="text-body tabular-nums">{state?.today}</span>
      </div>
      <div className="flex-1" />
      <AlertDialog.Root>
        <AlertDialog.Trigger className={button}>{L.초기화}</AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Popup className={`${floating} fixed top-1/2 left-1/2 flex w-list -translate-x-1/2 -translate-y-1/2 flex-col gap-4 p-6`}>
            <AlertDialog.Title className="text-title">{L.초기화}</AlertDialog.Title>
            <div className="flex justify-end gap-2">
              <AlertDialog.Close className={button}>{L.취소}</AlertDialog.Close>
              <AlertDialog.Close className={button} onClick={() => api('/reset', {}).then(() => setTarget(null))}>
                {L.초기화}
              </AlertDialog.Close>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </header>
  )
}
