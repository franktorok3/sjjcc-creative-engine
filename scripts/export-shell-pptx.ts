import { writeFileSync, mkdirSync } from "fs";
import { CREATIVE_SHELL_SPECS } from "../config/creative-shells";
import { buildShellPptx } from "../lib/creative/shells/pptx-builder";
import { validateShellSpec } from "../lib/creative/shells/validate";

async function main() {
  const outDir = "/opt/cursor/artifacts/creative-shells";
  mkdirSync(outDir, { recursive: true });

  for (const spec of CREATIVE_SHELL_SPECS) {
    const report = validateShellSpec(spec);
    if (!report.ok) {
      throw new Error(`${spec.key} invalid: ${JSON.stringify(report.issues)}`);
    }
    const file = await buildShellPptx(spec);
    const out = `${outDir}/${spec.key}.pptx`;
    writeFileSync(out, file.buffer);
    console.log(`OK ${spec.title} → ${out} (${file.buffer.byteLength} bytes)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
