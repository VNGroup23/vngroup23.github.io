// End-to-end check of the database API, calling it as the public `anon` role the app uses.
// It plays a short game and then RESETS the game, so it refuses to run while real
// attempts exist unless given --force.
//   node scripts/smoke-test.mjs [--force]
import { connect, env } from './lib-db.mjs'

const { client } = await connect()
const KEY = env.ADMIN_KEY
let failures = 0

const check = (label, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
}
const call = async (fn, ...args) => {
  const params = args.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await client.query(`select public.${fn}(${params}) as r`, args)
  return rows[0].r
}
const error = async (fn, ...args) => {
  try {
    await call(fn, ...args)
    return null
  } catch (e) {
    return e.message
  }
}

try {
  const { rows } = await client.query('select count(*)::int as n from attempts')
  if (rows[0].n > 0 && !process.argv.includes('--force')) throw new Error(`${rows[0].n} attempts exist — rerun with --force to wipe them`)
  const { rows: key } = await client.query('select q.id, q.correct, q.keep_order, cardinality(q.options) as n from questions q')
  const correct = Object.fromEntries(key.map((r) => [r.id, r.correct]))
  const { rows: cfg } = await client.query('select entry_code from app_config where id = 1')
  const ENTRY = cfg[0].entry_code
  const optionCount = Object.fromEntries(key.map((r) => [r.id, r.n]))
  const total = key.length
  const passing = Math.ceil(total * 0.8)

  await client.query('set role anon')
  await call('admin_reset', KEY)

  check('anon cannot read questions', (await error('get_state').then(() => client.query('select * from questions').then(() => null).catch((e) => e.message)))?.includes('permission denied'))
  check('anon cannot read attempts', (await client.query('select * from attempts').then(() => null).catch((e) => e.message))?.includes('permission denied'))
  check('state starts waiting', (await call('get_state')).status === 'waiting')
  check('departments', JSON.stringify(await call('get_departments')) === '["IT"]')
  check('entry code from the QR is accepted', (await call('check_entry', ENTRY.toLowerCase())) === true)
  check('wrong entry code is rejected', (await call('check_entry', 'SAIMA234')) === false)
  check('joining without the QR code is refused', (await error('join_game', 'Nguyễn Văn Ấn', '0912345678', 'IT', 'SAIMA234', null)) === 'BAD_ENTRY')
  check('rejects one-word name', (await error('join_game', 'An', '0912345678', 'IT', ENTRY, null)) === 'INVALID_NAME')
  check('rejects name with digits', (await error('join_game', 'Nguyễn Văn 2', '0912345678', 'IT', ENTRY, null)) === 'INVALID_NAME')
  check('rejects short phone', (await error('join_game', 'Nguyễn Văn Ấn', '091234', 'IT', ENTRY, null)) === 'INVALID_PHONE')
  check('rejects unknown department', (await error('join_game', 'Nguyễn Văn Ấn', '0912345678', 'Kế toán', ENTRY, null)) === 'INVALID_DEPARTMENT')

  const a = await call('join_game', '  Nguyễn   Văn Ấn ', '0912 345 678', 'IT', ENTRY, 'smoke-test')
  check('joins with Vietnamese name, normalised', a.player.name === 'Nguyễn Văn Ấn' && a.player.phone === '0912345678', a.code)
  const again = await call('join_game', 'nguyễn văn ấn', '+84912345678', 'IT', ENTRY, null)
  check('same phone + same name (any case) resumes', again.token === a.token)
  check('same phone + other name is refused', (await error('join_game', 'Trần Thị Bé', '0912345678', 'IT', ENTRY, null)) === 'PHONE_TAKEN')
  check('quiz locked before opening', (await error('get_quiz', a.token)) === 'NOT_OPEN')
  check('wrong admin key is refused', (await error('admin_open', 'nope')) === 'FORBIDDEN')

  const opened = await call('admin_open', KEY)
  check('admin opens the game', opened.status === 'open' && opened.endsAt - opened.openedAt === 1200000)
  check('cannot open twice', (await error('admin_open', KEY)) === 'NOT_WAITING')

  const quiz = await call('get_quiz', a.token)
  check(`quiz has all ${total} questions`, quiz.questions.length === total && quiz.questions.every((q) => q.options.length === optionCount[q.id]))
  check('quiz payload has no answer key', !JSON.stringify(quiz).includes('correct'))
  for (const k of key.filter((r) => r.keep_order)) {
    const q = quiz.questions.find((x) => x.id === k.id)
    check(`${k.id} keeps its option order`, q.options.map((o) => o.id).join() === Array.from({ length: k.n }, (_, i) => `${k.id}:${i}`).join())
  }

  const b = await call('join_game', 'Trần Thị Bích Ngọc', '0987654321', 'IT', ENTRY, null)
  const c = await call('join_game', 'Lê Văn Chậm', '0977000111', 'IT', ENTRY, null)
  const order = await call('get_quiz', b.token)
  check('players get different question orders', order.questions.map((q) => q.id).join() !== quiz.questions.map((q) => q.id).join())

  // a: all but one right; b: exactly the pass mark; c: 10 right and never submits.
  const answer = async (token, qs, nRight) => {
    for (const [i, q] of qs.entries()) {
      const idx = i < nRight ? correct[q.id] : (correct[q.id] + 1) % optionCount[q.id]
      await call('save_answer', token, q.id, `${q.id}:${idx}`)
    }
  }
  await answer(a.token, quiz.questions, total - 1)
  await answer(b.token, order.questions, passing)
  await answer(c.token, (await call('get_quiz', c.token)).questions.slice(0, 12), 10)
  check('rejects an option from another question', (await error('save_answer', a.token, 'q01', 'q02:0')) === 'NOT_FOUND')
  check('resume returns saved answers', Object.keys((await call('get_quiz', a.token)).answers).length === total)

  const subA = await call('submit_attempt', a.token)
  check('submit sets time, not auto', subA.submittedAt && subA.autoSubmitted === false)
  check('no answers after submitting', (await error('save_answer', a.token, 'q01', 'q01:0')) === 'ALREADY_SUBMITTED')
  await call('submit_attempt', b.token)

  await call('admin_set_remaining', KEY, 65)
  const late = await call('get_state')
  check('rehearsal: 65 s left', Math.abs(late.endsAt - late.serverNow - 65000) < 3000)
  await call('admin_close', KEY)
  check('closed game refuses new players', (await error('join_game', 'Phạm Văn Muộn', '0933222111', 'IT', ENTRY, null)) === 'GAME_CLOSED')
  const settled = await call('get_attempt', c.token)
  check('closing auto-submits the unsubmitted', settled.submittedAt && settled.autoSubmitted === true)

  const results = await call('admin_results', KEY)
  const byName = Object.fromEntries(results.map((r) => [r.name, r]))
  check(`a ranks 1st with ${total - 1}/${total}`, byName['Nguyễn Văn Ấn'].rank === 1 && byName['Nguyễn Văn Ấn'].correct === total - 1)
  check(`b ranks 2nd at the pass mark ${passing}/${total}`, byName['Trần Thị Bích Ngọc'].rank === 2 && byName['Trần Thị Bích Ngọc'].correct === passing)
  check('c is below 80% and unranked', byName['Lê Văn Chậm'].rank === null && byName['Lê Văn Chậm'].correct === 10)

  await call('admin_disqualify', KEY, byName['Nguyễn Văn Ấn'].id, 'Khai sai thông tin')
  const after = Object.fromEntries((await call('admin_results', KEY)).map((r) => [r.name, r]))
  check('disqualifying a moves b up to 1st', after['Nguyễn Văn Ấn'].rank === null && after['Trần Thị Bích Ngọc'].rank === 1)
  check('answer log kept every change', (await call('admin_answer_log', KEY)).length === total + total + 12)
} catch (e) {
  failures++
  console.error('✗ crashed:', e.message)
} finally {
  await client.query('reset role').catch(() => {})
  await client.query('select public.admin_reset($1)', [KEY]).catch(() => {})
  await client.end()
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed (game reset to waiting)')
  process.exitCode = failures ? 1 : 0
}
