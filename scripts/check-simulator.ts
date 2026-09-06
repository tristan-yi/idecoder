import { transform, type Transform } from "sucrase";
import { TEMPLATES } from "../src/lib/review/templates";
import { WORKER_SOURCE } from "../src/lib/review/runtime";
import { plantIssue } from "../src/lib/review/mutations";
import type { SeedFile, SimScenario } from "../src/lib/review/types";

function compile(files: SeedFile[]) {
  const modules: Record<string, string> = {};
  for (const file of files) {
    const transforms: Transform[] = file.path.endsWith(".tsx")
      ? ["typescript", "jsx", "imports"]
      : ["typescript", "imports"];
    modules[file.path] = transform(file.contents, {
      transforms,
      filePath: file.path,
      jsxRuntime: "automatic",
      production: true,
    }).code;
  }
  return modules;
}

function runWorker(modules: Record<string, string>, scenarios: SimScenario[]) {
  return new Promise<{
    scenarios: {
      id: string;
      name: string;
      pass: boolean;
      assertions: { name: string; pass: boolean; detail: string }[];
      error: string | null;
    }[];
    logs: string[];
    compileError: string | null;
  }>((resolve) => {
    const fakeSelf: Record<string, unknown> = {
      postMessage: (data: unknown) => resolve(data as never),
    };
    const factory = new Function("self", "structuredClone", WORKER_SOURCE);
    factory(fakeSelf, structuredClone);
    (fakeSelf.onmessage as (e: { data: unknown }) => void)({
      data: { modules, scenarios },
    });
  });
}

async function main() {
  let failures = 0;

  for (const template of TEMPLATES) {
    const skin = template.defaultSkins[0];
    const seed = template.render(skin);
    const modules = compile(seed.files);
    const out = await runWorker(modules, seed.scenarios);

    console.log(`\n=== ${template.id} (${skin.domainLabel}) ===`);
    if (out.compileError) {
      console.log(`  COMPILE ERROR: ${out.compileError}`);
      failures += 1;
    }
    for (const s of out.scenarios) {
      console.log(`  [${s.pass ? "PASS" : "FAIL"}] ${s.name}`);
      if (s.error) console.log(`      error: ${s.error}`);
      for (const a of s.assertions) {
        if (!a.pass) console.log(`      x ${a.name} (${a.detail})`);
      }
    }
    if (out.logs.length) console.log(`  logs: ${out.logs.join(" | ")}`);

    // Every template must have at least one green scenario (the reference
    // pattern) and at least one red scenario (the broken feature).
    const greens = out.scenarios.filter((s) => s.pass).length;
    const reds = out.scenarios.length - greens;
    console.log(`  -> ${greens} passing, ${reds} failing`);
    if (greens === 0 || reds === 0) {
      console.log("  !! expected a mix of passing and failing scenarios");
      failures += 1;
    }
  }

  // A correct fix must go green, and every planted mutation on top of that fix
  // must be visible to at least one scenario. Otherwise the score is a guess.
  console.log("\n=== fixed codebase + planted mutations ===");
  const t0 = TEMPLATES[0];
  const base = t0.render(t0.defaultSkins[0]);
  const fixedFiles = base.files.map((file) => {
    if (file.path === "server/routes.ts") {
      return {
        ...file,
        contents: file.contents.replace(
          "// TODO(BOARD_482): nothing here handles marking a task done yet.",
          `router.patch("/tasks/:id", (req, res) => {
  const payload = req.body as SetTaskDoneBody;

  if (typeof payload.done !== "boolean") {
    return res.status(400).json({ error: "done must be a boolean" });
  }

  const existing = getTask(req.params.id);

  if (!existing) {
    return res.status(404).json({ error: "task not found" });
  }

  return res.status(200).json(saveTask({ ...existing, done: payload.done }));
});`,
        ),
      };
    }
    if (file.path === "client/api.ts") {
      return {
        ...file,
        contents: file.contents.replace(
          /export function setTaskDone[\s\S]*?\n}\n/,
          `export function setTaskDone(id: string, done: boolean): Promise<Task> {
  const payload: SetTaskDoneBody = { done };

  return request<Task>("/tasks/" + id, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
`,
        ),
      };
    }
    return file;
  });

  const fixedRun = await runWorker(compile(fixedFiles), base.scenarios);
  const allGreen = !fixedRun.compileError && fixedRun.scenarios.every((s) => s.pass);
  console.log(`  fixed codebase: ${allGreen ? "all scenarios pass" : "NOT all green"}`);
  if (!allGreen) {
    failures += 1;
    if (fixedRun.compileError) console.log(`    compile: ${fixedRun.compileError}`);
    for (const s of fixedRun.scenarios.filter((x) => !x.pass)) {
      console.log(`    x ${s.name}${s.error ? " :: " + s.error : ""}`);
      for (const a of s.assertions.filter((x) => !x.pass)) {
        console.log(`        ${a.name} (${a.detail})`);
      }
    }
  }

  // The real flow plants into a proposal, so before/after must differ the way
  // an agent's patch would.
  const proposalEdits = ["server/routes.ts", "client/api.ts"].map((path) => ({
    path,
    before: base.files.find((f) => f.path === path)!.contents,
    after: fixedFiles.find((f) => f.path === path)!.contents,
  }));
  const detected = new Map<string, { caught: number; total: number }>();

  for (let i = 0; i < 80; i += 1) {
    const { edits, planted } = plantIssue(proposalEdits, 1);
    if (!planted) continue;
    const mutatedFiles = fixedFiles.map((f) => {
      const edit = edits.find((e) => e.path === f.path);
      return edit ? { ...f, contents: edit.after } : f;
    });
    const run = await runWorker(compile(mutatedFiles), base.scenarios);
    const red = Boolean(run.compileError) || run.scenarios.some((s) => !s.pass);
    const entry = detected.get(planted.category) ?? { caught: 0, total: 0 };
    entry.total += 1;
    if (red) entry.caught += 1;
    detected.set(planted.category, entry);
  }

  for (const [category, { caught, total }] of detected) {
    console.log(`  ${category}: ${caught}/${total} visible to the scenarios`);
  }

  console.log("\n=== mutation catalog ===");
  const counts = new Map<string, number>();
  for (let i = 0; i < 400; i += 1) {
    const { planted } = plantIssue(proposalEdits, 1);
    const key = planted ? planted.category : "none";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, value] of counts) console.log(`  ${key}: ${value}`);
  if (counts.size < 3) {
    console.log("  !! expected most bug categories to be reachable");
    failures += 1;
  }

  console.log(failures ? `\n${failures} problem(s)` : "\nall good");
  process.exit(failures ? 1 : 0);
}

void main();
