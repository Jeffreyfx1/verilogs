alter table shop_products add column if not exists image_url text not null default '';

create table if not exists shop_log_providers (
  id text primary key,
  name text not null,
  base_url text not null,
  api_key text not null default '',
  products_path text not null default '/listings',
  method text not null default 'GET',
  auth_method text not null default 'header',
  api_key_header text not null default 'X-API-Key',
  extra_headers text not null default '{}',
  query_json text not null default '{}',
  body_json text not null default '{}',
  pagination_json text not null default '{}',
  field_map text not null default '{}',
  enabled boolean not null default true,
  currency text not null default 'USD',
  usd_rate integer not null default 0,
  provider_id text not null default '',
  last_status text not null default '',
  last_error text not null default '',
  last_imported integer not null default 0,
  last_page integer not null default 0,
  updated_at text not null default ''
);

create table if not exists shop_referrals (
  id text primary key,
  referrer_id text not null,
  referred_id text not null unique,
  code text not null,
  status text not null,
  reward integer not null default 0,
  order_id text not null default '',
  created_at text not null,
  rewarded_at text not null default '',
  note text not null default ''
);

create table if not exists shop_referral_balances (
  user_id text primary key,
  balance integer not null default 0
);

create table if not exists shop_referral_ledger (
  id text primary key,
  user_id text not null,
  amount integer not null,
  ref text not null,
  note text not null default '',
  created_at text not null
);

create unique index if not exists shop_referral_ledger_ref on shop_referral_ledger (ref) where ref <> '';
