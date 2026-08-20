import {
  Box,
  FileText,
  HelpCircle,
  KeyRound,
  Megaphone,
  Wallet,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ROLE_LABEL, USERS } from "./auth";
import { useSession } from "./store";

const NAV = [
  { to: "/", label: "Claims", icon: KeyRound, end: true },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/assign", label: "Assign", icon: Wallet },
  { to: "/promote", label: "Quality", icon: Megaphone },
  { to: "/help", label: "Help", icon: HelpCircle },
];

export function Shell() {
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const location = useLocation();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <Box size={20} />
          </div>
          <div>
            <h1>ABC Claims</h1>
            <span>Adjudication workspace</span>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.end
              ? location.pathname === "/" || location.pathname.startsWith("/claims")
              : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={() => `nav-item${active ? " active" : ""}`}
                end={item.end}
              >
                <Icon size={20} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div>
          <div className="sidebar-user">
            <div className="avatar" aria-hidden>
              {user.name.split(" ").map((p) => p[0]).join("")}
            </div>
            <div>
              <strong>{user.name}</strong>
              <small>{user.title}</small>
            </div>
          </div>
          <select
            className="role-select"
            aria-label="Switch demo role"
            value={user.id}
            onChange={(e) => {
              const next = USERS.find((u) => u.id === e.target.value);
              if (next) setUser(next);
            }}
          >
            {USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {ROLE_LABEL[u.role]}
              </option>
            ))}
          </select>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
