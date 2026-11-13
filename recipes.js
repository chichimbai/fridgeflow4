const Core = window.FridgeCore;
const UI = window.FridgeUI;
const DB = window.FridgeMealDB;
const Match = window.FridgeMatch;
const Translate = window.FridgeTranslate;

const form = document.querySelector("#recipe-form");
const result = document.querySelector("#recipe-result");
const fridgePick = document.querySelector("#fridge-pick");
const favoritesGrid = document.querySelector("#recipe-favorites");
const quickRow = document.querySelector("#quick-row");
const quickChips = document.querySelector("#quick-chips");
const wishCount = document.querySelector("#wish-count");

const DISHES = {
  salad: { words: ["salad"] },
  soup: { words: ["soup", "broth", "chowder"] },
  hot: { categories: ["beef", "chicken", "pasta", "pork", "seafood", "lamb", "goat"] },
  breakfast: { categories: ["breakfast"] },
  snack: { categories: ["starter"] },
  side: { categories: ["side"] },
  dessert: { categories: ["dessert"] },
  drink: { words: ["smoothie", "juice", "drink", "tea", "coffee", "shake"] },
};

const TASTE_LABEL = { spicy: "острое", salty: "солёное", sweet: "сладкое", sour: "кислое", light: "лёгкое", hearty: "сытное" };
const FOOD_LABEL = {
  chicken: "курица", beef: "говядина", pork: "свинина", fish: "рыба", rice: "рис",
  potato: "картофель", tomato: "помидоры", cheese: "сыр", egg: "яйца", mushroom: "грибы",
  chocolate: "шоколад", vegetable: "овощи", fruit: "фрукты", soup: "суп", salad: "салат",
  pancake: "блины", porridge: "каша", pasta: "паста",
};
const DISH_LABEL = { salad: "салат", soup: "суп", hot: "горячее", breakfast: "завтрак", snack: "закуска", side: "гарнир", dessert: "десерт", drink: "напиток" };
const SVG = "http://www.w3.org/2000/svg";

const WISH_WORDS = [
  [/остр|перечн|карри/, "spicy"],
  [/сол[её]н/, "salty"],
  [/слад|десерт|торт|пирожн|конфет/, "sweet"],
  [/кисл/, "sour"],
  [/л[её]гк|диет|полезн|низкокалор|фитнес/, "light"],
  [/сытн|плотн|нажорист|калорийн/, "hearty"],
  [/постн|веган/, "vegan"],
  [/вегетариан/, "vegetarian"],
  [/куриц|курин/, "chicken"],
  [/говядин|мясн|бифштекс/, "beef"],
  [/свинин|бекон|ветчин|колбас/, "pork"],
  [/рыбн|лосос|форел|тунец|треск|кревет/, "fish"],
  [/рис/, "rice"],
  [/картоф|пюре/, "potato"],
  [/паста|макарон|спагетти|пенне/, "pasta"],
  [/помидор|томат/, "tomato"],
  [/сырн|сыр(?!ник)/, "cheese"],
  [/яичн|яйц|омлет/, "egg"],
  [/грибн|гриб(?!ник)/, "mushroom"],
  [/шоколад/, "chocolate"],
  [/овощн/, "vegetable"],
  [/фрукт|ягод/, "fruit"],
  [/суп|борщ|рамен/, "soup"],
  [/салат/, "salad"],
  [/завтрак/, "breakfast"],
  [/закус/, "snack"],
  [/гарнир/, "side"],
  [/десерт|торт|пирожн|морожен/, "dessert"],
  [/напит|смузи|коктейл/, "drink"],
  [/горяч|второе/, "hot"],
  [/блин|оладь|панкейк/, "pancake"],
  [/каша|овсян|гречк/, "porridge"],
];

const FOOD_TERMS = new Set([
  "chicken", "beef", "pork", "fish", "rice", "potato", "tomato", "cheese", "egg",
  "mushroom", "chocolate", "vegetable", "fruit", "soup", "salad", "pancake", "porridge", "pasta",
]);

let searching = false;

init();

function init() {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });

  form.elements.wish.addEventListener("input", () => {
    wishCount.textContent = `${form.elements.wish.value.length} / 200`;
  });

  form.addEventListener("change", (event) => {
    if (event.target.matches('input[type="checkbox"]')) {
      UI.replay(event.target.nextElementSibling, "chip-pop");
    }
  });

  document.querySelector("#clear-searches").addEventListener("click", () => {
    Core.recipes.clearSearches();
    UI.toast("История запросов очищена.", { tone: "info", duration: 2400 });
  });

  Core.on("recipes", () => {
    renderFavorites();
    renderQuick();
    renderHero();
  });
  Core.on("products profile", () => {
    renderFridge();
    renderHero();
  });

  renderHero();
  renderFridge();
  renderFavorites();
  renderQuick();
  UI.reveal(document.querySelectorAll(".page-hero, .cook-layout > .panel, .favorites-panel"));
}

function submit() {
  if (searching) return;
  const wish = form.elements.wish.value.trim();
  const tastes = [...form.querySelectorAll('input[name="taste"]:checked')].map((input) => input.value);
  const dishes = [...form.querySelectorAll('input[name="dish"]:checked')].map((input) => input.value);
  Core.recipes.saveSearch({ wish, tastes, dishes });
  showList(dishes, tastes, wish);
}

/* ---------- hero / fridge / quick searches ---------- */

function renderHero() {
  const products = Core.products.list();
  const active = products.filter((product) => !product.used);
  const urgent = active.filter((product) => Core.products.daysLeft(product) <= 2).length;
  const recipeStats = Core.recipes.stats();

  document.querySelector("#hero-active").textContent = String(active.length);
  document.querySelector("#hero-urgent").textContent = String(urgent);
  document.querySelector("#hero-cooked").textContent = String(recipeStats.cooked);
  document.querySelector("#hero-favorites").textContent = String(recipeStats.favorites);
}

function renderFridge() {
  const products = Match.loadFridge();
  document.querySelector("#fridge-count").textContent = String(products.length);
  fridgePick.replaceChildren();

  if (!products.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    const title = document.createElement("strong");
    title.textContent = "Холодильник пуст";
    const text = document.createElement("p");
    text.textContent = "Добавьте продукты — и подбор пойдёт от них.";
    const link = document.createElement("a");
    link.className = "action";
    link.href = "dashboard.html";
    link.textContent = "Добавить продукты";
    empty.append(title, text, link);
    fridgePick.append(empty);
    return;
  }

  products.forEach((product, index) => {
    const days = product.days;
    const tone = days < 0 ? "bad" : days <= 2 ? "almost" : days <= 5 ? "soon" : "good";
    const row = document.createElement("li");
    row.className = "pick-row";

    const name = document.createElement("span");
    name.className = "pick-name";
    const strong = document.createElement("strong");
    strong.textContent = capName(product.name);
    const small = document.createElement("small");
    small.textContent = product.en ? `в поиске: ${product.en}` : "в поиске не участвует";
    name.append(strong, small);

    const time = document.createElement("span");
    time.className = `pick-time is-${tone}`;
    time.textContent = product.en ? Match.expiryText(days) : "—";

    const bar = document.createElement("span");
    bar.className = `pick-bar tone-${tone}`;
    const fill = document.createElement("span");
    fill.style.width = days < 0 ? "100%" : days <= 2 ? "82%" : days <= 5 ? "54%" : "30%";
    bar.style.setProperty("--i", String(index));
    bar.append(fill);
    row.append(name, time, bar);
    fridgePick.append(row);
  });
}

function renderQuick() {
  const searches = Core.recipes.searches();
  quickRow.hidden = !searches.length;
  quickChips.replaceChildren();
  searches.forEach((entry) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip-btn";
    chip.append(clockIcon(), document.createTextNode(searchLabel(entry)));
    chip.title = "Повторить поиск";
    chip.addEventListener("click", () => applySearch(entry));
    quickChips.append(chip);
  });
}

function searchLabel(entry) {
  const bits = [];
  if (entry.wish) bits.push(`«${entry.wish}»`);
  bits.push(...entry.tastes.map((key) => TASTE_LABEL[key]).filter(Boolean));
  bits.push(...entry.dishes.map((key) => DISH_LABEL[key]).filter(Boolean));
  return bits.join(", ") || "Без уточнений";
}

function applySearch(entry) {
  form.elements.wish.value = entry.wish || "";
  form.elements.wish.dispatchEvent(new Event("input"));
  form.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = (input.name === "taste" ? entry.tastes : entry.dishes).includes(input.value);
  });
  form.requestSubmit();
}

/* ---------- search ---------- */

async function showList(dishes, tastes, wish) {
  result.hidden = false;
  const products = Match.loadFridge();
  const known = products.filter((product) => product.en);

  searching = true;
  const submitButton = form.querySelector("[type='submit']");
  submitButton.disabled = true;
  result.setAttribute("aria-busy", "true");
  showSkeleton(known);
  if (UI.motion()) result.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const wishKeys = wishWords(wish);
    const tastesAll = [...new Set([...tastes, ...wishKeys.filter((word) => TASTE_LABEL[word])])];
    const dishesAll = [...new Set([...dishes, ...wishKeys.filter((word) => DISH_LABEL[word])])];
    const keywords = [...new Set([...tastesAll, ...wishKeys])];
    const primary = [
      ...dishesAll.map((key) => DISH_QUERY[key]).filter(Boolean),
      ...tastesAll.map((taste) => (TASTE_QUERY[taste] || [])[0]).filter(Boolean),
    ];
    const extras = tastesAll.flatMap((taste) => (TASTE_QUERY[taste] || []).slice(1));
    const wanted = [...new Set([
      ...primary,
      ...extras,
      ...keywords.filter((word) => FOOD_TERMS.has(word)),
    ])].slice(0, 6);
    const found = await collectMeals(known, keywords, wanted, (index, total, term) => progressLine(term, index, total));
    const candidates = found.slice();
    if (tastesAll.length || dishesAll.length) {
      candidates.sort(
        (a, b) => Number(requestMatch(b, tastesAll, dishesAll, true)) - Number(requestMatch(a, tastesAll, dishesAll, true)),
      );
    }
    const ranked = [];
    const limit = Math.min(candidates.length, 24);
    for (let index = 0; index < limit; index += 6) {
      progressLine("подбираем совпадения", index, limit);
      const batch = candidates.slice(index, index + 6);
      const details = await Promise.all(
        batch.map((entry) => (entry.partial ? DB.byId(entry.idMeal).catch(() => null) : entry)),
      );
      details.forEach((meal) => {
        if (!meal || meal.partial || !meal.strIngredient1) return;
        const fit = Match.assess(meal, products);
        ranked.push({
          meal,
          fit,
          fridge: Match.fridgeScore(fit.have),
          pref: preferenceScore(meal, keywords, dishesAll),
        });
      });
    }

    if (!ranked.length) {
      showNote(
        "Источник не ответил",
        "Не удалось получить рецепты из TheMealDB. Проверьте интернет и попробуйте ещё раз — поиск идёт всегда, даже если холодильник пуст.",
      );
      return;
    }

    const sortBest = (a, b) =>
      a.fit.missing.length - b.fit.missing.length ||
      b.fit.have.length - a.fit.have.length ||
      b.pref - a.pref ||
      b.fridge - a.fridge ||
      a.meal.strMeal.localeCompare(b.meal.strMeal);

    let pool = ranked;
    if (tastesAll.length || dishesAll.length) {
      // Вкус и тип блюда соблюдаем всегда: сначала строго, затем мягче по описанию.
      const strict = ranked.filter((entry) => requestMatch(entry.meal, tastesAll, dishesAll, true));
      const soft = strict.length ? strict : ranked.filter((entry) => requestMatch(entry.meal, tastesAll, dishesAll, false));
      if (!soft.length) {
        showNote(
          "Под такие пожелания ничего не нашлось",
          "Попробуйте убрать один из фильтров вкуса или типа блюда — так найдётся больше рецептов с минимумом докупок.",
        );
        return;
      }
      pool = soft;
    }

    pool.sort(sortBest);
    renderResults(pool.slice(0, 6), products, keywords, { tastes: tastesAll, dishes: dishesAll });
  } catch (problem) {
    showNote("Источник недоступен", problem && problem.message ? problem.message : "Не удалось связаться с TheMealDB. Проверьте интернет и попробуйте снова.");
    if (problem && problem.name !== "SourceError") console.error(problem);
  } finally {
    searching = false;
    submitButton.disabled = false;
    result.removeAttribute("aria-busy");
  }
}

function showSkeleton(products) {
  result.replaceChildren();
  const head = document.createElement("div");
  head.className = "result-head";
  const title = document.createElement("h2");
  title.textContent = "Собираем рецепты";
  head.append(title);

  const progress = document.createElement("p");
  progress.className = "loading-line";
  progress.id = "search-progress";
  progress.append(spinner(), document.createTextNode(
    products.length
      ? `Сначала ищем по «${products.slice(0, 2).map((product) => product.name).join("», «")}»…`
      : "Ищем рецепты в TheMealDB…",
  ));
  result.append(head, progress);

  const grid = document.createElement("div");
  grid.className = "meal-grid";
  for (let index = 0; index < 3; index += 1) {
    const card = document.createElement("div");
    card.className = "skeleton-card";
    const media = document.createElement("div");
    media.className = "skeleton skeleton-media";
    const lineA = document.createElement("div");
    lineA.className = "skeleton skeleton-line";
    const lineB = document.createElement("div");
    lineB.className = "skeleton skeleton-line is-short";
    card.append(media, lineA, lineB);
    grid.append(card);
  }
  result.append(grid);
}

function progressLine(term, index, total) {
  const node = result.querySelector("#search-progress");
  if (!node) return;
  node.replaceChildren(spinner(), document.createTextNode(`Ищем «${term}» в ${DB.SOURCE_NAME}… ${Math.min(index + 1, total)} из ${total}`));
}

const DISH_QUERY = {
  salad: "salad",
  soup: "soup",
  hot: "",
  breakfast: "breakfast",
  snack: "starter",
  side: "side",
  dessert: "dessert",
  drink: "smoothie",
};

const TASTE_QUERY = {
  spicy: ["spicy", "chilli", "curry"],
  salty: ["bacon", "cheese", "olive", "anchovy", "soy sauce"],
  sweet: ["dessert", "cake"],
  sour: ["lemon", "vinegar"],
  light: ["salad", "soup"],
  hearty: ["stew", "roast"],
};

const FALLBACK_QUERIES = ["salad", "soup", "pasta", "rice", "chicken", "egg"];
const BATCH_SIZE = 3;

async function collectMeals(products, keywords, wanted, onStep) {
  const steps = [];
  products.slice(0, 6).forEach((product) => steps.push({ kind: "ingredient", term: product.en }));
  wanted.slice(0, 6).forEach((term) => steps.push({ kind: "search", term }));
  FALLBACK_QUERIES.forEach((term) => steps.push({ kind: "search", term }));

  const unique = [];
  const seenTerms = new Set();
  steps.forEach((step) => {
    const key = `${step.kind}:${step.term}`;
    if (!seenTerms.has(key)) {
      seenTerms.add(key);
      unique.push(step);
    }
  });

  const found = new Map();
  const groups = [];

  for (let index = 0; index < unique.length; index += BATCH_SIZE) {
    const batch = unique.slice(index, index + BATCH_SIZE);
    if (onStep) onStep(batch[0].term, index, unique.length);
    const settled = await Promise.allSettled(
      batch.map((step) => (step.kind === "ingredient" ? DB.byIngredient(step.term) : DB.search(step.term))),
    );

    settled.forEach((outcome, position) => {
      if (outcome.status !== "fulfilled") return;
      const step = batch[position];
      groups.push(outcome.value.map((meal) => meal.idMeal));
      outcome.value.forEach((meal) => {
        const current = found.get(meal.idMeal);
        if (current) {
          current.hits += 1;
          if (step.kind === "search") {
            // Полный ответ поиска заменяет краткую запись из filter.php:
            // иначе у блюда не окажется состава и оно «попадёт» без докупок.
            const { hits, rank } = current;
            Object.assign(current, meal, { partial: false, hits, rank });
          }
          return;
        }
        found.set(meal.idMeal, { ...meal, partial: step.kind === "ingredient", hits: 1, rank: 0 });
      });
    });
  }

  // Берём кандидатов по кругу из разных запросов: так в выдачу попадают
  // блюда под каждый продукт, а не только под первый.
  const used = new Set();
  const cursors = groups.map(() => 0);
  let rank = 0;
  let advanced = true;
  while (advanced) {
    advanced = false;
    for (let group = 0; group < groups.length; group += 1) {
      while (cursors[group] < groups[group].length) {
        const id = groups[group][cursors[group]];
        cursors[group] += 1;
        if (used.has(id)) continue;
        used.add(id);
        found.get(id).rank = rank;
        rank += 1;
        advanced = true;
        break;
      }
    }
  }

  return [...found.values()]
    .sort((a, b) => b.hits - a.hits || a.rank - b.rank || (a.partial ? 1 : 0) - (b.partial ? 1 : 0))
    .slice(0, 32);
}

/* ---------- rendering results ---------- */

function renderResults(picked, products, keywords, filters = { tastes: [], dishes: [] }) {
  result.replaceChildren();

  const head = document.createElement("div");
  head.className = "result-head";
  const titleWrap = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = products.length ? "Рецепты для вашего холодильника" : "Рецепты для вас";
  const meta = document.createElement("p");
  meta.className = "result-meta";
  const best = picked[0];
  const missing = best ? best.fit.missing.length : 0;
  const budget = missing
    ? `докупить минимум: ${missing} ${Core.text.plural(missing, "продукт", "продукта", "продуктов")}`
    : "ничего докупать не нужно";
  meta.textContent = `${picked.length} ${Core.text.plural(picked.length, "вариант", "варианта", "вариантов")} · ${budget}`;
  titleWrap.append(title, meta);

  const actions = document.createElement("div");
  actions.className = "result-actions";
  const source = document.createElement("span");
  source.className = "badge-soft";
  source.textContent = DB.SOURCE_NAME;
  actions.append(source);
  head.append(titleWrap, actions);
  result.append(head);

  if (!products.length) {
    const hint = document.createElement("p");
    hint.className = "panel-note";
    hint.textContent = "Холодильник пока пуст — показываем хорошие рецепты из базы. Добавьте продукты, и подбор станет точнее.";
    result.append(hint);
  }

  const grid = document.createElement("div");
  grid.className = "meal-grid";
  picked.forEach((entry) => grid.append(card(entry)));
  result.append(grid);

  UI.stagger(grid, ".meal-card");
  grid.querySelectorAll(".meal-card").forEach((node) => UI.tilt(node, 4));

  const note = document.createElement("p");
  note.className = "panel-note";
  const filtersList = [
    ...filters.tastes.map((word) => TASTE_LABEL[word]).filter(Boolean),
    ...filters.dishes.map((word) => DISH_LABEL[word]).filter(Boolean),
  ];
  const wishList = (keywords || [])
    .filter((word) => !TASTE_LABEL[word])
    .map((word) => FOOD_LABEL[word] || word);
  if (filtersList.length) {
    note.textContent = `Подобрано по пожеланиям: ${filtersList.join(", ")}. Сверху — блюда с минимумом докупок.`;
  } else if (wishList.length) {
    note.textContent = `Пожелания: ${wishList.join(", ")}. Сортировка — от меньшего числа недостающих продуктов.`;
  } else {
    note.textContent = `Тексты рецептов на английском — это условие открытой базы ${DB.SOURCE_NAME}. Сортировка: меньше докупок — выше.`;
  }
  result.append(note);
}

function card(entry) {
  const { meal, fit } = entry;
  const cardNode = document.createElement("article");
  cardNode.className = "meal-card";

  const shot = document.createElement("div");
  shot.className = "meal-shot";
  if (meal.strMealThumb) {
    const image = document.createElement("img");
    image.src = meal.strMealThumb;
    image.alt = meal.strMeal;
    image.loading = "lazy";
    shot.append(image);
  }
  shot.append(favButton(meal));

  const body = document.createElement("div");
  body.className = "meal-body";

  const title = document.createElement("h3");
  title.className = "meal-title";
  Translate.fill(title, meal.strMeal);
  if (meal.strMealThumb) {
    Translate.fill(shot.querySelector("img"), meal.strMeal, "alt");
  }
  const meta = document.createElement("p");
  meta.className = "meal-meta";
  meta.textContent = [Translate.term(meal.strCategory), Translate.term(meal.strArea)].filter(Boolean).join(" · ");

  const haveCount = fit.have.length;
  const missingCount = fit.missing.length;
  const total = haveCount + missingCount;
  const share = total ? Math.round((haveCount / total) * 100) : 0;

  const meter = document.createElement("div");
  meter.className = "match-meter";
  const track = document.createElement("div");
  track.className = "match-track";
  const haveBar = document.createElement("span");
  haveBar.className = "match-have";
  haveBar.style.width = `${share}%`;
  const missBar = document.createElement("span");
  missBar.className = "match-fill";
  missBar.style.width = `${100 - share}%`;
  track.append(haveBar, missBar);
  const labels = document.createElement("div");
  labels.className = "match-labels";
  const left = document.createElement("span");
  left.append("совпало ", Object.assign(document.createElement("b"), { textContent: `${share}%` }));
  const right = document.createElement("span");
  right.textContent = `не хватает: ${missingCount}`;
  labels.append(left, right);
  meter.append(track, labels);

  const have = document.createElement("p");
  have.className = "meal-have";
  const haveNames = fit.have
    .slice()
    .sort((a, b) => a.product.days - b.product.days)
    .map((item) => `${capName(item.product.name)} (${Match.expiryText(item.product.days)})`);
  have.textContent = `Есть дома: ${haveNames.join(", ")}`;

  const missing = document.createElement("p");
  missing.className = missingCount ? "meal-miss" : "meal-have";
  if (missingCount) {
    missing.append("Не хватает: ");
    fit.missing.forEach((name, index) => {
      const part = document.createElement("span");
      Translate.fill(part, name, "", { capitalize: true });
      missing.append(part);
      if (index < fit.missing.length - 1) missing.append(", ");
    });
  } else {
    missing.textContent = "Докупать ничего не нужно";
  }

  const foot = document.createElement("div");
  foot.className = "meal-foot";
  const open = document.createElement("a");
  open.className = "action";
  open.href = `recipe.html?id=${encodeURIComponent(meal.idMeal)}`;
  open.textContent = "Показать рецепт";
  foot.append(open);

  body.append(title, meta, meter);
  if (haveCount) body.append(have);
  body.append(missing, foot);
  cardNode.append(shot, body);
  return cardNode;
}

function favButton(meal) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "meal-fav";
  const isFav = Core.recipes.isFavorite(meal.idMeal || meal.id);
  button.classList.toggle("is-fav", isFav);
  button.setAttribute("aria-pressed", String(isFav));
  button.setAttribute("aria-label", isFav ? "Убрать из избранного" : "Добавить в избранное");
  button.title = button.getAttribute("aria-label");
  button.append(heartIcon());
  button.addEventListener("click", () => toggleFavorite(meal, button));
  return button;
}

function toggleFavorite(meal, button) {
  try {
    const next = Core.recipes.toggleFavorite(meal);
    button.classList.toggle("is-fav", next);
    button.setAttribute("aria-pressed", String(next));
    button.setAttribute("aria-label", next ? "Убрать из избранного" : "Добавить в избранное");
    button.title = button.getAttribute("aria-label");
    if (next) {
      UI.burst(button, { count: 12 });
      UI.toast("Рецепт добавлен в избранное.", { tone: "ok", duration: 2600 });
    } else {
      UI.toast("Рецепт убран из избранного.", { tone: "info", duration: 2200 });
    }
  } catch (problem) {
    UI.handle(problem);
  }
}

function renderFavorites() {
  const favorites = Core.recipes.favorites();
  favoritesGrid.replaceChildren();
  document.querySelector("#favorites-count").textContent = String(favorites.length);

  if (!favorites.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.style.gridColumn = "1 / -1";
    const title = document.createElement("strong");
    title.textContent = "Пока ничего не сохранено";
    const text = document.createElement("p");
    text.textContent = "Нажмите на сердечко в карточке рецепта — он останется здесь, даже если закрыть сайт.";
    empty.append(title, text);
    favoritesGrid.append(empty);
    return;
  }

  favorites.forEach((favorite) => {
    const cardNode = document.createElement("article");
    cardNode.className = "meal-card";

    const shot = document.createElement("div");
    shot.className = "meal-shot";
    if (favorite.thumb) {
      const image = document.createElement("img");
      image.src = favorite.thumb;
      image.alt = favorite.title;
      image.loading = "lazy";
      shot.append(image);
    }
    shot.append(favButton(favorite));

    const body = document.createElement("div");
    body.className = "meal-body";
    const title = document.createElement("h3");
    title.className = "meal-title";
    Translate.fill(title, favorite.title);
    const meta = document.createElement("p");
    meta.className = "meal-meta";
    meta.textContent = [Translate.term(favorite.category), Translate.term(favorite.area)].filter(Boolean).join(" · ") || "Избранное";
    const foot = document.createElement("div");
    foot.className = "meal-foot";
    const open = document.createElement("a");
    open.className = "action";
    open.href = `recipe.html?id=${encodeURIComponent(favorite.id)}`;
    open.textContent = "Открыть";
    foot.append(open);
    body.append(title, meta, foot);
    cardNode.append(shot, body);
    favoritesGrid.append(cardNode);
  });

  UI.stagger(favoritesGrid, ".meal-card");
}

/* ---------- helpers ---------- */

function showNote(title, text) {
  result.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "empty-state";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  empty.append(strong, paragraph);
  result.append(empty);
  result.hidden = false;
}

function capName(value) {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toLocaleUpperCase("ru") + text.slice(1) : text;
}

function wishWords(wish) {
  if (!wish) return [];
  const text = wish.toLocaleLowerCase("ru");
  return WISH_WORDS.filter(([pattern]) => pattern.test(text)).map(([, word]) => word);
}

function requestMatch(meal, tastes, dishes, strict) {
  const tasteOk = tastes.every((taste) => tasteHit(meal, taste));
  if (!tasteOk) return false;
  if (!dishes.length) return true;
  return dishes.some((key) => (strict ? dishStrict(meal, key) : dishHit(meal, key)));
}

function tasteHit(meal, taste) {
  const blob = mealBlob(meal);
  const pool = `${blob.title} ${blob.category} ${blob.tags} ${blob.instructions}`;
  const rules = {
    spicy: /spic|chill|curry|peri|jalape|paprika|hot sauce/,
    salty: /savoury|savory|soy sauce|anchov|olive|bacon|salted|cheese|fish sauce/,
    sweet: /sweet|sugar|honey|chocolate|dessert|cake|cookie|syrup/,
    sour: /sour|lemon|lime|vinegar|tamarind|yogurt|pickle/,
    light: /light|salad|soup|steam|vegetable|fresh|herb/,
    hearty: /hearty|stew|roast|beef|pork|lamb|pie|rich|comfort/,
  };
  return (rules[taste] || /$^/).test(pool);
}

function preferenceScore(meal, keywords, dishes) {
  const blob = mealBlob(meal);
  let score = 0;
  keywords.forEach((word) => {
    if (blob.title.includes(word)) score += 4;
    if (blob.category.includes(word) || blob.area.includes(word) || blob.tags.includes(word)) score += 2;
    if (blob.instructions.includes(word)) score += 1;
  });
  if (dishes.some((key) => dishHit(meal, key))) score += 6;
  return score;
}

function dishHit(meal, key) {
  const rule = DISHES[key];
  if (!rule) return false;
  const blob = mealBlob(meal);
  if (rule.categories && rule.categories.includes(blob.category)) return true;
  return (rule.words || []).some((word) => blob.title.includes(word) || blob.tags.includes(word) || blob.instructions.includes(word));
}

function dishStrict(meal, key) {
  const rule = DISHES[key];
  if (!rule) return false;
  const blob = mealBlob(meal);
  if (rule.categories && rule.categories.includes(blob.category)) return true;
  return (rule.words || []).some((word) => blob.title.includes(word) || blob.tags.includes(word));
}

function mealBlob(meal) {
  return {
    title: (meal.strMeal || "").toLowerCase(),
    category: (meal.strCategory || "").toLowerCase(),
    area: (meal.strArea || "").toLowerCase(),
    tags: (meal.strTags || "").toLowerCase(),
    instructions: (meal.strInstructions || "").toLowerCase(),
  };
}

function spinner() {
  const node = document.createElement("span");
  node.className = "spinner";
  node.setAttribute("aria-hidden", "true");
  return node;
}

function heartIcon() {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("d", "M12 20s-7-4.4-7-9.3C5 7.6 7 6 9.2 6c1.2 0 2.2.6 2.8 1.5C12.6 6.6 13.6 6 14.8 6 17 6 19 7.6 19 10.7 19 15.6 12 20 12 20Z");
  svg.append(path);
  return svg;
}

function clockIcon() {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("d", "M12 7v5l3 2M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0Z");
  svg.append(path);
  return svg;
}
