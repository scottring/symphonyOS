import { useState } from 'react'
import type { Project } from '@/types/project'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { PanelHeader } from './sections/PanelHeader'
import { PanelMetaRow } from './sections/PanelMetaRow'
import { PanelWhy } from './sections/PanelWhy'
import { PanelLinks } from './sections/PanelLinks'
import { PanelMightBeRelevant } from './sections/PanelMightBeRelevant'
import { PanelFooter } from './sections/PanelFooter'
import { useEntityRelations } from './hooks/useEntityRelations'
import type { MightBeRelevantItem } from './types'

interface TapProjectPanelProps {
  project: Project
  allTasks: Task[]
  allEvents: CalendarEvent[]
  allProjects: Project[]

  onClose: () => void
  onNotesChange: (next: string) => void
  onAddTask: (title: string) => void
  onMore: () => void
  onAddLink: (url: string) => void
  onOpenTask: (id: string) => void
  onOpenRelated: (kind: MightBeRelevantItem['kind'], id: string) => void
}

export function TapProjectPanel(props: TapProjectPanelProps) {
  const { project, allTasks, allEvents, allProjects } = props

  const relations = useEntityRelations({
    kind: 'project',
    entity: project,
    allTasks,
    allEvents,
    allProjects,
  })

  const [draftTask, setDraftTask] = useState('')

  function commitTask() {
    const text = draftTask.trim()
    if (text) {
      props.onAddTask(text)
      setDraftTask('')
    }
  }

  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader
        title={project.name}
        onTitleChange={() => { /* project rename — out of scope */ }}
        onClose={props.onClose}
      />
      <PanelMetaRow
        bucket={project.status || 'Project'}
      />
      <div className="flex flex-wrap gap-2 pb-4 mb-4 border-b border-neutral-200">
        <button
          onClick={props.onMore}
          aria-label="More actions"
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
        >
          ···
        </button>
      </div>

      <PanelWhy
        notes={project.notes}
        onChange={props.onNotesChange}
        label="What this is"
      />

      <section className="mb-4">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">
          Open work · {relations.tasks.length}
        </div>
        <div className="flex flex-col gap-1.5">
          {relations.tasks.map(t => (
            <button
              key={t.id}
              onClick={() => props.onOpenTask(t.id)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50 text-left"
            >
              <span className="w-6 h-6 flex items-center justify-center rounded-md bg-neutral-100">📋</span>
              <span className="text-sm text-neutral-800 flex-1">{t.title}</span>
            </button>
          ))}
          <input
            type="text"
            value={draftTask}
            onChange={(e) => setDraftTask(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitTask() }}
            onBlur={commitTask}
            placeholder="+ Add a task to this project…"
            className="text-sm px-2 py-1.5 rounded-md bg-transparent text-neutral-500 placeholder:text-neutral-400 focus:outline-none focus:bg-neutral-50 hover:bg-neutral-50"
          />
        </div>
      </section>

      <PanelLinks links={project.links} onAddLink={props.onAddLink} />

      <PanelMightBeRelevant items={[]} onOpen={props.onOpenRelated} />

      <PanelFooter
        createdAt={project.createdAt}
        updatedAt={project.updatedAt}
      />
    </article>
  )
}
