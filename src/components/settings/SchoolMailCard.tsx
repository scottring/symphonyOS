import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Mail, RefreshCw } from 'lucide-react'
import { useSchoolMail } from '@/hooks/useSchoolMail'
import { SectionHeading } from '@/components/layout/SectionHeading'
import { SchoolMailReview } from './SchoolMailReview'

export function SchoolMailCard() {
  const school = useSchoolMail()
  return <SchoolMailPanel school={school} />
}

/** The production view also supports the isolated, in-memory UI walkthrough. */
export function SchoolMailPanel(
  { school }: { school: ReturnType<typeof useSchoolMail> },
) {
  const section = useRef<HTMLElement>(null)
  useEffect(() => {
    if (window.location.hash === '#school-information') {
      section.current?.scrollIntoView({ block: 'start' })
    }
  }, [])
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [opened, setOpened] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const ready = school.messages.filter((message) => message.status === 'ready')
  const received = school.messages.length > 0
  const doAction = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setActionError(null)
    try {
      await action()
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section ref={section} id='school-information' className='scroll-mt-24'>
      <SectionHeading>School information</SectionHeading>
      <p className='text-sm text-neutral-600 mb-4'>
        Bring school emails here. Symphony picks out dates, things to do and
        routines. You choose what to add.
      </p>
      <div className='rounded-xl border border-primary-100 bg-primary-50/40 p-4 mb-5 text-sm text-primary-800 flex items-start gap-3'>
        <Mail className='w-5 h-5 shrink-0' />
        <p>
          <strong>Nothing enters your plans until you save it.</strong>{' '}
          School email is shared with the adults in your household. Forward only
          what you want them to see.
        </p>
      </div>
      {school.loading
        ? <p role='status'>Loading school information…</p>
        : !school.householdId
        ? (
          <p>
            Create or join a household with an adult account to set up school
            information.
          </p>
        )
        : (
          <>
            <ol
              aria-label='School information progress'
              className='flex flex-wrap gap-x-6 gap-y-2 text-xs text-neutral-600 mb-5'
            >
              <li>{school.address ? '✓' : '1.'} Address ready</li>
              <li>{received ? '✓' : '2.'} First email received</li>
              <li>
                {school.messages.some((m) =>
                    m.status === 'saved' || m.status === 'dismissed'
                  )
                  ? '✓'
                  : '3.'} First review complete
              </li>
            </ol>
            {!school.address
              ? (
                <button
                  disabled={busy}
                  className='btn-primary'
                  onClick={() => void doAction(school.enable)}
                >
                  Get my forwarding address
                </button>
              )
              : (
                <>
                  <div className='bg-white rounded-xl border border-neutral-200 p-4'>
                    <p className='font-medium mb-2'>
                      Forward one school email to:
                    </p>
                    <div className='flex flex-wrap gap-3 items-center'>
                      <code className='text-sm break-all flex-1'>
                        {school.address}
                      </code>
                      <button
                        className='text-sm text-primary-700 flex items-center gap-1'
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(school.address!)
                            setCopied(true)
                            setCopyError(false)
                          } catch {
                            setCopyError(true)
                          }
                        }}
                      >
                        {copied ? <Check size={16} /> : <Copy size={16} />}{' '}
                        {copied ? 'Copied' : 'Copy address'}
                      </button>
                    </div>
                    <p className='text-xs text-neutral-500 mt-3'>
                      Keep this address private. Anyone with it can submit an
                      email for your household to review.
                    </p>
                    {copyError && (
                      <p role='alert' className='text-sm mt-2'>
                        Could not copy. Select the address above and copy it.
                      </p>
                    )}
                  </div>
                  <p role='status' className='text-sm my-4'>
                    {received
                      ? 'Your forwarding address has received mail.'
                      : 'Waiting for your first email. You can keep this page open; it checks for new mail.'}
                  </p>
                  <details className='text-sm border-b border-neutral-100 pb-4 mb-5'>
                    <summary className='cursor-pointer text-primary-700 font-medium'>
                      Make school emails arrive automatically
                    </summary>
                    <div className='mt-3 space-y-3 text-neutral-600'>
                      <p>
                        Start with one forwarded message. Once it arrives
                        correctly, make a rule for the school or teacher
                        addresses you choose.
                      </p>
                      <p>
                        <strong>Gmail:</strong>{' '}
                        on a computer, open Settings → See all settings →
                        Forwarding and POP/IMAP → Add a forwarding address.
                        Paste the address above. Google sends a confirmation
                        email here; open it below and use its code in Gmail.
                        Then create a filter for the school senders and choose
                        “Forward it to.” Leave forwarding for all mail off.
                      </p>
                      <p>
                        <strong>Outlook or another provider:</strong>{' '}
                        create a rule for the school senders that forwards to
                        this address, if your provider allows it. Otherwise,
                        forward selected messages yourself.
                      </p>
                      <p>
                        This reads the email text. PDFs, photos and documents
                        attached to it may still need your attention. Connecting
                        Google Calendar does not enable email forwarding.
                      </p>
                    </div>
                  </details>
                  <div className='flex justify-between gap-4 items-center mb-3'>
                    <h3 className='font-medium'>
                      {ready.length
                        ? `Ready for your review (${ready.length})`
                        : 'Received emails'}
                    </h3>
                    <button
                      disabled={busy}
                      className='text-sm flex items-center gap-1 text-primary-700'
                      onClick={() => void doAction(school.refresh)}
                    >
                      <RefreshCw size={14} /> Check for mail
                    </button>
                  </div>
                  <div className='space-y-3'>
                    {[...school.messages].sort((a, b) =>
                      Number(b.status === 'ready') -
                      Number(a.status === 'ready')
                    ).map((message) => (
                      <div
                        key={message.id}
                        className='border border-neutral-200 rounded-xl bg-white overflow-hidden'
                      >
                        <button
                          className='w-full text-left p-4 flex items-start justify-between gap-3'
                          aria-expanded={opened === message.id}
                          onClick={() =>
                            setOpened(
                              opened === message.id ? null : message.id,
                            )}
                        >
                          <span>
                            <strong className='text-sm block'>
                              {message.subject || 'School email'}
                            </strong>
                            <span className='text-xs text-neutral-500'>
                              {message.sourceLabel || 'Email'} ·{' '}
                              {new Date(message.createdAt).toLocaleDateString()}
                            </span>
                          </span>
                          <span className='text-xs text-primary-700 shrink-0'>
                            {{
                              ready: message.proposal?.confirmation
                                ? 'Forwarding confirmation'
                                : 'Review',
                              processing: 'Reading…',
                              failed: 'Needs a retry',
                              saved: `Saved ${message.result?.count ?? ''}`,
                              dismissed: 'Reviewed · nothing added',
                              legacy: 'Earlier import',
                            }[message.status]}
                          </span>
                        </button>
                        {opened === message.id && (
                          <SchoolMailReview
                            key={`${message.id}:${message.status}`}
                            message={message}
                            members={school.members}
                            onSave={school.save}
                            onRetry={school.retry}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
          </>
        )}
      {(school.error || actionError) && (
        <p role='alert' className='text-sm text-red-700 mt-4'>
          {actionError || school.error}
        </p>
      )}
    </section>
  )
}
