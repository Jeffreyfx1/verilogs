create table if not exists shop_catalog (
  id text primary key,
  doc text not null,
  updated_at timestamptz not null default now()
);
