-- Rent Number pricing and operator variants. Creates tables and one column. Does not change number servers.
create table if not exists shop_rent_pricing (
  id text primary key,
  usd_ngn text not null,
  margin_per_usd text not null,
  margin_enabled integer not null default 0,
  updated_at text not null
);

insert into shop_rent_pricing (id, usd_ngn, margin_per_usd, margin_enabled, updated_at)
select 'default', '0', '0', 0, ''
where not exists (select 1 from shop_rent_pricing where id = 'default');

alter table shop_rent_offers add column if not exists rate text not null default '';

create table if not exists shop_rent_labels (
  service text primary key,
  label text not null,
  updated_at text not null
);
