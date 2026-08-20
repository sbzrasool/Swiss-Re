import type { Claim, ClaimStatus, QueryParams } from "./types";

export function queryClaims(all: Claim[], params: QueryParams): { rows: Claim[]; total: number } {
  const search = params.search.trim().toLowerCase();
  let filtered = all;

  if (search) {
    filtered = filtered.filter((c) => {
      return (
        c.claimNumber.toLowerCase().includes(search) ||
        c.claimant.toLowerCase().includes(search) ||
        c.company.toLowerCase().includes(search) ||
        c.email.toLowerCase().includes(search) ||
        c.phone.toLowerCase().includes(search)
      );
    });
  }

  if (params.status !== "All") {
    filtered = filtered.filter((c) => c.status === params.status);
  }

  if (params.channel !== "All") {
    filtered = filtered.filter((c) => c.channel === params.channel);
  }

  const sorted = filtered.slice().sort((a, b) => compare(a, b, params.sort));
  const rows = sorted.slice(params.offset, params.offset + params.limit);
  return { rows, total: sorted.length };
}

function compare(a: Claim, b: Claim, sort: QueryParams["sort"]): number {
  switch (sort) {
    case "oldest":
      return a.receivedAt - b.receivedAt;
    case "amount":
      return b.amount - a.amount;
    case "claimant":
      return a.claimant.localeCompare(b.claimant);
    case "status":
      return a.status.localeCompare(b.status);
    case "newest":
    default:
      return b.receivedAt - a.receivedAt;
  }
}

export function isActiveStatus(status: ClaimStatus): boolean {
  return status === "Intake" || status === "In Review" || status === "Pending Info" || status === "Escalated";
}
