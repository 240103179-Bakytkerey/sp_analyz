-- SMART PRO кері байланыс платформасының бастапқы құрылымы.
-- Күндер 'YYYY-MM-DD' мәтіні ретінде сақталады (уақыт белдеуімен шатаспау үшін).

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  username text not null unique,
  display_name text not null,
  role text not null check (role in ('admin', 'mentor', 'viewer')),
  teacher_id text,
  scope jsonb not null default '{}'::jsonb,
  password_hash text not null,
  session_gen integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subjects (
  id text primary key,
  name text not null,
  short text not null,
  glyph text not null default '',
  glyphs text not null default '',
  sapaline_code text,
  platform_code text,
  max_scores jsonb not null default '{}'::jsonb,
  sort integer not null default 0,
  active boolean not null default true
);

create table if not exists streams (
  id text primary key,
  name text not null,
  short text not null,
  sort integer not null default 0,
  active boolean not null default true
);

create table if not exists combinations (
  id text primary key,
  code text not null unique,
  name text not null,
  note text not null default '',
  sort integer not null default 0,
  active boolean not null default true
);

create table if not exists teachers (
  id text primary key,
  full_name text not null,
  display text not null default '',
  aliases jsonb not null default '[]'::jsonb,
  photo text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Кім қай ағымда қай пәнді береді. valid_from / valid_to — қолданылу кезеңі (бос = шексіз).
create table if not exists assignments (
  id text primary key,
  teacher_id text not null references teachers(id),
  stream_id text not null references streams(id),
  subject_id text not null references subjects(id),
  valid_from text,
  valid_to text,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists assignments_slot on assignments(stream_id, subject_id);

-- Оқу кезеңдері: әр ағымның өз күнтізбесі. seq — нақты рет (алдыңғы кезең осыдан анықталады).
create table if not exists periods (
  id text primary key,
  stream_id text not null references streams(id),
  kind text not null check (kind in ('week', 'bt')),
  month integer,
  week integer,
  test_date text,
  label text not null,
  cohort text not null default '',
  date_from text,
  date_to text,
  seq integer not null,
  created_at timestamptz not null default now()
);
create unique index if not exists periods_week on periods(stream_id, kind, month, week) where kind = 'week';
create unique index if not exists periods_label on periods(stream_id, kind, label);

-- Бір есеп: ЛС/СТ — ағым × пән × кезең (мұғалім тағайындаудан, тарихи түрде сақталады);
-- БТ — ағым × кезең × scope ('all' немесе комбинация id).
create table if not exists reports (
  id text primary key,
  type text not null check (type in ('ls', 'st', 'bt')),
  stream_id text not null references streams(id),
  subject_id text references subjects(id),
  teacher_id text references teachers(id),
  period_id text not null references periods(id),
  scope text not null default 'all',
  status text not null default 'draft' check (status in ('draft', 'published')),
  version integer not null default 1,
  data jsonb not null,
  published jsonb,
  published_rev integer not null default 0,
  published_at timestamptz,
  published_by text,
  demo boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);
create unique index if not exists reports_key on reports(type, stream_id, coalesce(subject_id, ''), period_id, scope);

create table if not exists report_revisions (
  id serial primary key,
  report_id text not null references reports(id) on delete cascade,
  version integer not null,
  action text not null,
  status text not null,
  data jsonb not null,
  teacher_id text,
  actor text,
  at timestamptz not null default now()
);
create index if not exists report_revisions_report on report_revisions(report_id, id desc);

create table if not exists acknowledgements (
  user_id text not null references users(id),
  report_id text not null references reports(id) on delete cascade,
  published_rev integer not null,
  at timestamptz not null default now(),
  primary key (user_id, report_id, published_rev)
);

create table if not exists import_mappings (
  source text not null,
  key text not null,
  value jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (source, key)
);

create table if not exists import_runs (
  id serial primary key,
  source text not null,
  params jsonb not null default '{}'::jsonb,
  status text not null,
  summary jsonb not null default '{}'::jsonb,
  actor text,
  at timestamptz not null default now()
);

create table if not exists audit (
  id serial primary key,
  actor text,
  entity text not null,
  entity_id text,
  action text not null,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index if not exists audit_entity on audit(entity, entity_id);

create table if not exists photos (
  id text primary key,
  teacher_id text not null,
  content_type text not null,
  body bytea not null,
  created_at timestamptz not null default now()
);
