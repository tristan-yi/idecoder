import type { SeedTemplate, Skin } from "./types";

const DEFAULT_SKINS: Skin[] = [
  {
    domainLabel: "Warehouse inventory",
    entity: "part",
    entityPlural: "parts",
    Entity: "Part",
    EntityPlural: "Parts",
    labelField: "name",
    labelHuman: "part name",
    reporter: "Dana (Ops)",
    channel: "#warehouse-tools",
    ticket: "INV_331",
    taskTitle: "Stock counts are going negative and the adjust button is flaky",
    taskBody:
      "Two things, might be the same bug, might not.\n\nFirst, the adjust button on the parts page mostly does nothing. Occasionally it works, I haven't figured out the pattern.\n\nSecond, we've got three parts sitting at negative stock in the export I pulled this morning. Physically impossible, obviously. Someone must have adjusted down past zero.",
    acceptanceHints: [
      "Adjusting stock up or down should actually save",
      "Stock should never end up below zero",
    ],
    openQuestions: [
      "If someone adjusts down by more than the count on hand, should it clamp to zero or reject the whole adjustment?",
      "Is a zero adjustment valid, or should that be an error?",
      "Do we need an audit record of who adjusted what?",
    ],
  },
  {
    domainLabel: "Event ticket pool",
    entity: "tier",
    entityPlural: "tiers",
    Entity: "Tier",
    EntityPlural: "Tiers",
    labelField: "name",
    labelHuman: "tier name",
    reporter: "Jules (Events)",
    channel: "#ticketing",
    ticket: "TIX_54",
    taskTitle: "Ticket allocations can be pushed below zero",
    taskBody:
      "We released 40 more seats than exist for the Thursday show because the allocation went negative and nobody noticed. Releasing tickets back to a tier also doesn't seem to save half the time.\n\nThis one's a bit urgent, we have another on-sale next week.",
    acceptanceHints: [
      "Allocation changes need to persist",
      "A tier should never show a negative allocation",
    ],
    openQuestions: [
      "Should an over-release clamp at zero or fail loudly so the operator notices?",
      "Is there a maximum allocation we should also be guarding?",
      "Should a failed adjustment leave the previous number visible, or blank the field?",
    ],
  },
];

export const quantityAdjustTemplate: SeedTemplate = {
  id: "quantity-adjust",
  label: "Numeric adjust with a wrong param source and no clamping",
  brokenFeatureBrief:
    "Creating a record works end to end. The adjust route reads the id from req.body instead of req.params, never validates that the delta is a number, and lets the quantity go negative. There is no not-found handling either.",
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
  quantity: number;
  createdAt: number;
};

export type Create${Entity}Body = {
  ${labelField}: string;
  quantity: number;
};

export type Adjust${Entity}Body = {
  delta: number;
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
import type { Adjust${Entity}Body, Create${Entity}Body, ${Entity} } from "../shared/types";
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

  if (typeof payload.quantity !== "number" || Number.isNaN(payload.quantity)) {
    return res.status(400).json({ error: "quantity must be a number" });
  }

  if (payload.quantity < 0) {
    return res.status(400).json({ error: "quantity cannot be negative" });
  }

  const ${entity}: ${Entity} = {
    id: nextId(),
    ${labelField},
    quantity: payload.quantity,
    createdAt: Date.now(),
  };

  save${Entity}(${entity});
  return res.status(201).json(${entity});
});

// TODO(${ticket}): ops keep reporting that adjust does nothing, and we have
// rows sitting at a negative quantity in the export.
router.post("/${entityPlural}/:id/adjust", (req, res) => {
  const payload = req.body as Adjust${Entity}Body & { id: string };
  const existing = get${Entity}(payload.id) as ${Entity};

  return res.status(200).json(
    save${Entity}({ ...existing, quantity: existing.quantity + payload.delta }),
  );
});

export default router;
`;

    const api = `import type { Adjust${Entity}Body, Create${Entity}Body, ${Entity} } from "../shared/types";

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

export function create${Entity}(${labelField}: string, quantity: number): Promise<${Entity}> {
  const payload: Create${Entity}Body = { ${labelField}, quantity };

  return request<${Entity}>("/${entityPlural}", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adjust${Entity}(id: string, delta: number): Promise<${Entity}> {
  const payload: Adjust${Entity}Body = { delta };

  return request<${Entity}>("/${entityPlural}/" + id + "/adjust", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
`;

    const hook = `import { useCallback, useState } from "react";
import type { ${Entity} } from "../shared/types";
import { adjust${Entity}, create${Entity}, fetch${EntityPlural} } from "./api";

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

  const add${Entity} = useCallback(async (${labelField}: string, quantity: number) => {
    try {
      const created = await create${Entity}(${labelField}, quantity);
      set${EntityPlural}((current) => [...current, created]);
      setError(null);
      return created;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the ${entity}");
      return null;
    }
  }, []);

  const adjustQuantity = useCallback(async (id: string, delta: number) => {
    try {
      const updated = await adjust${Entity}(id, delta);
      set${EntityPlural}((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setError(null);
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not adjust the ${entity}");
      return null;
    }
  }, []);

  return { ${entityPlural}, error, load, add${Entity}, adjustQuantity };
}
`;

    const table = `import { useEffect, useState } from "react";
import { use${EntityPlural} } from "./use${EntityPlural}";

export function ${Entity}Table() {
  const { ${entityPlural}, error, load, add${Entity}, adjustQuantity } = use${EntityPlural}();
  const [draft, setDraft] = useState("");

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!draft.trim()) return;
    await add${Entity}(draft.trim(), 0);
    setDraft("");
  }

  return (
    <section className="${entity}-table">
      {error ? <p role="alert">{error}</p> : null}

      <form onSubmit={handleSubmit}>
        <input
          value={draft}
          placeholder="New ${labelHuman}"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit">Add</button>
      </form>

      <table>
        <tbody>
          {${entityPlural}.map((item) => (
            <tr key={item.id}>
              <td>{item.${labelField}}</td>
              <td>{item.quantity}</td>
              <td>
                <button type="button" onClick={() => adjustQuantity(item.id, 1)}>
                  +1
                </button>
                <button type="button" onClick={() => adjustQuantity(item.id, -1)}>
                  -1
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
          note: "adjust handler is the reported problem",
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
          path: `client/${Entity}Table.tsx`,
          contents: table,
          role: "context",
          note: "renders rows and the adjust buttons",
        },
      ],
      scenarios: [
        {
          id: "create-persists",
          name: `Creating a ${entity} reaches the store`,
          code: `await reset();
const created = await api.create${Entity}("Widget", 5);
expect("server returned an id", typeof created.id === "string" && created.id.length > 0, "id was " + JSON.stringify(created.id));
expect("quantity stored", created.quantity === 5, "quantity was " + created.quantity);
expect("store holds one ${entity}", store.list${EntityPlural}().length === 1, "store holds " + store.list${EntityPlural}().length);`,
        },
        {
          id: "adjust-up",
          name: "Adjusting up saves the new quantity",
          code: `await reset();
const created = await api.create${Entity}("Widget", 5);
await api.adjust${Entity}(created.id, 3);
const stored = store.get${Entity}(created.id);
expect("quantity went to 8", Boolean(stored) && stored.quantity === 8, "quantity is " + (stored ? stored.quantity : "missing"));`,
        },
        {
          id: "adjust-below-zero",
          name: "Adjusting down past zero never goes negative",
          code: `await reset();
const created = await api.create${Entity}("Widget", 2);
let status = 0;
try {
  await api.adjust${Entity}(created.id, -10);
  status = 200;
} catch (err) {
  status = err && typeof err.status === "number" ? err.status : 0;
}
const stored = store.get${Entity}(created.id);
expect("clamped or refused, not a crash", status === 200 || status === 400, "status was " + status);
expect("quantity is not negative", Boolean(stored) && stored.quantity >= 0, "quantity is " + (stored ? stored.quantity : "missing"));`,
        },
        {
          id: "adjust-bad-delta",
          name: "A non-numeric delta is rejected with 400",
          code: `await reset();
const created = await api.create${Entity}("Widget", 5);
let status = 0;
try {
  await api.adjust${Entity}(created.id, "lots");
  status = 200;
} catch (err) {
  status = err && typeof err.status === "number" ? err.status : 0;
}
expect("responded 400", status === 400, "status was " + status);`,
        },
        {
          id: "adjust-missing",
          name: "Adjusting an unknown id returns 404",
          code: `await reset();
let status = 0;
try {
  await api.adjust${Entity}("${entity}_does_not_exist", 1);
  status = 200;
} catch (err) {
  status = err && typeof err.status === "number" ? err.status : 0;
}
expect("responded 404", status === 404, "status was " + status);`,
        },
      ],
      traceChain: [
        {
          file: `client/${Entity}Table.tsx`,
          symbol: "adjust button onClick",
          note: "passes the row id and a delta",
        },
        {
          file: `client/use${EntityPlural}.ts`,
          symbol: "adjustQuantity",
          note: "hook action, replaces the row in state with the server copy",
        },
        {
          file: "client/api.ts",
          symbol: `adjust${Entity} -> request`,
          note: "builds the path with the id and posts the delta",
        },
        {
          file: "server/routes.ts",
          symbol: `POST /${entityPlural}/:id/adjust`,
          note: "reads the id, applies the delta, responds with the row",
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
