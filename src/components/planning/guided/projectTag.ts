// src/components/planning/guided/projectTag.ts
//
// Minimal #project extraction for the session write-list inputs. Deliberately
// NOT parseQuickInput: that parser also eats date/time words ("next month",
// "at 9am"), which are often literal content in a season/month goal line.
// Here only an explicit #tag can change meaning, and only when it actually
// matches a project — unmatched tags stay in the title untouched.

import type { Project } from '@/types/project'

export interface ProjectTagResult {
  title: string
  projectId?: string
}

const normalize = (s: string) => s.toLowerCase().replace(/[\s-_]/g, '')

/** Extract the first `#tag` token that prefix-matches a project name
 *  (case/space-insensitive: `#kitchen` matches "Kitchen Renovation").
 *  The matched token is removed from the title; everything else is kept. */
export function extractProjectTag(raw: string, projects: Project[]): ProjectTagResult {
  const tokens = raw.match(/#[^\s#]+/g)
  if (!tokens) return { title: raw.trim() }
  for (const token of tokens) {
    const tag = normalize(token.slice(1))
    if (!tag) continue
    const project = projects.find((p) => normalize(p.name).startsWith(tag))
    if (project) {
      const title = raw.replace(token, ' ').replace(/\s+/g, ' ').trim()
      return { title, projectId: project.id }
    }
  }
  return { title: raw.trim() }
}
