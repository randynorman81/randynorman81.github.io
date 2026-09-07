// Shared helpers used by teacher.html and student.html.
// No build step, no dependencies -- plain browser JS.

function qs(sel, root) { return (root || document).querySelector(sel); }
function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function uid(prefix) {
  return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 10);
}

function toast(msg, ms) {
  const existing = qs(".toast");
  if (existing) existing.remove();
  const div = document.createElement("div");
  div.className = "toast";
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), ms || 3200);
}

async function fetchJSON(url, opts) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    throw new Error("Could not reach the server. Check your internet connection and try again.");
  }
  let data = null;
  try { data = await res.json(); } catch (err) { /* no body */ }
  if (!res.ok) {
    const msg = (data && data.error) ? data.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast("Copied to clipboard")).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); toast("Copied to clipboard"); } catch (e) { toast("Copy failed -- select and copy manually"); }
  ta.remove();
}

// --- Roster (CSV / pasted names) parsing ---------------------------------

function splitDelimitedLine(line, delim) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === delim && !inQuotes) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

function parseRoster(text) {
  const lines = String(text || "")
    .split(/\r\n|\n|\r/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const delim = lines[0].includes(",") ? "," : (lines[0].includes("\t") ? "\t" : null);
  const rows = lines.map((l) => (delim ? splitDelimitedLine(l, delim) : [l]));

  const header = rows[0].map((c) => c.trim().toLowerCase());
  const nameIdx = header.findIndex((h) => h.includes("name"));
  const firstIdx = header.findIndex((h) => h.includes("first"));
  const lastIdx = header.findIndex((h) => h.includes("last"));
  const looksLikeHeader = nameIdx >= 0 || firstIdx >= 0 || lastIdx >= 0;
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;

  const names = dataRows.map((r) => {
    let name;
    if (nameIdx >= 0) name = r[nameIdx];
    else if (firstIdx >= 0 || lastIdx >= 0) name = [r[firstIdx] || "", r[lastIdx] || ""].filter(Boolean).join(" ");
    else name = r[0];
    return (name || "").trim();
  }).filter(Boolean);

  // De-duplicate identical names by appending a counter, and assign stable ids.
  const seen = new Map();
  return names.map((name, i) => {
    let label = name;
    if (seen.has(name)) {
      const n = seen.get(name) + 1;
      seen.set(name, n);
      label = `${name} (${n + 1})`;
    } else {
      seen.set(name, 0);
    }
    return { id: "r" + i, name: label };
  });
}

// --- CSV export ------------------------------------------------------------

function toCSV(rows) {
  return rows.map((row) => row.map((cell) => {
    const s = String(cell == null ? "" : cell);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }).join(",")).join("\r\n");
}

function downloadCSV(filename, rows) {
  const csv = toCSV(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- Lazy-loaded content extraction (PDF / DOCX) ---------------------------

const _scriptCache = {};
function loadScript(src) {
  if (_scriptCache[src]) return _scriptCache[src];
  _scriptCache[src] = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Could not load a required library from the internet (" + src + "). Check your connection, or paste the lesson text directly instead."));
    document.head.appendChild(s);
  });
  return _scriptCache[src];
}

async function extractTextFromFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md")) {
    return await file.text();
  }
  if (name.endsWith(".pdf")) {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js";
    const buf = await file.arrayBuffer();
    const doc = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let text = "";
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(" ") + "\n\n";
    }
    return text;
  }
  if (name.endsWith(".docx")) {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js");
    const buf = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return result.value;
  }
  throw new Error("Unsupported file type. Please upload a .txt, .md, .pdf, or .docx file, or paste the text directly.");
}
