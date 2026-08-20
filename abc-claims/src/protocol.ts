import type { Claim, ClaimDocument, GridStats, QueryParams, Role } from "./types";

export type ClientRequest =
  | { type: "init" }
  | { type: "query"; params: QueryParams }
  | { type: "get"; claimId: string }
  | {
      type: "mutate";
      role: Role;
      action: "assign" | "delete" | "update";
      claimId: string;
      assignedTo?: string | null;
      patch?: Partial<Pick<Claim, "status" | "claimant" | "company" | "phone" | "email">>;
    };

export type WorkerRequest = ClientRequest & { id: number };

export type WorkerResponse =
  | { id: number; type: "ready"; stats: GridStats; tookMs: number }
  | { id: number; type: "queryResult"; rows: Claim[]; total: number; tookMs: number; stats: GridStats }
  | { id: number; type: "claimResult"; claim: Claim; documents: ClaimDocument[] }
  | { id: number; type: "mutateResult"; claim: Claim | null }
  | { id: number; type: "error"; message: string };
