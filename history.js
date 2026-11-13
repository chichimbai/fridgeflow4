const Core = window.FridgeCore;
const UI = window.FridgeUI;
const DB = window.FridgeMealDB;
const Match = window.FridgeMatch;
const Translate = window.FridgeTranslate;

const cards = document.querySelector("#history-cards");
const searchInput = document.querySelector("#history-search");
const lookupForm = document.querySelector("#recipe-lookup");
const lookupResult = document.querySelector("#recipe-lookup-result");

let query = "";

init();

function init() {
  searchInput.addEventListener("input", () => {
    query = searchInput.value.trim();
    renderHistory();
  });

  lookupForm.addEventListener("submit", lookup);

  Core.on("recipes", renderHistory);
  renderHistory();
  UI.reveal(document.querySelectorAll(".page-hero, .page-shell > .panel"));
}

/* ---------- history ---------- */

function renderHistory() {
  const viewed = Core.recipes.views();
  const favorites = viewed.filter((recipe) => Core.recipes.isFavorite(recipe.id)).length;
  document.querySelector("#history-total").textContent = String(viewed.length);
  document.querySelector("#history-unique").textContent = String(favorites);
  document.querySelector("#history-last").textContent = viewed.length && viewed[0].at
    ? Core.text.formatRelative(viewed[0].at)
    : "—";

  const filtered = viewed.filter((recipe) => matchesQuery(recipe.title || "", query));

  document.querySelector("#history-all-count").textContent = String(filtered.length);
  cards.replaceChildren();

  if (!viewed.length) {
    cards.append(emptyState(
      "История пока пустая",
      "Откройте любой рецепт на вкладке «Рецепты» — он сразу появится здесь.",
      { href: "recipes.html", label: "Перейти к рецептам" },
    ));
    return;
  }

  if (!filtered.length) {
    cards.append(emptyState(
      "Такого блюда в истории нет",
      "Попробуйте другое слово или поищите рецепт в TheMealDB ниже.",
    ));
    return;
  }

  filtered.forEach((recipe, index) => {
    cards.append(recipeCard({
      id: recipe.id,
      title: recipe.title || "Рецепт",
      thumb: recipe.thumb,
      at: recipe.at,
      index,
    }));
  });

  UI.stagger(cards, ".history-recipe");
}

function matchesQuery(title, value) {
  const text = value.toLocaleLowerCase("ru").trim();
  if (!text) return true;
  const name = title.toLowerCase();
  if (name.includes(text)) return true;
  const english = Match.toEnglishQuery(text);
  return Boolean(english && name.includes(english.toLowerCase()));
}

function recipeCard({ id, title, thumb, at, index = 0, badge = "" }) {
  const row = document.createElement("a");
  row.className = "history-recipe";
  row.href = `recipe.html?id=${encodeURIComponent(id)}`;
  row.style.setProperty("--i", String(Math.min(index, 12)));

  const shot = document.createElement("span");
  shot.className = "history-recipe-shot";
  if (thumb) {
    const image = document.createElement("img");
    image.src = thumb;
    image.alt = "";
    image.loading = "lazy";
    shot.append(image);
  }
  if (badge) {
    const times = document.createElement("span");
    times.className = "history-recipe-times";
    times.textContent = badge;
    shot.append(times);
  }

  const body = document.createElement("span");
  body.className = "history-recipe-body";
  const name = document.createElement("strong");
  name.className = "history-recipe-title";
  name.textContent = capName(title);
  const meta = document.createElement("small");
  meta.className = "history-recipe-meta";
  meta.textContent = at ? `Последний раз: ${Core.text.formatRelative(at)}` : "";

  const go = document.createElement("span");
  go.className = "history-recipe-go";
  go.textContent = "Открыть →";

  body.append(name, meta, go);
  row.append(shot, body);
  if (Translate) Translate.fill(name, title);
  return row;
}

function capName(value) {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toLocaleUpperCase("ru") + text.slice(1) : text;
}

/* ---------- lookup ---------- */

async function lookup(event) {
  event.preventDefault();
  const input = lookupForm.elements.query;
  const value = input.value.trim();
  lookupResult.replaceChildren();
  if (!value) return;

  const english = Match.toEnglishQuery(value);
  if (!english) {
    lookupResult.append(emptyState(
      "Поиск в базе идёт по-английски",
      "Напишите название латиницей, например omelette, или выберите блюдо на вкладке «Рецепты».",
    ));
    return;
  }

  const loading = document.createElement("p");
  loading.className = "loading-line";
  loading.append(spinner(), document.createTextNode(`Ищем «${english}» в TheMealDB…`));
  lookupResult.append(loading);

  try {
    const meals = await DB.search(english);
    lookupResult.replaceChildren();
    if (!meals.length) {
      lookupResult.append(emptyState("Ничего не нашлось", "Открытая база не знает такого названия."));
      return;
    }
    meals.slice(0, 9).forEach((meal, index) => {
      lookupResult.append(recipeCard({
        id: meal.idMeal,
        title: meal.strMeal,
        thumb: meal.strMealThumb,
        at: "",
        index,
        badge: "найти",
      }));
      const last = lookupResult.lastElementChild;
      const meta = last.querySelector(".history-recipe-meta");
      meta.textContent = [Translate ? Translate.term(meal.strCategory) : meal.strCategory, Translate ? Translate.term(meal.strArea) : meal.strArea]
        .filter(Boolean)
        .join(" · ");
    });
  } catch (problem) {
    lookupResult.replaceChildren();
    lookupResult.append(emptyState(
      "Источник недоступен",
      problem && problem.message ? problem.message : "Проверьте интернет и попробуйте снова.",
    ));
  }
}

/* ---------- helpers ---------- */

function emptyState(title, text, action) {
  const node = document.createElement("div");
  node.className = "empty-state";
  node.style.gridColumn = "1 / -1";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  node.append(strong, paragraph);
  if (action) {
    const link = document.createElement("a");
    link.className = "action";
    link.href = action.href;
    link.textContent = action.label;
    node.append(link);
  }
  return node;
}

function spinner() {
  const node = document.createElement("span");
  node.className = "spinner";
  node.setAttribute("aria-hidden", "true");
  return node;
}
