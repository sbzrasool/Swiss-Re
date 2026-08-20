import { can } from "./auth";
import { isActiveStatus, queryClaims } from "./engine";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import type {
  Channel,
  Claim,
  ClaimDocument,
  ClaimStatus,
  GridStats,
  LineOfBusiness,
  Permission,
  Role,
} from "./types";

const TOTAL = 20_000;
const CHANNELS: Channel[] = ["Email", "SFTP", "Portal", "Unstructured"];
const LOBS: LineOfBusiness[] = ["Life", "Health", "Disability", "Critical Illness"];
const FIRST = [
  "Maria", "James", "Priya", "Lukas", "Amina", "Chen", "Sofia", "Omar", "Elena", "Noah",
  "Hana", "Mateo", "Ingrid", "Arjun", "Claire", "Yuto", "Fatima", "Leo", "Sara", "Diego",
];
const LAST = [
  "Chen", "Patel", "Keller", "Nwosu", "Berg", "Nakamura", "Rossi", "Hughes", "Silva", "Khan",
  "Moreau", "Novak", "Andersson", "Costa", "Okafor", "Dubois", "Mehta", "Walsh", "Tanaka", "Iqbal",
];
const COMPANIES = [
  "Helvetia Life", "Nordic Health Re", "Pacific Mutual", "Rhine Cover", "Atlas Benefits",
  "Cedar Assurance", "Meridian Group", "Solstice Health", "Oakmont Life", "Vantage Care",
  "Lumen Disability", "Harbor Mutual", "Pinnacle Re", "Silverline", "Northgate Life",
];
const COUNTRIES = [
  "Switzerland", "Germany", "United States", "India", "United Kingdom", "Singapore",
  "France", "Japan", "Canada", "UAE", "Australia", "Netherlands",
];
const ASSIGNEES = ["Maya Ellison", "Ravi Shah", "Elena Vogt", "Jon Hale", "Priya Nair", null];

let claims: Claim[] = [];
let stats: GridStats = { total: 0, inReview: 0, highRisk: 0, inReviewDelta: 16, highRiskDelta: -4 };

function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length)]!;
}

function generate() {
  const rng = mulberry32(137263);
  const now = Date.UTC(2026, 7, 20);
  const rows: Claim[] = new Array(TOTAL);

  for (let i = 0; i < TOTAL; i++) {
    const first = pick(rng, FIRST);
    const last = pick(rng, LAST);
    const claimant = `${first} ${last}`;
    const status = weightedStatus(rng);
    const bytesBase = 150 * 1024 * 1024 + Math.floor(rng() * (850 * 1024 * 1024));
    const documentCount = 1 + Math.floor(rng() * 4);
    const totalBytes = bytesBase + documentCount * 12 * 1024 * 1024;
    const pageCount = Math.max(180, Math.round(totalBytes / (420 * 1024)));

    rows[i] = {
      id: `c-${i + 1}`,
      claimNumber: `CLM-${100000 + i}`,
      claimant,
      company: pick(rng, COMPANIES),
      phone: `+${Math.floor(20 + rng() * 80)} ${Math.floor(100 + rng() * 900)} ${Math.floor(1000 + rng() * 9000)}`,
      email: `${first}.${last}${i % 17}@${pick(rng, COMPANIES).split(" ")[0]!.toLowerCase()}.com`.replace(/[^a-z0-9.@]/g, ""),
      country: pick(rng, COUNTRIES),
      status,
      channel: pick(rng, CHANNELS),
      lob: pick(rng, LOBS),
      amount: Math.round((8000 + rng() * 920000) / 10) * 10,
      receivedAt: now - Math.floor(rng() * 120) * 86400000,
      assignedTo: isActiveStatus(status) ? pick(rng, ASSIGNEES) : pick(rng, ASSIGNEES.slice(0, 5)),
      documentCount,
      totalBytes,
      pageCount,
      riskScore: Math.round(rng() * 100),
    };
  }

  claims = rows;
  const inReview = rows.filter((c) => c.status === "In Review").length;
  const highRisk = rows.filter((c) => c.riskScore >= 75 && isActiveStatus(c.status)).length;
  stats = {
    total: rows.length,
    inReview,
    highRisk,
    inReviewDelta: 16,
    highRiskDelta: -4,
  };
}

function weightedStatus(rng: () => number): ClaimStatus {
  const n = rng();
  if (n < 0.18) return "Intake";
  if (n < 0.46) return "In Review";
  if (n < 0.62) return "Pending Info";
  if (n < 0.78) return "Adjudicated";
  if (n < 0.9) return "Closed";
  return "Escalated";
}

function documentsFor(claim: Claim): ClaimDocument[] {
  const rng = mulberry32(claim.id.split("-")[1]!.length + Number(claim.id.split("-")[1]));
  const kinds: ClaimDocument["kind"][] = ["fnol", "medical", "correspondence", "policy"];
  const names: Record<ClaimDocument["kind"], string> = {
    fnol: "FNOL pack.pdf",
    medical: "Medical records.pdf",
    correspondence: "Channel correspondence.pdf",
    policy: "Policy extract.pdf",
  };
  return Array.from({ length: claim.documentCount }, (_, i) => {
    const kind = kinds[i % kinds.length]!;
    const share = (kind === "medical" ? 0.48 : kind === "fnol" ? 0.32 : 0.1) * (0.85 + rng() * 0.3);
    const bytes = Math.max(20 * 1024 * 1024, Math.round(claim.totalBytes * share));
    return {
      id: `${claim.id}-d${i + 1}`,
      claimId: claim.id,
      name: `${claim.claimNumber} · ${names[kind]}`,
      kind,
      bytes,
      pageCount: Math.max(24, Math.round(bytes / (420 * 1024))),
      mime: "application/pdf",
    };
  });
}

function assertCan(role: Role, permission: Permission) {
  if (!can(role, permission)) {
    throw new Error(`FORBIDDEN:${permission}`);
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === "init") {
      const t0 = performance.now();
      generate();
      const tookMs = Math.round(performance.now() - t0);
      const res: WorkerResponse = { id: msg.id, type: "ready", stats, tookMs };
      self.postMessage(res);
      return;
    }

    if (!claims.length) generate();

    if (msg.type === "query") {
      const t0 = performance.now();
      const { rows, total } = queryClaims(claims, msg.params);
      const res: WorkerResponse = {
        id: msg.id,
        type: "queryResult",
        rows,
        total,
        tookMs: Math.round(performance.now() - t0),
        stats,
      };
      self.postMessage(res);
      return;
    }

    if (msg.type === "get") {
      const claim = claims.find((c) => c.id === msg.claimId);
      if (!claim) throw new Error("Claim not found");
      const res: WorkerResponse = {
        id: msg.id,
        type: "claimResult",
        claim,
        documents: documentsFor(claim),
      };
      self.postMessage(res);
      return;
    }

    if (msg.type === "mutate") {
      const idx = claims.findIndex((c) => c.id === msg.claimId);
      if (idx < 0) throw new Error("Claim not found");

      if (msg.action === "delete") {
        assertCan(msg.role, "claim.delete");
        const removed = claims[idx]!;
        claims.splice(idx, 1);
        stats.total = claims.length;
        const res: WorkerResponse = { id: msg.id, type: "mutateResult", claim: removed };
        self.postMessage(res);
        return;
      }

      if (msg.action === "assign") {
        assertCan(msg.role, "claim.assign");
        claims[idx] = { ...claims[idx]!, assignedTo: msg.assignedTo ?? null };
      }

      if (msg.action === "update") {
        assertCan(msg.role, "claim.edit");
        claims[idx] = { ...claims[idx]!, ...msg.patch };
      }

      const res: WorkerResponse = { id: msg.id, type: "mutateResult", claim: claims[idx]! };
      self.postMessage(res);
    }
  } catch (error) {
    const res: WorkerResponse = {
      id: msg.id,
      type: "error",
      message: error instanceof Error ? error.message : "Unknown worker error",
    };
    self.postMessage(res);
  }
};
