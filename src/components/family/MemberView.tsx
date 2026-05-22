import { ArrowLeft, Settings as SettingsIcon } from 'lucide-react'
import type { FamilyMember, FamilyMemberColor } from '@/types/family'
import { FAMILY_COLORS } from '@/types/family'
import type { Task } from '@/types/task'
import { selectMemberTasks } from '@/lib/memberTasks'

interface MemberViewProps {
  member: FamilyMember
  tasks: Task[]
  onBack: () => void
  onSelectTask: (taskId: string) => void
  onEditInSettings: () => void
}

export function MemberView({ member, tasks, onBack, onSelectTask, onEditInSettings }: MemberViewProps) {
  const { open, upcoming } = selectMemberTasks(tasks, member.id)
  const colors = FAMILY_COLORS[member.color as FamilyMemberColor] ?? FAMILY_COLORS.blue

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-medium ${colors.bg} ${colors.text}`}>
          {member.initials}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-display text-neutral-800">{member.name}</h1>
          {member.role_label && <p className="text-sm text-neutral-500 capitalize">{member.role_label}</p>}
        </div>
      </div>

      <section className="mb-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-2">Open tasks</h2>
        {open.length === 0 ? (
          <p className="text-sm text-neutral-400">No open tasks.</p>
        ) : (
          <ul className="space-y-1">
            {open.map((task) => (
              <li key={task.id}>
                <button
                  onClick={() => onSelectTask(task.id)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-50 text-sm text-neutral-800"
                >
                  {task.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-2">Upcoming</h2>
          <ul className="space-y-1">
            {upcoming.map((task) => (
              <li key={task.id}>
                <button
                  onClick={() => onSelectTask(task.id)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-50 text-sm flex justify-between gap-3"
                >
                  <span className="text-neutral-800">{task.title}</span>
                  {task.scheduledFor && (
                    <span className="text-neutral-400 shrink-0">
                      {task.scheduledFor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Profile</h2>
          <button
            onClick={onEditInSettings}
            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800"
          >
            <SettingsIcon className="w-3.5 h-3.5" /> Edit in Settings
          </button>
        </div>
        <dl className="space-y-2 text-sm">
          <ProfileRow label="Age range" value={member.age_range} />
          <ProfileRow label="Allergies" value={member.allergies?.join(', ')} />
          <ProfileRow label="Medications" value={member.medications?.map((m) => m.name).join(', ')} />
          <ProfileRow label="Dietary" value={member.dietary_restrictions?.join(', ')} />
          <ProfileRow label="Conditions" value={member.health_conditions?.join(', ')} />
          <ProfileRow label="Mobility" value={member.mobility_needs} />
          <ProfileRow label="Involvement" value={member.typical_involvement} />
        </dl>
      </section>
    </div>
  )
}

function ProfileRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-neutral-400">{label}</dt>
      <dd className="text-neutral-800 capitalize">{value}</dd>
    </div>
  )
}
