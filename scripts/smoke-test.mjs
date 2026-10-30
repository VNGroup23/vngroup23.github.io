// End-to-end check of the database API, calling it as the public `anon` role the app uses.
// Everything runs in one transaction that is rolled back, so real attempts are untouched.
// Inside it now() stands still at the transaction start.
//   node scripts/smoke-test.mjs
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
// An error aborts the transaction, so calls expected to fail run under a savepoint.
const error = async (run) => {
  await client.query('savepoint step')
  try {
    await run()
    await client.query('release savepoint step')
    return null
  } catch (e) {
    await client.query('rollback to savepoint step')
    return e.message
  }
}
const callError = (fn, ...args) => error(() => call(fn, ...args))
const asOwner = async (sql, args) => {
  await client.query('reset role')
  await client.query(sql, args)
  await client.query('set role anon')
}

try {
  await client.query('begin')
  const { rows: key } = await client.query('select q.id, q.correct, q.keep_order, cardinality(q.options) as n from questions q')
  const correct = Object.fromEntries(key.map((r) => [r.id, r.correct]))
  const { rows: cfg } = await client.query('select entry_code from app_config where id = 1')
  const ENTRY = cfg[0].entry_code
  const optionCount = Object.fromEntries(key.map((r) => [r.id, r.n]))
  const total = key.length
  const passing = Math.ceil(total * 0.8)

  await client.query('set role anon')
  await call('admin_reset', KEY)

  check('anon cannot read questions', (await error(() => client.query('select * from questions')))?.includes('permission denied'))
  check('anon cannot read attempts', (await error(() => client.query('select * from attempts')))?.includes('permission denied'))
  check('state starts waiting', (await call('get_state')).status === 'waiting')
  check('departments', JSON.stringify(await call('get_departments')) === '["IT"]')
  check('entry code from the QR is accepted', (await call('check_entry', ENTRY.toLowerCase())) === true)
  check('wrong entry code is rejected', (await call('check_entry', 'SAIMA234')) === false)
  check('joining without the QR code is refused', (await callError('join_game', 'Nguyễn Văn Ấn', '0912345678', 'IT', 'SAIMA234', null)) === 'BAD_ENTRY')
  check('rejects one-word name', (await callError('join_game', 'An', '0912345678', 'IT', ENTRY, null)) === 'INVALID_NAME')
  check('rejects name with digits', (await callError('join_game', 'Nguyễn Văn 2', '0912345678', 'IT', ENTRY, null)) === 'INVALID_NAME')
  check('rejects short phone', (await callError('join_game', 'Nguyễn Văn Ấn', '091234', 'IT', ENTRY, null)) === 'INVALID_PHONE')
  check('rejects unknown department', (await callError('join_game', 'Nguyễn Văn Ấn', '0912345678', 'Kế toán', ENTRY, null)) === 'INVALID_DEPARTMENT')

  const a = await call('join_game', '  Nguyễn   Văn Ấn ', '0912 345 678', 'IT', ENTRY, 'smoke-test')
  check('joins with Vietnamese name, normalised', a.player.name === 'Nguyễn Văn Ấn' && a.player.phone === '0912345678', a.code)
  const again = await call('join_game', 'nguyễn văn ấn', '+84912345678', 'IT', ENTRY, null)
  check('same phone + same name (any case) resumes', again.token === a.token)
  check('same phone + other name is refused', (await callError('join_game', 'Trần Thị Bé', '0912345678', 'IT', ENTRY, null)) === 'PHONE_TAKEN')
  check('quiz locked before opening', (await callError('get_quiz', a.token)) === 'NOT_OPEN')
  check('wrong admin key is refused', (await callError('admin_open', 'nope')) === 'FORBIDDEN')

  const opened = await call('admin_open', KEY)
  check('admin opens the game', opened.status === 'open' && opened.endsAt - opened.openedAt === 1200000)
  check('cannot open twice', (await callError('admin_open', KEY)) === 'NOT_WAITING')

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
  check('rejects an option from another question', (await callError('save_answer', a.token, 'q01', 'q02:0')) === 'NOT_FOUND')
  check('resume returns saved answers', Object.keys((await call('get_quiz', a.token)).answers).length === total)

  const subA = await call('submit_attempt', a.token)
  check('submit sets time, not auto', subA.submittedAt && subA.autoSubmitted === false)
  check('no answers after submitting', (await callError('save_answer', a.token, 'q01', 'q01:0')) === 'ALREADY_SUBMITTED')
  await call('submit_attempt', b.token)

  await call('admin_set_remaining', KEY, 65)
  const { rows: left } = await client.query('select extract(epoch from ends_at - now())::int as s from game')
  check('rehearsal: 65 s left', left[0].s === 65)
  await call('admin_close', KEY)
  check('closed game refuses new players', (await callError('join_game', 'Phạm Văn Muộn', '0933222111', 'IT', ENTRY, null)) === 'GAME_CLOSED')
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

  // Test mode: no lobby, each player has their own window from joining.
  await call('admin_reset', KEY)
  const t0 = await call('join_game', 'Đỗ Thị Thử', '0966555444', 'IT', ENTRY, null)
  check('waiting player has no deadline yet', t0.deadline === null)
  const on = await call('admin_set_test_mode', KEY, true)
  check('test mode: game counts as open', on.status === 'open' && on.testMode === true && on.endsAt === null)
  check('test mode: the real game cannot be opened', (await callError('admin_open', KEY)) === 'NOT_WAITING')
  check('test mode: lobby player gets own deadline', (await call('get_attempt', t0.token)).deadline !== null)
  const t1 = await call('join_game', 'Hoàng Văn Thử', '0955444333', 'IT', ENTRY, null)
  check('test mode: own 20 minutes from joining', t1.deadline - t1.enteredAt === 1200000)
  const tq = await call('get_quiz', t1.token)
  check('test mode: quiz opens right away', tq.questions.length === total)
  await call('save_answer', t1.token, tq.questions[0].id, `${tq.questions[0].id}:0`)
  await asOwner("update attempts set entered_at = now() - interval '21 minutes' where token = $1", [t1.token])
  check('test mode: answers refused once own time is up', (await callError('save_answer', t1.token, tq.questions[1].id, `${tq.questions[1].id}:0`)) === 'NOT_OPEN')
  const t1Settled = await call('get_attempt', t1.token)
  check('test mode: own time up auto-submits at the deadline', t1Settled.autoSubmitted === true && t1Settled.submittedAt === t1Settled.deadline)
  check('test mode: others keep playing', (await call('get_attempt', t0.token)).submittedAt === null)
  check('test mode: timed-out player is ranked by own window', (await call('admin_results', KEY)).find((r) => r.code === t1.code).durationMs === 1200000)
  const off = await call('admin_set_test_mode', KEY, false)
  check('test mode off: rehearsal wiped, back to waiting', off.status === 'waiting' && off.testMode === false && off.lobbyCount === 0)
} catch (e) {
  failures++
  console.error('✗ crashed:', e.message)
} finally {
  await client.query('rollback').catch(() => {})
  await client.end()
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed (rolled back, nothing changed)')
  process.exitCode = failures ? 1 : 0
}
