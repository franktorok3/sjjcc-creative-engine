export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        SJJCC Creative Engine
      </h1>
      <p className="text-zinc-600">
        Thin proof of architecture: Google Form → Canva Brand Template Autofill
        → Basecamp Message Board.
      </p>
      <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-700">
        <li>
          Health: <code className="rounded bg-zinc-100 px-1">GET /api/health</code>
        </li>
        <li>
          Canva OAuth:{" "}
          <code className="rounded bg-zinc-100 px-1">GET /api/canva/connect</code>
        </li>
        <li>
          Basecamp OAuth:{" "}
          <code className="rounded bg-zinc-100 px-1">GET /api/basecamp/connect</code>
        </li>
        <li>
          Webhook:{" "}
          <code className="rounded bg-zinc-100 px-1">POST /api/form-submit</code>
        </li>
        <li>
          Test runbook: <code className="rounded bg-zinc-100 px-1">QUICK_TEST.md</code>
        </li>
      </ul>
    </main>
  );
}
