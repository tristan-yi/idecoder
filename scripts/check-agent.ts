import { TEMPLATES } from "../src/lib/review/templates";
import { decodePlanted } from "../src/lib/review/secret";

const BASE = process.env.BASE_URL || "http://localhost:3002";

async function main() {
  const template = TEMPLATES[2];
  const seed = template.render(template.defaultSkins[0]);

  const rounds = Number(process.env.ROUNDS || 1);
  const messages = ["Walk me through what happens when someone clicks the +1 button."];
  for (let i = 0; i < rounds; i += 1) {
    messages.push("Fix the adjust endpoint so it matches the ticket.");
  }

  for (const message of messages) {
    console.log(`\n=== "${message}" ===`);
    const res = await fetch(`${BASE}/api/review/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: seed.task,
        files: seed.files,
        history: [],
        message,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      console.log(`  HTTP ${res.status}: ${data.error}`);
      continue;
    }

    console.log(`  kind: ${data.kind}`);
    console.log(`  message: ${String(data.message).slice(0, 220)}`);

    if (data.kind === "proposal") {
      for (const edit of data.proposal.edits) {
        const changed = edit.after.split("\n").length - edit.before.split("\n").length;
        console.log(`  edit: ${edit.path} (${changed >= 0 ? "+" : ""}${changed} lines)`);
      }
      const planted = decodePlanted(data.planted ?? null);
      if (planted) {
        console.log(`  PLANTED [${planted.category}] ${planted.file}:${planted.line}`);
        console.log(`    ${planted.label}`);
        console.log(`    before: ${planted.before.trim().slice(0, 100)}`);
        console.log(`    after:  ${planted.after.trim().slice(0, 100) || "(removed)"}`);
      } else {
        console.log("  PLANTED: none, this one is clean");
      }
    }
  }
}

void main();
