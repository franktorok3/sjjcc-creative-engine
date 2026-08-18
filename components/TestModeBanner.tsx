/**
 * Visible test-mode notice for the native Creative Engine portal.
 * Does not expose secrets or environment details.
 */
export function TestModeBanner() {
  return (
    <aside className="portal-test-banner" role="status" aria-live="polite">
      <p className="portal-test-banner__title">TEST MODE</p>
      <p className="portal-test-banner__copy">
        Native portal submissions only. Live Google Form requests are not being
        processed by the Creative Engine.
      </p>
    </aside>
  );
}
