import type { PackingNode } from '@/types/trip'

interface PackingListDisplayProps {
  nodes: PackingNode[]
  editable?: boolean
  onToggleCheck?: (index: number) => void
  onEditNode?: (index: number, text: string) => void
  onDeleteNode?: (index: number) => void
}

export function PackingListDisplay({
  nodes,
  editable = false,
  onToggleCheck,
  onEditNode,
  onDeleteNode,
}: PackingListDisplayProps) {
  if (nodes.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No items yet.</p>
      </div>
    )
  }

  return (
    <div className="packing-list-container">
      {/* Mobile: Single column. Desktop: Multi-column grid */}
      <div className="md:columns-2 md:gap-8 space-y-2">
        {nodes.map((node, index) => (
          <div
            key={index}
            className={`
              ${node.type === 'heading' ? 'break-after-avoid' : ''}
              ${node.type === 'heading' && node.level <= 2 ? 'md:col-span-full' : ''}
            `}
          >
            {node.type === 'heading' ? (
              <div className={`
                font-display
                ${node.level === 1 ? 'text-3xl text-gray-900 mt-8 mb-4' : ''}
                ${node.level === 2 ? 'text-2xl text-gray-800 mt-6 mb-3' : ''}
                ${node.level === 3 ? 'text-xl font-semibold text-gray-800 mt-4 mb-2' : ''}
                ${node.level === 4 ? 'text-lg font-semibold text-gray-700 mt-3 mb-2' : ''}
              `}>
                {editable ? (
                  <input
                    type="text"
                    value={node.text}
                    onChange={(e) => onEditNode?.(index, e.target.value)}
                    className="w-full bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-green-500 rounded px-1"
                  />
                ) : (
                  node.text
                )}
              </div>
            ) : (
              <label className="flex items-start gap-3 py-2 px-1 hover:bg-green-50 rounded cursor-pointer group">
                <input
                  type="checkbox"
                  checked={node.checked || false}
                  onChange={() => onToggleCheck?.(index)}
                  className="mt-1 w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500 flex-shrink-0"
                />
                {editable ? (
                  <input
                    type="text"
                    value={node.text}
                    onChange={(e) => onEditNode?.(index, e.target.value)}
                    className="flex-1 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-green-500 rounded px-1"
                  />
                ) : (
                  <span className={`flex-1 ${node.checked ? 'line-through text-gray-500' : 'text-gray-700'}`}>
                    {node.text}
                  </span>
                )}
                {editable && (
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      onDeleteNode?.(index)
                    }}
                    className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 text-sm"
                  >
                    ×
                  </button>
                )}
              </label>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
