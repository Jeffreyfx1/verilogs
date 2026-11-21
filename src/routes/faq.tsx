import { createFileRoute } from "@tanstack/react-router";
import { CmsPage } from "@/components/cms-page";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/faq")({ component: FaqPage });

function FaqPage() {
  const faqs = useStore((s) => s.faqs);
  return (
    <CmsPage
      slug="faq"
      extra={
        <div className="mt-6 divide-y divide-line rounded-card border border-line bg-card">
          {faqs.map((faq) => (
            <details key={faq.id} className="px-4 py-3">
              <summary className="cursor-pointer font-semibold">{faq.question}</summary>
              <p className="mt-2 text-sm leading-relaxed text-muted">{faq.answer}</p>
            </details>
          ))}
        </div>
      }
    />
  );
}
