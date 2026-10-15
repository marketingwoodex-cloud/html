-- WOODEX Dashboard — CONSOLIDATED MIGRATION (2026-09-27)
-- Run ONCE in the Supabase SQL editor (SQL > New query), then click Run.
-- Every statement is idempotent (IF NOT EXISTS), so it is safe to run again.
--
-- PART A: previously pending columns/tables
-- PART B: Master Blueprint tables (CRM, structured content, versions, SEO, menus)

---------------------------------------------------------------
-- PART A1: Media library — alt text + image dimensions
---------------------------------------------------------------
alter table media add column if not exists alt_text text;
alter table media add column if not exists width integer;
alter table media add column if not exists height integer;

---------------------------------------------------------------
-- PART A2: Projects publishing — published state + live slug
---------------------------------------------------------------
alter table projects add column if not exists published boolean not null default false;
alter table projects add column if not exists published_slug text;

---------------------------------------------------------------
-- PART A3: Dashboard users and roles (admin / editor / viewer)
-- Password hashes only; the functions use the service_role key
-- and bypass RLS. No public access policies are added.
---------------------------------------------------------------
create table if not exists cms_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  pass_sha256 text not null,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table cms_users enable row level security;

---------------------------------------------------------------
-- PART B: Master Blueprint — CRM, structured content, analytics,
-- versions, SEO, navigation
---------------------------------------------------------------

-- 1. Lead pipeline stage on enquiries (CRM funnel: new -> won/lost)
alter table enquiries add column if not exists pipeline_stage text not null default 'new';

-- 2. Media library folders
alter table media add column if not exists folder text not null default 'General';

-- 3. Clients
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);
alter table clients enable row level security;

-- 4. Site visits
create table if not exists site_visits (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid,
  client_name text not null,
  phone text,
  address text,
  visit_date timestamptz,
  notes text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'done', 'cancelled')),
  created_at timestamptz not null default now()
);
alter table site_visits enable row level security;

-- 5. Testimonials
create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  company text,
  photo text,
  rating int not null default 5,
  quote text not null,
  project text,
  service text,
  location text,
  featured boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now()
);
alter table testimonials enable row level security;

-- 6. Services (structured content type, published to /services/<slug>/)
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  category text,
  hero_title text,
  introduction text,
  benefits jsonb not null default '[]',
  process jsonb not null default '[]',
  deliverables jsonb not null default '[]',
  gallery jsonb not null default '[]',
  faqs jsonb not null default '[]',
  seo jsonb not null default '{}',
  published boolean not null default false,
  published_slug text,
  created_at timestamptz not null default now()
);
alter table services enable row level security;

-- 7. Locations (structured content type, published to /locations/<slug>/)
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  introduction text,
  services jsonb not null default '[]',
  faqs jsonb not null default '[]',
  map_url text,
  seo jsonb not null default '{}',
  published boolean not null default false,
  published_slug text,
  created_at timestamptz not null default now()
);
alter table locations enable row level security;

-- 8. Page view counter (built-in analytics)
create table if not exists page_views (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  viewed_at timestamptz not null default now()
);
alter table page_views enable row level security;

-- 9. Page version history (restore published pages)
create table if not exists page_versions (
  id uuid primary key default gen_random_uuid(),
  page_path text not null,
  html text not null,
  created_by text,
  note text,
  created_at timestamptz not null default now()
);
alter table page_versions enable row level security;

-- 10. SEO redirects
create table if not exists redirects (
  id uuid primary key default gen_random_uuid(),
  from_path text unique not null,
  to_path text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table redirects enable row level security;

-- 11. Navigation / mega menu items
create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  url text not null,
  parent_id uuid,
  position int not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);
alter table menu_items enable row level security;

-- Indexes
create index if not exists page_versions_path_created_idx
  on page_versions (page_path, created_at desc);
create index if not exists page_views_viewed_idx
  on page_views (viewed_at desc);
create index if not exists redirects_from_path_idx
  on redirects (from_path);
