alter table shop_products add column if not exists description_locked boolean not null default false;
alter table shop_products add column if not exists price_locked boolean not null default false;
