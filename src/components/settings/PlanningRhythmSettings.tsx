// src/components/settings/PlanningRhythmSettings.tsx
//
// W4 — the Settings home for the cadence config: which day the planning week
// starts on, and whether/when the weekly rhythm nudge appears. These feed both
// the Today rhythm nudge and the week-boundary math.

import { useState } from 'react'
import { useCadenceConfig, type WeekStart } from '@/lib/cadence/config'
import { useHouseholdWeekStart } from '@/hooks/useHouseholdWeekStart'
import { showToast } from '@/hooks/useToast'

/** Sunday, Monday, and Saturday — the week a Friday planning session plans. */
const WEEK_STARTS: WeekStart[] = [0, 1, 6]
const WEEK_RUNS: Record<WeekStart, string> = { 0: 'Sunday–Saturday', 1: 'Monday–Sunday', 6: 'Saturday–Friday' }

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 items-center rounded-full shrink-0 transition-colors duration-200 ${
        on ? 'bg-primary-500' : 'bg-neutral-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          on ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export function PlanningRhythmSettings() {
  const { config, setConfig } = useCadenceConfig()
  // In a household the week is one answer for everyone (week records match
  // by their start day); the owner changes it, and the change moves the
  // household's weeks with it. Alone, it stays this device's choice.
  const { household, setWeekStart } = useHouseholdWeekStart()
  const [asking, setAsking] = useState<WeekStart | null>(null)
  const [saving, setSaving] = useState(false)
  const current = household ? household.weekStartsOn : config.weekStartsOn
  const choose = (d: WeekStart) => {
    if (d === current) return
    if (!household) { setConfig({ weekStartsOn: d }); return }
    if (household.canEdit) setAsking(d)
  }
  const confirm = async () => {
    if (asking == null) return
    setSaving(true)
    const r = await setWeekStart(asking)
    setSaving(false)
    setAsking(null)
    if (r.ok) showToast(`Weeks now run ${WEEK_RUNS[asking]} for your household.${r.moved ? ' This week’s plan moved with it.' : ''}`, 'success', 6000)
    else showToast(`Couldn’t change the week: ${r.message}`, 'error', 7000)
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-neutral-700 mb-2">Planning Rhythm</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Set when your planning week begins and when Symphony gently reminds you to plan it.
      </p>

      <div className="space-y-3">
        {/* Week start */}
        <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-neutral-100">
          <div>
            <p className="text-neutral-700 font-medium">Week starts on</p>
            <p className="text-sm text-neutral-500">
              {household
                ? household.canEdit ? 'For everyone in your household — Saturday suits a Friday planning session' : 'Set for your household by its owner'
                : 'Anchors the weekly horizon and date math'}
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-neutral-200 overflow-hidden shrink-0" role="group" aria-label="Week starts on">
            {WEEK_STARTS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={current === d}
                disabled={!!household && !household.canEdit}
                onClick={() => choose(d)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-default ${
                  current === d
                    ? 'bg-primary-500 text-white'
                    : 'bg-white text-neutral-600 hover:bg-neutral-50 disabled:hover:bg-white'
                }`}
              >
                {DAY_NAMES[d]}
              </button>
            ))}
          </div>
        </div>
        {asking != null && (
          <div role="alertdialog" aria-label="Change when the week starts" className="p-4 bg-white rounded-lg border border-primary-200">
            <p className="text-neutral-700 font-medium">Weeks will run {WEEK_RUNS[asking]} for your household.</p>
            <p className="mt-1 text-sm text-neutral-500">
              Everything planned for a week moves to the new week it mostly falls in, and anything on a day stays on that day. You can change it back the same way.
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => void confirm()} disabled={saving}
                className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
                {saving ? 'Changing…' : `Start weeks on ${DAY_NAMES[asking]}`}
              </button>
              <button type="button" onClick={() => setAsking(null)} disabled={saving}
                className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50">Cancel</button>
            </div>
          </div>
        )}

        {/* Weekly nudge enable */}
        <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-neutral-100">
          <div>
            <p className="text-neutral-700 font-medium">Weekly planning reminder</p>
            <p className="text-sm text-neutral-500">A calm nudge on Today, once a week. Always optional.</p>
          </div>
          <Toggle
            on={config.weeklyNudgeEnabled}
            onClick={() => setConfig({ weeklyNudgeEnabled: !config.weeklyNudgeEnabled })}
          />
        </div>

        {/* Weekly nudge day — only when enabled */}
        {config.weeklyNudgeEnabled && (
          <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-neutral-100">
            <div>
              <p className="text-neutral-700 font-medium">Remind me on</p>
              <p className="text-sm text-neutral-500">Which day the weekly reminder appears</p>
            </div>
            <select
              value={config.weeklyNudgeDay}
              onChange={(e) => setConfig({ weeklyNudgeDay: Number(e.target.value) })}
              className="shrink-0 border border-neutral-200 rounded-lg px-3 py-1.5 text-sm text-neutral-700 bg-white"
            >
              {DAY_NAMES.map((name, i) => (
                <option key={name} value={i}>{name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </section>
  )
}
