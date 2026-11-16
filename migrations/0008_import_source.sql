alter table shop_products add column if not exists import_type text not null default '';
alter table shop_products add column if not exists server_id text not null default '';

create index if not exists shop_products_source on shop_products (import_type, category, server_id);

create table if not exists shop_catalog_backups (
  id text primary key,
  taken_at timestamptz not null default now(),
  note text not null default '',
  products_json text not null,
  product_count integer not null default 0
);
