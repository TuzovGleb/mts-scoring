// Защищённые страницы: форма пароля → PBKDF2+AES-GCM (Web Crypto) → рендер HTML.
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

// Точка входа: initProtected("manifest") на странице manifest.html
export async function initProtected(contentName) {
  const host = document.getElementById("protected");
  const blob = await fetch(`content/${contentName}.enc.json`).then((r) => r.json());

  const cached = sessionStorage.getItem(SS_KEY);
  if (cached) {
    try {
      renderArticle(host, await decrypt(blob, cached));
      return;
    } catch {
      sessionStorage.removeItem(SS_KEY); // пароль сменился
    }
  }
  renderForm(host, blob);
}

function renderForm(host, blob, error = false) {
  host.innerHTML = "";
  const card = document.createElement("div");
  card.className = "card lock-card";
  card.innerHTML = `
    <div class="lock-icon">🔒</div>
    <h2>Документ под паролем</h2>
    <p class="step-meta">Страница зашифрована. Введи пароль доступа — он один для всех документов.</p>
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
      const html = await decrypt(blob, pass);
      sessionStorage.setItem(SS_KEY, pass);
      renderArticle(host, html);
    } catch {
      renderForm(host, blob, true);
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
  lockBtn.addEventListener("click", () => {
    sessionStorage.removeItem(SS_KEY);
    location.reload();
  });
  bar.appendChild(lockBtn);

  const article = document.createElement("article");
  article.className = "card article";
  article.innerHTML = html;

  host.appendChild(bar);
  host.appendChild(article);
}
