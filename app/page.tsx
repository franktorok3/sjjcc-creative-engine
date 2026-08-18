import { Fraunces, Outfit } from "next/font/google";
import { CreativePortalForm } from "@/components/CreativePortalForm";
import { TestModeBanner } from "@/components/TestModeBanner";
import { isCreativeEngineTestMode } from "@/lib/creative/test-mode";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-portal-display",
});

const sans = Outfit({
  subsets: ["latin"],
  variable: "--font-portal-sans",
});

export default function HomePage() {
  const testMode = isCreativeEngineTestMode();

  return (
    <main className={`${display.variable} ${sans.variable} portal-page`}>
      <div className="portal-atmosphere" aria-hidden="true" />
      <div className="portal-shell">
        <header className="portal-hero">
          <p className="portal-brand">SJJCC Creative Engine</p>
          <h1 className="portal-title">SJJCC Creative Engine</h1>
          <p className="portal-subtitle">
            Create a branded marketing asset and send it to the Marketing
            Project Requests workflow.
          </p>
        </header>
        {testMode ? <TestModeBanner /> : null}
        <CreativePortalForm testMode={testMode} />
      </div>
    </main>
  );
}
