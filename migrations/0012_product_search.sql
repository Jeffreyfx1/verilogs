-- Built-in full-text index. Does not require pg_trgm, so boot still works on PGLite.
alter table shop_products add column if not exists search_vec tsvector
  generated always as (
    to_tsvector(
      'simple',
      coalesce(name, '') || ' ' ||
      coalesce(service, '') || ' ' ||
      coalesce(network, '') || ' ' ||
      coalesce(country, '') || ' ' ||
      coalesce(operator, '') || ' ' ||
      left(coalesce(description, ''), 240)
    )
  ) stored;

create index if not exists shop_products_search on shop_products using gin (search_vec);
