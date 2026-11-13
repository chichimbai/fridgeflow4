const Core = window.FridgeCore;
const UI = window.FridgeUI;
const DB = window.FridgeMealDB;
const Match = window.FridgeMatch;
const Translate = window.FridgeTranslate;
const SVG = "http://www.w3.org/2000/svg";

const root = document.querySelector("#recipe-detail");
const heading = document.querySelector("#recipe-heading");
const subheading = document.querySelector("#recipe-sub");
const id = new URLSearchParams(location.search).get("id");

let progressNodes = null;

if (!id) {
  missing("Ссылка без рецепта", "Вернитесь к списку и выберите блюдо ещё раз.");
} else {
  load(id);
}

async function load(recipeId) {
  try {
    const meal = await DB.byId(recipeId);
    if (!meal) {
      missing("Такого рецепта нет", "Вернитесь к списку и выберите блюдо снова.");
      return;
    }
    render(meal);
  } catch (problem) {
    const hit = DB.cached(recipeId);
    if (hit && !hit.partial) {
      render(hit);
      UI.toast("Показан сохранённый рецепт — интернет сейчас недоступен.", { tone: "info", duration: 4200 });
      return;
    }
    missing("Не удалось загрузить рецепт", problem && problem.message ? problem.message : "Проверьте интернет и обновите страницу.");
  }
}

function missing(title, text) {
  root.removeAttribute("aria-busy");
  root.replaceChildren();
  heading.textContent = "Рецепт не открылся";
  subheading.textContent = title;
  const empty = document.createElement("div");
  empty.className = "empty-state";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  const link = document.createElement("a");
  link.className = "action";
  link.href = "recipes.html";
  link.textContent = "К списку рецептов";
  empty.append(strong, paragraph, link);
  root.append(empty);
}

function render(meal) {
  root.removeAttribute("aria-busy");
  Core.recipes.visit(meal);
  heading.textContent = meal.strMeal;
  Translate.fill(heading, meal.strMeal);
  subheading.textContent = [Translate.term(meal.strCategory), Translate.term(meal.strArea)].filter(Boolean).join(" · ") || "Рецепт из открытой базы";
  Translate.translate(meal.strMeal).then((title) => {
    document.title = `${title} — FridgeFlow`;
  });
  root.replaceChildren();

  const stage = document.createElement("div");
  stage.className = "recipe-stage";
  stage.append(shot(meal), info(meal));

  const sections = document.createElement("div");
  sections.className = "recipe-sections";
  const parts = ingredients(meal);
  const steps = stepsFrom(meal.strInstructions || "");
  if (parts.length) sections.append(ingredientPanel(meal, parts));
  if (steps.length) sections.append(stepsPanel(meal, steps));

  root.append(stage);
  if (sections.children.length) root.append(sections);
  UI.reveal(root.querySelectorAll(".recipe-stage, .recipe-sections > .panel"));
}

function shot(meal) {
  const figure = document.createElement("figure");
  figure.className = "recipe-shot";
  const open = document.createElement("button");
  open.type = "button";
  open.className = "recipe-shot-open";
  open.setAttribute("aria-label", "Увеличить фотографию рецепта");

  if (meal.strMealThumb) {
    const image = document.createElement("img");
    image.src = meal.strMealThumb;
    image.alt = meal.strMeal;
    open.append(image);
  }
  const hint = document.createElement("span");
  hint.className = "recipe-shot-hint";
  hint.append(zoomIcon(), document.createTextNode("Увеличить"));
  open.append(hint);
  open.addEventListener("click", () => zoom(meal));
  figure.append(open);

  const badge = document.createElement("span");
  badge.className = "recipe-shot-badge";
  badge.textContent = [Translate.term(meal.strCategory), Translate.term(meal.strArea)].filter(Boolean).join(" · ") || "Рецепт";
  figure.append(badge);
  return figure;
}

function zoom(meal) {
  if (!meal.strMealThumb) return;
  const overlay = document.createElement("div");
  overlay.className = "recipe-zoom";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Фотография рецепта крупно");

  const frame = document.createElement("div");
  frame.className = "recipe-zoom-frame";
  const image = document.createElement("img");
  image.src = meal.strMealThumb;
  image.alt = heading.textContent;
  const caption = document.createElement("p");
  caption.textContent = heading.textContent;
  frame.append(image, caption);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "recipe-zoom-close";
  close.setAttribute("aria-label", "Закрыть фотографию");
  close.textContent = "×";
  overlay.append(frame, close);

  const onKey = (event) => {
    if (event.key === "Escape") dismiss();
  };
  const dismiss = () => {
    overlay.classList.remove("is-open");
    document.removeEventListener("keydown", onKey);
    document.body.classList.remove("has-zoom");
    setTimeout(() => overlay.remove(), UI.motion() ? 220 : 0);
  };

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) dismiss();
  });
  close.addEventListener("click", dismiss);
  document.addEventListener("keydown", onKey);
  document.body.append(overlay);
  document.body.classList.add("has-zoom");
  requestAnimationFrame(() => overlay.classList.add("is-open"));
  close.focus({ preventScroll: true });
}

function info(meal) {
  const node = document.createElement("div");
  node.className = "recipe-info";

  const title = document.createElement("h2");
  title.textContent = meal.strMeal;
  Translate.fill(title, meal.strMeal);
  const meta = document.createElement("p");
  meta.className = "recipe-meta";
  const metaParts = [Translate.term(meal.strCategory), Translate.term(meal.strArea)];
  const tags = meal.strTags ? meal.strTags.split(",").slice(0, 2).map((tag) => Translate.term(tag)).join(", ") : "";
  meta.textContent = [...metaParts, tags].filter(Boolean).join(" · ");

  const source = document.createElement("p");
  source.className = "recipe-source";
  const link = document.createElement("a");
  link.href = `${DB.SOURCE_URL}meal/${encodeURIComponent(meal.idMeal)}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = DB.SOURCE_NAME;
  source.append("Источник: ", link, ". Перевод автоматический, оригинал — по ссылке.");

  const fit = Match.assess(meal, Match.loadFridge());
  const fits = document.createElement("div");
  fits.className = "fit-grid";
  fits.append(fitCard(true, fit.have.map((item) => item.product.name), fit.have.length ? "" : "В холодильнике сейчас нет продуктов этого рецепта."));
  fits.append(fitCard(false, fit.missing, fit.missing.length ? "" : "Докупать ничего не нужно."));

  const actions = document.createElement("div");
  actions.className = "recipe-actions";

  const fav = document.createElement("button");
  fav.type = "button";
  fav.className = "action action-quiet fav-toggle";
  syncFavorite(fav);
  fav.addEventListener("click", () => {
    try {
      const next = Core.recipes.toggleFavorite(meal);
      syncFavorite(fav);
      if (next) {
        UI.burst(fav, { count: 12 });
        UI.toast("Рецепт в избранном.", { tone: "ok", duration: 2400 });
      } else {
        UI.toast("Рецепт убран из избранного.", { tone: "info", duration: 2200 });
      }
    } catch (problem) {
      UI.handle(problem);
    }
  });

  const cooked = document.createElement("button");
  cooked.type = "button";
  cooked.className = "action";
  cooked.append(potIcon(), document.createTextNode("Приготовили"));
  cooked.addEventListener("click", () => {
    try {
      const outcome = Core.recipes.markCooked(meal);
      if (outcome.duplicate) {
        UI.toast("Этот рецепт уже отмечен меньше 10 минут назад.", { tone: "warn" });
        return;
      }
      UI.burst(cooked, { count: 18 });
      UI.toast(`Записано в историю. Приготовлено раз: ${outcome.count}.`, {
        tone: "ok",
        action: { label: "В кабинет", run: () => { location.href = "cabinet.html"; } },
      });
    } catch (problem) {
      UI.handle(problem);
    }
  });

  actions.append(cooked, fav);
  node.append(title, meta, source, fits, actions, progressBlock(meal));
  return node;
}

function fitCard(have, names, emptyText) {
  const card = document.createElement("div");
  card.className = `fit-card${have ? "" : " is-missing"}`;
  const head = document.createElement("p");
  head.className = "fit-head";
  head.append(have ? checkIcon() : cartIcon(), document.createTextNode(have ? "Есть дома" : "Нужно докупить"));
  const total = document.createElement("p");
  total.className = "fit-total";
  const count = `${names.length} ${Core.text.plural(names.length, "продукт", "продукта", "продуктов")}`;
  total.textContent = have ? `В холодильнике: ${count}` : `Купить: ${count}`;
  const list = document.createElement("ul");
  list.className = "fit-list";
  if (names.length) {
    names.forEach((name) => {
      const item = document.createElement("li");
      Translate.fill(item, name, "", { capitalize: true });
      list.append(item);
    });
  } else {
    const item = document.createElement("li");
    item.textContent = emptyText;
    list.append(item);
  }
  card.append(head, total, list);
  return card;
}

function progressBlock(meal) {
  const block = document.createElement("div");
  block.className = "progress-block";

  const line = document.createElement("div");
  line.className = "progress-line";
  const label = document.createElement("span");
  label.id = "cook-label";
  const count = document.createElement("strong");
  count.id = "cook-count";
  line.append(label, count);

  const bar = document.createElement("div");
  bar.className = "progress-bar";
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-valuemin", "0");
  const fill = document.createElement("span");
  fill.className = "progress-fill";
  fill.id = "cook-fill";
  bar.append(fill);

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "link-btn";
  reset.textContent = "Сбросить прогресс";
  reset.addEventListener("click", () => {
    Core.recipes.resetProgress(meal.idMeal);
    syncProgress(meal);
    UI.toast("Отметки сняты.", { tone: "info", duration: 2000 });
  });

  block.append(line, bar, reset);
  progressNodes = { label, count, bar, fill, reset };
  queueMicrotask(() => syncProgress(meal));
  return block;
}

function syncProgress(meal) {
  if (!progressNodes) return;
  const state = Core.recipes.progress(meal.idMeal);
  const done = state.steps.length + state.ingredients.length;
  const total = root.querySelectorAll(".step-item").length + root.querySelectorAll(".check-item").length;
  const percent = total ? Math.round((done / total) * 100) : 0;

  progressNodes.label.textContent = `Выполнено ${done} из ${total}`;
  progressNodes.count.textContent = `${percent}%`;
  progressNodes.fill.style.width = `${percent}%`;
  progressNodes.bar.setAttribute("aria-valuenow", String(done));
  progressNodes.bar.setAttribute("aria-valuemax", String(total || 0));
  progressNodes.reset.disabled = !state.steps.length && !state.ingredients.length;
}

function paintDone(meal) {
  const state = Core.recipes.progress(meal.idMeal);
  root.querySelectorAll(".check-item").forEach((node) => {
    const done = state.ingredients.includes(Number(node.dataset.index));
    node.classList.toggle("is-done", done);
    node.setAttribute("aria-pressed", String(done));
  });
  root.querySelectorAll(".step-item").forEach((node) => {
    const done = state.steps.includes(Number(node.dataset.index));
    node.classList.toggle("is-done", done);
    node.setAttribute("aria-pressed", String(done));
  });
  syncProgress(meal);
}

function ingredientPanel(meal, parts) {
  const panel = document.createElement("section");
  panel.className = "panel";
  const head = document.createElement("div");
  head.className = "panel-head";
  const title = document.createElement("h2");
  title.textContent = "Ингредиенты";
  const badge = document.createElement("span");
  badge.className = "badge-soft";
  badge.textContent = `${parts.length} ${Core.text.plural(parts.length, "позиция", "позиции", "позиций")}`;
  head.append(title, badge);

  const list = document.createElement("ul");
  list.className = "check-list";
  parts.forEach(({ name, measure }, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "check-item";
    button.dataset.index = String(index);
    button.setAttribute("aria-pressed", "false");
    const ingredientName = Object.assign(document.createElement("span"), { className: "check-text" });
    Translate.fill(ingredientName, name, "", { capitalize: true });
    const amount = Object.assign(document.createElement("span"), { className: "check-measure" });
    Translate.fill(amount, measure);
    button.append(box(), ingredientName, amount);
    button.addEventListener("click", () => {
      Core.recipes.toggleProgress(meal.idMeal, "ingredients", index);
      paintDone(meal);
    });
    item.append(button);
    list.append(item);
  });

  panel.append(head, list);
  queueMicrotask(() => paintDone(meal));
  return panel;
}

function stepsPanel(meal, steps) {
  const panel = document.createElement("section");
  panel.className = "panel";
  const head = document.createElement("div");
  head.className = "panel-head";
  const title = document.createElement("h2");
  title.textContent = "Как приготовить";
  const badge = document.createElement("span");
  badge.className = "badge-soft";
  badge.textContent = `${steps.length} ${Core.text.plural(steps.length, "шаг", "шага", "шагов")}`;
  head.append(title, badge);

  const list = document.createElement("ol");
  list.className = "steps-list";
  steps.forEach((text, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "step-item";
    button.dataset.index = String(index);
    button.setAttribute("aria-pressed", "false");
    const stepText = Object.assign(document.createElement("span"), { className: "step-text" });
    Translate.fill(stepText, text, "", { capitalize: true });
    button.append(
      Object.assign(document.createElement("span"), { className: "step-num", textContent: String(index + 1) }),
      stepText,
    );
    button.addEventListener("click", () => {
      Core.recipes.toggleProgress(meal.idMeal, "steps", index);
      paintDone(meal);
    });
    item.append(button);
    list.append(item);
  });

  panel.append(head, list);
  queueMicrotask(() => paintDone(meal));
  return panel;
}

function syncFavorite(button) {
  const isFav = Core.recipes.isFavorite(id);
  button.classList.toggle("is-fav", isFav);
  button.setAttribute("aria-pressed", String(isFav));
  button.replaceChildren(heartIcon(), document.createTextNode(isFav ? "В избранном" : "В избранное"));
}

function ingredients(meal) {
  const parts = [];
  for (let index = 1; index <= 20; index += 1) {
    const name = (meal[`strIngredient${index}`] || "").trim();
    if (!name) continue;
    const measure = (meal[`strMeasure${index}`] || "").trim();
    parts.push({ name, measure });
  }
  return parts;
}

function stepsFrom(text) {
  const blocks = text
    .split(/\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (blocks.length > 1) return blocks;
  const flat = (blocks[0] || "").replace(/\s+/g, " ").trim();
  if (!flat) return [];
  if (flat.length <= 360) return [flat];
  return flat
    .split(/(?<=[.!?])\s+(?=[A-ZА-Я0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/* ---------- icons ---------- */

function icon(paths, { fill = "none", strokeWidth = 2 } = {}) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  paths.forEach((d) => {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", fill);
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", String(strokeWidth));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
  });
  return svg;
}

function heartIcon() {
  return icon(["M12 20s-7-4.4-7-9.3C5 7.6 7 6 9.2 6c1.2 0 2.2.6 2.8 1.5C12.6 6.6 13.6 6 14.8 6 17 6 19 7.6 19 10.7 19 15.6 12 20 12 20Z"]);
}

function zoomIcon() {
  return icon(["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z", "M20 20l-3.6-3.6", "M8 11h6M11 8v6"]);
}

function potIcon() {
  return icon(["M5 10.2h14v1.1c0 3.6-3.1 6.5-7 6.5s-7-2.9-7-6.5v-1.1Z", "M6.8 6.8h10.4c-.3-1.7-1.8-2.8-5.2-2.8s-4.9 1.1-5.2 2.8Z"]);
}

function checkIcon() {
  return icon(["m5 12.5 4.2 4.2L19 7"]);
}

function cartIcon() {
  return icon(["M5 6h2l2.2 8.5h8.6L20 8H8", "M10 19a1 1 0 1 0 0 .01M17 19a1 1 0 1 0 0 .01"]);
}

function box() {
  const node = document.createElement("span");
  node.className = "check-box";
  node.textContent = "✓";
  node.setAttribute("aria-hidden", "true");
  return node;
}
