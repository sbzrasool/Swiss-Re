import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  Monitor,
  Pencil,
  Trash2,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import { fetchClaims, formatBytes, formatMoney, mutateClaim } from "./api";
import { USERS } from "./auth";
import { useCan } from "./Can";
import { useSession } from "./store";
import type { Channel, Claim, ClaimStatus, GridStats, QueryParams } from "./types";

const PAGE_SIZE = 8;

function statusClass(status: ClaimStatus): string {
  if (status === "Closed") return "inactive";
  if (status === "Adjudicated") return "review";
  if (status === "Escalated" || status === "Pending Info") return "warn";
  return "active";
}

export function ClaimsPage() {
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const canEdit = useCan("claim.edit");
  const canDelete = useCan("claim.delete");
  const canAssign = useCan("claim.assign");

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<QueryParams["status"]>("All");
  const [channel, setChannel] = useState<QueryParams["channel"]>("All");
  const [sort, setSort] = useState<QueryParams["sort"]>("newest");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Claim[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<GridStats | null>(null);
  const [tookMs, setTookMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Claim | null>(null);
  const [assigning, setAssigning] = useState<Claim | null>(null);
  const [deleting, setDeleting] = useState<Claim | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, status, channel, sort]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchClaims({
      search: debounced,
      status,
      channel,
      sort,
      offset: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return;
        setRows(res.rows);
        setTotal(res.total);
        setTookMs(res.tookMs);
        setStats(res.stats);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, status, channel, sort, page, user.role]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pages = useMemo(() => visiblePages(page, pageCount), [page, pageCount]);

  async function runMutate(
    action: "assign" | "delete" | "update",
    claim: Claim,
    extra?: { assignedTo?: string | null; patch?: Partial<Claim> },
  ) {
    try {
      await mutateClaim({
        role: user.role,
        action,
        claimId: claim.id,
        assignedTo: extra?.assignedTo,
        patch: extra?.patch,
      });
      setToast(
        action === "delete"
          ? `${claim.claimNumber} deleted. Authorization was checked on the API, not only in the UI.`
          : `${claim.claimNumber} updated.`,
      );
      setEditing(null);
      setAssigning(null);
      setDeleting(null);
      const res = await fetchClaims({
        search: debounced,
        status,
        channel,
        sort,
        offset: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      setRows(res.rows);
      setTotal(res.total);
      setStats(res.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace("FORBIDDEN:", "Not authorized: ") : "Request failed");
    }
  }

  return (
    <>
      <div className="topbar">
        <h2 className="hello">
          Hello {user.name.split(" ")[0]} <em>👋🏼,</em>
        </h2>
        <input className="search" placeholder="Search" aria-label="Global search" />
      </div>

      <section className="metrics">
        <article className="metric">
          <div className="metric-icon" style={{ background: "#d3ffe7" }}>
            <UsersRound size={32} color="#00ac4f" />
          </div>
          <div>
            <h3>Total claims</h3>
            <strong>{(stats?.total ?? 20000).toLocaleString()}</strong>
            <p>
              <b className="up">
                <ArrowUpRight size={14} /> 16%
              </b>{" "}
              this month
            </p>
          </div>
        </article>
        <article className="metric">
          <div className="metric-icon" style={{ background: "#cce8ff" }}>
            <Users size={32} color="#1977f3" />
          </div>
          <div>
            <h3>In review</h3>
            <strong>{(stats?.inReview ?? 0).toLocaleString()}</strong>
            <p>
              <b className="up">
                <ArrowUpRight size={14} /> {stats?.inReviewDelta ?? 16}%
              </b>{" "}
              this month
            </p>
          </div>
        </article>
        <article className="metric">
          <div className="metric-icon" style={{ background: "#ffa3cf" }}>
            <Monitor size={32} color="#d0004b" />
          </div>
          <div>
            <h3>High-risk open</h3>
            <strong>{(stats?.highRisk ?? 0).toLocaleString()}</strong>
            <p>
              <b className="down">
                <ArrowDownRight size={14} /> {Math.abs(stats?.highRiskDelta ?? 4)}%
              </b>{" "}
              this month
            </p>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>All Claims</h2>
            <p>Open pipeline</p>
          </div>
          <div className="panel-tools">
            <input
              className="panel-search"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search claims"
            />
            <select
              className="select"
              value={status}
              onChange={(e) => setStatus(e.target.value as QueryParams["status"])}
              aria-label="Filter status"
            >
              <option value="All">All statuses</option>
              {["Intake", "In Review", "Pending Info", "Adjudicated", "Closed", "Escalated"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              className="select"
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel | "All")}
              aria-label="Filter channel"
            >
              <option value="All">All channels</option>
              {["Email", "SFTP", "Portal", "Unstructured"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              className="select"
              value={sort}
              onChange={(e) => setSort(e.target.value as QueryParams["sort"])}
              aria-label="Sort claims"
            >
              <option value="newest">Sort by: Newest</option>
              <option value="oldest">Sort by: Oldest</option>
              <option value="amount">Sort by: Amount</option>
              <option value="claimant">Sort by: Claimant</option>
              <option value="status">Sort by: Status</option>
            </select>
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Claimant</th>
                <th>Company</th>
                <th>Phone Number</th>
                <th>Email</th>
                <th>Country</th>
                <th>Status</th>
                <th>Documents</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} style={{ color: "#b5b7c0" }}>
                        Loading window…
                      </td>
                    </tr>
                  ))
                : rows.map((claim) => (
                    <tr key={claim.id} onClick={() => navigate(`/claims/${claim.id}`)}>
                      <td>
                        <div className="name-cell">
                          <strong>{claim.claimant}</strong>
                          <small>
                            {claim.claimNumber} · {formatMoney(claim.amount)}
                          </small>
                        </div>
                      </td>
                      <td>{claim.company}</td>
                      <td>{claim.phone}</td>
                      <td>{claim.email}</td>
                      <td>{claim.country}</td>
                      <td>
                        <span className={`pill ${statusClass(claim.status)}`}>{claim.status}</span>
                      </td>
                      <td>
                        {claim.documentCount} files · {formatBytes(claim.totalBytes)}
                      </td>
                      <td>
                        <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="icon-btn"
                            title={canEdit ? "Edit" : "Edit disabled for this role"}
                            disabled={!canEdit}
                            onClick={() => setEditing(claim)}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-btn"
                            title={canAssign ? "Assign" : "Assign disabled for this role"}
                            disabled={!canAssign}
                            onClick={() => setAssigning(claim)}
                          >
                            <UserPlus size={16} />
                          </button>
                          <button
                            className="icon-btn"
                            title={canDelete ? "Delete" : "Delete disabled for this role"}
                            disabled={!canDelete}
                            onClick={() => setDeleting(claim)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <span>
            Showing data {(total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1).toLocaleString()} to{" "}
            {Math.min(page * PAGE_SIZE, total).toLocaleString()} of {total.toLocaleString()} entries
          </span>
          <div className="pages">
            <button className="page" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              &lt;
            </button>
            {pages.map((item, idx) =>
              item === "…" ? (
                <span key={`e${idx}`}>…</span>
              ) : (
                <button
                  key={item}
                  className={`page${item === page ? " current" : ""}`}
                  onClick={() => setPage(item)}
                >
                  {item}
                </button>
              ),
            )}
            <button className="page" disabled={page === pageCount} onClick={() => setPage((p) => p + 1)}>
              &gt;
            </button>
          </div>
        </div>
        <p className="hint">
          Server-side filter/sort/page on 20,000 claims · worker query {tookMs}ms · UI renders {rows.length} rows.
          Select a row to open the document workspace.
        </p>
      </section>

      {editing && (
        <Modal title={`Edit ${editing.claimNumber}`} onClose={() => setEditing(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void runMutate("update", editing, {
                patch: {
                  claimant: String(data.get("claimant")),
                  company: String(data.get("company")),
                  phone: String(data.get("phone")),
                  email: String(data.get("email")),
                  status: String(data.get("status")) as ClaimStatus,
                },
              });
            }}
          >
            <label className="field">
              Claimant
              <input name="claimant" defaultValue={editing.claimant} />
            </label>
            <label className="field">
              Company
              <input name="company" defaultValue={editing.company} />
            </label>
            <label className="field">
              Phone
              <input name="phone" defaultValue={editing.phone} />
            </label>
            <label className="field">
              Email
              <input name="email" defaultValue={editing.email} />
            </label>
            <label className="field">
              Status
              <select name="status" defaultValue={editing.status}>
                {["Intake", "In Review", "Pending Info", "Adjudicated", "Closed", "Escalated"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn-primary" type="submit">
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}

      {assigning && (
        <Modal title={`Assign ${assigning.claimNumber}`} onClose={() => setAssigning(null)}>
          <p>Assignment is authorized on the API. Frontend only hides or disables the control.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void runMutate("assign", assigning, { assignedTo: String(data.get("assignee")) });
            }}
          >
            <label className="field">
              Assignee
              <select name="assignee" defaultValue={assigning.assignedTo ?? USERS[0]!.name}>
                {USERS.map((u) => (
                  <option key={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setAssigning(null)}>
                Cancel
              </button>
              <button className="btn-primary" type="submit">
                Assign
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal title={`Delete ${deleting.claimNumber}?`} onClose={() => setDeleting(null)}>
          <p>This is a hard delete of the claim record. Document objects would be tombstoned in production.</p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button className="btn-danger" type="button" onClick={() => void runMutate("delete", deleting)}>
              Delete
            </button>
          </div>
        </Modal>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
          <button className="btn-ghost" onClick={() => setToast(null)}>
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="modal-title">
        <h3 id="modal-title">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function visiblePages(current: number, total: number): Array<number | "…"> {
  if (total <= 6) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 4, "…", total];
  if (current >= total - 2) return [1, "…", total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}
