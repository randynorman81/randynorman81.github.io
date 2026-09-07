// Public endpoint used by students to submit answers. Grades multiple-choice
// and true/false questions automatically; short-answer questions are graded
// with a best-effort keyword match and flagged for teacher review.
import { getStore } from "@netlify/blobs";

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" },
  });
}

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:'"()]/g, "")
    .replace(/\s+/g, " ");
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try {
    body = await req.json();
  } catch (err) {
    return json({ error: "Invalid request body." }, 400);
  }

  const { ticketId, studentId, answers } = body;
  if (!ticketId || !studentId || !answers || typeof answers !== "object") {
    return json({ error: "Missing ticket id, student, or answers." }, 400);
  }

  const store = getStore("exit-tickets");
  const ticket = await store.get(`ticket:${ticketId}`, { type: "json" });
  if (!ticket) return json({ error: "Exit ticket not found." }, 404);

  const student = ticket.roster.find((s) => s.id === studentId);
  if (!student) return json({ error: "We could not find your name on the class roster. Please check with your teacher." }, 400);

  const perQuestion = ticket.questions.map((q) => {
    const given = answers[q.id];
    let correct = false;
    let needsReview = false;

    if (q.type === "multiple_choice" || q.type === "true_false") {
      correct = given !== undefined && given !== null && Number(given) === Number(q.correctIndex);
    } else if (q.type === "short_answer") {
      const norm = normalize(given);
      const accepted = (q.acceptableAnswers || []).map(normalize).filter(Boolean);
      correct = norm.length > 0 && accepted.some((a) => norm === a || norm.includes(a) || a.includes(norm));
      needsReview = true; // short answers always get a teacher glance, even when auto-marked correct
    }

    return { questionId: q.id, given: given === undefined ? "" : given, correct, needsReview, points: correct ? 1 : 0 };
  });

  const earned = perQuestion.reduce((sum, p) => sum + p.points, 0);
  const total = ticket.questions.length;

  const record = {
    studentId,
    studentName: student.name,
    perQuestion,
    score: earned,
    maxScore: total,
    percent: total ? Math.round((earned / total) * 100) : 0,
    submittedAt: new Date().toISOString(),
  };

  const responses = (await store.get(`responses:${ticketId}`, { type: "json" })) || [];
  const idx = responses.findIndex((r) => r.studentId === studentId);
  if (idx >= 0) responses[idx] = record; else responses.push(record);
  await store.setJSON(`responses:${ticketId}`, responses);

  return json({
    score: earned,
    maxScore: total,
    percent: record.percent,
    perQuestion: perQuestion.map((p) => ({ questionId: p.questionId, correct: p.correct })),
  });
};
