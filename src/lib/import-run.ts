import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { SyncReport } from "@/lib/catalog";
import { beginCatalogImport, stepCatalogImport, type ImportStep } from "@/lib/shop-fns";
import { useStore } from "@/lib/store";

export type ImportPhase = "idle" | "fetch" | "save" | "done" | "fail";

export type ImportRun = {
  phase: ImportPhase;
  total: number;
  saved: number;
  doneBatches: number;
  batches: number;
  batchSize: number;
  status: string;
  jobId: string;
  failedSteps: number;
  report: SyncReport | null;
  selective: boolean;
};

const idle: ImportRun = {
  phase: "idle",
  total: 0,
  saved: 0,
  doneBatches: 0,
  batches: 0,
  batchSize: 2000,
  status: "",
  jobId: "",
  failedSteps: 0,
  report: null,
  selective: false,
};

let snap: ImportRun = idle;
let running = false;
const listeners = new Set<() => void>();

function emit(patch: Partial<ImportRun>) {
  snap = { ...snap, ...patch };
  listeners.forEach((listener) => listener());
}

export function getImportRun() {
  return snap;
}

export function subscribeImport(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useImportRun() {
  return useSyncExternalStore(subscribeImport, getImportRun, getImportRun);
}

type StartInput = {
  url: string;
  payload?: unknown;
  apiKey: string;
  providerId: string;
  name: string;
  baseUrl: string;
  currency: "NGN" | "USD";
  usdRate: number;
  markup: number;
  publish: boolean;
  kind: string;
  selective?: boolean;
};

async function drain(jobId: string, batches: number) {
  let guard = 0;
  let latest: ImportStep = {
    error: null,
    jobId,
    total: snap.total,
    saved: snap.saved,
    batch: snap.doneBatches,
    batches,
    batchSize: snap.batchSize,
    done: false,
    report: null,
    state: null,
  };
  while (!latest.done && guard < batches + 2) {
    guard += 1;
    const step = await stepCatalogImport({ data: { jobId } });
    if (step.error) {
      emit({
        phase: "fail",
        saved: step.saved,
        doneBatches: step.batch,
        status: step.error,
        failedSteps: snap.failedSteps + 1,
      });
      toast.error(step.error);
      return;
    }
    latest = step;
    if (step.state) useStore.getState().adopt(step.state);
    emit({
      saved: step.saved,
      doneBatches: step.batch,
      batches: step.batches,
      total: step.total || snap.total,
      status: step.done ? snap.status : `Saving batch ${step.batch + 1} of ${step.batches}.`,
    });
  }
  if (!latest.done || !latest.report) {
    emit({
      phase: "fail",
      status: "The import stopped before the last batch.",
      failedSteps: snap.failedSteps + 1,
    });
    toast.error("Import stopped.");
    return;
  }
  const filed = latest.report.imported.toLocaleString("en-NG");
  emit({
    phase: "done",
    report: latest.report,
    saved: latest.saved,
    status: `${filed} services filed${latest.report.serverLabel ? ` under ${latest.report.serverLabel}` : ""}.`,
  });
  toast.success(`${filed} services filed.`);
}

export function startCatalogRun(input: StartInput) {
  if (running) return;
  running = true;
  const selective = !!input.selective;
  emit({
    ...idle,
    phase: input.url && !selective ? "fetch" : "save",
    selective,
    status: selective ? "Saving the products you ticked. Other products stay." : input.url ? "Downloading the catalogue." : "Splitting the catalogue into batches of 2,000.",
  });
  void (async () => {
    try {
      const started = await beginCatalogImport({ data: { ...input, selective } });
      if (started.error || !started.jobId) {
        emit({
          phase: "fail",
          status: started.error || "Import failed",
          failedSteps: 1,
        });
        toast.error(started.error || "Import failed");
        return;
      }
      emit({
        jobId: started.jobId,
        total: started.total,
        batches: started.batches,
        batchSize: started.batchSize,
        phase: "save",
        status: `Saving batch 1 of ${started.batches}.`,
      });
      await drain(started.jobId, started.batches);
    } catch {
      emit({
        phase: "fail",
        status: "Could not keep saving. The batches already saved are still in the catalogue.",
        failedSteps: snap.failedSteps + 1,
      });
      toast.error("Import stopped.");
    } finally {
      running = false;
    }
  })();
}

export function resumeCatalogRun() {
  if (running || !snap.jobId || snap.phase === "save" || snap.phase === "fetch") return;
  running = true;
  emit({ phase: "save", status: `Saving batch ${snap.doneBatches + 1} of ${snap.batches}.` });
  void drain(snap.jobId, snap.batches).finally(() => {
    running = false;
  });
}
