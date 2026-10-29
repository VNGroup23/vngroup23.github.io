import { readFileSync } from 'node:fs'
import pg from 'pg'

export const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

function candidates() {
  if (env.DATABASE_URL) return [env.DATABASE_URL]
  const ref = env.SUPABASE_REF
  const pass = env.DB_PASSWORD_ENC
  return [
    `postgresql://postgres:${pass}@db.${ref}.supabase.co:5432/postgres`,
    ...['aws-1', 'aws-0'].map((c) => `postgresql://postgres.${ref}:${pass}@${c}-ap-southeast-1.pooler.supabase.com:5432/postgres`),
  ]
}

export async function connect() {
  for (const url of candidates()) {
    const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 6000 })
    try {
      await client.connect()
      return { client, host: new URL(url).host }
    } catch (e) {
      await client.end().catch(() => {})
      if (process.env.DEBUG) console.error(new URL(url).host, '→', e.message)
    }
  }
  throw new Error('Could not connect to the database (set DEBUG=1 for details)')
}
