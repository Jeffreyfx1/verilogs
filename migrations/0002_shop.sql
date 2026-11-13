create table if not exists shop_state (
  id text primary key,
  doc text not null,
  updated_at timestamptz not null default now()
);

create table if not exists shop_sessions (
  token text primary key,
  user_id text,
  draft text,
  created_at timestamptz not null default now()
);

create table if not exists provider_keys (
  provider_id text primary key,
  api_key text not null
);
