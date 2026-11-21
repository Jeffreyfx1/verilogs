import { getSql } from "@/lib/db";
import { uid } from "@/lib/money";
import { isSiteSlug, pageDefaults, sanitizeHtml, SITE_PAGES, visiblePage } from "@/lib/site-pages";

type PageRow = {
  slug: string;
  title: string;
  public_html: string;
  draft_html: string;
  published: boolean;
  admin_note: string;
  updated_at: string;
  updated_by: string;
};

async function logAdmin(adminId: string, action: string, target: string) {
  const sql = await getSql();
  await sql.query("insert into shop_admin_log (id, admin_id, action, target, created_at) values ($1, $2, $3, $4, $5)", [
    uid("log"),
    adminId,
    action.slice(0, 80),
    target.slice(0, 180),
    new Date().toISOString(),
  ]);
}

export async function ensureSitePages() {
  const sql = await getSql();
  for (const page of SITE_PAGES) {
    const seed = pageDefaults(page.slug);
    await sql.query(
      `insert into shop_pages (slug, title, public_html, draft_html, published, admin_note, updated_at, updated_by)
       values ($1, $2, '', $3, false, '', $4, 'system')
       on conflict (slug) do nothing`,
      [page.slug, seed.title, seed.html, new Date().toISOString()],
    );
  }
}

export async function publishedPage(slug: string) {
  if (!isSiteSlug(slug)) return null;
  const sql = await getSql();
  const rows = await sql.query<{ title: string; public_html: string; published: boolean }>(
    "select title, public_html, published from shop_pages where slug = $1",
    [slug],
  );
  const row = rows[0];
  return { slug, ...visiblePage(row ? { title: row.title, publicHtml: row.public_html, published: row.published } : null, slug) };
}

export async function adminPageList() {
  await ensureSitePages();
  const sql = await getSql();
  const rows = await sql.query<PageRow>("select slug, title, published, updated_at, updated_by from shop_pages order by slug");
  return SITE_PAGES.map((page) => {
    const row = rows.find((item) => item.slug === page.slug);
    return { slug: page.slug, path: page.path, title: row?.title || page.title, published: !!row?.published, updatedAt: row?.updated_at || "", updatedBy: row?.updated_by || "" };
  });
}

export async function adminPage(slug: string) {
  if (!isSiteSlug(slug)) return null;
  await ensureSitePages();
  const sql = await getSql();
  const rows = await sql.query<PageRow>("select * from shop_pages where slug = $1", [slug]);
  const row = rows[0];
  if (!row) return null;
  const versions = await sql.query<{ id: string; title: string; kind: string; created_at: string; created_by: string }>(
    "select id, title, kind, created_at, created_by from shop_page_versions where slug = $1 order by created_at desc limit 30",
    [slug],
  );
  return {
    slug: row.slug,
    title: row.title,
    draftHtml: row.draft_html,
    publicHtml: row.public_html,
    published: row.published,
    adminNote: row.admin_note,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    versions,
  };
}

async function remember(slug: string, title: string, html: string, note: string, kind: string, actor: string) {
  const sql = await getSql();
  await sql.query(
    "insert into shop_page_versions (id, slug, title, html, admin_note, kind, created_at, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8)",
    [uid("pgv"), slug, title, html, note, kind, new Date().toISOString(), actor],
  );
}

export async function savePageDraft(input: { slug: string; title: string; draftHtml: string; adminNote: string }, actor: string) {
  if (!isSiteSlug(input.slug)) return { error: "Unknown page." };
  await ensureSitePages();
  const title = input.title.trim().slice(0, 120) || pageDefaults(input.slug).title;
  const draftHtml = sanitizeHtml(input.draftHtml).slice(0, 20000);
  const adminNote = String(input.adminNote || "").slice(0, 4000);
  const sql = await getSql();
  const now = new Date().toISOString();
  await sql.query(
    "update shop_pages set title = $2, draft_html = $3, admin_note = $4, updated_at = $5, updated_by = $6 where slug = $1",
    [input.slug, title, draftHtml, adminNote, now, actor],
  );
  await remember(input.slug, title, draftHtml, adminNote, "draft", actor);
  await logAdmin(actor, "save page draft", input.slug);
  return { error: null as string | null };
}

export async function publishPage(slug: string, actor: string) {
  if (!isSiteSlug(slug)) return { error: "Unknown page." };
  await ensureSitePages();
  const sql = await getSql();
  const rows = await sql.query<PageRow>("select * from shop_pages where slug = $1", [slug]);
  const row = rows[0];
  if (!row) return { error: "Page not found." };
  const html = sanitizeHtml(row.draft_html);
  if (!html) return { error: "Write the page before publishing." };
  const now = new Date().toISOString();
  await sql.query("update shop_pages set public_html = $2, published = true, updated_at = $3, updated_by = $4 where slug = $1", [slug, html, now, actor]);
  await remember(slug, row.title, html, row.admin_note, "publish", actor);
  await logAdmin(actor, "publish page", slug);
  return { error: null as string | null };
}

export async function unpublishPage(slug: string, actor: string) {
  if (!isSiteSlug(slug)) return { error: "Unknown page." };
  const sql = await getSql();
  const rows = await sql.query<PageRow>("select * from shop_pages where slug = $1", [slug]);
  const row = rows[0];
  if (!row) return { error: "Page not found." };
  await sql.query("update shop_pages set published = false, updated_at = $2, updated_by = $3 where slug = $1", [slug, new Date().toISOString(), actor]);
  await remember(slug, row.title, row.public_html, row.admin_note, "unpublish", actor);
  await logAdmin(actor, "unpublish page", slug);
  return { error: null as string | null };
}

export async function restorePageVersion(id: string, actor: string) {
  const sql = await getSql();
  const rows = await sql.query<{ id: string; slug: string; title: string; html: string; admin_note: string }>(
    "select id, slug, title, html, admin_note from shop_page_versions where id = $1",
    [id],
  );
  const version = rows[0];
  if (!version || !isSiteSlug(version.slug)) return { error: "Version not found." };
  const html = sanitizeHtml(version.html);
  const now = new Date().toISOString();
  await sql.query(
    "update shop_pages set title = $2, draft_html = $3, public_html = $3, published = true, admin_note = $4, updated_at = $5, updated_by = $6 where slug = $1",
    [version.slug, version.title, html, version.admin_note, now, actor],
  );
  await remember(version.slug, version.title, html, version.admin_note, "restore", actor);
  await logAdmin(actor, "restore page", `${version.slug}:${version.id}`);
  return { error: null as string | null, slug: version.slug };
}
