import type { ReactNode } from "react";
import { can } from "./auth";
import { useSession } from "./store";
import type { Permission } from "./types";

export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const role = useSession((s) => s.user.role);
  if (can(role, permission)) return <>{children}</>;
  return <>{fallback}</>;
}

export function useCan(permission: Permission): boolean {
  return can(useSession((s) => s.user.role), permission);
}
