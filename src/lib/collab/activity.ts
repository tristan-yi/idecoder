import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";

type ItemLike = { id?: { client?: number } };

export function isRemoteTextChange(
  event: Y.YTextEvent,
  transaction: Y.Transaction,
) {
  return (
    transaction.origin === "remote" &&
    event.delta.some((op) => op.insert != null || op.delete != null)
  );
}

function clientsFromInserts(event: Y.YTextEvent, except: number) {
  const ids = new Set<number>();
  event.changes.added.forEach((item) => {
    const client = (item as ItemLike).id?.client;
    if (typeof client === "number" && client !== except) ids.add(client);
  });
  return [...ids];
}

function clientsOnSurface(awareness: Awareness, surface: "code" | "notes") {
  const ids: number[] = [];
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID) return;
    if (state.surface === surface) ids.push(clientId);
  });
  return ids;
}

export function remoteEditClients(
  event: Y.YTextEvent,
  transaction: Y.Transaction,
  awareness: Awareness,
  surface: "code" | "notes",
): number[] {
  if (!isRemoteTextChange(event, transaction)) return [];
  const fromItems = clientsFromInserts(event, awareness.clientID);
  if (fromItems.length > 0) return fromItems;
  return clientsOnSurface(awareness, surface);
}

export function peerIdForClient(awareness: Awareness, clientId: number) {
  const user = awareness.getStates().get(clientId)?.user as
    | { id?: string }
    | undefined;
  return user?.id || `c:${clientId}`;
}

export function plusLabel(count: number) {
  if (count <= 0) return "";
  return `+${Math.min(count, 9)}`;
}
