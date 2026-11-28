import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { StatusPill } from "@/components/complaint-view";
import { Button, inputClass } from "@/components/ui";
import { COMPLAINT_CATEGORIES, COMPLAINT_STATUSES, adminStatusLabel, type ComplaintRow, type ComplaintStats } from "@/lib/complaints";
import { when } from "@/lib/money";
import { adminComplaintDesk } from "@/lib/shop-fns";

export const Route = createFileRoute("/admin/complaints")({ component: AdminComplaintsPage });

const emptyStats: ComplaintStats = { total: 0, fresh: 0, unread: 0, pending: 0, awaiting: 0, resolved: 0 };

function AdminComplaintsPage() {
  const [rows, setRows] = useState<ComplaintRow[]>([]);
  const [stats, setStats] = useState<ComplaintStats>(emptyStats);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = (nextPage = page) => {
    setLoading(true);
    adminComplaintDesk({ data: { q, status, category, sort, page: nextPage } })
      .then((res) => {
        if (res.error) {
          setError(res.error);
          toast.error(res.error);
        } else setError("");
        setRows(Array.isArray(res.rows) ? res.rows : []);
        setStats(res.stats || emptyStats);
        setPage(res.page || 1);
        setPages(res.pages || 1);
        setTotal(res.total || 0);
      })
      .catch(() => setError("Could not load complaints."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(1); }, []);

  const cards = [
    ["Total", stats.total],
    ["New", stats.fresh],
    ["Unread", stats.unread],
    ["Pending", stats.pending],
    ["Awaiting my response", stats.awaiting],
    ["Resolved", stats.resolved],
  ] as const;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Complaints</h1>
        <p className="mt-1 text-sm text-muted">Every complaint is stored in the database. A reply notifies that customer and opens this conversation.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map(([label, count]) => (
          <article key={label} className="rounded-card border border-line bg-card p-3 shadow-card">
            <p className="text-xs text-muted">{label}</p>
            <p className="text-2xl font-extrabold">{count.toLocaleString("en-NG")}</p>
          </article>
        ))}
      </div>
      <form
        className="grid gap-2 rounded-card border border-line bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          load(1);
        }}
      >
        <input className={inputClass} value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search reference, customer, order" />
        <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          {COMPLAINT_STATUSES.map((item) => <option key={item} value={item}>{adminStatusLabel(item)}</option>)}
        </select>
        <select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">All categories</option>
          {COMPLAINT_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className={inputClass} value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
        <Button type="submit">Search</Button>
      </form>
      {loading ? <p className="text-sm text-muted">Loading complaints…</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="hidden overflow-x-auto rounded-card border border-line bg-card shadow-card md:block">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Customer</th>
              <th className="px-3 py-2 font-semibold">Reference</th>
              <th className="px-3 py-2 font-semibold">Subject</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line align-top">
                <td className="px-3 py-3">
                  <p className="font-semibold">{row.userName || "Customer"}{row.adminUnread ? " · unread" : ""}</p>
                  <p className="text-xs text-muted">{row.userEmail}</p>
                  <p className="text-xs text-muted">{row.userId}</p>
                </td>
                <td className="px-3 py-3">
                  <Link to="/admin/complaints/$id" params={{ id: row.id }} className="font-extrabold text-primary">{row.reference}</Link>
                  <p className="text-xs text-muted">{row.category}{row.orderRef ? ` · ${row.orderRef}` : ""}</p>
                </td>
                <td className="px-3 py-3">
                  <p className="font-semibold">{row.subject}</p>
                  <p className="text-xs text-muted">{row.body.slice(0, 140)}</p>
                </td>
                <td className="px-3 py-3"><StatusPill status={row.status} admin /></td>
                <td className="px-3 py-3 text-xs text-muted">
                  <p>{when(row.createdAt)}</p>
                  <p>{row.lastReplyAt ? `Last reply ${when(row.lastReplyAt)}` : "No reply yet"}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <Link key={row.id} to="/admin/complaints/$id" params={{ id: row.id }} className="block rounded-card border border-line bg-card p-4 text-sm shadow-card">
            <div className="flex items-start justify-between gap-2">
              <p className="font-extrabold">{row.reference}{row.adminUnread ? " · unread" : ""}</p>
              <StatusPill status={row.status} admin />
            </div>
            <p className="mt-1 font-semibold">{row.subject}</p>
            <p className="text-xs text-muted">{row.userName} · {row.userId}</p>
            <p className="mt-1 text-xs text-muted">{row.category} · {when(row.createdAt)}{row.orderRef ? ` · ${row.orderRef}` : ""}</p>
            <p className="mt-2 text-muted">{row.body.slice(0, 180)}</p>
          </Link>
        ))}
      </div>
      {!loading && !rows.length ? <p className="text-sm text-muted">No complaints match that search.</p> : null}
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="text-muted">{total.toLocaleString("en-NG")} shown in this filter · page {page} of {pages}</p>
        <div className="flex gap-2">
          <Button tone="soft" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>Previous</Button>
          <Button tone="soft" disabled={page >= pages || loading} onClick={() => load(page + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
