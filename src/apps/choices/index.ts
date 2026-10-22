import type { AppDef } from '@/shell/types'
import { ChoicesApp } from './ChoicesApp'

// The comparison page. No sidebar entry and no selection kind: it opens from a
// goal's Choices section.
export const choicesAppDef: AppDef = {
  id: 'choices',
  route: '/choice',
  Component: ChoicesApp,
}
