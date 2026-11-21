-- Website pages, Vera knowledge and conversation records. Creates tables only.
create table if not exists shop_pages (
  slug text primary key,
  title text not null,
  public_html text not null default '',
  draft_html text not null default '',
  published boolean not null default false,
  admin_note text not null default '',
  updated_at text not null default '',
  updated_by text not null default ''
);

create table if not exists shop_page_versions (
  id text primary key,
  slug text not null,
  title text not null,
  html text not null,
  admin_note text not null default '',
  kind text not null,
  created_at text not null,
  created_by text not null
);

create index if not exists shop_page_versions_slug on shop_page_versions (slug, created_at desc);

create table if not exists shop_vera_knowledge (
  id text primary key,
  category text not null,
  title text not null,
  body text not null,
  enabled boolean not null default true,
  updated_at text not null,
  updated_by text not null default ''
);

create table if not exists shop_vera_threads (
  id text primary key,
  user_id text not null default '',
  status text not null default 'active',
  helpful text not null default '',
  comment text not null default '',
  escalated boolean not null default false,
  started_at text not null,
  updated_at text not null
);

create table if not exists shop_vera_messages (
  id text primary key,
  thread_id text not null,
  role text not null,
  body text not null,
  created_at text not null
);

create index if not exists shop_vera_messages_thread on shop_vera_messages (thread_id, created_at);

create table if not exists shop_vera_unanswered (
  id text primary key,
  question text not null,
  norm text not null unique,
  context text not null default '',
  times integer not null default 1,
  addressed boolean not null default false,
  created_at text not null,
  updated_at text not null
);

create table if not exists shop_admin_log (
  id text primary key,
  admin_id text not null,
  action text not null,
  target text not null default '',
  created_at text not null
);
