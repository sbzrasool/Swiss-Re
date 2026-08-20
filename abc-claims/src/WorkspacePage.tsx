import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronLeft,
  ChevronRight,
  Scissors,
  Combine,
  Trash2,
  MessageSquarePlus,
} from "lucide-react";
import { fetchClaim, fetchPageChunk, formatBytes, formatDate, formatMoney } from "./api";
import { useCan } from "./Can";
import { useSession } from "./store";
import type { Annotation, Claim, ClaimDocument, PagePayload } from "./types";

export function WorkspacePage() {
  const { claimId = "" } = useParams();
  const user = useSession((s) => s.user);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [documents, setDocuments] = useState<ClaimDocument[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchClaim(claimId)
      .then((res) => {
        if (cancelled) return;
        setClaim(res.claim);
        setDocuments(res.documents);
        setActiveId(res.documents[0]?.id ?? null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [claimId]);

  const doc = documents.find((d) => d.id === activeId) ?? documents[0];

  if (error) {
    return (
      <div className="panel">
        <div className="error">{error}</div>
        <Link to="/" className="btn">
          Back to claims
        </Link>
      </div>
    );
  }

  if (!claim || !doc) {
    return (
      <div className="panel">
        <p className="hint">Opening claim workspace…</p>
      </div>
    );
  }

  return (
    <>
      <div className="workspace-head">
        <div>
          <div className="crumb">
            <Link to="/">All claims</Link>
            <span>/</span>
            <span>{claim.claimNumber}</span>
          </div>
          <h2>{claim.claimant}</h2>
          <div className="meta">
            <span className="pill active">{claim.status}</span>
            <span>{claim.company}</span>
            <span>{formatMoney(claim.amount)}</span>
            <span>Received {formatDate(claim.receivedAt)}</span>
            <span>
              {claim.documentCount} documents · {formatBytes(claim.totalBytes)} · {claim.pageCount.toLocaleString()} pages
            </span>
            <span>Assigned {claim.assignedTo ?? "unassigned"}</span>
            <span>Signed in as {user.name}</span>
          </div>
        </div>
      </div>

      <div className="workspace">
        <aside className="doc-list">
          <h3>Case documents</h3>
          {documents.map((item) => (
            <button
              key={item.id}
              className={`doc-item${item.id === doc.id ? " current" : ""}`}
              onClick={() => setActiveId(item.id)}
            >
              <strong>{item.name}</strong>
              <small>
                {formatBytes(item.bytes)} · {item.pageCount.toLocaleString()} pages · {item.kind}
              </small>
            </button>
          ))}
          <p className="lock-note">
            Files stay in object storage. The browser only asks for the current page range.
          </p>
        </aside>
        <DocumentViewer claim={claim} document={doc} />
        <WorkspaceSide claim={claim} document={doc} />
      </div>
    </>
  );
}

function DocumentViewer({ claim, document }: { claim: Claim; document: ClaimDocument }) {
  const user = useSession((s) => s.user);
  const canAnnotate = useCan("document.annotate");
  const canSplit = useCan("document.split");
  const canMerge = useCan("document.merge");
  const canDeletePage = useCan("document.delete_page");
  const startJob = useSession((s) => s.startJob);
  const addAnnotation = useSession((s) => s.addAnnotation);
  const annotations = useSession((s) => s.annotations);
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<PagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const paperRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPage(1);
  }, [document.id]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setPageError(null);
    fetchPageChunk(document.id, page, document.pageCount, controller.signal)
      .then((res) => {
        setPayload(res);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setPageError(err.message);
        setLoading(false);
      });
    return () => controller.abort();
  }, [document.id, page, document.pageCount, retryNonce]);

  const thumbs = useVirtualizer({
    count: document.pageCount,
    getScrollElement: () => thumbsRef.current,
    estimateSize: () => 66,
    horizontal: true,
    overscan: 12,
  });

  const pageAnns = annotations.filter((a) => a.documentId === document.id && a.page === page);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!canAnnotate || !paperRef.current) return;
    const rect = paperRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setDraft({ x, y, w: 0, h: 0 });
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!draft || !paperRef.current) return;
    const rect = paperRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setDraft({
      x: Math.min(draft.x, x),
      y: Math.min(draft.y, y),
      w: Math.abs(x - draft.x),
      h: Math.abs(y - draft.y),
    });
  }

  function onPointerUp() {
    if (!draft || draft.w < 2 || draft.h < 2) {
      setDraft(null);
      return;
    }
    const note = window.prompt("Annotation note (page-level)") ?? "";
    addAnnotation({
      documentId: document.id,
      page,
      author: user.name,
      ...draft,
      note: note || "Highlight",
    });
    setDraft(null);
  }

  return (
    <section className="viewer">
      <div className="viewer-toolbar">
        <div>
          <button className="btn-sm btn" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ margin: "0 8px", fontSize: 13 }}>
            Page {page.toLocaleString()} / {document.pageCount.toLocaleString()}
          </span>
          <button
            className="btn-sm btn"
            disabled={page === document.pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn-sm btn"
            disabled={!canSplit}
            title={canSplit ? "Split after this page" : "Split requires Senior Adjudicator"}
            onClick={() =>
              startJob({
                type: "split",
                documentId: document.id,
                claimId: claim.id,
                label: `Split ${document.name} after page ${page}`,
              })
            }
          >
            <Scissors size={14} /> Split
          </button>
          <button
            className="btn-sm btn"
            disabled={!canMerge}
            title={canMerge ? "Merge with next document" : "Merge requires Senior Adjudicator"}
            onClick={() =>
              startJob({
                type: "merge",
                documentId: document.id,
                claimId: claim.id,
                label: `Merge ${document.name} into case packet`,
              })
            }
          >
            <Combine size={14} /> Merge
          </button>
          <button
            className="btn-sm btn-danger"
            disabled={!canDeletePage}
            title={canDeletePage ? "Delete this page" : "Delete page is restricted"}
            onClick={() =>
              startJob({
                type: "delete_page",
                documentId: document.id,
                claimId: claim.id,
                label: `Delete page ${page} from ${document.name}`,
              })
            }
          >
            <Trash2 size={14} /> Delete page
          </button>
        </div>
      </div>

      <div className="stream-banner">
        {payload
          ? `Streaming ${payload.rangeHeader} · ${payload.chunkKb} KB chunk · ${(document.bytes / 1024 ** 3).toFixed(2)} GB object not loaded`
          : "Requesting byte range…"}
      </div>

      <div className="page-stage">
        <div
          className="paper"
          ref={paperRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {loading && <p>Fetching page chunk…</p>}
          {pageError && (
            <div className="error">
              {pageError}
              <div className="modal-actions">
                <button className="btn-primary" onClick={() => setRetryNonce((n) => n + 1)}>
                  Retry page
                </button>
              </div>
            </div>
          )}
          {!loading && !pageError && payload && (
            <>
              <h4>{payload.title}</h4>
              <div className="rule" />
              {payload.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p>
                Drag on this page to annotate. Comments attach to the page, not the whole 1 GB file.
              </p>
            </>
          )}
          {pageAnns.map((ann) => (
            <AnnotationBox key={ann.id} ann={ann} />
          ))}
          {draft && (
            <div
              className="ann"
              style={{ left: `${draft.x}%`, top: `${draft.y}%`, width: `${draft.w}%`, height: `${draft.h}%` }}
            />
          )}
        </div>
      </div>

      <div className="thumbs" ref={thumbsRef}>
        <div
          style={{
            width: thumbs.getTotalSize(),
            height: 76,
            position: "relative",
          }}
        >
          {thumbs.getVirtualItems().map((item) => {
            const n = item.index + 1;
            return (
              <button
                key={item.key}
                className={`thumb${n === page ? " current" : ""}`}
                style={{
                  position: "absolute",
                  left: 0,
                  transform: `translateX(${item.start}px)`,
                  width: 58,
                }}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AnnotationBox({ ann }: { ann: Annotation }) {
  return (
    <div
      className="ann"
      title={`${ann.author}: ${ann.note}`}
      style={{ left: `${ann.x}%`, top: `${ann.y}%`, width: `${ann.w}%`, height: `${ann.h}%` }}
    />
  );
}

function WorkspaceSide({ claim, document }: { claim: Claim; document: ClaimDocument }) {
  const user = useSession((s) => s.user);
  const canComment = useCan("document.comment");
  const comments = useSession((s) => s.comments);
  const addComment = useSession((s) => s.addComment);
  const toggleComment = useSession((s) => s.toggleComment);
  const jobs = useSession((s) => s.jobs);
  const cancelJob = useSession((s) => s.cancelJob);
  const retryJob = useSession((s) => s.retryJob);
  const [body, setBody] = useState("");
  const [pageRef, setPageRef] = useState(1);

  const visible = useMemo(
    () => comments.filter((c) => c.documentId === document.id),
    [comments, document.id],
  );
  const claimJobs = jobs.filter((j) => j.claimId === claim.id);

  return (
    <aside className="side-panel">
      <div>
        <h3>Page comments</h3>
        <textarea
          className="comment-box"
          placeholder={canComment ? "Add a page-level comment" : "Commenting is disabled for this role"}
          disabled={!canComment}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="panel-tools" style={{ marginTop: 8 }}>
          <input
            className="select"
            style={{ width: 88 }}
            type="number"
            min={1}
            max={document.pageCount}
            value={pageRef}
            onChange={(e) => setPageRef(Number(e.target.value))}
            aria-label="Comment page"
          />
          <button
            className="btn-primary btn-sm"
            disabled={!canComment || !body.trim()}
            onClick={() => {
              addComment({
                documentId: document.id,
                page: pageRef,
                author: user.name,
                body: body.trim(),
              });
              setBody("");
            }}
          >
            <MessageSquarePlus size={14} /> Comment
          </button>
        </div>
        {visible.length === 0 && <p className="hint">No comments on this document yet.</p>}
        {visible.map((c) => (
          <div className="comment" key={c.id}>
            <strong>
              {c.author} · p.{c.page}
            </strong>
            <p>{c.body}</p>
            <button className="btn-ghost btn-sm" onClick={() => toggleComment(c.id)}>
              {c.resolved ? "Reopen" : "Resolve"}
            </button>
          </div>
        ))}
      </div>

      <div>
        <h3>Document jobs</h3>
        <p className="lock-note">
          Split, merge and delete are pessimistic server jobs. Cancel leaves the previous version intact.
        </p>
        {claimJobs.length === 0 && <p className="hint">No running operations.</p>}
        {claimJobs.map((job) => (
          <div className="job" key={job.id}>
            <strong>{job.label}</strong>
            <div className="job-bar">
              <span style={{ width: `${job.progress}%` }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>
                {job.status}
                {job.error ? ` · ${job.error}` : ""}
              </span>
              {(job.status === "running" || job.status === "queued") && (
                <button className="btn-ghost btn-sm" onClick={() => cancelJob(job.id)}>
                  Cancel
                </button>
              )}
              {job.status === "failed" && (
                <button className="btn-sm btn-primary" onClick={() => retryJob(job.id)}>
                  Retry
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
