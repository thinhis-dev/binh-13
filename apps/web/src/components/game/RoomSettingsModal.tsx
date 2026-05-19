import type { RoomSettings } from '@binh-13/shared'
import { EVENTS } from '@binh-13/shared'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { socket } from '@/lib/socket'

interface Props {
  settings: RoomSettings
  code: string
  playerId: number
}

const TIMER_OPTIONS = [
  { label: '30 seconds', value: 30 },
  { label: '60 seconds', value: 60 },
  { label: '90 seconds', value: 90 },
  { label: '2 minutes', value: 120 },
  { label: '5 minutes', value: 300 },
  { label: 'Unlimited', value: 0 },
]

function emitSettingsUpdate(
  code: string,
  playerId: number,
  partial: Partial<RoomSettings>,
) {
  socket.emit(EVENTS.ROOM_SETTINGS_UPDATE, { playerId, code, settings: partial })
}

interface SettingRowProps {
  id: string
  label: string
  description?: string
  control: React.ReactNode
}

function SettingRow({ id, label, description, control }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {control}
    </div>
  )
}

export function RoomSettingsModal({ settings, code, playerId }: Props) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" aria-label="Settings">
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Game Settings</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5 py-2">
          <SettingRow
            id="timer"
            label="Timer"
            description="Time to arrange cards"
            control={(
              <select
                id="timer"
                aria-label="Timer"
                value={settings.timerSeconds}
                onChange={e =>
                  emitSettingsUpdate(code, playerId, {
                    timerSeconds: Number(e.target.value),
                  })}
                className="h-9 appearance-none rounded-md border border-input bg-background px-3 py-1 pr-8 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                {TIMER_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          />

          <SettingRow
            id="autoStart"
            label="Auto-start"
            description="Deal cards when 2nd player joins"
            control={(
              <Switch
                id="autoStart"
                aria-label="Auto-start"
                checked={settings.autoStart}
                onCheckedChange={checked =>
                  emitSettingsUpdate(code, playerId, { autoStart: checked })}
              />
            )}
          />

          <SettingRow
            id="allowFoul"
            label="Allow foul"
            description="Accept foul arrangements"
            control={(
              <Switch
                id="allowFoul"
                aria-label="Allow foul"
                checked={settings.allowFoul}
                onCheckedChange={checked =>
                  emitSettingsUpdate(code, playerId, { allowFoul: checked })}
              />
            )}
          />

          <SettingRow
            id="showHandStrength"
            label="Show hand strength"
            description="Show evaluation while arranging"
            control={(
              <Switch
                id="showHandStrength"
                aria-label="Show hand strength"
                checked={settings.showHandStrength}
                onCheckedChange={checked =>
                  emitSettingsUpdate(code, playerId, {
                    showHandStrength: checked,
                  })}
              />
            )}
          />

          <SettingRow
            id="revealOnSubmit"
            label="Reveal on submit"
            description="Show arrangement before both submit"
            control={(
              <Switch
                id="revealOnSubmit"
                aria-label="Reveal on submit"
                checked={settings.revealOnSubmit}
                onCheckedChange={checked =>
                  emitSettingsUpdate(code, playerId, {
                    revealOnSubmit: checked,
                  })}
              />
            )}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
