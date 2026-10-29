// Small database helper for setup tasks. Reads credentials from .env.local.
//   node scripts/db.mjs ping
//   node scripts/db.mjs apply supabase/schema.sql
//   node scripts/db.mjs sql "select * from game"
//   node scripts/db.mjs set-admin-key <key>
//   node scripts/db.mjs import-questions src/data/questions.sample.ts [--reset]
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { connect } from './lib-db.mjs'

const [cmd, arg] = process.argv.slice(2)
const { client, host } = await connect()
try {
  if (cmd === 'ping') {
    const { rows } = await client.query(
      "select version(), datcollate, datlocprovider, (select count(*) from pg_collation where collname = 'und-x-icu') as icu from pg_database where datname = current_database()",
    )
    console.log('connected via', host, rows[0])
  } else if (cmd === 'apply') {
    await client.query(readFileSync(arg, 'utf8'))
    console.log('applied', arg)
  } else if (cmd === 'sql') {
    const res = await client.query(arg)
    console.log(JSON.stringify(res.rows ?? res, null, 2))
  } else if (cmd === 'import-questions') {
    // Accepts a .json array or a module whose first export is an array of
    // { id?, text, options, correct (0-based), keepOrder? }.
    const source = arg.endsWith('.json')
      ? JSON.parse(readFileSync(arg, 'utf8'))
      : Object.values(await import(pathToFileURL(resolve(arg)).href))[0]
    const questions = source.map((q, i) => ({
      id: q.id ?? `q${String(i + 1).padStart(2, '0')}`,
      position: i + 1,
      text: q.text.trim(),
      options: q.options.map((o) => String(o).trim()),
      correct: q.correct,
      keepOrder: !!q.keepOrder,
    }))
    await client.query('begin')
    const { rows } = await client.query('select count(*)::int as n from attempts')
    if (rows[0].n > 0 && process.argv[4] !== '--reset') throw new Error(`${rows[0].n} attempts exist; rerun with --reset to wipe them`)
    await client.query('delete from attempts where true')
    await client.query("update game set status = 'waiting', opened_at = null, ends_at = null, results_revealed = false where id = 1")
    await client.query('delete from questions where true')
    for (const q of questions) {
      await client.query('insert into questions (id, position, text, options, correct, keep_order) values ($1, $2, $3, $4, $5, $6)', [
        q.id,
        q.position,
        q.text,
        q.options,
        q.correct,
        q.keepOrder,
      ])
    }
    await client.query('commit')
    console.log('imported', questions.length, 'questions')
  } else if (cmd === 'set-admin-key') {
    await client.query("update app_config set admin_key_hash = extensions.crypt($1, extensions.gen_salt('bf')) where id = 1", [arg])
    console.log('admin key updated')
  } else {
    console.log('unknown command')
  }
} finally {
  await client.end()
}
