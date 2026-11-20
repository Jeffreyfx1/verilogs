create table if not exists shop_category_logos (
  category_name text primary key,
  image_url text not null default '',
  source_page text not null default '',
  source_site text not null default '',
  filename text not null default '',
  format text not null default '',
  confidence double precision not null default 0,
  status text not null default 'imported',
  custom boolean not null default false,
  verified boolean not null default false,
  note text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists shop_logo_discoveries (
  id text primary key,
  created_at timestamptz not null default now(),
  source_site text not null default 'accszone.com',
  report_json text not null default '{}',
  category_count integer not null default 0,
  logo_count integer not null default 0,
  listing_count integer not null default 0,
  matched integer not null default 0,
  ambiguous integer not null default 0,
  imported integer not null default 0,
  errors text not null default ''
);
