// Calls the Anthropic API to turn raw lesson content into a structured
// exit ticket (multiple-choice + optional short-answer questions).
// Requires the ANTHROPIC_API_KEY environment variable to be set on the
// Netlify site (Site settings -> Environment variables).

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" },
  });
}

function extractJSON(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The AI response did not contain valid JSON.");
  return JSON.parse(candidate.slice(start, end + 1));
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try {
    body = await req.json();
  } catch (err) {
    return json({ error: "Invalid request body." }, 400);
  }

  const content = (body.content || "").trim();
  const subject = (body.subject || "").trim();
  const gradeLevel = (body.gradeLevel || "").trim();
  const numMC = Math.min(Math.max(parseInt(body.numMultipleChoice, 10) || 3, 1), 6);
  const includeShortAnswer = body.includeShortAnswer !== false;

  if (content.length < 20) {
    return json({ error: "Please provide a bit more lesson content (at least a few sentences) so the AI has something to work with." }, 400);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({
      error: "This site is missing the ANTHROPIC_API_KEY environment variable. Whoever deployed this site to Netlify needs to add it under Site settings > Environment variables, then redeploy.",
    }, 500);
  }

  const trimmedContent = content.length > 12000 ? content.slice(0, 12000) : content;

  const instructions = `You are an experienced high school teacher writing a short "exit ticket" -- a quick formative check for understanding given at the very end of a class period.

Base the exit ticket ONLY on the lesson content provided below. Do not require outside knowledge.
${subject ? `Subject: ${subject}\n` : ""}${gradeLevel ? `Grade level: ${gradeLevel}\n` : ""}
Write exactly ${numMC} multiple-choice question(s), each with exactly 4 answer options where only one is correct. Questions should check real understanding of the material (not trivia or wording tricks), be unambiguous, and have plausible distractors (wrong answers that reflect common misconceptions, not silly options).
${includeShortAnswer ? "Also write exactly 1 short-answer question that asks students to explain or apply a key idea in their own words (a sentence or two). For it, provide a list of 3-6 short \"acceptableAnswers\" -- key words or short phrases that would indicate a correct response, used later for automatic keyword grading." : "Do not include any short-answer questions."}

Respond with ONLY a single JSON object, no other text, in exactly this shape:
{
  "title": "short descriptive title for the exit ticket",
  "questions": [
    { "type": "multiple_choice", "prompt": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0 }${includeShortAnswer ? ',\n    { "type": "short_answer", "prompt": "...", "acceptableAnswers": ["...", "..."] }' : ""}
  ]
}

Lesson content:
"""
${trimmedContent}
"""`;

  let anthropicRes;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        messages: [{ role: "user", content: instructions }],
      }),
    });
  } catch (err) {
    return json({ error: "Could not reach the AI service. Please try again in a moment." }, 502);
  }

  if (!anthropicRes.ok) {
    let detail = "";
    try { detail = (await anthropicRes.json()).error?.message || ""; } catch (e) { /* ignore */ }
    return json({ error: `The AI service returned an error${detail ? ": " + detail : "."}` }, 502);
  }

  const data = await anthropicRes.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) return json({ error: "The AI did not return any text." }, 502);

  let parsed;
  try {
    parsed = extractJSON(textBlock.text);
  } catch (err) {
    return json({ error: "The AI response could not be understood. Please try generating again." }, 502);
  }

  if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    return json({ error: "The AI did not return any questions. Please try again." }, 502);
  }

  const questions = parsed.questions.map((q, i) => {
    if (q.type === "short_answer") {
      return {
        id: "q" + i,
        type: "short_answer",
        prompt: String(q.prompt || "").trim(),
        acceptableAnswers: Array.isArray(q.acceptableAnswers) ? q.acceptableAnswers.map(String) : [],
      };
    }
    return {
      id: "q" + i,
      type: "multiple_choice",
      prompt: String(q.prompt || "").trim(),
      options: Array.isArray(q.options) ? q.options.slice(0, 4).map(String) : [],
      correctIndex: Number.isInteger(q.correctIndex) ? q.correctIndex : 0,
    };
  });

  return json({
    title: String(parsed.title || "Exit Ticket").trim(),
    subject,
    gradeLevel,
    questions,
  });
};
