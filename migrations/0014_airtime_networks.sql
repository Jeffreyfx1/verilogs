create table if not exists shop_airtime_networks (
  id text primary key,
  brand text not null,
  name text not null,
  image_url text not null default '',
  enabled boolean not null default false,
  min_amount integer not null default 50,
  max_amount integer not null default 50000,
  profit_naira integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists shop_airtime_networks_brand on shop_airtime_networks (brand);

create table if not exists shop_airtime_routes (
  id text primary key,
  network_id text not null references shop_airtime_networks (id) on delete cascade,
  provider_id text not null,
  provider_network_id text not null default '',
  purchase_path text not null default '',
  auth_header text not null default 'Authorization',
  auth_prefix text not null default 'Token',
  network_field text not null default 'network',
  phone_field text not null default 'phone',
  amount_field text not null default 'amount',
  ref_field text not null default 'ref',
  extra_json text not null default '{}',
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (network_id, provider_id)
);

insert into shop_airtime_networks (id, brand, name, sort_order, enabled)
values
  ('air-mtn', 'mtn', 'MTN', 1, false),
  ('air-airtel', 'airtel', 'Airtel', 2, false),
  ('air-glo', 'glo', 'Glo', 3, false),
  ('air-9mobile', '9mobile', '9mobile', 4, false)
on conflict (id) do nothing;
