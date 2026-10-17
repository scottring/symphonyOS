// The production review panel, synthetic examples and in-memory saves only.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SchoolMailPanel } from '../../src/components/settings/SchoolMailCard'
import type {
  SchoolMailItem,
  SchoolMailMessage,
  SchoolMailReceipt,
} from '../../src/lib/schoolMail'
import '../../src/index.css'

const sample: SchoolMailMessage = {
  id: 'sample-email',
  subject: 'Next week at Maple School',
  sourceLabel: 'Maple School (example)',
  createdAt: new Date().toISOString(),
  status: 'ready',
  result: null,
  error: null,
  sourceText:
    'Picture day is Tuesday, October 20 at 9am. Casey should bring a blue shirt. Please send the reading folder every Tuesday and Thursday. The school library is closed for renovations.',
  proposal: {
    gaps: [],
    items: [
      {
        id: 'event',
        kind: 'event',
        title: 'Picture day',
        date: '2026-10-20',
        time: '09:00',
        memberIds: ['casey'],
        quote: 'Picture day is Tuesday, October 20 at 9am.',
      },
      {
        id: 'shirt',
        kind: 'task',
        title: 'Bring a blue shirt',
        date: '2026-10-20',
        time: null,
        memberIds: ['casey'],
        quote: 'Casey should bring a blue shirt.',
      },
      {
        id: 'folder',
        kind: 'routine',
        title: 'Bring the reading folder',
        date: null,
        time: null,
        memberIds: ['casey'],
        quote: 'Please send the reading folder every Tuesday and Thursday.',
        repeat: { type: 'weekly', days: ['tue', 'thu'] },
        showOnTimeline: true,
      },
      {
        id: 'notice',
        kind: 'notice',
        title: 'School library closed for renovations',
        date: null,
        time: null,
        memberIds: [],
        quote: '',
      },
    ],
  },
}

function Preview() {
  const [address, setAddress] = useState<string | null>(null)
  const [messages, setMessages] = useState<SchoolMailMessage[]>([])
  const [saved, setSaved] = useState<SchoolMailItem[]>([])
  const [failNext, setFailNext] = useState(false)
  const save = async (
    id: string,
    items: SchoolMailItem[],
  ): Promise<SchoolMailReceipt> => {
    if (failNext) {
      setFailNext(false)
      throw new Error(
        'The save was not confirmed. Your selection is still here. Try Save again; it will not add the same items twice.',
      )
    }
    const existing = messages.find((m) => m.id === id)?.result
    if (existing) return existing
    const receipt: SchoolMailReceipt = {
      status: items.length ? 'saved' : 'dismissed',
      count: items.length,
      items: items.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
      })),
    }
    setSaved(items)
    setMessages((previous) =>
      previous.map((message) =>
        message.id === id
          ? { ...message, status: receipt.status, result: receipt }
          : message
      )
    )
    return receipt
  }
  return (
    <main className='max-w-3xl mx-auto px-5 py-8'>
      <header className='mb-8 pb-5 border-b border-neutral-200'>
        <p className='text-xs uppercase tracking-widest text-primary-700 mb-2'>
          Symphony · School email preview
        </p>
        <h1 className='font-display text-3xl mb-3'>
          A place for school information
        </h1>
        <p className='text-sm text-neutral-600'>
          Synthetic examples. Saves stay in this preview. No email is sent and
          no household records change.
        </p>
      </header>
      <aside
        className='mb-6 p-3 rounded-lg bg-neutral-100 text-sm flex flex-wrap gap-4'
        aria-label='Preview controls'
      >
        <button
          className='underline'
          disabled={!address || messages.length > 0}
          onClick={() => setMessages([sample])}
        >
          Receive sample email
        </button>
        <label className='flex gap-2'>
          <input
            type='checkbox'
            checked={failNext}
            onChange={(e) => setFailNext(e.target.checked)}
          />Simulate one failed save
        </label>
        <button
          className='underline'
          onClick={() => {
            setAddress(null)
            setMessages([])
            setSaved([])
          }}
        >
          Reset preview
        </button>
      </aside>
      <SchoolMailPanel
        school={{
          householdId: 'synthetic-household',
          address,
          members: [{ id: 'taylor', name: 'Taylor' }, {
            id: 'casey',
            name: 'Casey',
          }],
          messages,
          loading: false,
          error: null,
          enable: async () => setAddress('preview-only@example.invalid'),
          refresh: async () => {},
          retry: async () => {},
          save,
        }}
      />
      <section
        aria-label='Saved preview activities'
        className='mt-8 border-t pt-5'
      >
        <h2 className='font-display text-xl'>Saved in this preview</h2>
        {saved.length
          ? (
            <ul className='mt-2 space-y-2 text-sm'>
              {saved.map((item) => (
                <li key={item.id}>
                  {item.title} ·{' '}
                  {item.date ?? (item.repeat?.days?.join(', ') || 'No date')}
                  {item.time ? ` at ${item.time}` : ''}
                  {item.kind === 'routine'
                    ? item.showOnTimeline
                      ? ' · shown in Today and Week'
                      : ' · kept in Routines'
                    : ''}
                </li>
              ))}
            </ul>
          )
          : <p className='text-sm text-neutral-500 mt-2'>Nothing saved yet.</p>}
      </section>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<Preview />)
