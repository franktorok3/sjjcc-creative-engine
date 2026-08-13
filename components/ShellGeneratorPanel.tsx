"use client";

import { useEffect, useRef, useState } from "react";

type UiStage =
  | "idle"
  | "starting"
  | "pptx_generated"
  | "import_submitted"
  | "processing"
  | "ready"
  | "failed"
  | "timed_out";

type SubmittedJob = {
  shellKey: string;
  title: string;
  importJobId: string;
  statusUrl: string;
};

type JobPollResult = {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed" | "pending_timeout";
  designId: string | null;
  designUrl: string | null;
  designEditUrl: string | null;
  designViewUrl: string | null;
  thumbnailUrl: string | null;
  error: string | null;
  code?: string;
};

type ShellTrack = {
  shellKey: string;
  title: string;
  importJobId: string | null;
  stage: UiStage;
  designId: string | null;
  designUrl: string | null;
  error: string | null;
  startedAt: number | null;
};

const STAGE_LABEL: Record<UiStage, string> = {
  idle: "Idle",
  starting: "Starting",
  pptx_generated: "PPTX generated",
  import_submitted: "Import submitted",
  processing: "Processing in Canva",
  ready: "Ready",
  failed: "Failed",
  timed_out: "Timed out — check status",
};

const CLIENT_POLL_MAX_MS = 60_000;
const CLIENT_POLL_INTERVAL_MS = 2_500;
const FLYER_KEY = "flyer_standard_light";

function emptyTracks(keys: Array<{ key: string; title: string }>): ShellTrack[] {
  return keys.map((s) => ({
    shellKey: s.key,
    title: s.title,
    importJobId: null,
    stage: "idle",
    designId: null,
    designUrl: null,
    error: null,
    startedAt: null,
  }));
}

type Props = {
  shells: Array<{ key: string; title: string }>;
};

/**
 * Operator shell generator — submits import jobs then polls status.
 * Cancel/Reset clears client state only (no token/credential changes).
 */
export function ShellGeneratorPanel({ shells }: Props) {
  const [adminSecret, setAdminSecret] = useState("");
  const [tracks, setTracks] = useState<ShellTrack[]>(() => emptyTracks(shells));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const pollTimersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      for (const id of pollTimersRef.current) window.clearTimeout(id);
    };
  }, []);

  function clearPollTimers() {
    for (const id of pollTimersRef.current) window.clearTimeout(id);
    pollTimersRef.current = [];
  }

  function resetClientState() {
    cancelledRef.current = true;
    clearPollTimers();
    setBusy(false);
    setMessage(null);
    setTracks(emptyTracks(shells));
    // Re-arm cancel flag for a future run
    cancelledRef.current = false;
  }

  function updateTrack(shellKey: string, patch: Partial<ShellTrack>) {
    setTracks((prev) =>
      prev.map((t) => (t.shellKey === shellKey ? { ...t, ...patch } : t)),
    );
  }

  async function pollJob(
    shellKey: string,
    importJobId: string,
    secret: string,
  ): Promise<void> {
    const started = Date.now();

    const tick = async (): Promise<void> => {
      if (cancelledRef.current) return;

      if (Date.now() - started >= CLIENT_POLL_MAX_MS) {
        updateTrack(shellKey, {
          stage: "timed_out",
          error: `CANVA_IMPORT_PENDING — job ${importJobId} still processing`,
        });
        return;
      }

      updateTrack(shellKey, { stage: "processing" });

      try {
        const res = await fetch(
          `/api/admin/canva/shell-jobs?jobId=${encodeURIComponent(importJobId)}`,
          { headers: { "X-Admin-Secret": secret } },
        );
        const json = (await res.json()) as {
          success?: boolean;
          job?: JobPollResult;
          error?: string;
          message?: string;
        };

        if (cancelledRef.current) return;

        if (!res.ok || !json.job) {
          updateTrack(shellKey, {
            stage: "failed",
            error: json.message ?? json.error ?? `Status check failed (${res.status})`,
          });
          return;
        }

        const job = json.job;
        if (job.status === "completed") {
          updateTrack(shellKey, {
            stage: "ready",
            designId: job.designId,
            designUrl: job.designEditUrl ?? job.designUrl,
            error: null,
          });
          return;
        }

        if (job.status === "failed") {
          updateTrack(shellKey, {
            stage: "failed",
            error: job.error ?? job.code ?? "Import failed",
          });
          return;
        }

        if (job.status === "pending_timeout") {
          updateTrack(shellKey, {
            stage: "timed_out",
            error: job.error ?? "CANVA_IMPORT_PENDING",
          });
          return;
        }

        // queued / processing — schedule next poll
        const timer = window.setTimeout(() => {
          void tick();
        }, CLIENT_POLL_INTERVAL_MS);
        pollTimersRef.current.push(timer);
      } catch (error) {
        if (cancelledRef.current) return;
        updateTrack(shellKey, {
          stage: "failed",
          error: error instanceof Error ? error.message : "Status poll failed",
        });
      }
    };

    await tick();
  }

  async function runGenerate(keys: string[]) {
    if (!adminSecret.trim()) {
      setMessage("Enter X-Admin-Secret to generate (not stored on the server from this field).");
      return;
    }

    cancelledRef.current = false;
    clearPollTimers();
    setBusy(true);
    setMessage(null);

    const secret = adminSecret.trim();
    const targetKeys = new Set(keys);

    setTracks((prev) =>
      prev.map((t) =>
        targetKeys.has(t.shellKey)
          ? {
              ...t,
              stage: "starting",
              importJobId: null,
              designId: null,
              designUrl: null,
              error: null,
              startedAt: Date.now(),
            }
          : t,
      ),
    );

    try {
      const res = await fetch("/api/admin/canva/generate-shells", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Secret": secret,
        },
        body: JSON.stringify({ keys }),
      });

      const json = (await res.json()) as {
        success?: boolean;
        status?: string;
        jobs?: SubmittedJob[];
        error?: string;
        message?: string;
      };

      if (cancelledRef.current) return;

      if (!res.ok || !json.success || !json.jobs?.length) {
        for (const key of keys) {
          updateTrack(key, {
            stage: "failed",
            error: json.message ?? json.error ?? `Generate failed (${res.status})`,
          });
        }
        setMessage(json.message ?? json.error ?? "Generation failed");
        return;
      }

      // Server completed PPTX + import create before responding.
      for (const job of json.jobs) {
        updateTrack(job.shellKey, {
          stage: "pptx_generated",
          importJobId: job.importJobId,
        });
      }
      // Yield so the PPTX-generated stage is visible before import-submitted.
      await new Promise((r) => setTimeout(r, 250));
      if (cancelledRef.current) return;

      for (const job of json.jobs) {
        updateTrack(job.shellKey, {
          stage: "import_submitted",
          importJobId: job.importJobId,
        });
      }

      setMessage(
        `Import jobs submitted (${json.jobs.length}). Polling Canva status…`,
      );

      await Promise.all(
        json.jobs.map(async (job) => {
          updateTrack(job.shellKey, {
            stage: "processing",
            importJobId: job.importJobId,
          });
          await pollJob(job.shellKey, job.importJobId, secret);
        }),
      );
    } catch (error) {
      if (!cancelledRef.current) {
        setMessage(
          error instanceof Error ? error.message : "Generation request failed",
        );
        for (const key of keys) {
          updateTrack(key, {
            stage: "failed",
            error: error instanceof Error ? error.message : "Request failed",
          });
        }
      }
    } finally {
      if (!cancelledRef.current) setBusy(false);
    }
  }

  return (
    <section className="portal-form">
      <h2 className="portal-section-title">Shell generator</h2>
      <p className="portal-section-hint">
        Creates Canva import jobs and returns immediately. Status is polled
        separately — this page will not spin forever.
      </p>

      <label className="portal-field" style={{ display: "block", marginTop: "0.75rem" }}>
        <span className="portal-section-hint">X-Admin-Secret</span>
        <input
          className="portal-input"
          type="password"
          autoComplete="off"
          value={adminSecret}
          onChange={(e) => setAdminSecret(e.target.value)}
          placeholder="Admin secret"
          style={{ width: "100%", marginTop: "0.35rem" }}
        />
      </label>

      <div className="portal-result-actions" style={{ marginTop: "0.85rem" }}>
        <button
          type="button"
          className="portal-btn portal-btn--primary"
          disabled={busy}
          onClick={() => void runGenerate([FLYER_KEY])}
        >
          {busy ? "Working…" : "Generate flyer only"}
        </button>
        <button
          type="button"
          className="portal-btn portal-btn--secondary"
          disabled={busy}
          onClick={() => void runGenerate(shells.map((s) => s.key))}
        >
          Generate all shells
        </button>
        <button
          type="button"
          className="portal-btn portal-btn--ghost"
          onClick={resetClientState}
        >
          Cancel / Reset
        </button>
      </div>

      {message ? (
        <p className="portal-section-hint" style={{ marginTop: "0.75rem" }}>
          {message}
        </p>
      ) : null}

      <ul style={{ listStyle: "none", padding: 0, margin: "1rem 0 0" }}>
        {tracks.map((track) => (
          <li
            key={track.shellKey}
            style={{
              padding: "0.75rem 0",
              borderTop:
                "1px solid color-mix(in srgb, var(--portal-ink) 10%, transparent)",
            }}
          >
            <div style={{ fontWeight: 600 }}>{track.title}</div>
            <div className="portal-section-hint">
              Status: {STAGE_LABEL[track.stage]}
              {track.stage === "starting" ? " (PPTX → import)" : ""}
            </div>
            {track.importJobId ? (
              <div className="portal-section-hint">
                Import job: <code>{track.importJobId}</code>
              </div>
            ) : null}
            {track.designId ? (
              <div className="portal-section-hint">
                Design ID: <code>{track.designId}</code>
              </div>
            ) : null}
            {track.error ? (
              <p className="portal-review-warn" style={{ margin: "0.35rem 0 0" }}>
                {track.error}
              </p>
            ) : null}
            {track.designUrl ? (
              <div className="portal-result-actions" style={{ marginTop: "0.5rem" }}>
                <a
                  className="portal-btn portal-btn--primary"
                  href={track.designUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Canva
                </a>
              </div>
            ) : null}
            {track.stage === "timed_out" && track.importJobId ? (
              <p className="portal-section-hint" style={{ marginTop: "0.35rem" }}>
                Still pending — re-check{" "}
                <code>
                  /api/admin/canva/shell-jobs?jobId={track.importJobId}
                </code>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
