// Teacher-only endpoint to override the auto-grading of a single question
// for a single student (mainly for short-answer questions).
import { getStore } from "@netlify/blobs";

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" },
  });
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try {
    body = await req.json();
  } catch (err) {
    return json({ error: "Invalid request body." }, 400);
  }

  const { ticketId, editCode, studentId, questionId, correct } = body;
  if (!ticketId || !editCode || !studentId || !questionId || typeof correct !== "boolean") {
    return json({ error: "Missing required fields." }, 400);
  }

  const store = getStore("exit-tickets");
  const ticket = await store.get(`ticket:${ticketId}`, { type: "json" });
  if (!ticket) return json({ error: "Exit ticket not found." }, 404);
  if (ticket.editCode !== editCode) return json({ error: "That link does not have permission to edit these results." }, 403);

  const responses = (await store.get(`responses:${ticketId}`, { type: "json" })) || [];
  const record = responses.find((r) => r.studentId === studentId);
  if (!record) return json({ error: "No submission found for that student." }, 404);

  const pq = record.perQuestion.find((p) => p.questionId === questionId);
  if (!pq) return json({ error: "Question not found on that submission." }, 404);

  pq.correct = correct;
  pq.points = correct ? 1 : 0;
  pq.needsReview = false;

  record.score = record.perQuestion.reduce((sum, p) => sum + p.points, 0);
  record.maxScore = ticket.questions.length;
  record.percent = record.maxScore ? Math.round((record.score / record.maxScore) * 100) : 0;

  await store.setJSON(`responses:${ticketId}`, responses);
  return json({ record });
};
