-- Quotations (BOQ format, like the Platinum Ventures xlsx).
-- Run this in the Supabase SQL Editor, or ask Muse to run it with the DB password.
create table if not exists quotations (
  id uuid primary key default gen_random_uuid(),
  ref_no text unique not null,
  client_name text not null,
  phone text,
  email text,
  project text,
  site text,
  location text,
  title text not null default 'Interior',
  items jsonb not null default '[]',
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  total numeric not null default 0,
  terms text,
  status text not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table quotations enable row level security;
-- No public policies: the service_role key used by Netlify Functions bypasses RLS.

create index if not exists quotations_ref_idx on quotations (ref_no);
create index if not exists quotations_status_idx on quotations (status, created_at desc);
