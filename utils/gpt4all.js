// utils/gpt4all.js
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const CLI_PATH = process.env.GPT4ALL_CLI_PATH || "gpt4all";
const MODEL_PATH = process.env.GPT4ALL_MODEL_PATH || "";
const MAX_RESPONSE_MS = 120000;
const KB_DIR = path.join(__dirname, "..", "knowledgebase"); // put .txt files here

// load knowledge base at startup
let knowledgeBase = [];
try {
  if (fs.existsSync(KB_DIR)) {
    const files = fs.readdirSync(KB_DIR).filter((f) => f.endsWith(".txt"));
    knowledgeBase = files.map((fn) => ({
      id: fn,
      text: fs.readFileSync(path.join(KB_DIR, fn), "utf8"),
    }));
    console.log("[gpt4all util] loaded KB files:", files);
  } else {
    console.warn("[gpt4all util] knowledgebase directory not found:", KB_DIR);
  }
} catch (e) {
  console.error("[gpt4all util] error loading KB:", e);
}

// simple keyword-overlap scoring to pick top docs
function scoreDocs(query, docs, topN = 3) {
  if (!query) return [];
  const qTokens = query.toLowerCase().split(/\W+/).filter(Boolean);
  const scores = docs.map((d) => {
    const dt = d.text.toLowerCase();
    // count token overlaps (very simple)
    let score = 0;
    for (const t of qTokens) {
      if (dt.includes(t)) score += 1;
    }
    return { doc: d, score };
  });
  scores.sort((a, b) => b.score - a.score);
  return scores
    .filter((s) => s.score > 0)
    .slice(0, topN)
    .map((s) => s.doc);
}

// system prompt tailored to MyPadiFood
function buildSystemPrompt() {
  return [
    "You are the support assistant for MyPadiFood, a local food vendor & food-delivery marketplace in Nigeria.",
    "Answer user questions concisely and accurately; if you don't know, say you don't know and offer how to get help.",
    "Currency: use Nigerian Naira (₦) for prices unless user asks about another country.",
    "User-facing tone: friendly, helpful, short bullet points for steps, include links only if known.",
    "If the user asks about vendor signup, include required documents and steps (phone, business name, tax id).",
    "If user asks about orders, explain status options, delivery windows, refunds and contact channels.",
  ].join(" ");
}

// assemble final prompt we will pass to the CLI
function assemblePrompt(userMessage, history = []) {
  // pick top matching KB docs and include short excerpts
  const topDocs = scoreDocs(userMessage, knowledgeBase, 3);
  const kbText =
    topDocs.length > 0
      ? "\n\n--- Relevant MyPadiFood extracts (do not invent other facts) ---\n" +
        topDocs.map((d) => `Source: ${d.id}\n${d.text.slice(0, 1500)}`).join("\n\n---\n")
      : "";

  const system = buildSystemPrompt();

  // include limited history (last 6 messages)
  const histText = (history || [])
    .slice(-6)
    .map((h) => {
      return `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`;
    })
    .join("\n");

  // final prompt formatting — you can tweak to match gpt4all model expectations
  const prompt = [
    `SYSTEM: ${system}`,
    kbText ? kbText : "",
    histText ? `CONVERSATION HISTORY:\n${histText}` : "",
    `USER: ${userMessage}`,
    "",
    "Assistant:",
  ]
    .filter(Boolean)
    .join("\n\n");

  return prompt;
}

// call local CLI gpt4all
function runCli(prompt) {
  return new Promise((resolve, reject) => {
    const args = [];
    if (MODEL_PATH) {
      args.push("--model", MODEL_PATH);
    }
    // some builds expect --prompt, others use different flags; adjust if needed
    args.push("--prompt", prompt);

    execFile(
      CLI_PATH,
      args,
      { timeout: MAX_RESPONSE_MS, maxBuffer: 1024 * 1024 * 8 },
      (err, stdout, stderr) => {
        if (err) {
          return reject(
            new Error(`CLI error: ${err.message} ${stderr ? "| stderr: " + stderr : ""}`)
          );
        }
        const out = (stdout || "").toString().trim();
        resolve(out);
      }
    );
  });
}

async function sendMessage({ message, history = [], session = {} } = {}) {
  if (!message || typeof message !== "string") throw new Error("Missing message string");

  // build prompt with knowledgebase context
  const prompt = assemblePrompt(message, history);

  try {
    const raw = await runCli(prompt);
    // postprocess: strip any prompt echoes if needed
    const reply = raw;
    return reply;
  } catch (err) {
    console.error("[gpt4all util] sendMessage error:", err);
    throw err;
  }
}

module.exports = { sendMessage };
