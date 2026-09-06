import type { SeedTemplate, Skin } from "./types";

const DEFAULT_SKINS: Skin[] = [
  {
    domainLabel: "Doc comments",
    entity: "comment",
    entityPlural: "comments",
    Entity: "Comment",
    EntityPlural: "Comments",
    labelField: "body",
    labelHuman: "comment text",
    reporter: "Marcus (Support)",
    channel: "#support-escalations",
    ticket: "DOCS_207",
    taskTitle: "Deleting a comment wipes out the replies under it",
    taskBody:
      "Got a ticket from a customer this morning. Someone on their team deleted a top-level comment and the whole thread under it disappeared with it, including replies from other people. They're not thrilled.\n\nOther tools I've used leave a 'this comment was deleted' placeholder and keep the replies visible. Can we do something like that?",
    acceptanceHints: [
      "Deleting a comment should not take its replies with it",
      "The reader should still understand the thread structure afterwards",
    ],
    openQuestions: [
      "Should the deleted comment's text be blanked out, or kept and just marked deleted?",
      "If every comment in a thread is deleted, should the whole thread disappear?",
      "Can a deleted comment be restored, or is this one-way?",
    ],
  },
  {
    domainLabel: "Incident timeline",
    entity: "note",
    entityPlural: "notes",
    Entity: "Note",
    EntityPlural: "Notes",
    labelField: "body",
    labelHuman: "note text",
    reporter: "Alex (SRE)",
    channel: "#incident-tooling",
    ticket: "INC_88",
    taskTitle: "Removing a timeline note deletes everything threaded under it",
    taskBody:
      "During the postmortem yesterday someone tidied up a duplicate note and took three follow-up notes with it. We lost actual incident detail.\n\nWe need removal to be non-destructive. The audit trail matters more than a clean timeline here.",
    acceptanceHints: [
      "Removing a note must not remove notes threaded under it",
      "It should be obvious in the timeline that something was removed",
    ],
    openQuestions: [
      "Should removed notes still be visible to everyone, or only to admins?",
      "Do we need to record who removed it and when?",
      "Should removal be reversible?",
    ],
  },
];

export const nestedCommentsTemplate: SeedTemplate = {
  id: "nested-comments",
  label: "Hard delete that orphans threaded children",
  brokenFeatureBrief:
    "Creating threaded items works end to end. The delete route hard-removes the row from the store, so replies threaded under it are orphaned and the parent vanishes instead of leaving a tombstone. There is also no not-found handling on delete.",
  defaultSkins: DEFAULT_SKINS,
  render: (skin) => {
    const {
      entity,
      entityPlural,
      Entity,
      EntityPlural,
      labelField,
      labelHuman,
      ticket,
    } = skin;

    const sharedTypes = `export type ${Entity} = {
  id: string;
  ${labelField}: string;
  parentId: string | null;
  deletedAt: number | null;
  createdAt: number;
};

export type Create${Entity}Body = {
  ${labelField}: string;
  parentId: string | null;
};

export type ApiErrorBody = {
  error: string;
};
`;

    const store = `import type { ${Entity} } from "../shared/types";

const ${entityPlural} = new Map<string, ${Entity}>();
let counter = 0;

export function nextId(): string {
  counter += 1;
  return "${entity}_" + counter;
}

export function list${EntityPlural}(): ${Entity}[] {
  return Array.from(${entityPlural}.values()).sort((a, b) => a.createdAt - b.createdAt);
}

export function get${Entity}(id: string): ${Entity} | undefined {
  return ${entityPlural}.get(id);
}

export function save${Entity}(${entity}: ${Entity}): ${Entity} {
  ${entityPlural}.set(${entity}.id, ${entity});
  return ${entity};
}

export function remove${Entity}(id: string): boolean {
  return ${entityPlural}.delete(id);
}

export function resetStore(): void {
  ${entityPlural}.clear();
  counter = 0;
}
`;

    const routes = `import { Router } from "express";
import type { Create${Entity}Body, ${Entity} } from "../shared/types";
import { get${Entity}, list${EntityPlural}, nextId, remove${Entity}, save${Entity} } from "./store";

const router = Router();

// House style for every handler below:
//   1. read input off the request
//   2. validate, and bail out with res.status(code).json({ error }) on failure
//   3. return res.status(code).json(resource) on success
router.get("/${entityPlural}", (req, res) => {
  return res.status(200).json(list${EntityPlural}());
});

router.post("/${entityPlural}", (req, res) => {
  const payload = req.body as Create${Entity}Body;
  const ${labelField} = typeof payload.${labelField} === "string" ? payload.${labelField}.trim() : "";

  if (!${labelField}) {
    return res.status(400).json({ error: "${labelField} is required" });
  }

  const parentId = typeof payload.parentId === "string" ? payload.parentId : null;

  if (parentId && !get${Entity}(parentId)) {
    return res.status(404).json({ error: "parent ${entity} not found" });
  }

  const ${entity}: ${Entity} = {
    id: nextId(),
    ${labelField},
    parentId,
    deletedAt: null,
    createdAt: Date.now(),
  };

  save${Entity}(${entity});
  return res.status(201).json(${entity});
});

// TODO(${ticket}): this drops the row outright, so anything threaded under it
// is orphaned and disappears from the client.
router.delete("/${entityPlural}/:id", (req, res) => {
  remove${Entity}(req.params.id);
  return res.status(200).json({ ok: true });
});

export default router;
`;

    const api = `import type { Create${Entity}Body, ${Entity} } from "../shared/types";

const BASE_URL = "/api";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE_URL + path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  const payload = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, payload && payload.error ? payload.error : "Request failed");
  }

  return payload as T;
}

export function fetch${EntityPlural}(): Promise<${Entity}[]> {
  return request<${Entity}[]>("/${entityPlural}");
}

export function create${Entity}(${labelField}: string, parentId: string | null): Promise<${Entity}> {
  const payload: Create${Entity}Body = { ${labelField}, parentId };

  return request<${Entity}>("/${entityPlural}", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function delete${Entity}(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/${entityPlural}/" + id, {
    method: "DELETE",
  });
}
`;

    const hook = `import { useCallback, useState } from "react";
import type { ${Entity} } from "../shared/types";
import { create${Entity}, delete${Entity}, fetch${EntityPlural} } from "./api";

export function use${EntityPlural}() {
  const [${entityPlural}, set${EntityPlural}] = useState<${Entity}[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await fetch${EntityPlural}();
      set${EntityPlural}(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load ${entityPlural}");
    }
  }, []);

  const add${Entity} = useCallback(async (${labelField}: string, parentId: string | null) => {
    try {
      const created = await create${Entity}(${labelField}, parentId);
      set${EntityPlural}((current) => [...current, created]);
      setError(null);
      return created;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the ${entity}");
      return null;
    }
  }, []);

  const remove${Entity} = useCallback(async (id: string) => {
    try {
      await delete${Entity}(id);
      set${EntityPlural}((current) => current.filter((item) => item.id !== id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the ${entity}");
    }
  }, []);

  return { ${entityPlural}, error, load, add${Entity}, remove${Entity} };
}
`;

    const thread = `import { useEffect, useState } from "react";
import type { ${Entity} } from "../shared/types";
import { use${EntityPlural} } from "./use${EntityPlural}";

export function ${Entity}Thread() {
  const { ${entityPlural}, error, load, add${Entity}, remove${Entity} } = use${EntityPlural}();
  const [draft, setDraft] = useState("");

  useEffect(() => {
    void load();
  }, [load]);

  const roots = ${entityPlural}.filter((item) => item.parentId === null);

  function repliesTo(id: string): ${Entity}[] {
    return ${entityPlural}.filter((item) => item.parentId === id);
  }

  async function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!draft.trim()) return;
    await add${Entity}(draft.trim(), null);
    setDraft("");
  }

  return (
    <section className="${entity}-thread">
      {error ? <p role="alert">{error}</p> : null}

      <form onSubmit={handleSubmit}>
        <textarea
          value={draft}
          placeholder="Add a ${labelHuman}"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit">Post</button>
      </form>

      <ul>
        {roots.map((item) => (
          <li key={item.id}>
            <p>{item.${labelField}}</p>
            <button type="button" onClick={() => remove${Entity}(item.id)}>
              Delete
            </button>
            <ul>
              {repliesTo(item.id).map((reply) => (
                <li key={reply.id}>{reply.${labelField}}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
`;

    return {
      files: [
        {
          path: "shared/types.ts",
          contents: sharedTypes,
          role: "context",
          note: "shared request and response shapes",
        },
        {
          path: "server/store.ts",
          contents: store,
          role: "context",
          note: "in-memory persistence",
        },
        {
          path: "server/routes.ts",
          contents: routes,
          role: "target",
          note: "delete hard-removes the row",
        },
        {
          path: "client/api.ts",
          contents: api,
          role: "reference",
          note: "request wrapper and ApiError convention",
        },
        {
          path: `client/use${EntityPlural}.ts`,
          contents: hook,
          role: "reference",
          note: "hook actions and error handling",
        },
        {
          path: `client/${Entity}Thread.tsx`,
          contents: thread,
          role: "context",
          note: "renders roots and their replies",
        },
      ],
      scenarios: [
        {
          id: "create-thread",
          name: "Posting a reply links it to its parent",
          code: `await reset();
const root = await api.create${Entity}("Root ${labelHuman}", null);
const reply = await api.create${Entity}("A reply", root.id);
expect("reply points at the root", reply.parentId === root.id, "parentId was " + JSON.stringify(reply.parentId));
expect("store holds both", store.list${EntityPlural}().length === 2, "store holds " + store.list${EntityPlural}().length);`,
        },
        {
          id: "reply-to-missing-parent",
          name: "Replying to a missing parent returns 404",
          code: `await reset();
let status = 0;
try {
  await api.create${Entity}("Orphan", "${entity}_nope");
  status = 200;
} catch (err) {
  status = err && typeof err.status === "number" ? err.status : 0;
}
expect("responded 404", status === 404, "status was " + status);`,
        },
        {
          id: "delete-keeps-replies",
          name: "Deleting a parent keeps its replies readable",
          code: `await reset();
const root = await api.create${Entity}("Root ${labelHuman}", null);
const reply = await api.create${Entity}("A reply", root.id);
await api.delete${Entity}(root.id);
const all = await api.fetch${EntityPlural}();
const keptReply = all.find((item) => item.id === reply.id);
const tombstone = all.find((item) => item.id === root.id);
expect("reply is still returned", Boolean(keptReply), "reply missing from the list");
expect("parent is kept as a tombstone", Boolean(tombstone), "parent row was removed outright");
expect("tombstone is marked deleted", Boolean(tombstone && tombstone.deletedAt), "deletedAt was " + (tombstone ? String(tombstone.deletedAt) : "missing"));`,
        },
        {
          id: "delete-missing",
          name: "Deleting an unknown id returns 404",
          code: `await reset();
let status = 0;
try {
  await api.delete${Entity}("${entity}_does_not_exist");
  status = 200;
} catch (err) {
  status = err && typeof err.status === "number" ? err.status : 0;
}
expect("responded 404", status === 404, "status was " + status);`,
        },
      ],
      traceChain: [
        {
          file: `client/${Entity}Thread.tsx`,
          symbol: "handleSubmit",
          note: "form submit handler, trims the draft",
        },
        {
          file: `client/use${EntityPlural}.ts`,
          symbol: `add${Entity}`,
          note: "hook action, owns error state and the list update",
        },
        {
          file: "client/api.ts",
          symbol: `create${Entity} -> request`,
          note: "serializes the body and throws ApiError on a non-2xx",
        },
        {
          file: "server/routes.ts",
          symbol: `POST /${entityPlural}`,
          note: `validates ${labelField} and the parent, returns 400, 404 or 201`,
        },
        {
          file: "server/store.ts",
          symbol: `save${Entity}`,
          note: "writes into the in-memory Map",
        },
      ],
      task: {
        title: skin.taskTitle,
        reporter: skin.reporter,
        channel: skin.channel,
        body: skin.taskBody,
        acceptanceHints: skin.acceptanceHints,
        openQuestions: skin.openQuestions,
      },
    };
  },
};
