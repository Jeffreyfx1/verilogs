create table if not exists shop_products (
  id text primary key,
  provider_id text not null,
  external_id text not null,
  category text not null,
  name text not null default '',
  service text not null default '',
  country text not null default '',
  network text not null default '',
  price integer not null default 0,
  cost integer not null default 0,
  stock integer not null default 0,
  operator text not null default '',
  rate integer not null default 0,
  rates text not null default '',
  enabled boolean not null default false,
  validity text not null default '',
  variable boolean not null default false,
  description text not null default '',
  sync text not null default '',
  unique (provider_id, external_id)
);

create index if not exists shop_products_browse on shop_products (provider_id, category, service);
