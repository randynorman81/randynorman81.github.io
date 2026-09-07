import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" },
  });
}

function randomId(len) {
  return randomBytes(len || 12).toString("hex").slice(0, len || 12);
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

  const title = String(body.title || "").trim();
  const questions = Array.isArray(body.questions) ? body.questions : [];
  const roster = Array.isArray(body.roster) ? body.roster : [];

  if (!title) return json({ error: "Please give the exit ticket a title." }, 400);
  if (questions.length === 0) return json({ error: "Add at least one question before saving." }, 400);
  for (const q of questions) {
    if (!q.prompt || !String(q.prompt).trim()) return json({ error: "Every question needs text." }, 400);
    if (q.type !== "short_answer") {
      const opts = Array.isArray(q.options) ? q.options.filter((o) => String(o || "").trim()) : [];
      if (opts.length < 2) return json({ error: "Multiple-choice questions need at least 2 answer options." }, 400);
    }
  }

  const id = randomId(10);
  const editCode = randomId(24);

  const ticket = {
    id,
    editCode,
    title,
    subject: String(body.subject || "").trim(),
    gradeLevel: String(body.gradeLevel || "").trim(),
    createdAt: new Date().toISOString(),
    questions: questions.map(normalizeQuestion),
    roster: roster
      .filter((s) => s && String(s.name || "").trim())
      .map((s, i) => ({ id: String(s.id || "r" + i), name: String(s.name).trim() })),
  };

  try {
    const store = getStore("exit-tickets");
    await store.setJSON(`ticket:${id}`, ticket);
    await store.setJSON(`responses:${id}`, []);
  } catch (err) {
    return json({ error: "Could not save the exit ticket: " + err.message }, 500);
  }

  return json({ id, editCode });
};
