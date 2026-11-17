import { useLogins } from '@/hooks/useLogins'
import { LoginsView } from './LoginsView'

export function LoginsApp() {
  const { logins, loading, error, addLogin, updateLogin, deleteLogin } = useLogins()
  return (
    <LoginsView
      logins={logins}
      loading={loading}
      error={error}
      onAdd={addLogin}
      onUpdate={updateLogin}
      onDelete={deleteLogin}
    />
  )
}
