// Защищённый контент: форма пароля → PBKDF2+AES-GCM (Web Crypto).
// unlock(name, host) → Promise<plaintext> — универсальный гейт (документы и код).
// Пароль кэшируется в sessionStorage — между страницами сайта в рамках вкладки.
const SS_KEY = "hackteam:pass";

const b64ToBuf = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(pass, salt, iterations) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pass),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

async function decrypt(blob, pass) {
  const key = await deriveKey(pass, b64ToBuf(blob.salt), blob.iterations);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBuf(blob.iv) },
    key,
    b64ToBuf(blob.data)
  );
  return new TextDecoder().decode(plain);
}

// Универсальный гейт: рендерит форму пароля в host (если нужно),
// резолвится расшифрованным текстом content/<name>.enc.json.
export async function unlock(contentName, host) {
  const blob = await fetch(`content/${contentName}.enc.json`).then((r) => r.json());

  const cached = sessionStorage.getItem(SS_KEY);
  if (cached) {
    try {
      return await decrypt(blob, cached);
    } catch {
      sessionStorage.removeItem(SS_KEY); // пароль сменился
    }
  }
  return new Promise((resolve) => renderForm(host, blob, resolve));
}

export function lockSession() {
  sessionStorage.removeItem(SS_KEY);
  location.reload();
}

// Страницы документов: unlock → рендер статьи.
export async function initProtected(contentName) {
  const host = document.getElementById("protected");
  const html = await unlock(contentName, host);
  renderArticle(host, html);
}

function renderForm(host, blob, resolve, error = false) {
  host.innerHTML = "";
  const card = document.createElement("div");
  card.className = "card lock-card";
  card.innerHTML = `
    <div class="lock-icon">🔒</div>
    <h2>Доступ по паролю</h2>
    <p class="step-meta">Содержимое зашифровано. Введи пароль — он один для всех разделов.</p>
    <form class="lock-form">
      <input type="password" placeholder="Пароль" autocomplete="current-password" autofocus />
      <button class="btn" type="submit">Открыть</button>
    </form>
    ${error ? '<div class="lock-error">Неверный пароль</div>' : ""}
  `;
  host.appendChild(card);
  card.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pass = card.querySelector("input").value;
    const btn = card.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Расшифровка…";
    try {
      const text = await decrypt(blob, pass);
      sessionStorage.setItem(SS_KEY, pass);
      resolve(text);
    } catch {
      renderForm(host, blob, resolve, true);
    }
  });
}

function renderArticle(host, html) {
  host.innerHTML = "";
  const bar = document.createElement("div");
  bar.className = "lock-bar";
  const lockBtn = document.createElement("button");
  lockBtn.className = "btn btn--ghost btn--sm";
  lockBtn.type = "button";
  lockBtn.textContent = "🔒 Закрыть доступ";
  lockBtn.addEventListener("click", lockSession);
  bar.appendChild(lockBtn);

  const article = document.createElement("article");
  article.className = "card article";
  article.innerHTML = html;

  host.appendChild(bar);
  host.appendChild(article);
}
