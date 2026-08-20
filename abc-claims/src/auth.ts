import type { Permission, Role, User } from "./types";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  auditor: [
    "claim.view",
    "document.view",
    "document.comment",
  ],
  adjuster: [
    "claim.view",
    "claim.edit",
    "document.view",
    "document.edit",
    "document.comment",
    "document.annotate",
  ],
  senior_adjudicator: [
    "claim.view",
    "claim.edit",
    "claim.assign",
    "document.view",
    "document.edit",
    "document.comment",
    "document.annotate",
    "document.split",
    "document.merge",
    "document.delete_page",
  ],
  supervisor: [
    "claim.view",
    "claim.edit",
    "claim.delete",
    "claim.assign",
    "document.view",
    "document.comment",
    "document.annotate",
  ],
  admin: [
    "claim.view",
    "claim.edit",
    "claim.delete",
    "claim.assign",
    "document.view",
    "document.edit",
    "document.comment",
    "document.annotate",
    "document.split",
    "document.merge",
    "document.delete_page",
  ],
};

export const USERS: User[] = [
  { id: "u-maya", name: "Maya Ellison", title: "Claims Adjuster", role: "adjuster" },
  { id: "u-ravi", name: "Ravi Shah", title: "Senior Adjudicator", role: "senior_adjudicator" },
  { id: "u-elena", name: "Elena Vogt", title: "Claims Supervisor", role: "supervisor" },
  { id: "u-jon", name: "Jon Hale", title: "Audit & Compliance", role: "auditor" },
  { id: "u-priya", name: "Priya Nair", title: "Workspace Admin", role: "admin" },
];

export function permissionsFor(role: Role): Set<Permission> {
  return new Set(ROLE_PERMISSIONS[role]);
}

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_LABEL: Record<Role, string> = {
  adjuster: "Adjuster",
  senior_adjudicator: "Senior Adjudicator",
  supervisor: "Supervisor",
  auditor: "Auditor",
  admin: "Admin",
};
