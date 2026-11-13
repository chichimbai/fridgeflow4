const Core = window.FridgeCore;
const UI = window.FridgeUI;
const Prices = FridgePrices;

const currencySelect = document.querySelector("#currency");
const dayChart = document.querySelector("#day-chart");
const savedList = document.querySelector("#saved-list");
const drawer = document.querySelector("#account-drawer");
const accountForm = document.querySelector("#account-form");
const aboutCount = document.querySelector("#about-count");

let resetArmed = false;

function init() {
  Prices.CURRENCIES.forEach((currency) => {
    const option = document.createElement("option");
    option.value = currency.code;
    option.textContent = `${currency.label} (${currency.code})`;
    currencySelect.append(option);
  });
  currencySelect.value = Prices.currentCurrency();
  currencySelect.addEventListener("change", () => {
    Prices.saveCurrency(currencySelect.value);
    renderStats();
    renderSavings();
    UI.toast(`Валюта: ${currencySelect.options[currencySelect.selectedIndex].textContent}.`, { tone: "info", duration: 2200 });
  });

  document.querySelector("#account-open").addEventListener("click", openDrawer);
  document.querySelector("#account-cancel").addEventListener("click", closeDrawer);
  accountForm.addEventListener("submit", saveProfile);
  accountForm.elements.about.addEventListener("input", () => {
    aboutCount.textContent = `${accountForm.elements.about.value.length} / 180`;
  });
  accountForm.addEventListener("input", (event) => {
    const field = event.target.closest("label.field");
    const note = field && field.nextElementSibling;
    if (note && note.classList.contains("field-error")) note.remove();
  });

  const historyCard = document.querySelector("#history-card");
  historyCard.addEventListener("click", (event) => {
    if (event.target.closest("a")) return;
    historyCard.classList.toggle("is-open");
  });
  historyCard.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest("a")) return;
    event.preventDefault();
    historyCard.classList.toggle("is-open");
  });

  document.querySelector("#backup-export").addEventListener("click", exportBackup);
  document.querySelector("#backup-import").addEventListener("change", importBackup);
  document.querySelector("#backup-reset").addEventListener("click", resetBackup);

  Core.on("products recipes reviews profile journal", renderAll);

  trackCursor();
  renderAll();
  UI.reveal(document.querySelectorAll(".profile-hero, .stat-tile, .page-shell > .panel"));
}

function trackCursor() {
  document.querySelectorAll(".side-nav a, .stat-tile").forEach((node) => {
    node.addEventListener("pointermove", (event) => {
      const box = node.getBoundingClientRect();
      node.style.setProperty("--mx", `${((event.clientX - box.left) / box.width) * 100}%`);
      node.style.setProperty("--my", `${((event.clientY - box.top) / box.height) * 100}%`);
    });
  });
}

function renderAll() {
  renderProfile();
  renderStats();
  renderChart();
  renderSavings();
  renderHistory();
  renderFavorites();
  document.querySelector("#schema-badge").textContent = `схема v${Core.SCHEMA_VERSION}`;
  renderUsage();
}

/* ---------- profile ---------- */

function renderProfile() {
  const profile = Core.profile.get();
  const level = Core.stats.level();
  document.querySelector("#account-name").textContent = profile.name;
  document.querySelector("#account-initials").textContent = Core.profile.initials(profile.name);
  document.querySelector("#account-about").textContent =
    profile.about || "Расскажите о себе — это увидят в ваших отзывах.";
  document.querySelector("#account-about").classList.toggle("is-empty", !profile.about);

  document.querySelector("#level-chip").textContent = `Уровень ${level.level} · ${level.title}`;
  document.querySelector("#level-xp").textContent = level.nextAt
    ? `${level.xp} XP · до ${level.nextAt}`
    : `${level.xp} XP · максимум`;
  document.querySelector("#xp-fill").style.width = `${Math.round(level.progress * 100)}%`;
  document.querySelector("#xp-fill").parentElement.setAttribute("aria-label", `Опыт: ${Math.round(level.progress * 100)}%`);
}

function openDrawer() {
  const profile = Core.profile.get();
  accountForm.elements.name.value = profile.name;
  accountForm.elements.about.value = profile.about;
  aboutCount.textContent = `${profile.about.length} / 180`;
  UI.clearFieldErrors(accountForm);
  drawer.hidden = false;
  requestAnimationFrame(() => {
    drawer.classList.add("is-open");
    accountForm.elements.name.focus({ preventScroll: true });
  });
  if (UI.motion()) drawer.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeDrawer() {
  drawer.classList.remove("is-open");
  setTimeout(() => {
    drawer.hidden = true;
  }, UI.motion() ? 380 : 0);
}

function saveProfile(event) {
  event.preventDefault();
  try {
    const next = Core.profile.update({
      name: accountForm.elements.name.value,
      about: accountForm.elements.about.value,
    });
    closeDrawer();
    UI.burst(document.querySelector("#account-open"), { count: 14 });
    UI.toast(`Профиль сохранён: ${next.name}.`, { tone: "ok" });
  } catch (problem) {
    UI.handle(problem, accountForm);
  }
}

/* ---------- stats ---------- */

function renderStats() {
  const overview = Core.stats.overview(Prices.currentCurrency());
  const currency = overview.currency;

  UI.countUp(document.querySelector("#stat-used"), overview.counts.used);
  UI.countUp(document.querySelector("#stat-expired"), overview.counts.expired);
  UI.countUp(document.querySelector("#stat-saved"), overview.saved, {
    format: (value) => Math.round(value).toLocaleString("ru-RU"),
  });
  UI.countUp(document.querySelector("#stat-clean"), overview.daysClean);

  document.querySelector("#stat-rate").textContent = `${overview.useRate}% из закрытых`;
  document.querySelector("#stat-lost").textContent = overview.lost
    ? `Потеряно ${Prices.formatMoney(overview.lost, currency)}`
    : "Потерь нет";
  document.querySelector("#stat-clean-note").textContent = overview.lost ? "С последней просрочки" : "Просрочки не было";
}

function renderChart() {
  const days = Core.stats.daily(14);
  const max = Math.max(1, ...days.map((day) => Math.max(day.used, day.expired)));
  const today = Core.time.todayISO();
  dayChart.replaceChildren();

  let events = 0;
  days.forEach((day, index) => {
    events += day.used + day.expired;
    const column = document.createElement("div");
    column.className = `chart-col${day.day === today ? " is-today" : ""}`;

    const tip = document.createElement("span");
    tip.className = "chart-tip";
    tip.textContent = `${Core.text.formatDate(day.day)}: ${day.used} исп., ${day.expired} просроч.`;
    column.append(tip);

    const bars = document.createElement("div");
    bars.className = "chart-bars";
    bars.append(chartBar("is-used", day.used, max, index), chartBar("is-expired", day.expired, max, index));
    column.append(bars);

    const label = document.createElement("span");
    label.className = "chart-label";
    label.textContent = day.day.slice(8, 10) + "." + day.day.slice(5, 7);
    column.append(label);
    dayChart.append(column);
  });

  document.querySelector("#chart-total").textContent = `${events} ${Core.text.plural(events, "событие", "события", "событий")}`;
}

function chartBar(kind, value, max, index) {
  const bar = document.createElement("span");
  bar.className = `chart-bar ${kind}`;
  bar.style.height = `${Math.max(value ? 4 : 1, Math.round((value / max) * 100))}%`;
  bar.style.setProperty("--i", String(index));
  bar.title = `${value}`;
  return bar;
}

/* ---------- savings ---------- */

function renderSavings() {
  const overview = Core.stats.overview(Prices.currentCurrency());
  const currency = overview.currency;
  const saved = overview.saved;
  const lost = overview.lost;
  const scaleMax = saved + lost;
  const percent = scaleMax ? Math.round((saved / scaleMax) * 100) : 0;

  document.querySelector("#saved-amount").textContent = Prices.formatMoney(saved, currency);
  document.querySelector("#saved-lost").textContent = `Просрочено на ${Prices.formatMoney(lost, currency)}`;
  const fill = document.querySelector("#scale-fill");
  fill.style.width = `${percent}%`;
  const track = document.querySelector("#scale-track");
  track.setAttribute("aria-valuenow", String(Math.round(saved)));
  track.setAttribute("aria-valuemax", String(Math.round(scaleMax)));
  document.querySelector("#scale-note").textContent = scaleMax
    ? `${percent}% стоимости использованных и просроченных продуктов осталось в деле.`
    : "Отметьте продукты как использованные, чтобы увидеть сумму.";

  savedList.replaceChildren();
  if (!overview.savedRows.length) {
    const empty = document.createElement("li");
    empty.className = "panel-note";
    empty.textContent = "Пока нет использованных продуктов с известной ценой.";
    savedList.append(empty);
    return;
  }

  overview.savedRows.slice(0, 6).forEach((row) => {
    const item = document.createElement("li");
    item.className = "saved-row";
    const body = document.createElement("div");
    body.append(
      Object.assign(document.createElement("h3"), { textContent: row.product.name }),
      Object.assign(document.createElement("p"), {
        textContent: `${row.product.amount} ${Core.products.UNITS[row.product.unit] || ""} · ${row.source}`.trim(),
      }),
    );
    const money = document.createElement("strong");
    money.textContent = Prices.formatMoney(row.amount, currency);
    item.append(body, money);
    savedList.append(item);
  });
}

/* ---------- recipe history ---------- */

function renderHistory() {
  const views = Core.recipes.views();
  const countNode = document.querySelector("#history-count");
  const summaryNode = document.querySelector("#history-summary");
  const previewNode = document.querySelector("#history-preview");
  countNode.textContent = String(views.length);
  previewNode.replaceChildren();

  if (!views.length) {
    summaryNode.textContent = "Здесь появятся рецепты, которые вы открывали.";
    const hint = document.createElement("li");
    hint.className = "history-preview-empty";
    hint.textContent = "Откройте любой рецепт на вкладке «Рецепты» — он появится здесь.";
    previewNode.append(hint);
    return;
  }

  const latest = views[0];
  const latestWhen = latest.at ? Core.text.formatRelative(latest.at) : "";
  summaryNode.textContent = `${views.length} ${Core.text.plural(views.length, "рецепт", "рецепта", "рецептов")} · последний ${latestWhen}.`;

  views.slice(0, 3).forEach((recipe) => {
    const item = document.createElement("li");
    item.className = "history-preview-row";
    if (recipe.thumb) {
      const image = document.createElement("img");
      image.src = recipe.thumb;
      image.alt = "";
      image.loading = "lazy";
      item.append(image);
    }
    const body = document.createElement("span");
    body.className = "history-preview-body";
    const title = document.createElement("strong");
    title.textContent = capName(recipe.title || "Рецепт");
    if (window.FridgeTranslate) window.FridgeTranslate.fill(title, recipe.title || "Рецепт");
    const meta = document.createElement("small");
    meta.textContent = recipe.at ? Core.text.formatRelative(recipe.at) : "";
    body.append(title, meta);
    item.append(body);
    previewNode.append(item);
  });
}

function capName(value) {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toLocaleUpperCase("ru") + text.slice(1) : text;
}

function renderFavorites() {
  const favorites = Core.recipes.favorites();
  const node = document.querySelector("#cabinet-favorites");
  node.replaceChildren();
  if (!favorites.length) {
    node.append(emptyState("Избранное пустое", "Нажмите на сердечко в карточке рецепта — он появится здесь."));
    return;
  }
  favorites.slice(0, 8).forEach((favorite) => {
    node.append(historyRow({
      title: favorite.title,
      thumb: favorite.thumb,
      href: `recipe.html?id=${encodeURIComponent(favorite.id)}`,
      detail: [window.FridgeTranslate ? window.FridgeTranslate.term(favorite.category) : favorite.category, window.FridgeTranslate ? window.FridgeTranslate.term(favorite.area) : favorite.area]
        .filter(Boolean)
        .join(" · ") || "Избранное",
      count: "открыть",
    }));
  });
}

function historyRow({ title, thumb, href, detail, count }) {
  const row = document.createElement("a");
  row.className = "history-row";
  row.href = href;

  if (thumb) {
    const image = document.createElement("img");
    image.className = "history-thumb";
    image.src = thumb;
    image.alt = "";
    image.loading = "lazy";
    row.append(image);
  } else {
    const placeholder = document.createElement("span");
    placeholder.className = "history-thumb";
    row.append(placeholder);
  }

  const body = document.createElement("span");
  body.className = "history-body";
  const titleNode = document.createElement("strong");
  if (window.FridgeTranslate) window.FridgeTranslate.fill(titleNode, title);
  else titleNode.textContent = title;
  body.append(titleNode, Object.assign(document.createElement("small"), { textContent: detail }));
  const badge = document.createElement("span");
  badge.className = "history-count";
  badge.textContent = count;
  row.append(body, badge);
  return row;
}

/* ---------- backup ---------- */

function exportBackup() {
  try {
    const payload = Core.backup.export();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fridgeflow-${Core.time.todayISO()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
    UI.toast("Копия скачана. Файл можно загрузить на другом устройстве.", { tone: "ok" });
  } catch (problem) {
    UI.error(problem);
  }
}

async function importBackup(event) {
  const input = event.currentTarget;
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const result = Core.backup.import(payload);
    UI.toast(`Данные восстановлены, ключей: ${result.keys}.`, { tone: "ok", duration: 4200 });
  } catch (problem) {
    if (problem instanceof SyntaxError) UI.error({ message: "Файл не похож на резервную копию JSON." });
    else UI.error(problem);
  } finally {
    input.value = "";
  }
}

function resetBackup() {
  const button = document.querySelector("#backup-reset");
  if (!resetArmed) {
    resetArmed = true;
    button.textContent = "Стереть все данные?";
    setTimeout(() => {
      resetArmed = false;
      button.textContent = "Сбросить всё";
    }, 4000);
    return;
  }
  resetArmed = false;
  button.textContent = "Сбросить всё";
  Core.backup.reset();
  closeDrawer();
  UI.toast("Все данные сброшены. Холодильник снова с демо-продуктами.", { tone: "warn", duration: 4800 });
}

function renderUsage() {
  const bytes = Core.backup.usage();
  const text = bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} КБ` : `${bytes} Б`;
  document.querySelector("#backup-usage").textContent = `Данные занимают примерно ${text} в этом браузере. Лимит — около 5 МБ.`;
}

/* ---------- small helpers ---------- */

function emptyState(title, text) {
  const node = document.createElement("div");
  node.className = "empty-state";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  node.append(strong, paragraph);
  return node;
}

init();
