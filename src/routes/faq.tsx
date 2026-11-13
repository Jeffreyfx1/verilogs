import { createFileRoute } from "@tanstack/react-router";
import { PublicFrame } from "@/components/chrome";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/faq")({ component: FaqPage });

function FaqPage() {
  const faqs = useStore((s) => s.faqs);
  return (
    <PublicFrame>
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-3xl font-extrabold">FAQ</h1>
        <div className="mt-6 divide-y divide-line rounded-card border border-line bg-card">
          {faqs.map((f) => (
            <details key={f.id} className="px-4 py-3">
              <summary className="cursor-pointer font-semibold">{f.question}</summary>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </PublicFrame>
  );
}
