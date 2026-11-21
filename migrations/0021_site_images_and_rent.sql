-- Website photographs and the Rent numbers catalogue. Creates tables only.
create table if not exists shop_site_images (
  slot text not null,
  variant text not null default 'desktop',
  mime text not null,
  bytes text not null,
  alt text not null default '',
  updated_at text not null,
  primary key (slot, variant)
);

create table if not exists shop_site_image_history (
  id text primary key,
  slot text not null,
  variant text not null,
  mime text not null,
  bytes text not null,
  alt text not null default '',
  created_at text not null
);

create table if not exists shop_rent_countries (
  slug text primary key,
  name text not null,
  iso text not null default '',
  prefix text not null default '',
  updated_at text not null
);

create table if not exists shop_rent_offers (
  id text primary key,
  country text not null,
  service text not null,
  operator text not null,
  kind text not null,
  price_usd text not null,
  stock integer not null default 0,
  updated_at text not null,
  unique (country, service, operator, kind)
);

create index if not exists shop_rent_offers_country on shop_rent_offers (country);

create table if not exists shop_rent_imports (
  id text primary key,
  action text not null,
  imported integer not null default 0,
  updated integer not null default 0,
  skipped integer not null default 0,
  failed integer not null default 0,
  detail text not null default '',
  created_at text not null
);
