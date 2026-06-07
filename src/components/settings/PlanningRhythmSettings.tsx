// src/components/settings/PlanningRhythmSettings.tsx
//
// W4 — the Settings home for the cadence config: which day the planning week
// starts on, and whether/when the weekly rhythm nudge appears. These feed both
// the Today rhythm nudge and the week-boundary math.

import { useCadenceConfig, type WeekStart } from '@/lib/cadence/config'

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
            <p className="text-sm text-neutral-500">Anchors the weekly horizon and date math</p>
          </div>
          <div className="inline-flex rounded-lg border border-neutral-200 overflow-hidden shrink-0">
            {([0, 1] as WeekStart[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setConfig({ weekStartsOn: d })}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  config.weekStartsOn === d
                    ? 'bg-primary-500 text-white'
                    : 'bg-white text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {DAY_NAMES[d]}
              </button>
            ))}
          </div>
        </div>

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
