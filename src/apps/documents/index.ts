import type { AppDef } from '@/shell/types'
import { DocumentsApp } from './DocumentsApp'

// Documents shelf. No selection kind — documents open via a signed URL in a
// new tab rather than through the global DetailPanel.
export const documentsAppDef: AppDef = {
  id: 'documents',
  route: '/documents',
  Component: DocumentsApp,
}
