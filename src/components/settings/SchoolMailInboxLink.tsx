import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible'

export function SchoolMailInboxLink() {
  const [count, setCount] = useState(0)
  const refresh = useCallback(async () => {
    const { count, error } = await supabase.from('school_mail_reviews').select(
      'capture_id',
      { count: 'exact', head: true },
    ).eq('status', 'ready')
    if (!error) setCount(count ?? 0)
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  useRefreshOnVisible(refresh)
  if (!count) return null
  return (
    <Link
      to='/settings?tab=general#school-information'
      className='block rounded-xl border border-primary-100 bg-primary-50/40 p-4 my-4 text-sm'
    >
      <strong>School information ready to review</strong>
      <span className='block mt-1'>
        {count} {count === 1 ? 'email' : 'emails'}{' '}
        · Choose what to add to your plans →
      </span>
    </Link>
  )
}
