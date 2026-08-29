import type { AppDef } from '@/shell/types'
import { NotesApp } from './NotesApp'

// The notes stream. No selection kind — a note opens in NoteModal from the
// page's own `?note=` param rather than through the global DetailPanel.
export const notesAppDef: AppDef = {
  id: 'notes',
  route: '/notes',
  Component: NotesApp,
}
