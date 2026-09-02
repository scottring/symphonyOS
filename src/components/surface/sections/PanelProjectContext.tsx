import type { Project } from '@/types/project'
import { ConceptIcon } from '@/lib/conceptIcons'
import { PanelSection } from './PanelSection'
import { PanelRow } from './PanelRow'

interface PanelProjectContextProps {
  project?: Project
  /**
   * The number the panel's action bar already offers as its call button. When
   * the project's phone IS that number it's one tap away already — listing it
   * again here would be the second call affordance this panel deliberately
   * doesn't have.
   */
  actionPhone?: string
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

/**
 * What the task inherits from its project — the vendor's site, the contractor's
 * number — attributed so it reads as the project's, not the task's. The point of
 * hanging context on a project is that every task under it gets it for free at
 * execution time; without this section that context only lived on the project
 * page, a navigation away.
 */
export function PanelProjectContext({ project, actionPhone }: PanelProjectContextProps) {
  if (!project) return null
  const links = project.links ?? []
  const phone = project.phoneNumber && project.phoneNumber !== actionPhone ? project.phoneNumber : undefined
  if (links.length === 0 && !phone) return null

  const count = links.length + (phone ? 1 : 0)
  return (
    <PanelSection
      id="project-context"
      label={`From ${project.name}`}
      preview={`${count} item${count === 1 ? '' : 's'}`}
    >
      {phone && (
        <PanelRow
          href={`tel:${phone}`}
          external={false}
          icon={<span className="w-6 h-6 flex items-center justify-center rounded-md bg-emerald-100"><ConceptIcon name="call" decorative /></span>}
        >
          <span className="block text-sm text-neutral-800">{phone}</span>
        </PanelRow>
      )}
      {links.map((link) => (
        <PanelRow
          key={link.url}
          href={link.url}
          icon={<span className="w-6 h-6 flex items-center justify-center rounded-md bg-sky-100"><ConceptIcon name="attachment" decorative /></span>}
        >
          <span className="block text-sm text-neutral-800 truncate">{link.title || hostname(link.url)}</span>
        </PanelRow>
      ))}
    </PanelSection>
  )
}
