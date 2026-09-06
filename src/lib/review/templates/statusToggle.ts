import type { SeedTemplate, Skin } from "./types";

const DEFAULT_SKINS: Skin[] = [
  {
    domainLabel: "Team task board",
    entity: "task",
    entityPlural: "tasks",
    Entity: "Task",
    EntityPlural: "Tasks",
    labelField: "title",
    labelHuman: "title",
    reporter: "Priya (PM)",
    channel: "#board-bugs",
    ticket: "BOARD_482",
    taskTitle: "Checking off a task doesn't stick",
    taskBody:
      "A few people on the pilot team flagged this today. You tick a task off on the board, it goes grey like you'd expect, and then the next morning it's back to unchecked. One person swore it worked last week but I can't reproduce that.\n\nCan we get this working properly? It's the last thing blocking the pilot rollout.",
    acceptanceHints: [
      "Checking a task off should survive a page refresh",
      "Unchecking should work the same way",
    ],
    openQuestions: [
      "Should the checkbox roll back visually if the server call fails, or stay checked?",
      "Is there an expectation that two people checking the same task at once is handled?",
      "Does 'back to unchecked the next morning' mean the write never happened, or that something resets it overnight?",
    ],
  },
  {
    domainLabel: "Reading list",
    entity: "article",
    entityPlural: "articles",
    Entity: "Article",
    EntityPlural: "Articles",
    labelField: "headline",
    labelHuman: "headline",
    reporter: "Sam (Design)",
    channel: "#reading-list",
    ticket: "READ_119",
    taskTitle: "Marking an article as read doesn't save",
    taskBody:
      "Marking something as read only seems to last until I reload. I've been using this to keep track of what I've gotten through and now I genuinely don't know what I've read.\n\nNot urgent-urgent but it makes the whole feature pointless.",
    acceptanceHints: [
      "Read state should persist across reloads",
      "Should be able to mark something unread again",
    ],
    openQuestions: [
      "Should marking as read be optimistic in the UI, or wait for the server?",
      "What should happen if the article was deleted in another tab?",
      "Do we need any feedback when the save fails?",
    ],
  },
];

export const statusToggleTemplate: SeedTemplate = {
  id: "status-toggle",
  label: "Boolean status that never persists",
  brokenFeatureBrief:
    "The create flow works end to end. The feature that flips a boolean status field is only wired up in local React state: there is no server route for it, and the client API helper is a stub that rejects. The user has to add the route, the helper, and the hook call.",
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
  done: boolean;
  createdAt: number;
};

export type Create${Entity}Body = {
  ${labelField}: string;
};

export type Set${Entity}DoneBody = {
  done: boolean;
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

export function resetStore(): void {
  ${entityPlural}.clear();
  counter = 0;
}
`;

    const routes = `import { Router } from "express";
import type { Create${Entity}Body, ${Entity} } from "../shared/types";
import { get${Entity}, list${EntityPlural}, nextId, save${Entity} } from "./store";

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

  const ${entity}: ${Entity} = {
    id: nextId(),
    ${labelField},
    done: false,
    createdAt: Date.now(),
  };

  save${Entity}(${entity});
  return res.status(201).json(${entity});
});

router.get("/${entityPlural}/:id", (req, res) => {
  const existing = get${Entity}(req.params.id);

  if (!existing) {
    return res.status(404).json({ error: "${entity} not found" });
  }

  return res.status(200).json(existing);
});

// TODO(${ticket}): nothing here handles marking a ${entity} done yet.

export default router;
`;

    const api = `import type { Create${Entity}Body, ${Entity}, Set${Entity}DoneBody } from "../shared/types";

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

export function create${Entity}(${labelField}: string): Promise<${Entity}> {
  const payload: Create${Entity}Body = { ${labelField} };

  return request<${Entity}>("/${entityPlural}", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// TODO(${ticket}): there is no endpoint behind this yet.
export function set${Entity}Done(id: string, done: boolean): Promise<${Entity}> {
  const payload: Set${Entity}DoneBody = { done };
  void id;
  void payload;
  return Promise.reject(new ApiError(501, "set${Entity}Done is not wired up yet"));
}
`;

    const hook = `import { useCallback, useState } from "react";
import type { ${Entity} } from "../shared/types";
import { create${Entity}, fetch${EntityPlural} } from "./api";

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

  const add${Entity} = useCallback(async (${labelField}: string) => {
    try {
      const created = await create${Entity}(${labelField});
      set${EntityPlural}((current) => [...current, created]);
      setError(null);
      return created;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the ${entity}");
      return null;
    }
  }, []);

  // TODO(${ticket}): this only repaints the row, it never reaches the server.
  const toggle${Entity} = useCallback(async (id: string, done: boolean) => {
    set${EntityPlural}((current) =>
      current.map((item) => (item.id === id ? { ...item, done } : item)),
    );
  }, []);

  return { ${entityPlural}, error, load, add${Entity}, toggle${Entity} };
}
`;

    const list = `import { useEffect, useState } from "react";
import { use${EntityPlural} } from "./use${EntityPlural}";

export function ${Entity}List() {
  const { ${entityPlural}, error, load, add${Entity}, toggle${Entity} } = use${EntityPlural}();
  const [draft, setDraft] = useState("");

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!draft.trim()) return;
    await add${Entity}(draft.trim());
    setDraft("");
  }

  return (
    <section className="${entity}-list">
      {error ? <p role="alert">{error}</p> : null}

      <form onSubmit={handleSubmit}>
        <input
          value={draft}
          placeholder="New ${labelHuman}"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit">Add</button>
      </form>

      <ul>
        {${entityPlural}.map((item) => (
          <li key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={item.done}
                onChange={(event) => toggle${Entity}(item.id, event.target.checked)}
              />
              {item.${labelField}}
            </label>
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
          role: "reference",
          note: "create flow works, toggle route missing",
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
          role: "target",
          note: "toggle only updates local state",
        },
        {
          path: `client/${Entity}List.tsx`,
          contents: list,
          role: "context",
          note: "renders the list and wires handlers",
        },
      ],
      scenarios: [
        {
          id: "create-persists",
          name: `Creating a ${entity} reaches the store`,
          code: `await reset();
const created = await api.create${Entity}("First ${labelHuman}");
expect("server returned an id", typeof created.id === "string" && created.id.length > 0, "id was " + JSON.stringify(created.id));
expect("store holds one ${entity}", store.list${EntityPlural}().length === 1, "store holds " + store.list${EntityPlural}().length);
expect("new ${entityPlural} start undone", created.done === false, "done was " + created.done);`,
        },
        {
          id: "hook-create",
          name: "Hook state reflects a created row",
          code: `await reset();
await hook.act((h) => h.load());
await hook.act((h) => h.add${Entity}("From the hook"));
expect("hook shows one row", hook.current.${entityPlural}.length === 1, "hook shows " + hook.current.${entityPlural}.length);
expect("no error surfaced", hook.current.error === null, String(hook.current.error));`,
        },
        {
          id: "toggle-persists",
          name: `Marking a ${entity} done survives a reload`,
          code: `await reset();
const created = await api.create${Entity}("Persist me");
await api.set${Entity}Done(created.id, true);
const reloaded = await api.fetch${EntityPlural}();
const found = reloaded.find((item) => item.id === created.id);
expect("${entity} still exists after reload", Boolean(found), "not found in reload");
expect("done flag persisted", Boolean(found && found.done), "done was " + (found ? found.done : "missing"));`,
        },
        {
          id: "toggle-missing",
          name: "Toggling an unknown id returns 404",
          code: `await reset();
let status = 0;
try {
  await api.set${Entity}Done("${entity}_does_not_exist", true);
  status = 200;
} catch (err) {
  status = err && typeof err.status === "number" ? err.status : 0;
}
expect("responded 404", status === 404, "status was " + status);`,
        },
      ],
      traceChain: [
        {
          file: `client/${Entity}List.tsx`,
          symbol: "handleSubmit",
          note: "form submit handler, trims the draft",
        },
        {
          file: `client/use${EntityPlural}.ts`,
          symbol: `add${Entity}`,
          note: "hook action, owns error state and the optimistic list update",
        },
        {
          file: "client/api.ts",
          symbol: `create${Entity} -> request`,
          note: "serializes the body and throws ApiError on a non-2xx",
        },
        {
          file: "server/routes.ts",
          symbol: `POST /${entityPlural}`,
          note: `validates ${labelField}, returns 400 or 201`,
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
