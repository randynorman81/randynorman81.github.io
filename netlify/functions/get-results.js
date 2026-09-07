// Teacher-only endpoint: requires the edit code generated when the ticket
// was created. Returns the full ticket (including the answer key) plus all
// student responses so far.
import { getStore } from "@netlify/blobs";

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" },
  });
}

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const editCode = url.searchParams.get("editCode");
  if (!id || !editCode) return json({ error: "Missing id or edit code." }, 400);

  const store = getStore("exit-tickets");
  const ticket = await store.get(`ticket:${id}`, { type: "json" });
  if (!ticket) return json({ error: "Exit ticket not found." }, 404);
  if (ticket.editCode !== editCode) return json({ error: "That link does not have permission to view these results." }, 403);

  const responses = (await store.get(`responses:${id}`, { type: "json" })) || [];

  return json({ ticket, responses });
};
