import { create } from "zustand";
import { USERS } from "./auth";
import type { Comment, Annotation, DocumentJob, User, JobType } from "./types";

interface SessionState {
  user: User;
  setUser: (user: User) => void;
  comments: Comment[];
  annotations: Annotation[];
  jobs: DocumentJob[];
  addComment: (comment: Omit<Comment, "id" | "createdAt" | "resolved">) => void;
  toggleComment: (id: string) => void;
  addAnnotation: (ann: Omit<Annotation, "id">) => void;
  removeAnnotation: (id: string) => void;
  startJob: (input: { type: JobType; documentId: string; claimId: string; label: string }) => string;
  cancelJob: (id: string) => void;
  retryJob: (id: string) => void;
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

const jobTimers = new Map<string, number>();

function runJob(set: (fn: (s: SessionState) => Partial<SessionState>) => void, get: () => SessionState, id: string) {
  const tick = () => {
    const job = get().jobs.find((j) => j.id === id);
    if (!job) return;
    if (job.status === "cancelling") {
      set((s) => ({
        jobs: s.jobs.map((j) => (j.id === id ? { ...j, status: "cancelled", progress: j.progress } : j)),
      }));
      return;
    }
    if (job.status !== "running" && job.status !== "queued") return;

    const next = Math.min(100, job.progress + 6 + Math.floor(Math.random() * 9));
    if (next >= 100) {
      const fail = Math.random() < 0.12;
      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === id
            ? {
                ...j,
                progress: fail ? 78 : 100,
                status: fail ? "failed" : "success",
                error: fail ? "Partial write on page index. Object storage left the previous version intact." : undefined,
              }
            : j,
        ),
      }));
      return;
    }

    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, status: "running", progress: next } : j)),
    }));
    jobTimers.set(id, window.setTimeout(tick, 280));
  };
  jobTimers.set(id, window.setTimeout(tick, 200));
}

export const useSession = create<SessionState>((set, get) => ({
  user: USERS[0]!,
  setUser: (user) => set({ user }),
  comments: [],
  annotations: [],
  jobs: [],
  addComment: (comment) =>
    set((s) => ({
      comments: [
        {
          ...comment,
          id: uid("cmt"),
          createdAt: Date.now(),
          resolved: false,
        },
        ...s.comments,
      ],
    })),
  toggleComment: (id) =>
    set((s) => ({
      comments: s.comments.map((c) => (c.id === id ? { ...c, resolved: !c.resolved } : c)),
    })),
  addAnnotation: (ann) =>
    set((s) => ({ annotations: [...s.annotations, { ...ann, id: uid("ann") }] })),
  removeAnnotation: (id) =>
    set((s) => ({ annotations: s.annotations.filter((a) => a.id !== id) })),
  startJob: (input) => {
    const id = uid("job");
    set((s) => ({
      jobs: [
        {
          id,
          ...input,
          progress: 0,
          status: "queued",
          startedAt: Date.now(),
        },
        ...s.jobs,
      ],
    }));
    runJob(set, get, id);
    return id;
  },
  cancelJob: (id) => {
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === id && (j.status === "running" || j.status === "queued")
          ? { ...j, status: "cancelling" }
          : j,
      ),
    }));
  },
  retryJob: (id) => {
    const job = get().jobs.find((j) => j.id === id);
    if (!job) return;
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === id ? { ...j, status: "queued", progress: 0, error: undefined } : j,
      ),
    }));
    runJob(set, get, id);
  },
}));
