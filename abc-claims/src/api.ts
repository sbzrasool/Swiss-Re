import type {
  Claim,
  ClaimDocument,
  GridStats,
  PagePayload,
  QueryParams,
  QueryResult,
  Role,
} from "./types";
import type { ClientRequest, WorkerRequest, WorkerResponse } from "./protocol";

const worker = new Worker(new URL("./claims.worker.ts", import.meta.url), { type: "module" });

let seq = 1;
const pending = new Map<number, { resolve: (v: WorkerResponse) => void; reject: (e: Error) => void }>();

worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
  const res = event.data;
  const waiter = pending.get(res.id);
  if (!waiter) return;
  pending.delete(res.id);
  if (res.type === "error") waiter.reject(new Error(res.message));
  else waiter.resolve(res);
};

function call(req: ClientRequest, networkMs = 90): Promise<WorkerResponse> {
  const id = seq++;
  const payload = { ...req, id } as WorkerRequest;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    window.setTimeout(() => worker.postMessage(payload), networkMs);
  });
}

export async function initStore(): Promise<{ stats: GridStats; tookMs: number }> {
  const res = await call({ type: "init" }, 0);
  if (res.type !== "ready") throw new Error("Init failed");
  return { stats: res.stats, tookMs: res.tookMs };
}

export async function fetchClaims(params: QueryParams): Promise<QueryResult> {
  const res = await call({ type: "query", params }, 70 + Math.floor(Math.random() * 80));
  if (res.type !== "queryResult") throw new Error("Query failed");
  return { rows: res.rows, total: res.total, tookMs: res.tookMs, stats: res.stats };
}

export async function fetchClaim(claimId: string): Promise<{ claim: Claim; documents: ClaimDocument[] }> {
  const res = await call({ type: "get", claimId }, 60);
  if (res.type !== "claimResult") throw new Error("Get failed");
  return { claim: res.claim, documents: res.documents };
}

export async function mutateClaim(input: {
  role: Role;
  action: "assign" | "delete" | "update";
  claimId: string;
  assignedTo?: string | null;
  patch?: Partial<Pick<Claim, "status" | "claimant" | "company" | "phone" | "email">>;
}): Promise<Claim | null> {
  const res = await call({ type: "mutate", ...input }, 80);
  if (res.type !== "mutateResult") throw new Error("Mutate failed");
  return res.claim;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(ts);
}

export async function fetchPageChunk(
  documentId: string,
  page: number,
  pageCount: number,
  signal?: AbortSignal,
): Promise<PagePayload> {
  const latency = 110 + (page % 9) * 25;
  await wait(latency, signal);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (page % 73 === 0) {
    throw new Error("Range request timed out on chunk boundary. The file is still intact on object storage.");
  }

  const chunkKb = 180 + (page % 12) * 40;
  const start = (page - 1) * 420 * 1024;
  const end = start + chunkKb * 1024;
  return {
    page,
    title: pageTitle(documentId, page),
    lines: pageLines(documentId, page, pageCount),
    chunkKb,
    rangeHeader: `bytes=${start}-${end}`,
  };
}

function pageTitle(documentId: string, page: number): string {
  if (documentId.includes("d1")) return page === 1 ? "First Notice of Loss" : `FNOL exhibit ${page}`;
  if (documentId.includes("d2")) return page === 1 ? "Medical chronology" : `Clinical page ${page}`;
  if (documentId.includes("d3")) return `Channel artefact ${page}`;
  return `Policy schedule p.${page}`;
}

function pageLines(documentId: string, page: number, pageCount: number): string[] {
  return [
    `Document ${documentId} · page ${page} of ${pageCount}`,
    "This page is materialised from a byte-range request. The remainder of the file is not in memory.",
    `Claim facts seed ${((page * 17) % 97) + 3} · OCR confidence ${(92 - (page % 7)).toFixed(1)}%`,
    "Benefit: waiting period satisfied. Attending physician statement attached as subsequent range.",
    "Do not download the full object to the browser. Split, merge and delete operate as server-side jobs.",
    `Offset checksum ${((page * 7919) % 99991).toString(16).padStart(4, "0")}`,
  ];
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}
