import { useState } from 'react'
import {
  SCHOOL_DAYS,
  schoolItemDestination,
  type SchoolMailItem,
  type SchoolMailMessage,
  type SchoolMailReceipt,
} from '@/lib/schoolMail'

interface Props {
  message: SchoolMailMessage
  members: { id: string; name: string }[]
  onSave: (id: string, items: SchoolMailItem[]) => Promise<SchoolMailReceipt>
  onRetry: (id: string) => Promise<void>
}
export function SchoolMailReview({ message, members, onSave, onRetry }: Props) {
  const [items, setItems] = useState(() => message.proposal?.items ?? [])
  const [selected, setSelected] = useState(() =>
    new Set(items.map((item) => item.id))
  )
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState(message.result)
  const saved = receipt ?? message.result
  const terminal = !!saved || message.status === 'saved' ||
    message.status === 'dismissed'
  const update = (id: string, change: Partial<SchoolMailItem>) =>
    setItems((previous) =>
      previous.map((item) => item.id === id ? { ...item, ...change } : item)
    )
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setBusy(false)
    }
  }
  const save = () =>
    act(async () =>
      setReceipt(
        await onSave(message.id, items.filter((item) => selected.has(item.id))),
      )
    )
  return (
    <div className='border-t border-neutral-100 p-4 space-y-4'>
      {message.proposal?.confirmation && (
        <p className='text-sm'>
          This is your email provider’s forwarding confirmation. Open the
          original message below and use its code in Gmail if you requested
          forwarding. It adds nothing to your plan.
        </p>
      )}
      <details open={message.proposal?.confirmation} className='text-sm'>
        <summary className='cursor-pointer font-medium text-primary-700'>
          Read the original email
        </summary>
        <pre className='whitespace-pre-wrap break-words font-sans mt-3 rounded-lg bg-neutral-50 p-3 max-h-80 overflow-y-auto'>{message.sourceText||'The original text is unavailable.'}</pre>
      </details>
      {message.status === 'processing' && (
        <div>
          <p role='status' className='text-sm'>
            Reading this email. Nothing has been added to your plans.
          </p>
          {Date.now() - new Date(message.createdAt).getTime() > 300000 && (
            <button
              disabled={busy}
              className='text-primary-700 text-sm underline mt-2'
              onClick={() => void act(() => onRetry(message.id))}
            >
              Taking too long? Try reading again
            </button>
          )}
        </div>
      )}
      {message.status === 'failed' && (
        <div>
          <p className='text-sm'>
            Could not read this email. Nothing has been added by this review.
          </p>
          <button
            disabled={busy}
            className='text-primary-700 text-sm underline mt-2'
            onClick={() => void act(() => onRetry(message.id))}
          >
            Try reading again
          </button>
        </div>
      )}
      {message.status === 'legacy' && (
        <p className='text-sm'>
          This email was processed before review-before-save was introduced. Its
          earlier additions are already in the app.
        </p>
      )}
      {message.proposal?.gaps.map((gap, n) => (
        <p key={n} className='text-sm text-amber-800 bg-amber-50 rounded p-3'>
          {gap}
        </p>
      ))}
      {terminal
        ? (
          <div role='status' className='rounded-lg bg-primary-50 p-3 text-sm'>
            <strong>
              {saved?.status === 'dismissed'
                ? 'Reviewed. Nothing added.'
                : `Saved ${saved?.count ?? 0} ${
                  saved?.count === 1 ? 'item' : 'items'
                }.`}
            </strong>
            {saved?.items?.length
              ? (
                <ul className='list-disc pl-5 mt-2'>
                  {saved.items.map((item) => <li key={item.id}>{item.title}
                  </li>)}
                </ul>
              )
              : null}
            {!!saved?.skipped?.length && (
              <p className='mt-2'>
                Already in your plans; no duplicate added:{' '}
                {saved.skipped.join(', ')}.
              </p>
            )}
            <p className='mt-2'>
              Your existing plan stays in place. Find saved activities in Today,
              Week or Routines. School notices stay with this email and can appear
              on your shared tablet.
            </p>
          </div>
        )
        : message.status === 'ready' && (
          <>
            {items.length > 0
              ? (
                <>
                  <p className='text-sm font-medium'>
                    Choose what belongs in your plans
                  </p>
                  <p className='text-xs text-neutral-500'>
                    These additions are visible to your household. Dates and
                    people are suggestions; change them before saving. Nothing
                    is added to Google Calendar.
                  </p>
                </>
              )
              : !message.proposal?.confirmation && (
                <p className='text-sm'>
                  No activities were found. Check the original email, especially
                  any attachments.
                </p>
              )}
            <div className='space-y-3'>
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-lg border p-3 ${
                    selected.has(item.id)
                      ? 'border-primary-200'
                      : 'border-neutral-100 opacity-70'
                  }`}
                >
                  <div className='flex items-start gap-3'>
                    <input
                      type='checkbox'
                      aria-label={`Include ${item.title}`}
                      checked={selected.has(item.id)}
                      disabled={busy}
                      onChange={() =>
                        setSelected((previous) => {
                          const next = new Set(previous)
                          if (next.has(item.id)) next.delete(item.id)
                          else next.add(item.id)
                          return next
                        })}
                      className='mt-1'
                    />
                    <div className='flex-1 min-w-0'>
                      <strong className='text-sm block'>{item.title}</strong>
                      <p className='text-xs text-neutral-600 mt-1'>
                        {schoolItemDestination(item)}
                      </p>
                      <p className='text-xs text-neutral-500 mt-1'>
                        {item.memberIds.length
                          ? members.filter((member) =>
                            item.memberIds.includes(member.id)
                          ).map((member) => member.name).join(', ')
                          : 'No person assigned'}
                      </p>
                    </div>
                    <button
                      disabled={busy}
                      className='text-xs text-primary-700 underline'
                      onClick={() =>
                        setEditing(editing === item.id ? null : item.id)}
                    >
                      {editing === item.id ? 'Done editing' : 'Change'}
                    </button>
                  </div>
                  {item.warning && (
                    <p className='mt-2 text-xs text-amber-800'>
                      {item.warning}
                    </p>
                  )}
                  {item.detail && (
                    <p className='mt-2 text-xs text-neutral-600 whitespace-pre-wrap'>
                      {item.detail}
                    </p>
                  )}
                  {item.quote && (
                    <details className='mt-2 text-xs text-neutral-500'>
                      <summary className='cursor-pointer'>
                        Why Symphony suggested this
                      </summary>
                      <blockquote className='border-l-2 pl-3 mt-2 whitespace-pre-wrap'>
                        {item.quote}
                      </blockquote>
                    </details>
                  )}
                  {editing === item.id && (
                    <fieldset
                      disabled={busy}
                      className='mt-3 pt-3 border-t space-y-3 text-sm'
                    >
                      <label className='block'>
                        Title<input
                          aria-label={`Title for ${item.title}`}
                          value={item.title}
                          maxLength={500}
                          onChange={(e) =>
                            update(item.id, { title: e.target.value })}
                          className='input-base mt-1 w-full'
                        />
                      </label>
                      {!['notice', 'routine'].includes(item.kind) && (
                        <div className='flex gap-3 flex-wrap'>
                          <label>
                            Date{' '}
                            <input
                              aria-label={`Date for ${item.title}`}
                              type='date'
                              value={item.date ?? ''}
                              onChange={(e) =>
                                update(item.id, {
                                  date: e.target.value || null,
                                  ...(!e.target.value ? { time: null } : {}),
                                })}
                              className='input-base mt-1 block'
                            />
                          </label>
                          <label>
                            Time (optional)<input
                              aria-label={`Time for ${item.title}`}
                              type='time'
                              disabled={!item.date}
                              value={item.time ?? ''}
                              onChange={(e) =>
                                update(item.id, {
                                  time: e.target.value || null,
                                })}
                              className='input-base mt-1 block'
                            />
                          </label>
                        </div>
                      )}
                      <fieldset>
                        <legend>Who is this for?</legend>
                        <div className='flex flex-wrap gap-3 mt-2'>
                          {members.map((member) => (
                            <label
                              key={member.id}
                              className='flex gap-2 items-center'
                            >
                              <input
                                type='checkbox'
                                checked={item.memberIds.includes(member.id)}
                                onChange={() =>
                                  update(item.id, {
                                    memberIds:
                                      item.memberIds.includes(member.id)
                                        ? item.memberIds.filter((id) =>
                                          id !== member.id
                                        )
                                        : [...item.memberIds, member.id],
                                  })}
                              />
                              {member.name}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      {item.kind === 'routine' && (
                        <>
                          <label className='block'>
                            Repeats<select
                              aria-label={`Repeat for ${item.title}`}
                              value={item.repeat?.type ?? 'weekly'}
                              onChange={(e) =>
                                update(item.id, {
                                  repeat: e.target.value === 'daily'
                                    ? { type: 'daily' }
                                    : { type: 'weekly', days: ['mon'] },
                                })}
                              className='input-base block mt-1'
                            >
                              <option value='daily'>Every day</option>
                              <option value='weekly'>
                                On selected weekdays
                              </option>
                            </select>
                          </label>
                          {item.repeat?.type === 'weekly' && (
                            <div className='flex flex-wrap gap-3'>
                              {SCHOOL_DAYS.map((day) => (
                                <label
                                  key={day}
                                  className='capitalize flex gap-1'
                                >
                                  <input
                                    type='checkbox'
                                    checked={item.repeat?.days?.includes(day) ??
                                      false}
                                    onChange={() =>
                                      update(item.id, {
                                        repeat: {
                                          type: 'weekly',
                                          days: item.repeat?.days?.includes(day)
                                            ? item.repeat.days.filter((d) =>
                                              d !== day
                                            )
                                            : [
                                              ...(item.repeat?.days ?? []),
                                              day,
                                            ],
                                        },
                                      })}
                                  />
                                  {day}
                                </label>
                              ))}
                            </div>
                          )}
                          <label className='flex gap-2 items-center'>
                            <input
                              type='checkbox'
                              checked={item.showOnTimeline ?? true}
                              onChange={(e) =>
                                update(item.id, {
                                  showOnTimeline: e.target.checked,
                                })}
                            />Show this routine in Today and Week
                          </label>
                        </>
                      )}
                    </fieldset>
                  )}
                </div>
              ))}
            </div>
            <div className='pt-3 border-t'>
              <button
                disabled={busy || items.some((item) =>
                  selected.has(item.id) &&
                  (!item.title.trim() ||
                    (item.repeat?.type === 'weekly' &&
                      !item.repeat.days?.length))
                )}
                className='btn-primary w-full sm:w-auto'
                onClick={() => void save()}
              >
                {busy
                  ? 'Saving…'
                  : selected.size
                  ? `Save ${selected.size} selected ${
                    selected.size === 1 ? 'item' : 'items'
                  }`
                  : message.proposal?.confirmation
                  ? 'I’ve handled the confirmation'
                  : 'Finish without adding anything'}
              </button>
              <p className='text-xs text-neutral-500 mt-2'>
                {selected.size
                  ? 'Only the selected items will be added. Nothing is saved until you press Save.'
                  : 'This keeps the email here and adds nothing to your plans.'}
              </p>
            </div>
          </>
        )}
      {error && <p role='alert' className='text-sm text-red-700'>{error}</p>}
    </div>
  )
}
