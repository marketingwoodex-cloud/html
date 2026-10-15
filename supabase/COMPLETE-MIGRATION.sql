-- ============================================================================
-- WOODEX COMPLETE MIGRATION  (run once in Supabase SQL Editor)
-- ----------------------------------------------------------------------------
-- Fills the 8 tables that the application uses but that were never versioned
-- in the repo (audit finding: "schema drift"), and hardens every table with
-- RLS + no public policies. Safe to run against an existing database:
-- every statement is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
--
-- Existing files (supabase/woodex-consolidated-migration-2026-09-27.sql,
-- netlify/*.sql) remain valid; this file is the single source of truth for
-- everything else. Run AFTER those files if starting from empty.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. enquiries  (contact form + pipeline)
-- ---------------------------------------------------------------------------
create table if not exists public.enquiries (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  phone          text not null,
  email          text,
  project_type   text,
  message        text,
  source         text not null default 'website',
  status         text not null default 'new',
  pipeline_stage text not null default 'new',
  notes          text,
  client_id      uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.enquiries add column if not exists source         text not null default 'website';
alter table public.enquiries add column if not exists status         text not null default 'new';
alter table public.enquiries add column if not exists pipeline_stage text not null default 'new';
alter table public.enquiries add column if not exists notes          text;
alter table public.enquiries add column if not exists client_id      uuid;
alter table public.enquiries add column if not exists updated_at     timestamptz not null default now();
create index if not exists enquiries_created_at_idx     on public.enquiries (created_at desc);
create index if not exists enquiries_pipeline_stage_idx on public.enquiries (pipeline_stage);
create index if not exists enquiries_status_idx         on public.enquiries (status);

-- ---------------------------------------------------------------------------
-- 2. estimator_leads  (cost-estimator funnel)
-- ---------------------------------------------------------------------------
create table if not exists public.estimator_leads (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  phone         text not null,
  email         text,
  service_type  text not null,
  area_sqft     integer,
  selections    jsonb not null default '{}'::jsonb,
  estimate_min  integer,
  estimate_max  integer,
  status        text not null default 'new',
  source_page   text,
  created_at    timestamptz not null default now()
);
alter table public.estimator_leads add column if not exists source_page text;
create index if not exists estimator_leads_created_at_idx on public.estimator_leads (created_at desc);
create index if not exists estimator_leads_status_idx     on public.estimator_leads (status);

-- ---------------------------------------------------------------------------
-- 3. activity  (dashboard feed + audit trail + login-fail rate limiting)
-- ---------------------------------------------------------------------------
create table if not exists public.activity (
  id         bigserial primary key,
  kind       text not null,
  text       text not null,
  meta       jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_kind_text_created_idx on public.activity (kind, text, created_at desc);
create index if not exists activity_created_at_idx         on public.activity (created_at desc);

-- ---------------------------------------------------------------------------
-- 3b. page_views: anonymous visitor id (unique-visitor analytics)
-- ---------------------------------------------------------------------------
alter table public.page_views add column if not exists vid text;
create index if not exists page_views_created_at_idx on public.page_views (created_at desc);
create index if not exists page_views_vid_idx on public.page_views (vid);

-- ---------------------------------------------------------------------------
-- 4. blog_posts  (Insights CMS)
-- ---------------------------------------------------------------------------
create table if not exists public.blog_posts (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  slug         text not null unique,
  excerpt      text,
  cover_image  text,
  content      jsonb,
  status       text not null default 'draft',
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.blog_posts add column if not exists cover_image text;
alter table public.blog_posts add column if not exists content     jsonb;
create index if not exists blog_posts_status_idx on public.blog_posts (status);

-- ---------------------------------------------------------------------------
-- 5. projects  (portfolio CMS)
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  slug           text not null unique,
  category       text,
  location       text,
  description    text,
  images         jsonb not null default '[]'::jsonb,
  status         text not null default 'draft',
  published      boolean not null default false,
  published_slug text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.projects add column if not exists published      boolean not null default false;
alter table public.projects add column if not exists published_slug text;
alter table public.projects add column if not exists images         jsonb not null default '[]'::jsonb;
create index if not exists projects_status_idx on public.projects (status);

-- ---------------------------------------------------------------------------
-- 6. team
-- ---------------------------------------------------------------------------
create table if not exists public.team (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  role       text,
  photo      text,
  phone      text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 7. media  (library)
-- ---------------------------------------------------------------------------
create table if not exists public.media (
  id         uuid primary key default gen_random_uuid(),
  url        text not null,
  filename   text,
  size_bytes bigint,
  alt_text   text,
  width      integer,
  height     integer,
  created_at timestamptz not null default now()
);
alter table public.media add column if not exists alt_text  text;
alter table public.media add column if not exists width     integer;
alter table public.media add column if not exists height    integer;
alter table public.media add column if not exists size_bytes bigint;
create index if not exists media_created_at_idx on public.media (created_at desc);

-- ---------------------------------------------------------------------------
-- 8. site_settings  (key/value, published to site files by Settings view)
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: enabled everywhere, service_role-only (no public policies).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'enquiries','estimator_leads','activity','blog_posts','projects',
    'team','media','site_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Explicitly drop any accidentally-public policies on these tables.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('enquiries','estimator_leads','activity','blog_posts',
                        'projects','team','media','site_settings')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;
