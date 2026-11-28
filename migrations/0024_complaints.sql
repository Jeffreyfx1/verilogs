-- Complaints, public replies, internal notes and status history.
-- Rows are kept. There is no delete path in the app.
create table if not exists shop_complaints (
  id text primary key,
  reference text not null unique,
  user_id text not null,
  user_name text not null default '',
  user_email text not null default '',
  subject text not null,
  category text not null,
  body text not null,
  order_ref text not null default '',
  status text not null,
  admin_unread boolean not null default true,
  customer_unread boolean not null default false,
  client_key text not null default '',
  screenshot_mime text not null default '',
  screenshot text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_reply_at timestamptz
);

create unique index if not exists shop_complaints_client_key
  on shop_complaints (user_id, client_key)
  where client_key <> '';

create index if not exists shop_complaints_user on shop_complaints (user_id, created_at desc);
create index if not exists shop_complaints_status on shop_complaints (status, created_at desc);

create table if not exists shop_complaint_messages (
  id text primary key,
  complaint_id text not null references shop_complaints (id),
  author_id text not null,
  author_role text not null,
  body text not null,
  internal boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists shop_complaint_messages_thread
  on shop_complaint_messages (complaint_id, created_at);

create table if not exists shop_complaint_events (
  id text primary key,
  complaint_id text not null references shop_complaints (id),
  from_status text not null default '',
  to_status text not null,
  actor_id text not null default '',
  actor_role text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists shop_complaint_events_thread
  on shop_complaint_events (complaint_id, created_at);
