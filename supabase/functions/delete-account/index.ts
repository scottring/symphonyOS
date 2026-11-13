import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleDeleteAccount } from './handler.ts'

const BUCKETS = ['attachments', 'asset-photos']
const BATCH = 100

type Admin = ReturnType<typeof createClient>

/** Every object path under `prefix/` (recursing into folders, which list with a null id). */
async function listAll(admin: Admin, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = []
  const PAGE = 100
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: PAGE, offset })
    if (error) throw error
    const entries = data ?? []
    for (const entry of entries) {
      const full = `${prefix}/${entry.name}`
      if (entry.id === null) paths.push(...(await listAll(admin, bucket, full)))
      else paths.push(full)
    }
    if (entries.length < PAGE) break
  }
  return paths
}

const adminClient = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

Deno.serve((req) =>
  handleDeleteAccount(req, {
    userFor: async (authorization) => {
      const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authorization } },
      })
      const {
        data: { user },
        error,
      } = await db.auth.getUser(authorization.replace(/^Bearer\s+/i, ''))
      if (error || !user) return null
      return { id: user.id, isAnonymous: user.is_anonymous === true }
    },
    removeFiles: async (userId) => {
      const admin = adminClient()
      for (const bucket of BUCKETS) {
        const paths = await listAll(admin, bucket, userId)
        for (let i = 0; i < paths.length; i += BATCH) {
          const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + BATCH))
          if (error) throw error
        }
      }
    },
    deleteData: async (userId) => {
      const { data, error } = await adminClient().rpc('delete_account_data', { p_user: userId })
      if (error) throw error
      const ids = (data as { display_user_ids?: unknown } | null)?.display_user_ids
      return { display_user_ids: Array.isArray(ids) ? (ids as string[]) : [] }
    },
    deleteAuthUser: async (userId) => {
      const { error } = await adminClient().auth.admin.deleteUser(userId)
      if (error) throw error
    },
  }),
)
