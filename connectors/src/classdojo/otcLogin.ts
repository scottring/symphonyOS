// ONE-TIME ClassDojo login, run by a human on the Fly machine:
//
//   fly ssh console --app symphony-connectors
//   cd /app && node --experimental-strip-types src/classdojo/otcLogin.ts
//
// ClassDojo treats a login from a datacenter IP as anomalous and emails a
// one-time code. This requests that code, waits for you to type it in, and
// writes the resulting session cookie to the volume — so the connector never
// needs the password again on this machine, across restarts and deploys.
import { createInterface } from 'node:readline/promises'
import { join } from 'node:path'
import { loadConfig } from '../config.ts'
import { SessionStore } from './session.ts'
import { makeClassDojoClient } from './client.ts'

const config = loadConfig(process.env)
if (!config.classdojoEmail || !config.classdojoPassword) {
  console.error('CLASSDOJO_EMAIL / CLASSDOJO_PASSWORD are not set on this machine.')
  process.exit(1)
}

const sessionStore = new SessionStore(join(config.stateDir, 'classdojo-session.json'))
await sessionStore.load()

const client = makeClassDojoClient({
  email: config.classdojoEmail,
  password: config.classdojoPassword,
  sessionStore,
})

console.log('requesting a one-time code from ClassDojo...')
await client.requestCode()
console.log(`code sent to ${config.classdojoEmail}. check email.`)

const rl = createInterface({ input: process.stdin, output: process.stdout })
const code = (await rl.question('one-time code: ')).trim()
rl.close()

await client.loginWithCode(code)
console.log('logged in. session written to the volume — the connector will reuse it.')

// Prove it actually works before declaring victory.
const posts = await client.fetchPostsSince(null)
console.log(`verified: fetched ${posts.length} post(s) from the story feed.`)
