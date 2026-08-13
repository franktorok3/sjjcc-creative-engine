import { CREATIVE_SHELL_SPECS } from "@/config/creative-shells";
import { CANVA_SHELL_CAPABILITY_ASSESSMENT } from "@/config/canva-shell-capabilities";
import { CREATIVE_TEMPLATE_CANDIDATES } from "@/config/canva-template-candidates";
import { SHELL_FINISHING_CHECKLIST } from "@/config/shell-finishing-checklist";
import { validateShellSpec } from "@/lib/creative/shells/validate";
import { Fraunces, Outfit } from "next/font/google";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-portal-display",
});

const sans = Outfit({
  subsets: ["latin"],
  variable: "--font-portal-sans",
});

type GeneratedShellRow = {
  title?: string;
  designId?: string;
  designEditUrl?: string | null;
  thumbnailUrl?: string | null;
  brandTemplateId?: string | null;
  manualPublishRequired?: boolean;
  AutofillBindingRequired?: boolean;
  logoReplacementRequired?: boolean;
  editableImportConfirmed?: boolean;
  importJobStatus?: string;
  dimensions?: { width: number; height: number; unit: string };
};

type GenerationFile = {
  generatedAt?: string;
  shells?: GeneratedShellRow[];
};

type CandidateFile = {
  generatedAt?: string;
  candidates?: Array<{ id: string; title: string; approved: boolean }>;
};

async function loadJson<T>(relativePath: string): Promise<T | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), relativePath), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Operator-only shell family preview with finishing checklist.
 * Not linked from the public portal.
 */
export default async function AdminShellsPage() {
  const generation = await loadJson<GenerationFile>(
    "config/canva-shell-generation.latest.json",
  );
  const candidatesFile = await loadJson<CandidateFile>(
    "config/canva-template-candidates.generated.json",
  );

  return (
    <main className={`${display.variable} ${sans.variable} portal-page`}>
      <div className="portal-atmosphere" aria-hidden="true" />
      <div
        className="portal-shell"
        style={{ width: "min(960px, calc(100% - 2rem))" }}
      >
        <header className="portal-hero">
          <p className="portal-brand">CE Shell Family</p>
          <h1 className="portal-title">Creative Engine shell preview</h1>
          <p className="portal-subtitle">
            Operator review for the first three standard-light shells. Open each
            Canva design and complete the finishing checklist. Not for ordinary
            portal users.
          </p>
        </header>

        <section className="portal-form">
          <h2 className="portal-section-title">Creation path</h2>
          <p className="portal-section-hint">
            {CANVA_SHELL_CAPABILITY_ASSESSMENT.chosenCreationPath.id}
          </p>
          <p className="portal-section-hint">
            Automated: PPTX layout → Canva Design Import → editable design URL.
            Optional Brand Template publish is best-effort and never blocks
            generation.
          </p>
          {generation?.generatedAt ? (
            <p className="portal-section-hint">
              Last generation: {generation.generatedAt}
            </p>
          ) : (
            <p className="portal-review-warn">
              No generation artifact on this instance yet. Run{" "}
              <code>POST /api/admin/canva/generate-shells</code> on Production
              (uses <code>X-Admin-Secret</code>).
            </p>
          )}
        </section>

        {CREATIVE_SHELL_SPECS.map((spec) => {
          const validation = validateShellSpec(spec);
          const generated = generation?.shells?.find(
            (s) => s.title === spec.title,
          );
          const candidate =
            candidatesFile?.candidates?.find((c) => c.title === spec.title) ??
            CREATIVE_TEMPLATE_CANDIDATES.find((c) => c.title === spec.title);

          return (
            <section key={spec.key} className="portal-form">
              <h2 className="portal-section-title">{spec.title}</h2>
              <dl className="portal-review">
                <div>
                  <dt>Dimensions</dt>
                  <dd>
                    {spec.width} × {spec.height} {spec.unit}
                  </dd>
                </div>
                <div>
                  <dt>Design ID</dt>
                  <dd>{generated?.designId ?? "—"}</dd>
                </div>
                <div>
                  <dt>Import</dt>
                  <dd>
                    {generated?.importJobStatus ?? "—"}
                    {generated?.editableImportConfirmed
                      ? " · editable confirmed"
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt>Candidate ID</dt>
                  <dd>{candidate?.id ?? "—"}</dd>
                </div>
                <div>
                  <dt>Approved</dt>
                  <dd>no (candidate)</dd>
                </div>
                <div>
                  <dt>Validation</dt>
                  <dd>
                    {validation.ok
                      ? "Implementation checks passed"
                      : "Failed"}{" "}
                    ({validation.validationKind})
                  </dd>
                </div>
              </dl>

              <div className="portal-result-actions">
                {generated?.designEditUrl ? (
                  <a
                    className="portal-btn portal-btn--primary"
                    href={generated.designEditUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Canva
                  </a>
                ) : (
                  <span className="portal-section-hint">
                    Canva edit link appears after Production generation.
                  </span>
                )}
                {generated?.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={generated.thumbnailUrl}
                    alt={`${spec.title} thumbnail`}
                    style={{
                      maxWidth: "180px",
                      borderRadius: "0.6rem",
                      border:
                        "1px solid color-mix(in srgb, var(--portal-ink) 12%, transparent)",
                    }}
                  />
                ) : null}
              </div>

              <p className="portal-section-hint">Expected Autofill markers</p>
              <p style={{ margin: 0, fontFamily: "ui-monospace, monospace" }}>
                {[...spec.requiredAutofillRoles, ...spec.optionalAutofillRoles]
                  .map((role) => `[[${role}]]`)
                  .join(" · ")}
              </p>

              <p className="portal-section-hint">Logo placeholders</p>
              <p style={{ margin: 0, fontFamily: "ui-monospace, monospace" }}>
                [[SJJCC_LOGO_LOCKUP]] · [[UJA_LOGO]]
              </p>

              <p className="portal-section-hint">Finishing checklist</p>
              <ul className="portal-checks" style={{ color: "var(--portal-ink)" }}>
                {SHELL_FINISHING_CHECKLIST.map((item) => (
                  <li key={item}>☐ {item}</li>
                ))}
              </ul>

              <p className="portal-section-hint">Flags</p>
              <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
                <li>
                  manualPublishRequired:{" "}
                  {String(generated?.manualPublishRequired ?? true)}
                </li>
                <li>
                  AutofillBindingRequired:{" "}
                  {String(generated?.AutofillBindingRequired ?? true)}
                </li>
                <li>
                  logoReplacementRequired:{" "}
                  {String(generated?.logoReplacementRequired ?? true)}
                </li>
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
