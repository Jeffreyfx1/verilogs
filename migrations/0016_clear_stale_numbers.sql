-- One-time: drop previously imported virtual-number rows that are neither live nor used.
-- Live means enabled. Used means an order or an in-flight purchase still points at the row.
-- Customer orders, wallets, logs, SMM, data and airtime are not touched.

do $$
declare
  used_ids text[] := array[]::text[];
begin
  if to_regclass('shop_products') is null then
    return;
  end if;

  begin
    select coalesce(array_agg(distinct item->>'productId'), array[]::text[])
      into used_ids
    from shop_state as state
    cross join lateral jsonb_array_elements(coalesce((state.doc::jsonb)->'orders', '[]'::jsonb)) as item
    where state.id = 'main'
      and coalesce(item->>'productId', '') <> '';
  exception when others then
    used_ids := array[]::text[];
  end;

  begin
    select used_ids || coalesce(array_agg(distinct purchase.product_id), array[]::text[])
      into used_ids
    from shop_idempotency as purchase
    where purchase.product_id <> '';
  exception when others then
    null;
  end;

  delete from shop_products
  where category in ('number', 'numbers', 'rent', 'usa')
    and enabled = false
    and not (id = any(used_ids));

  begin
    update shop_state
    set doc = (
      jsonb_set(
        doc::jsonb,
        '{products}',
        coalesce((
          select jsonb_agg(product)
          from jsonb_array_elements(coalesce((doc::jsonb)->'products', '[]'::jsonb)) as product
          where coalesce(product->>'category', '') not in ('number', 'numbers', 'rent', 'usa')
             or coalesce(product->>'enabled', 'false') in ('true', 't', '1')
             or coalesce(product->>'id', '') = any(used_ids)
        ), '[]'::jsonb)
      )
    )::text,
    updated_at = now()
    where id = 'main'
      and left(btrim(doc), 1) = '{';
  exception when others then
    null;
  end;

  begin
    update shop_catalog
    set doc = coalesce((
      select jsonb_agg(product)::text
      from jsonb_array_elements(doc::jsonb) as product
      where coalesce(product->>'category', '') not in ('number', 'numbers', 'rent', 'usa')
         or coalesce(product->>'enabled', 'false') in ('true', 't', '1')
         or coalesce(product->>'id', '') = any(used_ids)
    ), '[]'),
    updated_at = now()
    where id = 'main'
      and left(btrim(doc), 1) = '[';
  exception when others then
    null;
  end;
end $$;
