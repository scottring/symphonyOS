import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { useCallback, useEffect } from 'react'

interface TiptapEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
  autoFocus?: boolean
  editable?: boolean
}

export function TiptapEditor({
  content,
  onChange,
  placeholder = 'Start writing...',
  autoFocus = false,
  editable = true,
}: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
    ],
    content,
    editable,
    autofocus: autoFocus,
    editorProps: {
      attributes: {
        class: 'prose prose-neutral max-w-none focus:outline-none min-h-[200px] px-4 py-3',
      },
      handlePaste: (view, event) => {
        // Get clipboard data
        const text = event.clipboardData?.getData('text/plain')
        if (!text) return false

        // Check if it looks like tabular data (has tabs and multiple lines)
        const lines = text.split('\n').filter(line => line.trim())
        const hasTabs = lines.some(line => line.includes('\t'))

        if (!hasTabs || lines.length < 2) return false // Let default paste handle it

        // Parse TSV data
        const rows = lines.map(line => line.split('\t'))
        const cols = Math.max(...rows.map(row => row.length))

        // Ensure all rows have the same number of columns
        const normalizedRows = rows.map(row => {
          const normalized = [...row]
          while (normalized.length < cols) {
            normalized.push('')
          }
          return normalized
        })

        // Insert table
        const { tr } = view.state
        const table = view.state.schema.nodes.table.create(null, [
          // Create header row
          view.state.schema.nodes.tableRow.create(
            null,
            normalizedRows[0].map(cell =>
              view.state.schema.nodes.tableHeader.create(
                null,
                view.state.schema.text(cell)
              )
            )
          ),
          // Create body rows
          ...normalizedRows.slice(1).map(row =>
            view.state.schema.nodes.tableRow.create(
              null,
              row.map(cell =>
                view.state.schema.nodes.tableCell.create(
                  null,
                  view.state.schema.text(cell)
                )
              )
            )
          ),
        ])

        view.dispatch(tr.replaceSelectionWith(table))
        event.preventDefault()
        return true
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  // Update content when prop changes (e.g., switching notes)
  // Use emitUpdate: false to prevent triggering onChange when syncing external content
  // This prevents race conditions where synced content triggers a save with stale/empty data
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false })
    }
  }, [content, editor])

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable)
    }
  }, [editor, editable])

  const toggleBold = useCallback(() => {
    editor?.chain().focus().toggleBold().run()
  }, [editor])

  const toggleItalic = useCallback(() => {
    editor?.chain().focus().toggleItalic().run()
  }, [editor])

  const toggleHeading = useCallback((level: 1 | 2 | 3) => {
    editor?.chain().focus().toggleHeading({ level }).run()
  }, [editor])

  const toggleBulletList = useCallback(() => {
    editor?.chain().focus().toggleBulletList().run()
  }, [editor])

  const toggleOrderedList = useCallback(() => {
    editor?.chain().focus().toggleOrderedList().run()
  }, [editor])

  const toggleTaskList = useCallback(() => {
    editor?.chain().focus().toggleTaskList().run()
  }, [editor])

  const insertTable = useCallback(() => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }, [editor])

  // Table manipulation commands
  const addRowBefore = useCallback(() => {
    editor?.chain().focus().addRowBefore().run()
  }, [editor])

  const addRowAfter = useCallback(() => {
    editor?.chain().focus().addRowAfter().run()
  }, [editor])

  const deleteRow = useCallback(() => {
    editor?.chain().focus().deleteRow().run()
  }, [editor])

  const addColumnBefore = useCallback(() => {
    editor?.chain().focus().addColumnBefore().run()
  }, [editor])

  const addColumnAfter = useCallback(() => {
    editor?.chain().focus().addColumnAfter().run()
  }, [editor])

  const deleteColumn = useCallback(() => {
    editor?.chain().focus().deleteColumn().run()
  }, [editor])

  const deleteTable = useCallback(() => {
    editor?.chain().focus().deleteTable().run()
  }, [editor])

  const toggleHeaderRow = useCallback(() => {
    editor?.chain().focus().toggleHeaderRow().run()
  }, [editor])

  if (!editor) {
    return null
  }

  const isInTable = editor.isActive('table')

  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden bg-white">
      {/* Toolbar */}
      {editable && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-neutral-100 bg-neutral-50/50 overflow-x-auto">
          {/* Text formatting */}
          <ToolbarButton
            onClick={toggleBold}
            isActive={editor.isActive('bold')}
            title="Bold (⌘B)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
              <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            onClick={toggleItalic}
            isActive={editor.isActive('italic')}
            title="Italic (⌘I)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="4" x2="10" y2="4" />
              <line x1="14" y1="20" x2="5" y2="20" />
              <line x1="15" y1="4" x2="9" y2="20" />
            </svg>
          </ToolbarButton>

          <div className="w-px h-5 bg-neutral-200 mx-1 flex-shrink-0" />

          {/* Headings */}
          <ToolbarButton
            onClick={() => toggleHeading(1)}
            isActive={editor.isActive('heading', { level: 1 })}
            title="Heading 1"
          >
            <span className="text-xs font-bold">H1</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => toggleHeading(2)}
            isActive={editor.isActive('heading', { level: 2 })}
            title="Heading 2"
          >
            <span className="text-xs font-bold">H2</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => toggleHeading(3)}
            isActive={editor.isActive('heading', { level: 3 })}
            title="Heading 3"
          >
            <span className="text-xs font-bold">H3</span>
          </ToolbarButton>

          <div className="w-px h-5 bg-neutral-200 mx-1 flex-shrink-0" />

          {/* Lists */}
          <ToolbarButton
            onClick={toggleBulletList}
            isActive={editor.isActive('bulletList')}
            title="Bullet list"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            onClick={toggleOrderedList}
            isActive={editor.isActive('orderedList')}
            title="Numbered list"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="10" y1="6" x2="21" y2="6" />
              <line x1="10" y1="12" x2="21" y2="12" />
              <line x1="10" y1="18" x2="21" y2="18" />
              <path d="M4 6h1v4" />
              <path d="M4 10h2" />
              <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            onClick={toggleTaskList}
            isActive={editor.isActive('taskList')}
            title="Task list (checkboxes)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="6" height="6" rx="1" />
              <path d="m3 17 2 2 4-4" />
              <path d="M13 6h8" />
              <path d="M13 12h8" />
              <path d="M13 18h8" />
            </svg>
          </ToolbarButton>

          <div className="w-px h-5 bg-neutral-200 mx-1 flex-shrink-0" />

          {/* Table */}
          <ToolbarButton
            onClick={insertTable}
            isActive={editor.isActive('table')}
            title="Insert table"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </ToolbarButton>

          {/* Table controls (shown when cursor is in a table) */}
          {isInTable && (
            <>
              <div className="w-px h-5 bg-neutral-200 mx-1 flex-shrink-0" />

              {/* Row controls */}
              <ToolbarButton
                onClick={addRowBefore}
                title="Add row above"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="3" x2="15" y2="9" />
                  <line x1="12" y1="3" x2="12" y2="9" />
                </svg>
              </ToolbarButton>
              <ToolbarButton
                onClick={addRowAfter}
                title="Add row below"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="15" x2="21" y2="15" />
                  <line x1="9" y1="15" x2="15" y2="21" />
                  <line x1="12" y1="15" x2="12" y2="21" />
                </svg>
              </ToolbarButton>
              <ToolbarButton
                onClick={deleteRow}
                title="Delete row"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="12" x2="21" y2="12" strokeWidth="2.5" />
                  <line x1="8" y1="8" x2="16" y2="16" />
                </svg>
              </ToolbarButton>

              <div className="w-px h-5 bg-neutral-200 mx-1 flex-shrink-0" />

              {/* Column controls */}
              <ToolbarButton
                onClick={addColumnBefore}
                title="Add column left"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                  <line x1="3" y1="9" x2="9" y2="15" />
                  <line x1="3" y1="12" x2="9" y2="12" />
                </svg>
              </ToolbarButton>
              <ToolbarButton
                onClick={addColumnAfter}
                title="Add column right"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="15" y1="3" x2="15" y2="21" />
                  <line x1="15" y1="9" x2="21" y2="15" />
                  <line x1="15" y1="12" x2="21" y2="12" />
                </svg>
              </ToolbarButton>
              <ToolbarButton
                onClick={deleteColumn}
                title="Delete column"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="12" y1="3" x2="12" y2="21" strokeWidth="2.5" />
                  <line x1="8" y1="8" x2="16" y2="16" />
                </svg>
              </ToolbarButton>

              <div className="w-px h-5 bg-neutral-200 mx-1 flex-shrink-0" />

              {/* Table options */}
              <ToolbarButton
                onClick={toggleHeaderRow}
                title="Toggle header row"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="9" x2="21" y2="9" strokeWidth="2.5" />
                </svg>
              </ToolbarButton>
              <ToolbarButton
                onClick={deleteTable}
                title="Delete table"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="7" y1="7" x2="17" y2="17" strokeWidth="2.5" />
                  <line x1="17" y1="7" x2="7" y2="17" strokeWidth="2.5" />
                </svg>
              </ToolbarButton>
            </>
          )}
        </div>
      )}

      {/* Editor */}
      <div className={`relative ${!content && !editor.isFocused ? 'tiptap-empty' : ''}`}>
        <EditorContent editor={editor} />
        {!content && !editor.isFocused && editable && (
          <div className="absolute top-3 left-4 text-neutral-400 pointer-events-none">
            {placeholder}
          </div>
        )}
      </div>

      {/* Tiptap styles */}
      <style>{`
        .ProseMirror {
          min-height: 200px;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          color: #9ca3af;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .ProseMirror ul[data-type="taskList"] {
          list-style: none;
          padding: 0;
        }
        .ProseMirror ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
        }
        .ProseMirror ul[data-type="taskList"] li > label {
          flex-shrink: 0;
          user-select: none;
        }
        .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"] {
          width: 1rem;
          height: 1rem;
          margin-top: 0.25rem;
          cursor: pointer;
          accent-color: #3b82f6;
        }
        .ProseMirror ul[data-type="taskList"] li > div {
          flex: 1;
        }
        .ProseMirror table {
          border-collapse: collapse;
          margin: 1rem 0;
          overflow: hidden;
          width: 100%;
        }
        .ProseMirror table td,
        .ProseMirror table th {
          border: 1px solid #e5e7eb;
          padding: 0.5rem;
          position: relative;
          vertical-align: top;
          min-width: 100px;
        }
        .ProseMirror table th {
          background-color: #f9fafb;
          font-weight: 600;
        }
        .ProseMirror table .selectedCell {
          background-color: #dbeafe;
        }
        .ProseMirror h1 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        .ProseMirror h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        .ProseMirror h3 {
          font-size: 1.125rem;
          font-weight: 600;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
      `}</style>
    </div>
  )
}

interface ToolbarButtonProps {
  onClick: () => void
  isActive?: boolean
  title: string
  children: React.ReactNode
}

function ToolbarButton({ onClick, isActive, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`
        p-1.5 rounded transition-colors
        ${isActive
          ? 'bg-neutral-200 text-neutral-900'
          : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700'
        }
      `}
    >
      {children}
    </button>
  )
}
