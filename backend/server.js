import "dotenv/config";
import express from "express";
import cors from "cors";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { PROVIDERS, runProvider, providerStatus } from "./providers/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");

const app = express();
app.use(express.json({ limit: "1mb" }));

const origins = (process.env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim());
app.use(cors({ origin: origins.includes("*") ? true : origins }));

// jobId -> { id, createdAt, project, prompt, status, results: { name: {...} } }
const jobs = new Map();

function safeName(s) {
  return String(s || "проект").trim().replace(/[^\wА-Яа-яЁё.-]+/g, "_") || "проект";
}

async function saveResult(job, name, result) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(DATA_DIR, `${safeName(job.project)}_${name}_${date}.md`);
  const header = `# ${job.project || "проект"} — ${name} — ${date}\n\n`;
  const srcs =
    result.sources && result.sources.length
      ? `\n\n## Источники\n${result.sources.map((s) => `- [${s.title}](${s.url})`).join("\n")}\n`
      : "";
  await fs.writeFile(file, header + (result.text || "") + srcs, "utf8");
  return file;
}

// Запустить один провайдер и записать исход в job.
async function runOne(job, name) {
  job.results[name] = { status: "running", text: "", sources: [], error: null };
  try {
    const result = await runProvider(name, job.prompt);
    const file = await saveResult(job, name, result).catch(() => null);
    job.results[name] = {
      status: "done",
      text: result.text,
      sources: result.sources || [],
      mock: Boolean(result.mock),
      file,
      error: null,
    };
  } catch (e) {
    job.results[name] = {
      status: "error",
      text: "",
      sources: [],
      error: String(e?.message || e),
    };
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, providers: providerStatus() });
});

// Запуск рассылки. body: { prompt, models?: string[], project?: string }
app.post("/api/research", (req, res) => {
  const { prompt, models, project } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "prompt обязателен" });
  }
  const chosen = (Array.isArray(models) && models.length ? models : Object.keys(PROVIDERS)).filter(
    (m) => PROVIDERS[m]
  );
  if (!chosen.length) return res.status(400).json({ error: "нет валидных моделей" });

  const id = crypto.randomUUID();
  const job = {
    id,
    createdAt: new Date().toISOString(),
    project: project || "",
    prompt,
    status: "running",
    results: {},
  };
  jobs.set(id, job);

  // Запускаем провайдеры параллельно; ошибка одного не валит остальных.
  Promise.allSettled(chosen.map((name) => runOne(job, name))).then(() => {
    job.status = "done";
  });

  res.json({ jobId: id, models: chosen });
});

// Статус задачи (поллинг с фронта).
app.get("/api/research/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "job не найден" });
  res.json({
    id: job.id,
    status: job.status,
    project: job.project,
    createdAt: job.createdAt,
    results: job.results,
  });
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`scoring-app backend на http://localhost:${PORT}`);
  console.log("Провайдеры:", providerStatus());
});
