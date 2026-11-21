-- One cashback row per referred user. A repeated deposit callback cannot insert a second row.
create table if not exists shop_referral_cashbacks (
  referred_id text primary key,
  deposit_ref text not null,
  deposit_amount integer not null,
  amount integer not null,
  created_at text not null
);

create unique index if not exists shop_referral_cashbacks_deposit on shop_referral_cashbacks (deposit_ref);
