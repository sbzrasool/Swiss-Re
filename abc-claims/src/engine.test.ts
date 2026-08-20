import { describe, expect, it } from "vitest";
import { queryClaims } from "./engine";
import type { Claim } from "./types";

function claim(partial: Partial<Claim> & Pick<Claim, "id" | "claimant" | "receivedAt" | "amount" | "status">): Claim {
  return {
    claimNumber: partial.id,
    company: "Helvetia Life",
    phone: "1",
    email: "a@b.com",
    country: "Switzerland",
    channel: "Email",
    lob: "Life",
    assignedTo: null,
    documentCount: 2,
    totalBytes: 1,
    pageCount: 10,
    riskScore: 10,
    ...partial,
  };
}

describe("queryClaims", () => {
  const all = [
    claim({ id: "1", claimant: "Maya Chen", company: "Atlas", receivedAt: 3, amount: 100, status: "Intake" }),
    claim({ id: "2", claimant: "Ravi Shah", company: "Pacific", receivedAt: 2, amount: 500, status: "Closed", channel: "SFTP" }),
    claim({ id: "3", claimant: "Elena Vogt", company: "Rhine", receivedAt: 1, amount: 250, status: "In Review" }),
  ];

  it("filters by search and status then sorts newest first", () => {
    const result = queryClaims(all, {
      search: "e",
      status: "All",
      channel: "All",
      sort: "newest",
      offset: 0,
      limit: 10,
    });
    expect(result.total).toBe(2);
    expect(result.rows.map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("pages without scanning the UI-visible slice incorrectly", () => {
    const result = queryClaims(all, {
      search: "",
      status: "All",
      channel: "All",
      sort: "amount",
      offset: 1,
      limit: 1,
    });
    expect(result.total).toBe(3);
    expect(result.rows[0]?.id).toBe("3");
  });
});
