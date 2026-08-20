import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { initStore } from "./api";
import { ClaimsPage } from "./ClaimsPage";
import { Shell } from "./Shell";
import { WorkspacePage } from "./WorkspacePage";

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initStore()
      .then(() => setReady(true))
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="boot">
        <div className="boot-card">
          <h2>Could not start the claims index</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="boot">
        <div className="boot-card">
          <h2>Indexing 20,000 claims</h2>
          <p>The dataset is built off the main thread in a web worker so the shell stays responsive.</p>
          <div className="progress">
            <span />
          </div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<ClaimsPage />} />
          <Route path="/claims/:claimId" element={<WorkspacePage />} />
          <Route path="/documents" element={<Stub title="Documents" body="Global document search would reuse the same streaming viewer. Open a claim from the grid to work a file." />} />
          <Route path="/assign" element={<Stub title="Assign" body="Work queues are role-filtered. Use Assign on a claims row. Supervisors, senior adjudicators and admins are authorized." />} />
          <Route path="/promote" element={<Stub title="Quality" body="QA sampling and audit trails would live here. Auditors can comment in the workspace without mutating documents." />} />
          <Route path="/help" element={<Stub title="Help" body="Switch roles in the sidebar to see how Edit, Delete, Assign, Split and Merge are shown, hidden or rejected by the API." />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function Stub({ title, body }: { title: string; body: string }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <p className="hint">{body}</p>
    </section>
  );
}
