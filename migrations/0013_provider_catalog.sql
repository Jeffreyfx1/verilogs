create table if not exists shop_provider_fetch (
  id text primary key,
  method text not null default '',
  auth_kind text not null default '',
  header_name text not null default '',
  content_type text not null default '',
  query_json text not null default '{}',
  body_json text not null default '{}',
  headers_json text not null default '{}',
  field_map text not null default '{}',
  confirmed boolean not null default false,
  last_status integer not null default 0,
  last_error text not null default '',
  last_method text not null default '',
  products_seen integer not null default 0,
  updated_at text not null default ''
);
