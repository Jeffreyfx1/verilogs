-- One-time number catalogue reset for Server 1, Server 2 and Server 3.
-- Deletes imported number rows, including live ones, plus their staged import batches.
-- Does not touch GetaText / USA, logs, SMM, VPN, data, airtime, orders, wallets or provider keys.

do $$
declare
  number_providers text[] := array[]::text[];
  getatext_providers text[] := array[]::text[];
  reset_ids text[] := array[]::text[];
  removed integer := 0;
begin
  if to_regclass('shop_products') is null then
    return;
  end if;

  begin
    select coalesce(array_agg(item->>'id') filter (where coalesce(item->>'id', '') <> ''), array[]::text[])
      into getatext_providers
    from shop_state as state
    cross join lateral jsonb_array_elements(coalesce((state.doc::jsonb)->'providers', '[]'::jsonb)) as item
    where state.id = 'main'
      and (
        coalesce(item->>'importType', '') = 'USA_IMPORT'
        or coalesce(item->>'serverId', '') = 'usa'
        or lower(coalesce(item->>'baseUrl', '') || ' ' || coalesce(item->>'name', '')) like '%getatext.com%'
      );

    select coalesce(array_agg(item->>'id') filter (where coalesce(item->>'id', '') <> ''), array[]::text[])
      into number_providers
    from shop_state as state
    cross join lateral jsonb_array_elements(coalesce((state.doc::jsonb)->'providers', '[]'::jsonb)) as item
    where state.id = 'main'
      and not (coalesce(item->>'id', '') = any(getatext_providers))
      and coalesce(item->>'importType', '') <> 'USA_IMPORT'
      and coalesce(item->>'serverId', '') <> 'usa'
      and lower(coalesce(item->>'baseUrl', '') || ' ' || coalesce(item->>'name', '')) not like '%getatext.com%'
      and (
        coalesce(item->>'importType', '') = 'NUMBER_IMPORT'
        or coalesce(item->>'serverId', '') in ('1', '2', '3')
        or lower(coalesce(item->>'baseUrl', '') || ' ' || coalesce(item->>'name', '')) like '%5sim.net%'
      );
  exception when others then
    number_providers := array[]::text[];
    getatext_providers := array[]::text[];
  end;

  select coalesce(array_agg(product.id), array[]::text[])
    into reset_ids
  from shop_products as product
  where coalesce(product.import_type, '') <> 'USA_IMPORT'
    and coalesce(product.server_id, '') <> 'usa'
    and coalesce(product.category, '') <> 'usa'
    and coalesce(product.category, '') not in ('logs', 'smm', 'vpn', 'data', 'airtime', 'cable', 'electricity', 'exam', 'giftcard', 'betting', 'boost')
    and not (product.provider_id = any(getatext_providers))
    and (
      product.import_type = 'NUMBER_IMPORT'
      or product.server_id in ('1', '2', '3')
      or product.category in ('number', 'numbers', 'rent')
      or product.provider_id = any(number_providers)
    );

  if to_regclass('shop_catalog_backups') is not null
     and not exists (select 1 from shop_catalog_backups where id = 'number-catalogue-reset') then
    insert into shop_catalog_backups (id, note, products_json, product_count)
    select
      'number-catalogue-reset',
      'Server 1-3 number catalogue before reset. GetaText excluded.',
      coalesce((select jsonb_agg(to_jsonb(product))::text from shop_products as product where product.id = any(reset_ids)), '[]'),
      coalesce(array_length(reset_ids, 1), 0);
  end if;

  delete from shop_products where id = any(reset_ids);
  get diagnostics removed = row_count;

  begin
    delete from shop_import_batches
    where job_id in (
      select job.id
      from shop_import_jobs as job
      where job.provider_id = any(number_providers)
         or (
           left(btrim(job.meta), 1) = '{'
           and coalesce(job.meta::jsonb->>'kind', '') in ('numbers', 'server2', 'server3')
         )
    );
    delete from shop_import_jobs as job
    where job.provider_id = any(number_providers)
       or (
         left(btrim(job.meta), 1) = '{'
         and coalesce(job.meta::jsonb->>'kind', '') in ('numbers', 'server2', 'server3')
       );
  exception when others then
    null;
  end;

  begin
    update shop_state
    set doc = (
      jsonb_set(
        jsonb_set(
          doc::jsonb,
          '{products}',
          coalesce((
            select jsonb_agg(product)
            from jsonb_array_elements(coalesce((doc::jsonb)->'products', '[]'::jsonb)) as product
            where not (coalesce(product->>'id', '') = any(reset_ids))
              and (
                coalesce(product->>'category', '') in ('logs', 'smm', 'vpn', 'data', 'airtime', 'cable', 'electricity', 'exam', 'giftcard', 'betting', 'boost', 'usa')
                or coalesce(product->>'importType', '') = 'USA_IMPORT'
                or coalesce(product->>'serverId', '') = 'usa'
                or product->>'providerId' = any(getatext_providers)
                or not (
                  coalesce(product->>'importType', '') = 'NUMBER_IMPORT'
                  or coalesce(product->>'serverId', '') in ('1', '2', '3')
                  or coalesce(product->>'category', '') in ('number', 'numbers', 'rent')
                  or product->>'providerId' = any(number_providers)
                )
              )
          ), '[]'::jsonb)
        ),
        '{providers}',
        coalesce((
          select jsonb_agg(
            case
              when provider->>'id' = any(number_providers)
                then jsonb_set(provider, '{lastSync}', 'null'::jsonb) || '{"servesNumbers":false}'::jsonb
              else provider
            end
          )
          from jsonb_array_elements(coalesce((doc::jsonb)->'providers', '[]'::jsonb)) as provider
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
      where not (coalesce(product->>'id', '') = any(reset_ids))
    ), '[]'),
    updated_at = now()
    where id = 'main'
      and left(btrim(doc), 1) = '[';
  exception when others then
    null;
  end;
end $$;
