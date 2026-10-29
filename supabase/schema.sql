-- Thử thách 23 năm · database schema and API for Supabase (Postgres 17).
-- Safe to re-run. Every table has RLS on and no grants to the public roles; the app
-- only calls the SECURITY DEFINER functions below, so the answer key never leaves
-- the database and grading happens here.

-- ---- Tables -----------------------------------------------------------------------

create table if not exists public.app_config (
  id int primary key default 1 check (id = 1),
  admin_key_hash text
);
insert into public.app_config (id) values (1) on conflict do nothing;
-- Secret carried by the QR code on the event screen; joining requires it.
alter table public.app_config add column if not exists entry_code text;

create table if not exists public.game (
  id int primary key default 1 check (id = 1),
  status text not null default 'waiting' check (status in ('waiting', 'open', 'closed')),
  opened_at timestamptz,
  ends_at timestamptz,
  duration_seconds int not null default 1200,
  pass_rate numeric not null default 0.8,
  results_revealed boolean not null default false
);
insert into public.game (id) values (1) on conflict do nothing;

create table if not exists public.departments (
  name text primary key,
  position int not null default 0
);
insert into public.departments (name, position) values ('IT', 1) on conflict do nothing;

create table if not exists public.questions (
  id text primary key,
  position int not null,
  text text not null,
  options text[] not null check (cardinality(options) between 2 and 6),
  correct int not null, -- 0-based index into options
  keep_order boolean not null default false,
  check (correct >= 0 and correct < cardinality(options))
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  code text not null unique,
  name text not null,
  phone text not null unique,
  department text not null,
  entered_at timestamptz not null default now(),
  submitted_at timestamptz,
  auto_submitted boolean not null default false,
  question_order text[] not null,
  option_order jsonb not null, -- question id → option indexes in the order this player sees them
  user_agent text,
  disqualified boolean not null default false,
  disqualify_reason text
);

create table if not exists public.answers (
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  question_id text not null,
  option_index int not null,
  answered_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

-- Every answer change, kept for resolving complaints.
create table if not exists public.answer_log (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  question_id text not null,
  option_index int not null,
  at timestamptz not null default now()
);
create index if not exists answer_log_attempt_idx on public.answer_log (attempt_id);

alter table public.app_config enable row level security;
alter table public.game enable row level security;
alter table public.departments enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.answers enable row level security;
alter table public.answer_log enable row level security;

revoke all on public.app_config, public.game, public.departments, public.questions,
  public.attempts, public.answers, public.answer_log from anon, authenticated;

-- The game row holds only status and times; clients read it to get realtime updates.
grant select on public.game to anon, authenticated;
drop policy if exists "game row is public" on public.game;
create policy "game row is public" on public.game for select to anon, authenticated using (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game') then
    alter publication supabase_realtime add table public.game;
  end if;
end $$;

-- ---- Internal helpers ---------------------------------------------------------------

-- Random code from an alphabet without look-alikes (no 0/O, 1/I/L).
create or replace function public._random_code(n int) returns text
language sql volatile as $$
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, n)
$$;

update public.app_config set entry_code = public._random_code(8) where id = 1 and entry_code is null;

create or replace function public._ms(ts timestamptz) returns bigint
language sql stable as $$ select (extract(epoch from ts) * 1000)::bigint $$;

-- An open game whose time is up counts as closed even before anyone updates the row.
create or replace function public._status(g public.game) returns text
language sql stable as $$
  select case when g.status = 'open' and g.ends_at is not null and now() >= g.ends_at then 'closed' else g.status end
$$;

create or replace function public._attempt_json(a public.attempts) returns json
language sql stable as $$
  select json_build_object(
    'token', a.token,
    'code', a.code,
    'player', json_build_object('name', a.name, 'phone', a.phone, 'department', a.department),
    'enteredAt', public._ms(a.entered_at),
    'submittedAt', public._ms(a.submitted_at),
    'autoSubmitted', a.auto_submitted)
$$;

-- Once the game is closed, unsubmitted attempts count as submitted at closing time.
create or replace function public._settle_all() returns void
language sql security definer set search_path = public as $$
  update attempts a set submitted_at = g.ends_at, auto_submitted = true
  from game g
  where g.id = 1 and a.submitted_at is null and public._status(g) = 'closed'
$$;

create or replace function public._admin_ok(p_key text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((
    select admin_key_hash is not null and admin_key_hash = crypt(coalesce(p_key, ''), admin_key_hash)
    from app_config where id = 1), false)
$$;

create or replace function public._require_admin(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._admin_ok(p_key) then
    perform pg_sleep(1);
    raise exception 'FORBIDDEN';
  end if;
end $$;

-- ---- Player API ---------------------------------------------------------------------

create or replace function public.get_state() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'status', public._status(g),
    'openedAt', public._ms(g.opened_at),
    'endsAt', public._ms(g.ends_at),
    'lobbyCount', (select count(*) from attempts),
    'resultsRevealed', g.results_revealed,
    'serverNow', public._ms(clock_timestamp()))
  from game g where g.id = 1
$$;

create or replace function public.get_departments() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(name order by position, name), '{}') from departments
$$;

create or replace function public.check_entry(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select entry_code is not null and upper(trim(coalesce(p_code, ''))) = entry_code from app_config where id = 1), false)
$$;

drop function if exists public.join_game(text, text, text, text);
create or replace function public.join_game(p_name text, p_phone text, p_department text, p_entry text, p_user_agent text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_name text := regexp_replace(trim(normalize(coalesce(p_name, ''), NFC)), '\s+', ' ', 'g');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[\s.()-]', '', 'g');
  v_code text;
  v_game game;
  v_row attempts;
begin
  if not public.check_entry(p_entry) then raise exception 'BAD_ENTRY'; end if;
  if v_phone like '+84%' then v_phone := '0' || substr(v_phone, 4); end if;
  if v_phone !~ '^0[35789][0-9]{8}$' then raise exception 'INVALID_PHONE'; end if;
  if v_name !~ '^[[:alpha:]]+( [[:alpha:]]+)+$' or length(v_name) > 50 then raise exception 'INVALID_NAME'; end if;
  if not exists (select 1 from departments where name = p_department) then raise exception 'INVALID_DEPARTMENT'; end if;

  select * into v_row from attempts where phone = v_phone;
  if found then
    if lower(v_row.name) <> lower(v_name) then raise exception 'PHONE_TAKEN'; end if;
    perform public._settle_all();
    select * into v_row from attempts where id = v_row.id;
    return public._attempt_json(v_row);
  end if;

  select * into v_game from game where id = 1;
  if public._status(v_game) = 'closed' then raise exception 'GAME_CLOSED'; end if;
  if not exists (select 1 from questions) then raise exception 'NO_QUESTIONS'; end if;

  loop
    v_code := 'VN23-' || public._random_code(4);
    exit when not exists (select 1 from attempts where code = v_code);
  end loop;

  begin
    insert into attempts (token, code, name, phone, department, question_order, option_order, user_agent)
    values (
      encode(gen_random_bytes(16), 'hex'),
      v_code,
      v_name,
      v_phone,
      p_department,
      (select array_agg(id order by random()) from questions),
      (select jsonb_object_agg(q.id, (
         select jsonb_agg(i order by case when q.keep_order then i::float8 else random() end)
         from generate_series(0, cardinality(q.options) - 1) i))
       from questions q),
      left(p_user_agent, 300))
    returning * into v_row;
  exception when unique_violation then
    -- The same phone joined twice at once: hand back the attempt that won.
    select * into v_row from attempts where phone = v_phone;
    if not found then raise exception 'RETRY'; end if;
    if lower(v_row.name) <> lower(v_name) then raise exception 'PHONE_TAKEN'; end if;
  end;
  return public._attempt_json(v_row);
end $$;

create or replace function public.get_attempt(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare v attempts;
begin
  perform public._settle_all();
  select * into v from attempts where token = p_token;
  if not found then return null; end if;
  return public._attempt_json(v);
end $$;

create or replace function public.get_quiz(p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare v attempts; g game;
begin
  select * into v from attempts where token = p_token;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v.submitted_at is not null then raise exception 'ALREADY_SUBMITTED'; end if;
  select * into g from game where id = 1;
  if public._status(g) <> 'open' then raise exception 'NOT_OPEN'; end if;
  return json_build_object(
    'questions', (
      select json_agg(json_build_object(
        'id', q.id,
        'text', q.text,
        'options', (
          select json_agg(json_build_object('id', q.id || ':' || o.idx, 'text', q.options[o.idx::int + 1]) order by o.ord)
          from jsonb_array_elements_text(v.option_order -> q.id) with ordinality as o(idx, ord)))
        order by qo.ord)
      from unnest(v.question_order) with ordinality as qo(qid, ord)
      join questions q on q.id = qo.qid),
    'answers', coalesce(
      (select json_object_agg(x.question_id, x.question_id || ':' || x.option_index) from answers x where x.attempt_id = v.id),
      '{}'::json));
end $$;

create or replace function public.save_answer(p_token text, p_question_id text, p_option_id text) returns void
language plpgsql security definer set search_path = public as $$
declare v attempts; g game; v_idx int; v_count int;
begin
  select * into v from attempts where token = p_token;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v.submitted_at is not null then raise exception 'ALREADY_SUBMITTED'; end if;
  select * into g from game where id = 1;
  if public._status(g) <> 'open' then raise exception 'NOT_OPEN'; end if;
  if split_part(p_option_id, ':', 1) <> p_question_id or not (p_question_id = any (v.question_order)) then
    raise exception 'NOT_FOUND';
  end if;
  v_idx := nullif(regexp_replace(split_part(p_option_id, ':', 2), '\D', '', 'g'), '')::int;
  select cardinality(options) into v_count from questions where id = p_question_id;
  if v_idx is null or v_idx >= v_count then raise exception 'NOT_FOUND'; end if;

  insert into answers (attempt_id, question_id, option_index) values (v.id, p_question_id, v_idx)
  on conflict (attempt_id, question_id) do update set option_index = excluded.option_index, answered_at = now();
  insert into answer_log (attempt_id, question_id, option_index) values (v.id, p_question_id, v_idx);
end $$;

create or replace function public.submit_attempt(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare v attempts; g game;
begin
  select * into g from game where id = 1;
  -- A submit that lands within 1.5s of the deadline came from the client's own countdown.
  update attempts
  set submitted_at = least(now(), coalesce(g.ends_at, now())),
      auto_submitted = g.ends_at is not null and now() >= g.ends_at - interval '1.5 seconds'
  where token = p_token and submitted_at is null;
  select * into v from attempts where token = p_token;
  if not found then raise exception 'NOT_FOUND'; end if;
  return public._attempt_json(v);
end $$;

-- ---- BTC admin API (every call needs the admin key) ---------------------------------

create or replace function public.admin_check(p_key text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if public._admin_ok(p_key) then return true; end if;
  perform pg_sleep(1);
  return false;
end $$;

create or replace function public.admin_open(p_key text) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin(p_key);
  update game
  set status = 'open', opened_at = now(), ends_at = now() + make_interval(secs => duration_seconds), results_revealed = false
  where id = 1 and status = 'waiting';
  if not found then raise exception 'NOT_WAITING'; end if;
  return public.get_state();
end $$;

create or replace function public.admin_close(p_key text) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin(p_key);
  update game set status = 'closed', ends_at = least(coalesce(ends_at, now()), now()) where id = 1;
  perform public._settle_all();
  return public.get_state();
end $$;

-- Rehearsal helper: moves the deadline so `p_seconds` remain.
create or replace function public.admin_set_remaining(p_key text, p_seconds int) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin(p_key);
  update game
  set ends_at = now() + make_interval(secs => p_seconds),
      opened_at = now() + make_interval(secs => p_seconds) - make_interval(secs => duration_seconds)
  where id = 1 and status = 'open';
  return public.get_state();
end $$;

create or replace function public.admin_reveal(p_key text, p_on boolean) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin(p_key);
  update game set results_revealed = p_on where id = 1;
  return public.get_state();
end $$;

-- Wipes every attempt and puts the game back to "waiting" (for rehearsals).
create or replace function public.admin_reset(p_key text) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin(p_key);
  delete from attempts where true;
  update game set status = 'waiting', opened_at = null, ends_at = null, results_revealed = false where id = 1;
  return public.get_state();
end $$;

-- Ranking rule: submitted, not disqualified, at least pass_rate correct; then most
-- correct, fastest (submit time minus later of entry and opening), earliest entry.
create or replace function public.admin_results(p_key text) returns json
language plpgsql security definer set search_path = public as $$
declare v_total int; g game;
begin
  perform public._require_admin(p_key);
  perform public._settle_all();
  select count(*) into v_total from questions;
  select * into g from game where id = 1;
  return coalesce((
    with scored as (
      select a.*,
        (select count(*) from answers x join questions q on q.id = x.question_id
          where x.attempt_id = a.id and x.option_index = q.correct) as correct,
        (select count(*) from answers x where x.attempt_id = a.id) as answered,
        greatest(a.entered_at, coalesce(g.opened_at, a.entered_at)) as started_at
      from attempts a),
    flagged as (
      select s.*,
        (s.submitted_at is not null and not s.disqualified and v_total > 0 and s.correct >= v_total * g.pass_rate) as qualified,
        extract(epoch from (s.submitted_at - s.started_at)) * 1000 as duration_ms
      from scored s),
    ranked as (
      select f.*,
        case when f.qualified then row_number() over (partition by f.qualified order by f.correct desc, f.duration_ms, f.entered_at) end as rank
      from flagged f)
    select json_agg(json_build_object(
      'id', r.id, 'rank', r.rank, 'name', r.name, 'phone', r.phone, 'department', r.department, 'code', r.code,
      'correct', r.correct, 'answered', r.answered, 'total', v_total,
      'durationMs', round(r.duration_ms), 'enteredAt', public._ms(r.entered_at), 'submittedAt', public._ms(r.submitted_at),
      'autoSubmitted', r.auto_submitted, 'qualified', r.qualified,
      'disqualified', r.disqualified, 'disqualifyReason', r.disqualify_reason, 'userAgent', r.user_agent)
      order by r.rank nulls last, r.correct desc, r.duration_ms nulls last, r.entered_at)
    from ranked r), '[]'::json);
end $$;

-- p_reason null puts a disqualified player back into the ranking.
create or replace function public.admin_disqualify(p_key text, p_attempt_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin(p_key);
  update attempts set disqualified = p_reason is not null, disqualify_reason = p_reason where id = p_attempt_id;
end $$;

create or replace function public.admin_answer_log(p_key text) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin(p_key);
  return coalesce((
    select json_agg(json_build_object(
      'code', a.code, 'name', a.name, 'phone', a.phone, 'questionId', q.id, 'question', q.text,
      'answer', q.options[l.option_index + 1], 'isCorrect', l.option_index = q.correct, 'at', public._ms(l.at))
      order by a.code, l.at)
    from answer_log l
    join attempts a on a.id = l.attempt_id
    join questions q on q.id = l.question_id), '[]'::json);
end $$;

create or replace function public.admin_entry(p_key text) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin(p_key);
  return (select entry_code from app_config where id = 1);
end $$;

-- A new code makes every QR code printed so far stop working.
create or replace function public.admin_rotate_entry(p_key text) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  perform public._require_admin(p_key);
  update app_config set entry_code = public._random_code(8) where id = 1 returning entry_code into v_code;
  return v_code;
end $$;

create or replace function public.admin_set_departments(p_key text, p_names text[]) returns text[]
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin(p_key);
  delete from departments where true;
  insert into departments (name, position)
  select trim(n), ord from unnest(p_names) with ordinality as t(n, ord) where trim(n) <> ''
  on conflict do nothing;
  return public.get_departments();
end $$;

-- ---- Permissions --------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.get_state(),
  public.get_departments(),
  public.check_entry(text),
  public.join_game(text, text, text, text, text),
  public.get_attempt(text),
  public.get_quiz(text),
  public.save_answer(text, text, text),
  public.submit_attempt(text),
  public.admin_check(text),
  public.admin_open(text),
  public.admin_close(text),
  public.admin_set_remaining(text, int),
  public.admin_reveal(text, boolean),
  public.admin_reset(text),
  public.admin_results(text),
  public.admin_disqualify(text, uuid, text),
  public.admin_answer_log(text),
  public.admin_entry(text),
  public.admin_rotate_entry(text),
  public.admin_set_departments(text, text[])
to anon, authenticated;
