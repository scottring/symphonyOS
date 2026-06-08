import { ArrowLeft, Settings as SettingsIcon } from 'lucide-react'
import type { FamilyMember, FamilyMemberColor } from '@/types/family'
import { FAMILY_COLORS } from '@/types/family'
import type { Task, TaskBucket } from '@/types/task'
import type { Project } from '@/types/project'
import { selectMemberTasks } from '@/lib/memberTasks'
import { DenseInboxRow } from '@/components/schedule/DenseInboxRow'
import { TriageWhenMenu } from '@/components/schedule/TriageWhenMenu'
import { applyTriageWhen } from '@/lib/triage/applyWhen'

interface MemberViewProps {
  member: FamilyMember
  tasks: Task[]
  onBack: () => void
  onSelectTask: (taskId: string) => void
  onEditInSettings: () => void
  projects: Project[]
  familyMembers: FamilyMember[]
  onToggleTask: (id: string) => void
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onDeleteTask: (id: string) => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  onSetBucket: (id: string, bucket: TaskBucket) => void
}

export function MemberView({
  member, tasks, onBack, onSelectTask, onEditInSettings,
  projects, familyMembers, onToggleTask, onUpdateTask, onDeleteTask, onPushTask, onSetBucket,
}: MemberViewProps) {
  const { open, upcoming } = selectMemberTasks(tasks, member.id)
  const colors = FAMILY_COLORS[member.color as FamilyMemberColor] ?? FAMILY_COLORS.blue

  const renderRow = (task: Task) => (
    <DenseInboxRow
      key={task.id}
      task={task}
      project={projects.find((p) => p.id === task.projectId)}
      projects={projects}
      familyMembers={familyMembers}
      quickActions={[]}
      onQuickAction={() => {}}
      triageMenu={
        <TriageWhenMenu
          onPick={(when) => applyTriageWhen(when, task.id, { onPushTask, onSetBucket })}
          onPickDate={(date) => onPushTask(task.id, date)}
          onComplete={() => onToggleTask(task.id)}
          onDelete={() => onDeleteTask(task.id)}
        />
      }
      onToggleComplete={() => onToggleTask(task.id)}
      onUpdate={(updates) => onUpdateTask(task.id, updates)}
      onSelect={() => onSelectTask(task.id)}
      onAssign={(memberIds) => onUpdateTask(task.id, { assignedToAll: memberIds })}
    />
  )

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
          <div className="space-y-2">{open.map(renderRow)}</div>
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-2">Upcoming</h2>
          <div className="space-y-2">{upcoming.map(renderRow)}</div>
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
      <dd className="text-neutral-800">{value}</dd>
    </div>
  )
}
