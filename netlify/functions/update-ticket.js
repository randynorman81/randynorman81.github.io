import { getStore } from "@netlify/blobs";

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" },
  });
}

function randomPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function normalizeQuestion(q, i) {
  const id = "q" + i;
  if (q.type === "short_answer") {
    return {
      id,
      type: "short_answer",
      prompt: String(q.prompt || "").trim(),
      acceptableAnswers: Array.isArray(q.acceptableAnswers)
        ? q.acceptableAnswers.map((a) => String(a).trim()).filter(Boolean)
        : [],
    };
  }
  const type = q.type === "true_false" ? "true_false" : "multiple_choice";
  const options = Array.isArray(q.options) ? q.options.map((o) => String(o).trim()) : [];
  return {
    id,
    type,
    prompt: String(q.prompt || "").trim(),
    options,
    correctIndex: Number.isInteger(q.correctIndex) ? q.correctIndex : 0,
  };
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try {
    body = await req.json();
  } catch (err) {
    return json({ error: "Invalid request body." }, 400);
  }

  const { id, editCode } = body;
  if (!id || !editCode) return json({ error: "Missing id or edit code." }, 400);

  const store = getStore("exit-tickets");
  const ticket = await store.get(`ticket:${id}`, { type: "json" });
  if (!ticket) return json({ error: "Exit ticket not found." }, 404);
  if (ticket.editCode !== editCode) return json({ error: "That edit link is not valid for this exit ticket." }, 403);

  const title = String(body.title || "").trim();
  const questions = Array.isArray(body.questions) ? body.questions : [];
  const roster = Array.isArray(body.roster) ? body.roster : [];

  if (!title) return json({ error: "Please give the exit ticket a title." }, 400);
  if (questions.length === 0) return json({ error: "Add at least one question before saving." }, 400);

  ticket.title = title;
  ticket.subject = String(body.subject || "").trim();
  ticket.gradeLevel = String(body.gradeLevel || "").trim();
  ticket.questions = questions.map(normalizeQuestion);
  const existingPins = new Map((ticket.roster || []).map((s) => [s.id, s.pin]));
  ticket.roster = roster
    .filter((s) => s && String(s.name || "").trim())
    .map((s, i) => {
      const id = String(s.id || "r" + i);
      const pin = /^\d{4}$/.test(String(s.pin || "")) ? String(s.pin) : (existingPins.get(id) || randomPin());
      return { id, name: String(s.name).trim(), pin };
    });

  await store.setJSON(`ticket:${id}`, ticket);
  return json({ ok: true });
};
