import { useEffect, useState } from "react";
import { PublicFrame } from "@/components/chrome";
import { CmsHtml } from "@/components/rich-text";
import { publicPage } from "@/lib/cms-fns";
import { pageDefaults, type SiteSlug } from "@/lib/site-pages";

export function CmsPage({ slug, extra }: { slug: SiteSlug; extra?: React.ReactNode }) {
  const fallback = pageDefaults(slug);
  const [title, setTitle] = useState(fallback.title);
  const [html, setHtml] = useState(fallback.html);
  useEffect(() => {
    let live = true;
    publicPage({ data: { slug } })
      .then((page) => {
        if (!live || !page) return;
        setTitle(page.title);
        setHtml(page.html);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [slug]);
  return (
    <PublicFrame>
      <article className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-3xl font-extrabold">{title}</h1>
        <div className="mt-4">
          <CmsHtml html={html} />
        </div>
        {extra}
      </article>
    </PublicFrame>
  );
}
