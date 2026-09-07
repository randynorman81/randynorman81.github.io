# Exit Ticket Generator

A small self-contained website that lets a teacher turn any lesson content into a
short, self-grading high school "exit ticket." No coding, no build step, and no
separate database to set up — it deploys straight to [Netlify](https://www.netlify.com/)
as-is.

- **Teachers** paste or upload lesson content (`.txt`, `.md`, `.pdf`, `.docx`) and the
  site uses AI to draft a few multiple-choice questions plus an optional short-answer
  question, all editable before publishing.
- **Rosters** can be uploaded as a CSV (a "Name" column, or First/Last columns) or
  just pasted as one name per line, so students pick their name instead of typing it.
- **Students** open one link, answer the questions, and submit.
- **Grading is automatic** for multiple-choice/true-false questions. Short-answer
  questions get a best-effort keyword check that the teacher can override with one
  click on the results page.

## 1. Deploy to Netlify

You do **not** need to know how to code to do this.

1. Create a free account at [netlify.com](https://www.netlify.com/).
2. From the Netlify dashboard, click **Add new site**.
   - **Easiest — no Git required:** choose "Deploy manually" and drag the whole
     project folder (or a zip of it) onto the upload area.
   - **Recommended for updates:** connect this GitHub repository instead ("Import
     an existing project"), so any future changes redeploy automatically. Leave the
     build settings as detected (publish directory `.`, functions directory
     `netlify/functions`) — they're already configured in `netlify.toml`.
3. Wait for the deploy to finish. Netlify gives you a URL like
   `https://your-site-name.netlify.app`.

## 2. Add your AI key (required for generating questions)

The site calls the Anthropic API to draft questions from your lesson content, so it
needs an API key:

1. Get an API key from the [Anthropic Console](https://console.anthropic.com/) (a
   school or district may already have one; a personal key works too — usage for a
   few exit tickets a day is inexpensive).
2. In Netlify: go to your site → **Site configuration** → **Environment variables**
   → **Add a variable**.
3. Set the key name to `ANTHROPIC_API_KEY` and paste in your API key as the value.
4. Go to **Deploys** and trigger **Deploy site** (or **Clear cache and deploy**) so
   the new variable takes effect.

That's it — no other setup. Saved exit tickets and student responses are stored
automatically using [Netlify Blobs](https://docs.netlify.com/blobs/overview/), which
requires no extra configuration.

## 3. Using it

1. Open your site's URL and click **Create an Exit Ticket**.
2. Paste in your lesson content (or upload a file) and click **Generate Exit Ticket
   with AI**.
3. Review the generated questions — edit wording, swap answer choices, add or
   remove questions, and pick which option is correct for each.
4. Upload or paste your class roster.
5. Click **Save & Publish**. You'll get two links:
   - A **student link** — share this with your class (project it, post it in your
     LMS, etc.).
   - A **results link** — bookmark this. It's the only way to see or edit results
     later, and it also lets you fix the questions after publishing.
6. As students submit, refresh the results page to see scores. Multiple-choice
   questions are graded instantly; click **Details** next to a student to review
   short answers and mark them correct/incorrect if needed.
7. Use **Export results as CSV** to download a gradebook-ready spreadsheet.

## Notes & limits

- This is intentionally lightweight: there's no teacher login. Anyone with a
  results link can view/edit that exit ticket's results, so treat those links like
  a password and don't post them publicly. Anyone with a *student* link can submit
  once per roster name (resubmitting replaces the earlier answer).
- Short-answer grading is a simple keyword match, not full AI grading — it's meant
  to save time, not replace a teacher's judgment. Every short answer is flagged for
  a quick review on the results page.
- File uploads for lesson content are extracted entirely in the browser (using
  [pdf.js](https://mozilla.github.io/pdf.js/) and
  [mammoth.js](https://github.com/mwilliamson/mammoth.js), loaded from a CDN) —
  nothing is uploaded anywhere except the extracted text, which is sent once to the
  AI provider to generate questions.

## Project structure

```
index.html                        Landing page
teacher.html                      Create tickets + view/edit results
student.html                      Where students answer and submit
assets/style.css, assets/common.js
netlify/functions/
  generate-ticket.js              Calls the AI to draft questions
  save-ticket.js / update-ticket.js
  get-ticket.js                   Public, answer-key-free (used by student.html)
  submit-response.js              Grades and stores a student's submission
  get-results.js                  Teacher-only (requires the edit code)
  update-response.js              Teacher override for short-answer grading
```
