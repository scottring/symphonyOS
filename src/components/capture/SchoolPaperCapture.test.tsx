import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { FamilyMember } from '@/types/family'
import type { Task } from '@/types/task'

const m = vi.hoisted(() => ({
  readSchoolPaper: vi.fn(),
  saveSchoolPaper: vi.fn(async () => ({ saved: true, photoAttached: true })),
  loadOpenPapers: vi.fn(async () => [] as Task[]),
  uploadPaperPhoto: vi.fn(async () => 'u/paper-plan/x/photo-1.jpg'),
  prepareImages: vi.fn(async (b: Blob) => [{ blob: b, part: 'whole' }]),
}))
vi.mock('@/lib/paperPlan/api', () => ({ readSchoolPaper: m.readSchoolPaper }))
vi.mock('@/lib/paperPlan/images', () => ({ prepareImages: m.prepareImages }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/paperPlan/schoolPaper', async (orig) => ({
  ...(await orig<typeof import('@/lib/paperPlan/schoolPaper')>()),
  saveSchoolPaper: m.saveSchoolPaper, loadOpenPapers: m.loadOpenPapers, uploadPaperPhoto: m.uploadPaperPhoto,
}))
vi.mock('@/hooks/useWallData', () => ({ rowToTask: (r: unknown) => r, TASK_COLUMNS: '*' }))

import { SchoolPaperCapture } from './SchoolPaperCapture'

const ella = { id: 'e', name: 'Ella', role_label: 'child' } as FamilyMember
const kaleb = { id: 'k', name: 'Kaleb', role_label: 'child' } as FamilyMember
const openPink = { id: 'p1', title: 'Pink health form', completed: false, category: 'paper', assignedTo: 'k', createdAt: new Date(), updatedAt: new Date() } as Task

async function photograph(read: unknown, open: Task[] = []) {
  m.readSchoolPaper.mockResolvedValue({ ok: true, paper: read })
  m.loadOpenPapers.mockResolvedValue(open)
  const onClose = vi.fn()
  render(<SchoolPaperCapture userId="u" holderId="scott" kids={[ella, kaleb]} onClose={onClose} today="2026-10-20" />)
  const input = screen.getByLabelText('Take a photo of the paper')
  fireEvent.change(input, { target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] } })
  await screen.findByRole('button', { name: 'Save' })
  return onClose
}

beforeEach(() => vi.clearAllMocks())

describe('SchoolPaperCapture', () => {
  it('the confirm card shows kid, title, due and money, editable', async () => {
    await photograph({ title: 'Field trip slip', for: ['Ella'], due: '2026-10-22', money: '$12', confidence: 0.9 })
    expect(screen.getByLabelText('Paper')).toHaveValue('Field trip slip')
    expect(screen.getByLabelText('Due')).toHaveValue('2026-10-22')
    expect(screen.getByLabelText('Money')).toHaveValue('$12')
    expect(screen.getByRole('button', { name: 'Ella' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Kaleb' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.change(screen.getByLabelText('Paper'), { target: { value: 'Zoo trip slip' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(m.saveSchoolPaper).toHaveBeenCalledTimes(1))
    expect(m.saveSchoolPaper).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      kidIds: ['e'], title: 'Zoo trip slip', due: '2026-10-22', holderId: 'scott', existing: undefined,
    }))
  })

  it('a paper already on the wall is pre-selected and claimed', async () => {
    await photograph({ title: 'Pink Health Information Form', for: ['Kaleb'], confidence: 0.9 }, [openPink])
    expect(screen.getByText('Kaleb’s: Pink health form', { exact: false })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(m.saveSchoolPaper).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kidIds: ['k'], existing: openPink })))
  })

  it('"It\'s a different paper" saves it as new', async () => {
    await photograph({ title: 'Pink Health Information Form', for: ['Kaleb'], confidence: 0.9 }, [openPink])
    fireEvent.click(screen.getByRole('button', { name: 'It’s a different paper' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(m.saveSchoolPaper).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ existing: undefined })))
  })

  it('a paper naming no child asks whose it is before saving', async () => {
    await photograph({ title: 'Book fair order', for: 'everyone', confidence: 0.9 })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Kaleb' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('two kids with their own matches each get a line', async () => {
    const ellaPink = { ...openPink, id: 'p2', assignedTo: 'e' } as Task
    await photograph({ title: 'Pink health form', for: 'everyone', confidence: 0.9 }, [openPink, ellaPink])
    fireEvent.click(screen.getByRole('button', { name: 'Ella' }))
    fireEvent.click(screen.getByRole('button', { name: 'Kaleb' }))
    expect(screen.getByText('Ella’s: Pink health form', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Kaleb’s: Pink health form', { exact: false })).toBeInTheDocument()
  })

  it('a saved paper whose photo did not attach is not saved again', async () => {
    m.saveSchoolPaper.mockResolvedValueOnce({ saved: true, photoAttached: false })
    await photograph({ title: 'Field trip slip', for: ['Ella'], confidence: 0.9 })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/photo didn’t attach/i)).toBeInTheDocument()
    expect(screen.getByText('On the wall.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('says so when the photo is not a readable paper', async () => {
    m.readSchoolPaper.mockResolvedValue({ ok: true, paper: null })
    render(<SchoolPaperCapture userId="u" holderId="scott" kids={[ella, kaleb]} onClose={vi.fn()} today="2026-10-20" />)
    fireEvent.change(screen.getByLabelText('Take a photo of the paper'), { target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] } })
    expect(await screen.findByText(/couldn’t read a school paper/i)).toBeInTheDocument()
  })
})
