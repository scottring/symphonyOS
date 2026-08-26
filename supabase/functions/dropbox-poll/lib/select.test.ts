import { describe, it, expect } from 'vitest'
import { selectNewFiles, maxServerModified, type DropboxEntry } from './select'

const file = (over: Partial<DropboxEntry>): DropboxEntry => ({
  '.tag': 'file',
  name: 'page.png',
  path_lower: '/supernote/export/page.png',
  server_modified: '2026-08-25T12:00:00Z',
  size: 1024,
  ...over,
})

const SINCE = '2026-08-25T10:00:00Z'

describe('selectNewFiles', () => {
  it('takes files strictly newer than the checkpoint', () => {
    const out = selectNewFiles(
      [
        file({ name: 'old.png', server_modified: '2026-08-25T09:00:00Z' }),
        file({ name: 'boundary.png', server_modified: SINCE }),
        file({ name: 'new.png', server_modified: '2026-08-25T11:00:00Z' }),
      ],
      SINCE,
      10,
    )
    expect(out.map((e) => e.name)).toEqual(['new.png'])
  })

  it('skips folders, deleted entries, and unsupported extensions', () => {
    const out = selectNewFiles(
      [
        file({ '.tag': 'folder', name: 'sub' }),
        file({ '.tag': 'deleted', name: 'gone.png' }),
        file({ name: 'notes.txt' }),
        file({ name: 'scan.PDF' }),
      ],
      SINCE,
      10,
    )
    expect(out.map((e) => e.name)).toEqual(['scan.PDF'])
  })

  it('skips files over the size ceiling', () => {
    const out = selectNewFiles([file({ name: 'huge.pdf', size: 11 * 1024 * 1024 })], SINCE, 10)
    expect(out).toEqual([])
  })

  it('returns oldest first and honours the cap', () => {
    const out = selectNewFiles(
      [
        file({ name: 'c.png', server_modified: '2026-08-25T13:00:00Z' }),
        file({ name: 'a.png', server_modified: '2026-08-25T11:00:00Z' }),
        file({ name: 'b.png', server_modified: '2026-08-25T12:00:00Z' }),
      ],
      SINCE,
      2,
    )
    expect(out.map((e) => e.name)).toEqual(['a.png', 'b.png'])
  })
})

describe('maxServerModified', () => {
  it('returns the newest timestamp among the entries', () => {
    expect(
      maxServerModified(
        [file({ server_modified: '2026-08-25T11:00:00Z' }), file({ server_modified: '2026-08-25T13:00:00Z' })],
        SINCE,
      ),
    ).toBe('2026-08-25T13:00:00Z')
  })

  it('returns the fallback when nothing was processed', () => {
    expect(maxServerModified([], SINCE)).toBe(SINCE)
  })
})
