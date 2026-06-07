import type { AppDef } from '@/shell/types'
import { ProjectsApp } from './ProjectsApp'

// Projects (list + detail). It does not own a selection kind — opening a task
// from a project delegates to the tasks app's /task/:id route (see ProjectsApp).
export const projectsAppDef: AppDef = {
  id: 'projects',
  route: '/projects',
  Component: ProjectsApp,
}
