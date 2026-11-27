-- One row per Paystack reference. Status is the admin deposit list.
create table if not exists shop_deposits (
  reference text primary key,
  user_id text not null default '',
  credit integer not null default 0,
  charge integer not null default 0,
  product_id text not null default '',
  status text not null,
  paystack_status text not null default '',
  paystack_amount integer not null default 0,
  ledger_ref text not null default '',
  manual_ref text not null default '',
  detail text not null default '',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_deposits_status on shop_deposits (status, updated_at desc);
