import { Route, Routes, useParams } from 'react-router-dom'
import { ChoicePage } from '@/components/choices/ChoicePage'

function ChoiceRoute() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <div className="p-8 text-center text-neutral-500">This choice isn't available</div>
  return <ChoicePage key={id} id={id} />
}

/** The comparison lives at /choice/:id, its own page (it needs the width).
 *  The shell mounts this app under /choice, so its paths are relative. */
export function ChoicesApp() {
  return (
    <Routes>
      <Route path=":id" element={<ChoiceRoute />} />
      <Route path="*" element={<div className="p-8 text-center text-neutral-500">This choice isn't available</div>} />
    </Routes>
  )
}
