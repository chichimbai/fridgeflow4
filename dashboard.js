const Core = window.FridgeCore;
const UI = window.FridgeUI;
const UNITS = Core.products.UNITS;

const form = document.querySelector("#product-form");
const formTitle = document.querySelector("#form-title");
const cancelEdit = document.querySelector("#cancel-edit");
const listPanel = document.querySelector("#product-list");
const list = document.querySelector("#product-rows");
const toggleList = document.querySelector("#toggle-list");
const recordsCount = document.querySelector("#records-count");
const filterTabs = document.querySelectorAll(".list-tab");
const addButton = document.querySelector("#add-product");
const recommend = document.querySelector("#recommend");
const recommendToggle = document.querySelector("#recommend-toggle");
const recommendList = document.querySelector("#recommend-list");
const recommendSave = document.querySelector("#recommend-save");
const statusText = document.querySelector("#fridge-status");
const nameNode = document.querySelector("#user-name");
const nameForm = document.querySelector("#name-form");
const renameButton = document.querySelector("#rename");
const searchInput = document.querySelector("#product-search");
const filterSelect = document.querySelector("#product-filter");
const eatFirstSection = document.querySelector("#eat-first");
const eatFirstList = document.querySelector("#eat-first-list");
const bars = document.querySelector("#usage-bars");
const mix = document.querySelector("#usage-mix");
const mixLegend = document.querySelector("#usage-mix-legend");
const usageDonut = document.querySelector("#usage-donut");
const usagePercent = document.querySelector("#usage-percent");
const usageNote = document.querySelector("#usage-note");
const expiredDonut = document.querySelector("#expired-donut");
const expiredPercent = document.querySelector("#expired-percent");
const expiredNote = document.querySelector("#expired-note");
const statsBadge = document.querySelector("#stats-badge");
const exportButton = document.querySelector("#export-data");
const importButton = document.querySelector("#import-data");
const importFile = document.querySelector("#import-file");
const dataError = document.querySelector("#data-error");

let products = Core.products.list();
let editingId = null;

nameNode.textContent = Core.profile.get().name;

toggleList.addEventListener("click", () => {
  const open = listPanel.classList.toggle("is-open");
  toggleList.setAttribute("aria-expanded", String(open));
  toggleList.classList.toggle("is-collapsed", !open);
  toggleList.setAttribute("aria-label", open ? "Свернуть список" : "Развернуть список");
  toggleList.title = open ? "Свернуть список" : "Развернуть список";
});

filterTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    filterTabs.forEach((entry) => entry.classList.toggle("is-active", entry === tab));
    filterSelect.value = tab.dataset.filter;
    render();
  });
});

addButton.addEventListener("click", () => {
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  form.elements.name.focus({ preventScroll: true });
});

recommendToggle.addEventListener("click", () => {
  const open = recommend.classList.toggle("is-open");
  recommendToggle.setAttribute("aria-expanded", String(open));
});

searchInput.addEventListener("input", render);
filterSelect.addEventListener("change", render);

exportButton.addEventListener("click", () => {
  const payload = Core.backup.export();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fridgeflow-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  UI.toast("Файл с данными скачан.", { tone: "ok" });
});

importButton.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async () => {
  const file = importFile.files && importFile.files[0];
  if (!file) return;
  dataError.hidden = true;
  try {
    const payload = JSON.parse(await file.text());
    Core.backup.import(payload);
    UI.toast("Данные холодильника загружены.", { tone: "ok" });
  } catch (problem) {
    dataError.textContent = problem && problem.message ? problem.message : "Не удалось прочитать файл.";
    dataError.hidden = false;
  } finally {
    importFile.value = "";
  }
});

recommendList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-recommend]");
  if (!button) return;
  const suggestion = Core.recommendations.suggestions().find((item) => item.key === button.dataset.recommend);
  if (!suggestion) return;
  form.elements.name.value = suggestion.name;
  form.elements.amount.value = suggestion.amount ? String(suggestion.amount) : "";
  if (suggestion.unit) form.elements.unit.value = suggestion.unit;
  form.elements.price.value = suggestion.price == null ? "" : priceForForm(suggestion);
  form.elements.expiry.focus();
});

recommendSave.addEventListener("click", () => {
  const name = capName(form.elements.name.value.trim());
  if (!name) {
    UI.fieldErrors(form, { name: "Сначала впишите название продукта." });
    return;
  }
  try {
    Core.recommendations.add({
      name,
      amount: Number(form.elements.amount.value) || null,
      unit: form.elements.unit.value,
      price: readPrice(form.elements.price.value),
      priceCurrency: readPrice(form.elements.price.value) == null ? null : FridgePrices.currentCurrency(),
    });
    UI.toast(`«${name}» добавлен в частые покупки.`, { tone: "ok" });
  } catch (problem) {
    UI.handle(problem, form);
  }
});

renameButton.addEventListener("click", () => {
  nameForm.hidden = false;
  renameButton.hidden = true;
  nameForm.elements.userName.value = nameNode.textContent;
  nameForm.elements.userName.focus();
});

document.querySelector("#cancel-name").addEventListener("click", closeNameForm);

nameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const next = Core.profile.update({ name: nameForm.elements.userName.value });
    nameNode.textContent = next.name;
    UI.clearFieldErrors(nameForm);
    closeNameForm();
    UI.reveal([nameForm.parentElement].filter(Boolean));
  } catch (problem) {
    UI.handle(problem, nameForm);
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = readForm();

  try {
    if (editingId) {
      Core.products.update(editingId, data);
      UI.toast(`Продукт «${data.name}» обновлён.`, { tone: "ok" });
    } else {
      Core.products.create(data);
      UI.toast(`«${data.name}» добавлен в холодильник.`, { tone: "ok" });
    }
    editingId = null;
    resetForm();
    render();
  } catch (problem) {
    UI.handle(problem, form);
  }
});

cancelEdit.addEventListener("click", resetForm);

list.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  const row = event.target.closest("[data-id]");
  if (!button || !row) {
    return;
  }

  const id = row.dataset.id;
  const action = button.dataset.action;

  try {
    if (action === "edit") {
      startEdit(id);
    }

    if (action === "delete") {
      const removed = Core.products.remove(id);
      if (editingId === id) {
        editingId = null;
        resetForm();
      }
      render();
      UI.toast(`«${removed.name}» удалён.`, {
        tone: "warn",
        duration: 6000,
        action: {
          label: "Отменить",
          run: () => {
            Core.products.restore(removed);
            UI.toast(`«${removed.name}» возвращён.`, { tone: "ok" });
          },
        },
      });
    }

    if (action === "recommend") {
      const current = Core.products.get(id);
      if (!current) return;
      fillFromProduct(current);
      Core.recommendations.add(current);
      UI.toast(`«${current.name}» теперь в частых покупках.`, { tone: "ok" });
    }

    if (action === "use") {
      const current = Core.products.markUsed(id);
      render();
      UI.toast(`«${current.name}» отмечен как использованный.`, { tone: "ok" });
    }
  } catch (problem) {
    UI.handle(problem);
  }
});

Core.on("products profile", () => {
  nameNode.textContent = Core.profile.get().name;
  render();
  renderRecommendations();
});

render();
renderRecommendations();
UI.reveal(document.querySelectorAll(".panel"));

function fillFromProduct(product) {
  form.elements.name.value = capName(product.name);
  form.elements.amount.value = product.amount ? String(product.amount) : "";
  if (product.unit) form.elements.unit.value = product.unit;
  form.elements.price.value = product.price == null ? "" : priceForForm(product);
  form.elements.name.focus();
}

function capName(value) {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toLocaleUpperCase("ru") + text.slice(1) : text;
}

function timesLabel(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 > 10 && mod100 < 20) return `${count} раз`;
  if (mod10 === 1) return `${count} раз`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} раза`;
  return `${count} раз`;
}

function renderRecommendations() {
  const items = Core.recommendations.suggestions();
  recommendList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "recommend-empty";
    empty.textContent = "Пока пусто. Отметьте один продукт два раза подряд или добавьте его из формы.";
    recommendList.append(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.recommend = item.key;
    const times = item.count ? `, ${timesLabel(item.count)}` : "";
    button.textContent = `${capName(item.name)}${times}`;
    row.append(button);
    recommendList.append(row);
  });
}

function readForm() {
  const data = new FormData(form);
  return {
    name: capName(String(data.get("name")).trim()),
    amount: Number(data.get("amount")),
    unit: String(data.get("unit")),
    expiry: String(data.get("expiry")),
    price: readPrice(data.get("price")),
    priceCurrency: readPrice(data.get("price")) == null ? null : FridgePrices.currentCurrency(),
  };
}

function priceForForm(product) {
  if (product.price == null) return "";
  const code = FridgePrices.currentCurrency();
  const kzt = FridgePrices.toKzt(Number(product.price), product.priceCurrency || "KZT");
  return String(Math.round(FridgePrices.fromKzt(kzt, code) * 100) / 100);
}

function readPrice(value) {
  if (value == null || String(value).trim() === "") return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function startEdit(id) {
  const product = products.find((entry) => entry.id === id);
  if (!product) {
    return;
  }

  editingId = id;
  form.elements.name.value = capName(product.name);
  form.elements.amount.value = String(product.amount);
  form.elements.unit.value = product.unit;
  form.elements.expiry.value = product.expiry;
  form.elements.price.value = priceForForm(product);
  formTitle.textContent = "Изменить продукт";
  form.querySelector("[type='submit']").textContent = "Сохранить";
  cancelEdit.hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function closeNameForm() {
  nameForm.hidden = true;
  renameButton.hidden = false;
  nameForm.reset();
}

function resetForm() {
  editingId = null;
  form.reset();
  formTitle.textContent = "Добавить продукт";
  form.querySelector("[type='submit']").textContent = "Добавить";
  cancelEdit.hidden = true;
}

function render() {
  products = Core.products.list();
  const active = products
    .filter((product) => !product.used)
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
  const used = products.filter((product) => product.used);
  const fresh = active.filter((product) => classify(product) === "fresh");
  const soon = active.filter((product) => classify(product) === "soon");
  const almost = active.filter((product) => classify(product) === "almost");
  const expired = active.filter((product) => classify(product) === "expired");

  document.querySelector("#count-total").textContent = String(products.length);
  document.querySelector("#count-soon").textContent = String(soon.length);
  document.querySelector("#count-used").textContent = String(used.length);
  document.querySelector("#count-almost").textContent = String(almost.length);
  document.querySelector("#count-expired").textContent = String(expired.length);

  statusText.textContent =
    soon.length || almost.length || expired.length
      ? "Есть продукты, на которые стоит взглянуть"
      : "Твой холодильник в порядке";

  renderStats({ used, fresh, soon, almost, expired });
  renderEatFirst(active);
  renderList(active, used);
}

function renderStats({ used, fresh, soon, almost, expired }) {
  const total = products.length;
  const usedShare = share(used.length, total);
  const expiredShare = share(expired.length, total);

  usageDonut.style.setProperty("--share", usedShare);
  usagePercent.textContent = `${usedShare}%`;
  usageNote.textContent = `${used.length} из ${total}`;
  expiredDonut.style.setProperty("--share", expiredShare);
  expiredPercent.textContent = `${expiredShare}%`;
  expiredNote.textContent = `${expired.length} из ${total}`;
  statsBadge.textContent = countLabel(total);

  renderMix([
    { tone: "used", label: "Использовано", value: used.length },
    { tone: "fresh", label: "Свежие", value: fresh.length },
    { tone: "soon", label: "3–5 дней", value: soon.length },
    { tone: "almost", label: "0–2 дня", value: almost.length },
    { tone: "expired", label: "Просрочено", value: expired.length },
  ]);

  renderBars([
    { tone: "total", label: "Всего", value: total },
    { tone: "soon", label: "Скоро", value: soon.length },
    { tone: "used", label: "Использ.", value: used.length },
    { tone: "almost", label: "Вот-вот", value: almost.length },
    { tone: "expired", label: "Просроч.", value: expired.length },
  ]);
}

function share(count, total) {
  return total ? Math.round((count / total) * 100) : 0;
}

function countLabel(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 > 10 && mod100 < 20) return `${count} продуктов`;
  if (mod10 === 1) return `${count} продукт`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} продукта`;
  return `${count} продуктов`;
}

function renderMix(groups) {
  const total = groups.reduce((sum, group) => sum + group.value, 0);
  mix.replaceChildren();
  mixLegend.replaceChildren();
  if (!total) return;

  groups.forEach((group) => {
    const part = document.createElement("span");
    part.className = `mix-part mix-${group.tone}`;
    part.style.width = `${(group.value / total) * 100}%`;
    mix.append(part);

    const entry = document.createElement("span");
    entry.className = `mix-${group.tone}`;
    entry.textContent = `${group.label} · ${group.value}`;
    mixLegend.append(entry);
  });
}

function renderBars(groups) {
  const max = Math.max(1, ...groups.map((group) => group.value));
  bars.replaceChildren();

  groups.forEach((group) => {
    const bar = document.createElement("div");
    bar.className = `bar bar-${group.tone}`;

    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = String(group.value);

    const fill = document.createElement("span");
    fill.className = "bar-fill";
    fill.style.setProperty("--size", `${(group.value / max) * 100}%`);

    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = group.label;

    bar.append(value, fill, label);
    bars.append(bar);
  });
}

function renderEatFirst(active) {
  const urgent = active
    .filter((product) => {
      const state = classify(product);
      return state === "expired" || state === "almost";
    })
    .sort((a, b) => a.expiry.localeCompare(b.expiry));

  eatFirstSection.hidden = urgent.length === 0;
  eatFirstList.replaceChildren();

  urgent.forEach((product) => {
    const row = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = `${capName(product.name)}, ${product.amount} ${UNITS[product.unit] || ""}`.trim();
    const status = document.createElement("span");
    status.className = expiryClass(product);
    status.textContent = expiryLabel(product);
    row.append(name, status);
    eatFirstList.append(row);
  });
}


function renderList(active, used) {
  list.replaceChildren();

  const query = Core.text.normalizeKey(searchInput.value);
  const filter = filterSelect.value;

  let shownActive = active;
  let shownUsed = used;

  if (filter !== "all") {
    shownActive = filter === "used" ? [] : active.filter((product) => classify(product) === filter);
    shownUsed = filter === "used" ? used : [];
  }

  if (query) {
    shownActive = shownActive.filter((product) => Core.text.normalizeKey(product.name).includes(query));
    shownUsed = shownUsed.filter((product) => Core.text.normalizeKey(product.name).includes(query));
  }

  recordsCount.textContent = String(shownActive.length + shownUsed.length);

  if (!shownActive.length && !shownUsed.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = products.length
      ? "Ничего не найдено. Попробуйте изменить поиск или фильтр."
      : "В холодильнике пока нет продуктов.";
    list.append(empty);
    return;
  }

  let index = 0;
  shownActive.forEach((product) => {
    index += 1;
    list.append(renderProduct(product, index));
  });

  if (!shownUsed.length) {
    return;
  }

  const title = document.createElement("h3");
  title.className = "used-title";
  title.textContent = "Уже использовано";
  list.append(title);
  shownUsed.forEach((product) => {
    index += 1;
    list.append(renderProduct(product, index));
  });
}

function renderProduct(product, index) {
  const row = document.createElement("article");
  const state = product.used ? "used" : classify(product);
  row.className = `product product-${state}`;
  row.dataset.id = product.id;

  const main = document.createElement("div");
  main.className = "product-main";

  const num = document.createElement("span");
  num.className = "row-num";
  num.textContent = String(index).padStart(2, "0");

  const avatar = document.createElement("span");
  avatar.className = "product-avatar";
  avatar.textContent = product.name.trim().charAt(0).toLocaleUpperCase("ru");

  const heading = document.createElement("h3");
  heading.textContent = capName(product.name);
  main.append(num, avatar, heading);

  const amount = document.createElement("p");
  amount.className = "product-amount";
  amount.textContent = `${product.amount} ${UNITS[product.unit] || ""}`.trim();

  const price = document.createElement("p");
  price.className = "product-price";
  price.textContent = product.price == null
    ? "—"
    : FridgePrices.formatMoney(product.price, product.priceCurrency || "KZT");

  const date = document.createElement("p");
  date.className = "product-date";
  date.textContent = formatDate(product.used && product.usedOn ? product.usedOn : product.expiry);

  const status = document.createElement("span");
  status.className = `status-pill-row pill-${state}`;
  status.textContent = pillLabel(product);

  const actions = document.createElement("div");
  actions.className = "row-actions";
  if (!product.used && (state === "almost" || state === "expired")) {
    const star = document.createElement("span");
    star.className = "row-star";
    star.textContent = "★";
    star.title = "Сначала съесть";
    actions.append(star);
  }
  if (!product.used) {
    actions.append(iconButton("Использовано", "use", "✓", "row-btn-use"));
  }
  actions.append(iconButton("Изменить", "edit", "✎", ""));
  actions.append(iconButton("В список", "recommend", "✚", ""));
  actions.append(iconButton("Удалить", "delete", "✕", "row-btn-danger"));

  row.append(main, amount, price, date, status, actions);
  return row;
}

function iconButton(label, action, glyph, extraClass) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `row-btn ${extraClass}`.trim();
  element.dataset.action = action;
  element.textContent = glyph;
  element.title = label;
  element.setAttribute("aria-label", label);
  return element;
}

function formatDate(iso) {
  const months = [
    "янв", "фев", "мар", "апр", "мая", "июн",
    "июл", "авг", "сен", "окт", "ноя", "дек",
  ];
  const [year, month, day] = String(iso).split("-").map(Number);
  if (!year || !month || !day) return String(iso);
  return `${day} ${months[month - 1]} ${year}`;
}

function classify(product) {
  return Core.products.classify(product);
}

function pillLabel(product) {
  if (product.used) return "Использовано";
  if (classify(product) === "expired") return "Просрочено";
  return expiryLabel(product);
}

function expiryClass(product) {
  if (product.used) {
    return "";
  }
  const state = classify(product);
  if (state === "soon" || state === "almost") return "status-warn";
  if (state === "expired") return "status-expired";
  return "";
}

function expiryLabel(product) {
  if (product.used) {
    return "Использовано";
  }

  const days = Core.time.daysUntil(product.expiry);
  if (days < 0) {
    return `Просрочено на ${Math.abs(days)} дн.`;
  }
  if (days === 0) {
    return "Срок сегодня";
  }
  if (days === 1) {
    return "Остался 1 день";
  }
  return `Осталось ${days} дн.`;
}
