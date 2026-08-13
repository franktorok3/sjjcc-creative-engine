import { CREATIVE_SHELL_SPECS } from "@/config/creative-shells";
import { CANVA_SHELL_CAPABILITY_ASSESSMENT } from "@/config/canva-shell-capabilities";
import { CREATIVE_TEMPLATE_CANDIDATES } from "@/config/canva-template-candidates";
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

type GeneratedFile = {
  generatedAt?: string;
  candidates?: Array<{
    id: string;
    title: string;
    approved: boolean;
  }>;
};

async function loadGeneratedCandidates(): Promise<GeneratedFile | null> {
  try {
    const raw = await readFile(
      path.join(process.cwd(), "config/canva-template-candidates.generated.json"),
      "utf8",
    );
    return JSON.parse(raw) as GeneratedFile;
  } catch {
    return null;
  }
}

/**
 * Operator-only shell family preview (not linked from the public portal).
 */
export default async function AdminShellsPage() {
  const generated = await loadGeneratedCandidates();

  return (
    <main className={`${display.variable} ${sans.variable} portal-page`}>
      <div className="portal-atmosphere" aria-hidden="true" />
      <div className="portal-shell" style={{ width: "min(960px, calc(100% - 2rem))" }}>
        <header className="portal-hero">
          <p className="portal-brand">CE Shell Family</p>
          <h1 className="portal-title">Creative Engine shell preview</h1>
          <p className="portal-subtitle">
            Operator review for the first three standard-light shells. Not for
            ordinary portal users.
          </p>
        </header>

        <section className="portal-form">
          <h2 className="portal-section-title">Creation path</h2>
          <p className="portal-section-hint">
            {CANVA_SHELL_CAPABILITY_ASSESSMENT.chosenCreationPath.id}
          </p>
          <ol className="portal-checks" style={{ color: "var(--portal-ink)" }}>
            {CANVA_SHELL_CAPABILITY_ASSESSMENT.chosenCreationPath.steps.map(
              (step) => (
                <li key={step}>{step}</li>
              ),
            )}
          </ol>
          <p className="portal-section-hint">
            Autofill fields cannot be created via Connect API. Manual Data
            Autofill binding + Brand Template publish (if API denied) remain.
          </p>
        </section>

        {CREATIVE_SHELL_SPECS.map((spec) => {
          const validation = validateShellSpec(spec);
          const candidate =
            generated?.candidates?.find((c) => c.title === spec.title) ??
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
                  <dt>Asset</dt>
                  <dd>{spec.assetType}</dd>
                </div>
                <div>
                  <dt>Density</dt>
                  <dd>{spec.density}</dd>
                </div>
                <div>
                  <dt>Candidate ID</dt>
                  <dd>{candidate?.id ?? "—"}</dd>
                </div>
                <div>
                  <dt>Approved</dt>
                  <dd>{candidate?.approved ? "yes" : "no (candidate)"}</dd>
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

              <p className="portal-section-hint">Expected Autofill roles</p>
              <p style={{ margin: 0 }}>
                {[...spec.requiredAutofillRoles, ...spec.optionalAutofillRoles]
                  .join(", ")}
              </p>

              <p className="portal-section-hint">Locked brand elements</p>
              <ul className="portal-checks">
                <li>✓ Bottom brand bar (not Autofill)</li>
                <li>✓ SJJCC logo zone (left)</li>
                <li>✓ UJA logo zone (right of SJJCC)</li>
                <li>✓ QR above brand bar</li>
              </ul>

              <p className="portal-section-hint">Remaining manual steps</p>
              <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "var(--portal-muted)" }}>
                {CANVA_SHELL_CAPABILITY_ASSESSMENT.manualStepsRemaining.map(
                  (step) => (
                    <li key={step}>{step}</li>
                  ),
                )}
              </ul>

              {generated?.generatedAt ? (
                <p className="portal-section-hint">
                  Last generation artifact: {generated.generatedAt}. Open Canva
                  via design/edit URLs returned by{" "}
                  <code>POST /api/admin/canva/generate-shells</code>.
                </p>
              ) : (
                <p className="portal-review-warn">
                  No generation artifact yet. Run{" "}
                  <code>POST /api/admin/canva/generate-shells</code> with{" "}
                  <code>X-Admin-Secret</code> to create live Canva designs.
                </p>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
