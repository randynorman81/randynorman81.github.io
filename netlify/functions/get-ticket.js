// Public endpoint used by the student page. Never returns correct answers.
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
  if (!id) return json({ error: "Missing exit ticket id." }, 400);

  const store = getStore("exit-tickets");
  const ticket = await store.get(`ticket:${id}`, { type: "json" });
  if (!ticket) return json({ error: "We couldn't find that exit ticket. Double-check the link with your teacher." }, 404);

  return json({
    id: ticket.id,
    title: ticket.title,
    subject: ticket.subject,
    gradeLevel: ticket.gradeLevel,
    roster: ticket.roster.map((s) => ({ id: s.id, name: s.name })),
    questions: ticket.questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      options: q.type === "short_answer" ? undefined : q.options,
    })),
  });
};
