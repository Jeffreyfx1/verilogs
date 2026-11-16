alter table shop_products add column if not exists marketplace_subcategory text not null default '';
alter table shop_products add column if not exists smm_min integer not null default 0;
alter table shop_products add column if not exists smm_max integer not null default 0;
alter table shop_products add column if not exists smm_type text not null default '';
alter table shop_products add column if not exists smm_refill boolean not null default false;

create index if not exists shop_products_subcategory on shop_products (category, marketplace_subcategory);
