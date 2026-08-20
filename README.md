# ABC Claims Workspace

Senior UI Engineering case study for [Swiss Re](https://www.swissre.com/) — Senior Application Engineer (UI Developer), ref. 137263.

Working React prototype plus an architecture note for a claims adjudication UI:

- Landing grid of **20,000+ claims** with server-side sort, filter, and pagination
- **RBAC** (UI hides/disables actions; the API worker still enforces them)
- Document workspace for **150 MB–1 GB** files: page streaming, comments, annotations, split / merge / delete jobs

Layout follows the provided Figma, [CRM Dashboard Customers List](https://www.figma.com/community/file/1146467298668328949/crm-dashboard-customers-list).

## Run

```bash
cd abc-claims
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

```bash
npm test        # RBAC + query-engine unit tests
npm run build   # production bundle
```

## Five-minute review

1. **Grid** — 20,000 claims are indexed in a web worker. The table shows an 8-row page to match the Figma. Search, status, channel and sort run on the worker (the “server”), not on a rendered DOM list.
2. **Roles** — Change the person in the sidebar. Auditor: Edit / Delete / Assign disabled. Adjuster: can edit, cannot delete or assign. Supervisor: can delete and assign. The worker still returns `FORBIDDEN` if a blocked action is sent.
3. **Workspace** — Click a row. Associated files are 150 MB–1 GB. Only the current page chunk is fetched. The thumbnail strip is virtualized so a 2,000-page file does not mount 2,000 DOM nodes.
4. **Jobs** — Split / Merge / Delete page as Senior Adjudicator (`Ravi Shah`). Watch progress, cancel, and retry.
5. **Comments / annotations** — Drag on the page to highlight. Comments are page-scoped, not file-scoped.

## Architecture

Read [abc-claims/ARCHITECTURE.md](./abc-claims/ARCHITECTURE.md) for component boundaries, data flow, performance strategy, and trade-offs.
