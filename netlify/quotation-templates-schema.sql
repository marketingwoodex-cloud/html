-- Woodex quotation templates: reusable per-work-type line items + terms.
-- Run in Supabase SQL Editor. One row per work type (Civil Work, Interior,
-- Fit-out, Renovation, Architecture, 3D Visualization, Furniture,
-- Design Consultancy). Dashboard seeds these from the built-in defaults.

create table if not exists quotation_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  items jsonb not null default '[]'::jsonb,
  terms text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table quotation_templates enable row level security;
-- No public policies: only the service-role backend touches this table.
