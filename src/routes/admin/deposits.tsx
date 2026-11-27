import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, inputClass } from "@/components/ui";
import { DEPOSIT_LABEL, type DepositStatus } from "@/lib/paystack-deposit";
import { naira, when } from "@/lib/money";
import { depositDesk, reconcileDeposit } from "@/lib/shop-fns";

export const Route = createFileRoute("/admin/deposits")({ component: DepositsPage });

type Row = {
  reference: string;
  email: string;
  credit: number;
  status: DepositStatus;
  detail: string;
  manualRef: string;
  paidAt: string;
  updatedAt: string;
};

function DepositsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState("");
  const load = () => {
    depositDesk().then((res) => {
      if (res.error) toast.error(res.error);
      setRows(Array.isArray(res.rows) ? res.rows : []);
    }).catch(() => toast.error("Could not load deposits."));
  };
  useEffect(() => { load(); }, []);
  const run = (ref: string, mode: "check" | "credit" | "manual") => {
    if (mode === "credit" && !window.confirm("This adds the Paystack amount to the wallet. Use it only if the manual credit is not already there. A Paystack reference that was already credited is not added again.")) return;
    if (mode === "manual" && !window.confirm("This keeps the existing manual credit and does not add the Paystack amount again.")) return;
    setBusy(ref + mode);
    reconcileDeposit({ data: { reference: ref, mode } })
      .then((res) => {
        if (res.error) toast.error(res.error);
        else toast.success(DEPOSIT_LABEL[res.status as DepositStatus] || "Checked with Paystack");
        load();
      })
      .catch(() => toast.error("Could not check that payment."))
      .finally(() => setBusy(""));
  };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Wallet deposits</h1>
        <p className="mt-1 text-sm text-muted">Each row is one Paystack reference. A payment is credited only after Paystack verifies it, and a reference is credited once. A manual wallet credit of the same amount is kept and is not added again.</p>
      </div>
      <section className="rounded-card border border-line bg-card p-4 shadow-card">
        <p className="text-sm font-bold">Check a Paystack reference</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input className={`${inputClass} min-w-56 flex-1`} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="vl_…" />
          <Button tone="soft" disabled={!!busy} onClick={() => run(reference, "check")}>{busy.endsWith("check") ? "Checking…" : "Verify with Paystack"}</Button>
        </div>
      </section>
      <div className="space-y-3">
        {rows.map((row) => (
          <article key={row.reference} className="rounded-card border border-line bg-card p-4 text-sm shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-extrabold">{DEPOSIT_LABEL[row.status] || row.status}</p>
                <p className="mt-1 text-xs text-muted">{row.reference}{row.email ? ` · ${row.email}` : ""}</p>
              </div>
              <p className="font-extrabold">{naira(row.credit)}</p>
            </div>
            {row.detail ? <p className="mt-2 text-sm text-muted">{row.detail}</p> : null}
            <p className="mt-1 text-xs text-muted">{row.paidAt ? `Paid ${when(row.paidAt)}` : `Updated ${when(row.updatedAt)}`}{row.manualRef ? " · manual credit kept" : ""}</p>
            {row.status === "needs_reconciliation" || row.status === "pending_credit" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button tone="soft" disabled={!!busy} onClick={() => run(row.reference, "check")}>Verify again</Button>
                <Button tone="soft" disabled={!!busy} onClick={() => run(row.reference, "manual")}>Keep the manual credit</Button>
                <Button tone="soft" disabled={!!busy} onClick={() => run(row.reference, "credit")}>Credit anyway</Button>
              </div>
            ) : null}
          </article>
        ))}
        {!rows.length ? <p className="text-sm text-muted">No Paystack deposits recorded yet.</p> : null}
      </div>
    </div>
  );
}
