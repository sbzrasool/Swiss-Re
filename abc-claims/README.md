# ABC Claims Workspace

Senior UI Engineering case study for Swiss Re — Senior Application Engineer (UI Developer), ref. 137263.

This is a working React prototype plus an architecture note. It implements the claims grid, RBAC, and large-document workspace described in the problem statement, using the provided [CRM Dashboard Customers List](https://www.figma.com/community/file/1146467298668328949/crm-dashboard-customers-list) as the layout and spacing system (Poppins, 30px cards, metric row, 8-row table, rounded pagination).

## Run

```bash
cd abc-claims
npm install
npm run dev
```

Open the printed local URL (Vite default is `http://localhost:5173`).

```bash
npm test        # RBAC + query-engine unit tests
npm run build   # production bundle
```

## Five-minute review

1. **Grid** — 20,000 claims are indexed in a web worker. The table shows an 8-row page to match the Figma. Search, status, channel and sort are applied on the worker (the “server”), not by filtering a rendered DOM list.
2. **Roles** — Change the person in the sidebar. Auditor: Edit/Delete/Assign disabled. Adjuster: can edit, cannot delete or assign. Supervisor: can delete and assign. Try Delete as Adjuster after forcing the control — the worker still returns `FORBIDDEN`.
3. **Workspace** — Click a row. Associated files are 150 MB–1 GB. Only the current page chunk is fetched (`Range`-style). The thumbnail strip is virtualized so a 2,000-page file does not mount 2,000 DOM nodes.
4. **Jobs** — Split / Merge / Delete page as Senior Adjudicator (`Ravi Shah`). Watch progress, cancel, and retry. About 12% of jobs fail on purpose so recovery is visible. Page 73 of any document fails once so the retry path is visible.
5. **Comments / annotations** — Drag on the page to highlight. Comments are page-scoped, not file-scoped.

## What is real vs simulated

| Concern | In this prototype | Production equivalent |
| --- | --- | --- |
| 20k claims | Generated in a worker, queried with simulated latency | PostgreSQL / Elasticsearch + paged API |
| 150 MB–1 GB PDFs | Manifest + page chunks, no full object in memory | S3/GCS range GETs + PDF.js worker |
| Authz | Worker checks role on mutate | Resource server + token claims; UI is decorative |
| Split/merge | Timed job with cancel/retry | Async job (SQS/Step Functions) writing a new object version |

Layout, RBAC behaviour, data flow and performance choices are the assessment surface. There is no live claims backend.

Read [ARCHITECTURE.md](./ARCHITECTURE.md) for component boundaries, data flow, performance strategy and trade-offs.
