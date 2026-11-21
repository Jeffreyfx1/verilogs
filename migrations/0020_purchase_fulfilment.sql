-- Purchase delivery and webhook event log. Creates tables only.
create table if not exists shop_fulfilments (
  order_id text primary key,
  user_id text not null,
  category text not null default '',
  title text not null default '',
  provider_id text not null default '',
  provider text not null default '',
  provider_ref text not null default '',
  phone text not null default '',
  country text not null default '',
  service text not null default '',
  delivery text not null default '',
  messages text not null default '[]',
  status text not null default '',
  updated_at text not null default ''
);

create index if not exists shop_fulfilments_ref on shop_fulfilments (provider_ref);

create table if not exists shop_webhook_events (
  id text primary key,
  provider text not null,
  event_key text not null,
  status text not null,
  summary text not null default '',
  error text not null default '',
  duplicates integer not null default 0,
  created_at text not null,
  unique (provider, event_key)
);
