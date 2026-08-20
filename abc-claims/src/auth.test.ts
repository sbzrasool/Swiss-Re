import { describe, expect, it } from "vitest";
import { can } from "./auth";

describe("RBAC", () => {
  it("hides destructive claim actions from auditors", () => {
    expect(can("auditor", "claim.view")).toBe(true);
    expect(can("auditor", "claim.delete")).toBe(false);
    expect(can("auditor", "document.split")).toBe(false);
    expect(can("auditor", "document.comment")).toBe(true);
  });

  it("keeps split/merge on senior adjudicators and admins only", () => {
    expect(can("adjuster", "document.split")).toBe(false);
    expect(can("senior_adjudicator", "document.split")).toBe(true);
    expect(can("admin", "document.merge")).toBe(true);
    expect(can("supervisor", "claim.delete")).toBe(true);
    expect(can("supervisor", "document.merge")).toBe(false);
  });
});
