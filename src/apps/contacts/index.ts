import type { AppDef } from '@/shell/types'
import { ContactsApp } from './ContactsApp'

// Contacts (list + detail). It does not own a selection kind — opening a task
// from a contact delegates to the tasks app's /task/:id route (see ContactsApp).
export const contactsAppDef: AppDef = {
  id: 'contacts',
  route: '/contacts',
  Component: ContactsApp,
}
