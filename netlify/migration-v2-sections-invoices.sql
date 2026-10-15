-- Woodex dashboard v2: sectioned templates/quotations, descriptions, versions, invoices.
-- Run ONCE in the Supabase SQL Editor (safe to re-run: all statements are idempotent).

-- ============ 1. quotation_templates: description + sections ============
alter table quotation_templates add column if not exists description text not null default '';
alter table quotation_templates add column if not exists sections jsonb not null default '[]'::jsonb;

-- Migrate existing flat items into one "General" section (only where sections empty).
update quotation_templates
set sections = jsonb_build_array(jsonb_build_object('name', 'General', 'items', items)),
    updated_at = now()
where sections = '[]'::jsonb and items <> '[]'::jsonb;

-- ============ 2. quotations: description + sections + versions ============
alter table quotations add column if not exists description text not null default '';
alter table quotations add column if not exists sections jsonb not null default '[]'::jsonb;
alter table quotations add column if not exists version int not null default 1;
alter table quotations add column if not exists parent_id uuid references quotations(id) on delete set null;
alter table quotations add column if not exists option_label text not null default '';

update quotations
set sections = jsonb_build_array(jsonb_build_object('name', 'General', 'items', items)),
    updated_at = now()
where sections = '[]'::jsonb and items <> '[]'::jsonb;

-- Versions share a ref_no: replace unique(ref_no) with unique(ref_no, version).
alter table quotations drop constraint if exists quotations_ref_no_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quotations_ref_version_unique') then
    alter table quotations add constraint quotations_ref_version_unique unique (ref_no, version);
  end if;
end $$;

create index if not exists quotations_parent_idx on quotations (parent_id);

-- ============ 3. invoices ============
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  inv_no text not null,
  version int not null default 1,
  quotation_id uuid references quotations(id) on delete set null,
  client_name text not null,
  phone text,
  email text,
  project text,
  site text,
  location text,
  title text not null default 'Invoice',
  description text not null default '',
  sections jsonb not null default '[]'::jsonb,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  total numeric not null default 0,
  amount_paid numeric not null default 0,
  payment_status text not null default 'unpaid',
  issue_date date not null default current_date,
  due_date date,
  terms text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_no_version_unique unique (inv_no, version)
);

alter table invoices enable row level security;
-- No public policies: only the service-role backend touches this table.

create index if not exists invoices_no_idx on invoices (inv_no);
create index if not exists invoices_pay_idx on invoices (payment_status, created_at desc);
create index if not exists invoices_quot_idx on invoices (quotation_id);

-- ============ 4. lead pipeline statuses ============
-- Normalize legacy statuses to the New → Contacted → Site Visit → Quoted → Won/Lost pipeline.
-- (enquiries / estimator_leads have no updated_at column, so it is not touched here.)
update enquiries set status = 'contacted' where status = 'in_progress';
update enquiries set status = 'won' where status = 'closed';
update estimator_leads set status = 'won' where status = 'closed';
