// src/lib/choices/applyDeps.ts
//
// The choice writers the change card applies chat's choice ops through
// (applyChangeSet). Bound to one client and the signed-in user: the shell
// passes the reviewed writer's client, so every write is journaled under the
// card's save receipt and its Undo.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TaskContext } from '@/types/task'
import type { Choice, ChoiceOption, GoalRef, PriceLine } from '@/types/choice'
import { scopeForDomain } from '@/lib/scope'
import * as db from './db'
import type { ChoiceDetail } from './db'

export interface ChoiceWriters {
  loadChoice: (id: string) => Promise<ChoiceDetail | null>
  createChoice: (goal: GoalRef, title: string) => Promise<Choice | null>
  deleteChoice: (id: string) => Promise<boolean>
  updateChoice: (id: string, patch: Parameters<typeof db.updateChoice>[2]) => Promise<boolean>
  addOption: (choiceId: string, input: { name: string; contactId?: string }) => Promise<ChoiceOption | null>
  deleteOption: (id: string) => Promise<boolean>
  updateOption: (id: string, patch: Parameters<typeof db.updateOption>[2]) => Promise<boolean>
  addPriceLine: (optionId: string, input: { workIds: string[]; amountCents: number; note?: string }) => Promise<PriceLine | null>
  deletePriceLine: (id: string) => Promise<boolean>
  /** A new contact for an option added with a phone; carries the goal's
   *  domain (and the scope it implies) when the goal has one. Its id. */
  addContact: (name: string, phone: string, goalContext: TaskContext | null) => Promise<string | null>
  /** Undo of addContact. */
  deleteContact: (id: string) => Promise<boolean>
  createFollowUp: (detail: ChoiceDetail, option: ChoiceOption, on: Date) => Promise<string | null>
  /** Undo of createFollowUp. */
  deleteTask: (id: string) => Promise<boolean>
  chooseOption: (detail: ChoiceDetail, optionId: string, note: string | null) => Promise<boolean>
  reopenChoice: (detail: ChoiceDetail) => Promise<boolean>
}

export function makeChoiceWriters(client: SupabaseClient, userId: string): ChoiceWriters {
  return {
    loadChoice: (id) => db.loadChoice(client, id),
    createChoice: (goal, title) => db.createChoice(client, userId, goal, title),
    deleteChoice: (id) => db.deleteChoice(client, id),
    updateChoice: (id, patch) => db.updateChoice(client, id, patch),
    addOption: (choiceId, input) => db.addOption(client, userId, choiceId, input),
    deleteOption: (id) => db.deleteOption(client, id),
    updateOption: (id, patch) => db.updateOption(client, id, patch),
    addPriceLine: (optionId, input) => db.addPriceLine(client, userId, optionId, input),
    deletePriceLine: (id) => db.deletePriceLine(client, id),
    addContact: async (name, phone, goalContext) => {
      // useContacts' insert, without the hook (this runs outside React).
      const { data, error } = await client.from('contacts').insert({
        user_id: userId,
        name,
        phone,
        email: null,
        notes: null,
        category: null,
        birthday: null,
        relationship: null,
        preferences: null,
        place_id: null,
        ...(goalContext ? { context: goalContext, scope: scopeForDomain(goalContext, [], null) } : {}),
      }).select('id').single()
      if (error || !data) return null
      return (data as { id: string }).id
    },
    deleteContact: async (id) => {
      // RLS turns a forbidden DELETE into zero rows with no error.
      const { data, error } = await client.from('contacts').delete().eq('id', id).select('id')
      return !error && ((data ?? []) as { id: string }[]).some((c) => c.id === id)
    },
    createFollowUp: (detail, option, on) => db.createFollowUp(client, userId, detail, option, on),
    deleteTask: (id) => db.deleteFollowUp(client, id),
    chooseOption: (detail, optionId, note) => db.chooseOption(client, detail, optionId, note, new Date()),
    reopenChoice: (detail) => db.reopenChoice(client, detail),
  }
}
