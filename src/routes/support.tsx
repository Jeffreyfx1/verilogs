import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicFrame } from "@/components/chrome";
import { useUser } from "@/lib/store";

export const Route = createFileRoute("/support")({ component: SupportPublic });

function SupportPublic() {
  const user = useUser();
  return (
    <PublicFrame>
      <div className="mx-auto max-w-xl px-4 py-12">
        <h1 className="text-3xl font-extrabold">Support</h1>
        <p className="mt-2 text-sm text-muted">Open a ticket from your dashboard. We reply on the same thread, and the help card stays at the bottom of the menu.</p>
        <Link to={user ? "/dashboard/support" : "/login"} className="btn-gradient mt-6 inline-block rounded-xl px-5 py-3 text-sm font-semibold">
          {user ? "Open support" : "Log in to contact support"}
        </Link>
      </div>
    </PublicFrame>
  );
}
