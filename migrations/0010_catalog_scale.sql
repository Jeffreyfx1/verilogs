-- Keyset pages and country lookups. Safe on every boot (if not exists).
create index if not exists shop_products_keyset on shop_products (service, name, id);
create index if not exists shop_products_category_keyset on shop_products (category, service, name, id);
create index if not exists shop_products_sub_keyset on shop_products (category, marketplace_subcategory, service, name, id);
create index if not exists shop_products_country on shop_products (category, country, price);

-- Trigram search when the server provides pg_trgm. A missing extension must not abort boot.
do $$
begin
  create extension if not exists pg_trgm;
  execute 'create index if not exists shop_products_name_trgm on shop_products using gin (name gin_trgm_ops)';
  execute 'create index if not exists shop_products_service_trgm on shop_products using gin (service gin_trgm_ops)';
exception when others then
  null;
end $$;

create table if not exists shop_balances (
  user_id text primary key,
  balance integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists shop_ledger (
  id text primary key,
  user_id text not null,
  kind text not null,
  amount integer not null,
  balance_after integer not null default 0,
  note text not null default '',
  ref text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists shop_ledger_ref on shop_ledger (ref) where ref <> '';

create table if not exists shop_idempotency (
  key text primary key,
  user_id text not null,
  product_id text not null default '',
  amount integer not null default 0,
  status text not null,
  order_id text not null default '',
  provider_order_id text not null default '',
  detail text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists shop_idempotency_status on shop_idempotency (status, created_at);
