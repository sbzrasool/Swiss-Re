export type Role =
  | "adjuster"
  | "senior_adjudicator"
  | "supervisor"
  | "auditor"
  | "admin";

export type Permission =
  | "claim.view"
  | "claim.edit"
  | "claim.delete"
  | "claim.assign"
  | "document.view"
  | "document.edit"
  | "document.comment"
  | "document.annotate"
  | "document.split"
  | "document.merge"
  | "document.delete_page";

export type ClaimStatus =
  | "Intake"
  | "In Review"
  | "Pending Info"
  | "Adjudicated"
  | "Closed"
  | "Escalated";

export type Channel = "Email" | "SFTP" | "Portal" | "Unstructured";
export type LineOfBusiness = "Life" | "Health" | "Disability" | "Critical Illness";

export interface User {
  id: string;
  name: string;
  title: string;
  role: Role;
}

export interface Claim {
  id: string;
  claimNumber: string;
  claimant: string;
  company: string;
  phone: string;
  email: string;
  country: string;
  status: ClaimStatus;
  channel: Channel;
  lob: LineOfBusiness;
  amount: number;
  receivedAt: number;
  assignedTo: string | null;
  documentCount: number;
  totalBytes: number;
  pageCount: number;
  riskScore: number;
}

export interface ClaimDocument {
  id: string;
  claimId: string;
  name: string;
  kind: "fnol" | "medical" | "correspondence" | "policy";
  bytes: number;
  pageCount: number;
  mime: "application/pdf";
}

export interface QueryParams {
  search: string;
  status: ClaimStatus | "All";
  channel: Channel | "All";
  sort: "newest" | "oldest" | "amount" | "claimant" | "status";
  offset: number;
  limit: number;
}

export interface QueryResult {
  rows: Claim[];
  total: number;
  tookMs: number;
  stats: GridStats;
}

export interface GridStats {
  total: number;
  inReview: number;
  highRisk: number;
  inReviewDelta: number;
  highRiskDelta: number;
}

export interface Comment {
  id: string;
  documentId: string;
  page: number;
  author: string;
  body: string;
  createdAt: number;
  resolved: boolean;
}

export interface Annotation {
  id: string;
  documentId: string;
  page: number;
  author: string;
  x: number;
  y: number;
  w: number;
  h: number;
  note: string;
}

export type JobType = "split" | "merge" | "delete_page" | "add_page";
export type JobStatus = "queued" | "running" | "cancelling" | "success" | "failed" | "cancelled";

export interface DocumentJob {
  id: string;
  type: JobType;
  documentId: string;
  claimId: string;
  label: string;
  progress: number;
  status: JobStatus;
  error?: string;
  startedAt: number;
}

export interface PagePayload {
  page: number;
  title: string;
  lines: string[];
  chunkKb: number;
  rangeHeader: string;
}
