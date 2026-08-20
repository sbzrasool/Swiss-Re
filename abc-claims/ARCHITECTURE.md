# Architecture note — ABC Claims Workspace

Swiss Re Senior UI case study (137263). This note is the discussion the brief asks for: architecture, performance, data flow and trade-offs. The running app in this folder is the proof.

## 1. Problem framing

ABC Insurance is replacing a legacy claims UI. The new surface has to:

- Let adjudicators work a **20,000+ row** inventory (sort, filter, Edit / Delete / Assign).
- Enforce **RBAC** so records and actions follow the user’s permissions.
- Open associated documents of **~150 MB–1 GB** (the brief also says 100 MB–1 GB; 1500 MB is treated as a typo) and support edit, split, merge, delete, page comments and annotations.

Insurance work is document-heavy and interrupt-driven. The UI must stay responsive, show progress honestly, and never put a gigabyte file in the JavaScript heap.

## 2. Architecture

### 2.1 Component boundaries

```
┌─────────────────────────────────────────────────────────────┐
│ App shell                                                   │
│  Sidebar · role switcher · layout tokens from the Figma     │
├──────────────────────────┬──────────────────────────────────┤
│ Claims grid feature      │ Document workspace feature       │
│  metrics, table, pager   │  file list, page viewer,         │
│  edit/assign/delete      │  comments, annotations, jobs     │
├──────────────────────────┴──────────────────────────────────┤
│ Shared: design tokens, Can(), session store, API façade     │
└──────────────────────────┬──────────────────────────────────┘
                           │ typed messages, simulated RTT
                           ▼
              Claims worker  =  stand-in for the API
              (generate, query, authorize, mutate)
```

- **Shell** owns chrome and the demo identity. It does not fetch claims.
- **Claims grid** owns inventory UX. It talks only to `api.ts`.
- **Workspace** owns document UX. It never loads a full file; it asks for a page chunk and a job id.
- **Worker** is the source of truth for records and authorization. The UI may hide a button; the worker still rejects the call.

That split is deliberate. A claims table and a PDF workstation have different cache keys, failure modes and performance budgets. Putting both in one global store would force every keystroke in search to consider annotation state.

### 2.2 State management

| State | Where | Why |
| --- | --- | --- |
| Identity / role | Zustand `useSession` | Cross-cutting, small, changes rarely |
| Grid query (search, page, sort) | Component state | URL-local; avoids stale pages in the workspace |
| Claim list | Fetched into the grid, not cached globally | Always a page window; no 20k array on the main thread |
| Comments / annotations | Zustand (client) | Optimistic and page-scoped; would hydrate from `/comments` in production |
| Long-running jobs | Zustand + timers | Survives panel re-renders; maps to a job API |

Redux is unnecessary at this size. Context alone would re-render the grid on every job tick. Zustand keeps job progress off the table’s render path.

Data fetching is an explicit façade (`api.ts`) with latency on purpose. In production this becomes React Query (or RTK Query) with:

- `queryKey: ['claims', filters, page]`
- `staleTime` ~ 30s for the inventory
- `placeholderData: keepPreviousData` so pagination does not flash empty

### 2.3 Backend API assumptions

The UI is written against these contracts. The worker implements a thin version of them.

```
GET  /claims?search&status&channel&sort&offset&limit
     -> { rows, total, stats }          // never the full set

GET  /claims/:id
     -> { claim, documents[] }          // manifests only (bytes, pageCount, etag)

GET  /documents/:id/pages/:n
     Range: bytes=…                     // page image / PDF slice
     -> 206 Partial Content

POST /claims/:id:assign | :delete | PATCH /claims/:id
     Authorization required             // 403 if the role cannot

POST /documents/:id:split | :merge | pages/:n:delete
     -> 202 { jobId }                   // do not block the request on 1GB I/O

GET  /jobs/:id  / POST /jobs/:id:cancel
```

Critical enforcement lives **on the resource server**:

- Authn: SSO token (OIDC). The prototype skips login and exposes a role switcher so reviewers can test.
- Authz: permission check on every mutate. The `Can` component is UX only.
- Validation: status transitions, assign-to-active-user, page index bounds.
- Document mutations: new object version + write-ahead page index, not in-place rewrite of a 1 GB blob.

### 2.4 Data flow — grid to workspace

1. Worker builds 20,000 claims off the main thread (~indexing screen).
2. Grid sends a query; worker filters/sorts/slices; UI paints **8 rows**.
3. Row click → `GET /claims/:id` → document **manifests** (kilobytes, not gigabytes).
4. Workspace requests **page 1** as a byte range. Neighbour pages can prefetch; the rest stay on object storage.
5. Split/merge enqueue a job. The viewer keeps showing the last consistent page until the job commits a new etag.

The transition is a route (`/claims/:id`), not a modal. A 1 GB workstation needs the full canvas. Breadcrumbs keep the inventory one click away. A master-detail split would starve the page stage on a 1440px Figma frame.

## 3. Performance strategy

### 3.1 Twenty thousand rows

**Do not send 20k rows to the browser. Do not mount 20k DOM nodes.**

A compact claim DTO is ~400 bytes. 20,000 rows is ~8 MB parse plus a huge reconciliation. Insurance rows are wider than that (treaty, cedent, benefit codes). The inventory API therefore **pages**. The Figma shows eight rows and “Showing data 1 to 8 of N entries”; the prototype follows that.

What the main thread holds: the current page (8 rows), facet stats, and query params. The worker holds the corpus because this demo has no database. Production does not put the corpus in a worker either — it puts it in the data store.

Rendering: eight rows need no virtualization. Virtualization is used where the count explodes — the **document thumbnail strip** (hundreds to thousands of pages) via `@tanstack/react-virtual`. Only ~12 thumb nodes exist at a time.

Search is debounced (250ms) and executed on the worker so typing does not block paint.

### 3.2 150 MB–1 GB documents

**Never `fetch()` the object.** Treat the file as an addressable byte range.

- Open: load a manifest (`pageCount`, `bytes`, `etag`). Cost: a few KB.
- View: `Range` request for the current page (and optionally ±1). Cost: a few hundred KB.
- Parse/rasterize: PDF.js in a **web worker** (simulated here by delayed page materialisation).
- Thumbnails: separate low-DPI sprite or first-page image API, also virtualized.
- Text search inside a file: server-side OCR index, not client-side scan of 1 GB.

The viewer shows the range header and chunk size so the constraint is visible: *“Streaming bytes=X-Y · 220 KB chunk · 0.84 GB object not loaded.”*

Page 73 is forced to fail so retry is a first-class path, not an afterthought. AbortController cancels in-flight chunks on page change so scrolling does not race.

### 3.3 Re-renders and memory

- Job ticks live in Zustand. The grid does not subscribe.
- Page viewer keys work off `documentId + page`. Changing page does not remount the shell.
- Comments are filtered by `documentId` in a `useMemo`.
- Annotation geometry is stored as **percentages of the page**, not pixels, so resize does not duplicate state.

## 4. Trade-offs

### Pagination vs infinite scroll vs virtualization

| Approach | When it wins | Cost |
| --- | --- | --- |
| **Server pagination (chosen for the grid)** | Matches the Figma; stable “row 17 of 20,000”; good for audit and keyboard users | Jumping to a known claim still needs search, not scrubbing |
| Infinite scroll | Scanning an unranked inbox | Poor “where am I?”; accidental duplicate mutations; hard to restore scroll after a workspace round-trip |
| Client virtualization of the full set | < ~5k compact rows already in memory | 20k+ insurance records are the wrong payload; still costs parse and filter on the UI thread |
| Windowed virtualization (cursor + overscan) | Very large *already filtered* lists, e.g. 2,000 page thumbs | More moving parts; used for the thumbnail strip |

Recommendation: **keep pagination on the inventory**; **virtualize the document chrome**. If product later wants a “dense ops” view, add a cursor window (`limit=80`) behind the same query contract without changing the worker’s authorization model.

### Client vs server processing

| Work | Client | Server |
| --- | --- | --- |
| Filter/sort 20k claims | No | Yes |
| Rasterize the visible PDF page | Yes (worker) | Optional pre-render for huge scans |
| Split/merge/delete pages | No | Yes — new object version |
| Hit-test an annotation rectangle | Yes | Persist only |
| Full-text over a 1 GB file | No | Search index |

Client-side split of a 1 GB PDF would freeze the tab and risk a corrupt download. The UI therefore starts a **job** and keeps the previous version until commit.

### Caching

- Grid pages: cache by query key, short TTL. Claims change as they are assigned.
- Document manifests: cache by etag. Invalidate when a job succeeds.
- Page chunks: LRU of the last ~15 pages. Do not cache the whole file.
- Avoid `Cache-Control: immutable` on documents that can be split.

### Optimistic vs pessimistic updates

| Action | Strategy | Reason |
| --- | --- | --- |
| Comment, resolve thread | **Optimistic** | Cheap, reversible, users type fast |
| Annotation draw | **Optimistic** | Local geometry; sync in background |
| Assign / edit fields | **Pessimistic** (wait for worker) | Other people look at the same queue |
| Delete claim | **Pessimistic** + confirm | Destructive, RBAC-sensitive |
| Split / merge / delete page | **Pessimistic job** | Partial failure must leave the last good object |

Jobs expose **cancel** while running and **retry** on failure. Cancel during a split does not apply a half-written index; the prototype maps that to a `cancelling → cancelled` state and an error message that the previous version is intact.

## 5. RBAC model

Permissions are a flat capability set (`claim.delete`, `document.split`, …). Roles are bundles:

| Role | Inventory | Documents |
| --- | --- | --- |
| Auditor | view | view, comment |
| Adjuster | view, edit | view, edit, comment, annotate |
| Supervisor | view, edit, delete, assign | view, comment, annotate |
| Senior adjudicator | view, edit, assign | all document ops including split/merge/delete page |
| Admin | all | all |

**Frontend:** `Can` / `useCan` hide or disable controls (Figma does not have a disabled glyph, so icon buttons go inert and a tooltip states why).

**Backend:** `assertCan(role, permission)` on every mutate. A crafted request from a disabled button still fails.

Row visibility in production would also be **query-scoped** (adjuster sees assigned book of business; auditor sees a sampled set). The prototype keeps a shared 20k list so reviewers can compare roles on the same rows; the authorization story is in the actions, which is what the brief asks to show/hide/disable.

## 6. UX for long work

- Indexing 20k claims: blocking boot with progress, worker-side so the tab does not freeze.
- Grid: “Loading window…” rather than a blank Figma table.
- Page fetch: banner + in-paper loading; failed chunk has Retry.
- Jobs: progress bar, status text, Cancel, Retry.
- Role mismatch: toast / error `Not authorized: claim.delete`.

Perceived performance: paint the workspace chrome and manifest first, then the first page. That is faster than a spinner waiting on a full download that must never happen.

## 7. Reliability of document state

Split/merge/delete are modeled as **append a new version, then swap the pointer**. A failed job at 78% does not mutate the viewer’s etag. Comments store `documentId + page`; after a split, production would remap page numbers with a server-provided translation table. The prototype does not pretend that remap is a client problem.

## 8. Scalability

| Axis | Approach |
| --- | --- |
| More claims (200k–2m) | Same paged API; add indexes / search; the UI does not change |
| Larger files (multi-GB scans) | Same range protocol; maybe tile rendering; still no full-file fetch |
| Concurrent editors | Job leases + etag if-match; disable split while a job is running on that document |
| Global teams | Shell already isolates locale-ready strings; data residency stays on the API |

## 9. Design system

The brief cites the community Figma *CRM Dashboard Customers List* (Avi Yansah) as the UX/UI input. The prototype maps that system onto claims:

- Poppins, `#FAFBFF` canvas, 30px radius, purple `#5932EA` as the primary token
- Hello {name}, three metric cards, “All Claims / Open pipeline”, table columns aligned to the Figma (name, company, phone, email, country, status)
- Status pills (green active / red inactive language extended with review and warning)

Brand tokens are isolated in `styles.css` `:root`. Swapping `#5932EA` for Swiss Re Lake is a token change, not a rewrite. Swiss Re’s production system is Figma + Material M2; a later iteration would replace these primitives with that library rather than invent a third look.

## 10. What I would do next in a delivery team

- Replace the worker with the real claims and document APIs; keep the façade.
- PDF.js worker + object-storage range GETs.
- React Query, route-level error boundaries, Playwright for grid + job cancel.
- Persist comments against a page anchor (coordinates + extracted text quote).
- WCAG 2.2 AA: the Figma search contrast is weak; I would raise placeholder contrast before production.
- Feature-flag the dense virtualized inventory if ops users outgrow 8-row pages.

The prototype is intentionally small. The architecture is the part that should survive contact with a real backend.
