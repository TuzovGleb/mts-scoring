// Шифрует content-src/*.html → frontend/content/*.enc.json
// PBKDF2-SHA256 (310k итераций) → AES-256-GCM. Без внешних зависимостей.
// Запуск: node tools/encrypt-content.mjs "<пароль>"
import { promises as fs } from "node:fs";
import path from "node:path";
import { webcrypto as crypto } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "..", "content-src");
const OUT = path.resolve(__dirname, "..", "frontend", "content");
const ITERATIONS = 310000;

const password = process.argv[2];
if (!password) {
  console.error('Использование: node tools/encrypt-content.mjs "<пароль>"');
  process.exit(1);
}

const b64 = (buf) => Buffer.from(buf).toString("base64");

async function deriveKey(pass, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pass),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
}

await fs.mkdir(OUT, { recursive: true });
const files = (await fs.readdir(SRC)).filter(
  (f) => f.endsWith(".html") || f.endsWith(".js")
);
if (!files.length) {
  console.error(`Нет .html/.js в ${SRC}`);
  process.exit(1);
}

for (const file of files) {
  const html = await fs.readFile(path.join(SRC, file), "utf8");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(html)
  );
  const out = {
    v: 1,
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: b64(salt),
    iv: b64(iv),
    data: b64(data),
  };
  const outFile = path.join(OUT, file.replace(/\.(html|js)$/, ".enc.json"));
  await fs.writeFile(outFile, JSON.stringify(out), "utf8");
  console.log(`✓ ${file} → ${path.relative(process.cwd(), outFile)} (${out.data.length} b64 байт)`);
}
console.log("Готово. В git коммитятся только frontend/content/*.enc.json");
