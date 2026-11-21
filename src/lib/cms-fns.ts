import { createServerFn } from "@tanstack/react-start";
import { isSiteSlug } from "@/lib/site-pages";

async function actorId() {
  const { adminContext } = await import("@/lib/shop-core.server");
  const admin = await adminContext();
  return admin?.userId || "";
}

export const publicPage = createServerFn({ method: "GET" })
  .validator((input: { slug?: string }) => ({ slug: String(input?.slug || "") }))
  .handler(async ({ data }) => {
    if (!isSiteSlug(data.slug)) return null;
    const { publishedPage } = await import("@/lib/site-content.server");
    return publishedPage(data.slug);
  });

export const websitePages = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await actorId();
  if (!actor) return { error: "Only an admin can do that.", pages: [] };
  const { adminPageList } = await import("@/lib/site-content.server");
  return { error: null as string | null, pages: await adminPageList() };
});

export const websitePage = createServerFn({ method: "GET" })
  .validator((input: { slug?: string }) => ({ slug: String(input?.slug || "") }))
  .handler(async ({ data }) => {
    const actor = await actorId();
    if (!actor) return { error: "Only an admin can do that.", page: null };
    const { adminPage } = await import("@/lib/site-content.server");
    return { error: null as string | null, page: await adminPage(data.slug) };
  });

export const saveWebsiteDraft = createServerFn({ method: "POST" })
  .validator((input: { slug?: string; title?: string; draftHtml?: string; adminNote?: string }) => ({
    slug: String(input?.slug || ""),
    title: String(input?.title || ""),
    draftHtml: String(input?.draftHtml || ""),
    adminNote: String(input?.adminNote || ""),
  }))
  .handler(async ({ data }) => {
    const actor = await actorId();
    if (!actor) return { error: "Only an admin can do that." };
    const { savePageDraft } = await import("@/lib/site-content.server");
    return savePageDraft(data, actor);
  });

export const publishWebsite = createServerFn({ method: "POST" })
  .validator((input: { slug?: string }) => ({ slug: String(input?.slug || "") }))
  .handler(async ({ data }) => {
    const actor = await actorId();
    if (!actor) return { error: "Only an admin can do that." };
    const { publishPage } = await import("@/lib/site-content.server");
    return publishPage(data.slug, actor);
  });

export const unpublishWebsite = createServerFn({ method: "POST" })
  .validator((input: { slug?: string }) => ({ slug: String(input?.slug || "") }))
  .handler(async ({ data }) => {
    const actor = await actorId();
    if (!actor) return { error: "Only an admin can do that." };
    const { unpublishPage } = await import("@/lib/site-content.server");
    return unpublishPage(data.slug, actor);
  });

export const restoreWebsite = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => ({ id: String(input?.id || "") }))
  .handler(async ({ data }) => {
    const actor = await actorId();
    if (!actor) return { error: "Only an admin can do that." };
    const { restorePageVersion } = await import("@/lib/site-content.server");
    return restorePageVersion(data.id, actor);
  });

export const veraKnowledge = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await actorId();
  if (!actor) return { error: "Only an admin can do that.", rows: [] };
  const { listVeraKnowledge } = await import("@/lib/vera.server");
  return { error: null as string | null, rows: await listVeraKnowledge() };
});

export const saveVeraArticle = createServerFn({ method: "POST" })
  .validator((input: { id?: string; category?: string; title?: string; body?: string; enabled?: boolean }) => ({
    id: String(input?.id || ""),
    category: String(input?.category || ""),
    title: String(input?.title || ""),
    body: String(input?.body || ""),
    enabled: input?.enabled !== false,
  }))
  .handler(async ({ data }) => {
    const actor = await actorId();
    if (!actor) return { error: "Only an admin can do that." };
    const { saveVeraKnowledge } = await import("@/lib/vera.server");
    return saveVeraKnowledge(data, actor);
  });

export const deleteVeraArticle = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => ({ id: String(input?.id || "") }))
  .handler(async ({ data }) => {
    const actor = await actorId();
    if (!actor) return { error: "Only an admin can do that." };
    const { removeVeraKnowledge } = await import("@/lib/vera.server");
    return removeVeraKnowledge(data.id, actor);
  });

export const previewVera = createServerFn({ method: "POST" })
  .validator((input: { question?: string }) => ({ question: String(input?.question || "").slice(0, 500) }))
  .handler(async ({ data }) => {
    const actor = await actorId();
    if (!actor) return { error: "Only an admin can do that.", preview: null };
    const { previewVeraAnswer } = await import("@/lib/vera.server");
    const preview = await previewVeraAnswer(data.question);
    return { error: preview.error, preview };
  });

export const veraDesk = createServerFn({ method: "POST" })
  .validator((input: { q?: string; status?: string; from?: string; to?: string }) => ({
    q: String(input?.q || ""),
    status: String(input?.status || ""),
    from: String(input?.from || ""),
    to: String(input?.to || ""),
  }))
  .handler(async ({ data }) => {
    const actor = await actorId();
    if (!actor) return { error: "Only an admin can do that.", report: null };
    const { veraAnalytics } = await import("@/lib/vera.server");
    return { error: null as string | null, report: await veraAnalytics(data) };
  });

export const setVeraStatus = createServerFn({ method: "POST" })
  .validator((input: { id?: string; status?: string }) => ({
    id: String(input?.id || ""),
    status: input?.status === "resolved" || input?.status === "escalated" || input?.status === "abandoned" || input?.status === "active" ? input.status : "active",
  }))
  .handler(async ({ data }) => {
    const actor = await actorId();
    if (!actor) return { error: "Only an admin can do that." };
    const status = data.status === "resolved" || data.status === "escalated" || data.status === "abandoned" || data.status === "active" ? data.status : "active";
    const { setVeraThreadStatus } = await import("@/lib/vera.server");
    return setVeraThreadStatus(data.id, status, actor);
  });

export const answerUnanswered = createServerFn({ method: "POST" })
  .validator((input: { id?: string; answer?: string }) => ({ id: String(input?.id || ""), answer: String(input?.answer || "") }))
  .handler(async ({ data }) => {
    const actor = await actorId();
    if (!actor) return { error: "Only an admin can do that." };
    const { addressUnanswered } = await import("@/lib/vera.server");
    return addressUnanswered(data.id, data.answer, actor);
  });

export const suggestVera = createServerFn({ method: "POST" })
  .validator((input: { question?: string }) => ({ question: String(input?.question || "") }))
  .handler(async ({ data }) => {
    const actor = await actorId();
    if (!actor) return { error: "Only an admin can do that." };
    const { suggestVeraKnowledge } = await import("@/lib/vera.server");
    return suggestVeraKnowledge(data.question, actor);
  });

export const pruneVera = createServerFn({ method: "POST" })
  .validator((input: { days?: number }) => ({ days: Number(input?.days) || 90 }))
  .handler(async ({ data }) => {
    const actor = await actorId();
    if (!actor) return { error: "Only an admin can do that." };
    const { deleteOldVeraThreads } = await import("@/lib/vera.server");
    return deleteOldVeraThreads(data.days, actor);
  });
