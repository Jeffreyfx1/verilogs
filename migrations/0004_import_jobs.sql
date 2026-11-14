create table if not exists shop_import_jobs (
  id text primary key,
  status text not null,
  total integer not null,
  cursor integer not null default 0,
  batch_size integer not null,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped integer not null default 0,
  by_category text not null default '{}',
  by_network text not null default '{}',
  provider_id text not null default '',
  keep_ids text not null default '[]',
  touched text not null default '[]',
  meta text not null,
  error text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists shop_import_batches (
  job_id text not null,
  seq integer not null,
  items text not null,
  primary key (job_id, seq)
);
