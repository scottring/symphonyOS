import { describe, expect, it } from 'vitest'
import { groceryItems, readUtterance, tidy } from './wallUtterance'

describe('what a sentence said to the wall means', () => {
  it('drops the wake phrase and fillers', () => {
    expect(tidy('Hey Symphony, add milk to the grocery list.')).toBe('add milk to the grocery list')
    expect(tidy('symphony um what’s for dinner')).toBe("what's for dinner")
  })

  it('groceries: names what to add, split into lines', () => {
    expect(readUtterance('Add milk and eggs to the grocery list.')).toEqual({ kind: 'groceries', items: ['milk', 'eggs'] })
    expect(readUtterance('put some bread, butter and a dozen eggs on the shopping list')).toEqual({ kind: 'groceries', items: ['bread', 'butter', 'dozen eggs'] })
    expect(readUtterance('We need paper towels')).toEqual({ kind: 'groceries', items: ['paper towels'] })
    expect(readUtterance("we're out of coffee")).toEqual({ kind: 'groceries', items: ['coffee'] })
    expect(groceryItems('milk, milk and Milk')).toEqual(['milk'])
    // Heard on the wall, 2026-10-13: Whisper's "Ad" for "Add".
    expect(readUtterance('Ad Voice test to the grocery list.')).toEqual({ kind: 'groceries', items: ['voice test'] })
  })

  // The old command regex read "add … to groceries" as "add what's missing";
  // naming an item must add that item.
  it("only 'add what's missing' is the dinner command", () => {
    expect(readUtterance("add what's missing to the groceries")).toEqual({ kind: 'command', command: { type: 'add-missing' } })
    expect(readUtterance('add milk to groceries')).toEqual({ kind: 'groceries', items: ['milk'] })
  })

  it('kitchen commands still run', () => {
    expect(readUtterance('Hey Symphony, set a timer for 5 minutes')).toEqual({ kind: 'command', command: { type: 'start-timer', minutes: 5 } })
    expect(readUtterance("What's for dinner tonight?")).toEqual({ kind: 'command', command: { type: 'show-dinner' } })
    expect(readUtterance('next step')).toEqual({ kind: 'command', command: { type: 'next-step' } })
  })

  it('scratchpad: things to talk about, and notes', () => {
    expect(readUtterance('We should talk about summer camp.')).toEqual({ kind: 'talk', text: 'Summer camp' })
    expect(readUtterance("let's talk about the dentist bill")).toEqual({ kind: 'talk', text: 'The dentist bill' })
    expect(readUtterance('leave a note that the dog has been fed')).toEqual({ kind: 'note', text: 'The dog has been fed' })
  })

  it('Inbox: reminders and tasks, as a family task', () => {
    expect(readUtterance('Remind us to call the plumber on Thursday.')).toEqual({ kind: 'inbox', text: 'Call the plumber on Thursday' })
    expect(readUtterance("don't forget to return the library books")).toEqual({ kind: 'inbox', text: 'Return the library books' })
    expect(readUtterance('add renew passports to the inbox')).toEqual({ kind: 'inbox', text: 'Renew passports' })
    // "we need to …" is a task, not groceries.
    expect(readUtterance('we need to book the car service')).toEqual({ kind: 'inbox', text: 'Book the car service' })
  })

  it('questions are answered, not saved', () => {
    expect(readUtterance("What's after school today?")).toEqual({ kind: 'question', text: "What's after school today?" })
    expect(readUtterance('is Mia at swim tomorrow')).toEqual({ kind: 'question', text: 'Is Mia at swim tomorrow?' })
    expect(readUtterance('remind me what time pickup is')).toEqual({ kind: 'question', text: 'Remind me what time pickup is?' })
  })

  it('anything else is not understood and saves nothing', () => {
    expect(readUtterance('the cat is on the counter again')).toEqual({ kind: 'unknown', text: 'the cat is on the counter again' })
    expect(readUtterance('   ')).toEqual({ kind: 'unknown', text: '' })
  })
})
