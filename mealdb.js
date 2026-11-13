window.FridgeMealDB = (() => {
  const API = "https://www.themealdb.com/api/json/v1/1";
  const SOURCE_NAME = "TheMealDB";
  const SOURCE_URL = "https://www.themealdb.com/";
  const CACHE_KEY = window.FridgeCore.KEYS.mealCache;
  const LIST_PREFIX = "fridgeflow-list:";
  const CACHE_LIMIT = 150;
  const LIST_TTL_MS = 6 * 60 * 60 * 1000;
  const TIMEOUT_MS = 9000;
  const RETRIES = 2;
  const { readJSON, writeJSON } = window.FridgeCore.storage;
  const inflight = new Map();

  class SourceError extends Error {
    constructor(message, retry) {
      super(message);
      this.name = "SourceError";
      this.retry = retry;
    }
  }

  function loadCache() {
    const parsed = readJSON(CACHE_KEY, {});
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }

  function saveCache(cache) {
    const entries = Object.entries(cache)
      .sort(([, a], [, b]) => (b._at || 0) - (a._at || 0))
      .slice(0, CACHE_LIMIT);
    try {
      writeJSON(CACHE_KEY, Object.fromEntries(entries));
    } catch {
      // Без кэша всё работает, просто медленнее.
    }
  }

  function rememberMany(meals) {
    if (!meals.length) return;
    const cache = loadCache();
    const now = Date.now();
    meals.forEach((meal) => {
      if (meal && meal.idMeal) cache[meal.idMeal] = { ...meal, _at: now };
    });
    saveCache(cache);
  }

  function remember(meal) {
    rememberMany([meal]);
  }

  function cached(id) {
    return loadCache()[id] || null;
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function fetchOnce(path) {
    if (navigator.onLine === false) throw new SourceError("Нет подключения к интернету.", false);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${API}${path}`, { signal: controller.signal });
      if (response.status === 429 || response.status >= 500) {
        throw new SourceError(`Источник временно недоступен (${response.status}).`, true);
      }
      if (!response.ok) throw new SourceError(`Источник ответил ошибкой ${response.status}.`, false);
      return await response.json();
    } catch (error) {
      if (error instanceof SourceError) throw error;
      if (error.name === "AbortError") throw new SourceError("Источник слишком долго не отвечает.", true);
      throw new SourceError("Не удалось связаться с источником рецептов.", true);
    } finally {
      clearTimeout(timer);
    }
  }

  function request(path) {
    if (inflight.has(path)) return inflight.get(path);
    const job = (async () => {
      let lastError;
      for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
        try {
          return await fetchOnce(path);
        } catch (error) {
          lastError = error;
          if (!error.retry || attempt === RETRIES) break;
          await wait(450 * 2 ** attempt);
        }
      }
      throw lastError;
    })().finally(() => inflight.delete(path));
    inflight.set(path, job);
    return job;
  }

  async function requestList(path) {
    const key = LIST_PREFIX + path;
    try {
      const hit = JSON.parse(sessionStorage.getItem(key) || "null");
      if (hit && Date.now() - hit.at < LIST_TTL_MS) return hit.meals;
    } catch {
      // повреждённая запись — запросим заново
    }
    const data = await request(path);
    const meals = Array.isArray(data.meals) ? data.meals : [];
    try {
      sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), meals }));
    } catch {
      // sessionStorage недоступен или полон
    }
    return meals;
  }

  async function search(word) {
    const meals = await requestList(`/search.php?s=${encodeURIComponent(word)}`);
    rememberMany(meals);
    return meals;
  }

  async function byIngredient(ingredient) {
    return requestList(`/filter.php?i=${encodeURIComponent(ingredient)}`);
  }

  async function byId(id) {
    const hit = cached(id);
    if (hit && !hit.partial) return hit;
    const data = await request(`/lookup.php?i=${encodeURIComponent(id)}`);
    const meal = Array.isArray(data.meals) ? data.meals[0] : null;
    if (meal) remember(meal);
    return meal || null;
  }

  return {
    search,
    byIngredient,
    byId,
    cached,
    SourceError,
    SOURCE_NAME,
    SOURCE_URL,
  };
})();

window.FridgeMatch = (() => {
  const FOODS = [
    { keys: ["подсолнеч"], en: "olive oil", label: "растительное масло", words: ["sunflower oil", "vegetable oil", "olive oil"] },
    { keys: ["молок", "кефир"], en: "milk", label: "молоко", words: ["milk"] },
    { keys: ["йогурт"], en: "yogurt", label: "йогурт", words: ["yogurt", "yoghurt"] },
    { keys: ["сметан"], en: "sour cream", label: "сметана", words: ["sour cream", "soured cream"] },
    { keys: ["сливк"], en: "cream", label: "сливки", words: ["cream"] },
    { keys: ["сыр"], en: "cheese", label: "сыр", words: ["cheese", "parmesan", "cheddar", "mozzarella", "feta"] },
    { keys: ["яйц"], en: "egg", label: "яйца", words: ["egg"] },
    { keys: ["помидор", "томат"], en: "tomato", label: "помидоры", words: ["tomato"] },
    { keys: ["огурец", "огурц"], en: "cucumber", label: "огурец", words: ["cucumber"] },
    { keys: ["картоф"], en: "potato", label: "картофель", words: ["potato"] },
    { keys: ["морков"], en: "carrot", label: "морковь", words: ["carrot"] },
    { keys: ["чеснок"], en: "garlic", label: "чеснок", words: ["garlic"] },
    { keys: ["лук"], en: "onion", label: "лук", words: ["onion"] },
    { keys: ["куриц", "курин"], en: "chicken", label: "курица", words: ["chicken"] },
    { keys: ["говяд"], en: "beef", label: "говядина", words: ["beef"] },
    { keys: ["свинин", "бекон", "ветчин"], en: "pork", label: "свинина", words: ["pork", "bacon", "ham"] },
    { keys: ["баранин"], en: "lamb", label: "баранина", words: ["lamb"] },
    { keys: ["рыб", "лосос", "тунец", "треск", "кревет"], en: "salmon", label: "рыба", words: ["salmon", "tuna", "cod", "fish", "prawn", "shrimp"] },
    { keys: ["рис"], en: "rice", label: "рис", words: ["rice"] },
    { keys: ["греч"], en: "buckwheat", label: "гречка", words: ["buckwheat"] },
    { keys: ["паста", "макарон", "спагет"], en: "pasta", label: "паста", words: ["pasta", "spaghetti", "noodle"] },
    { keys: ["хлеб"], en: "bread", label: "хлеб", words: ["bread"] },
    { keys: ["сливочн", "масло"], en: "butter", label: "масло", words: ["butter"] },
    { keys: ["яблок"], en: "apple", label: "яблоки", words: ["apple"] },
    { keys: ["банан"], en: "banana", label: "бананы", words: ["banana"] },
    { keys: ["гриб"], en: "mushroom", label: "грибы", words: ["mushroom"] },
    { keys: ["капуст"], en: "cabbage", label: "капуста", words: ["cabbage"] },
    { keys: ["шпинат"], en: "spinach", label: "шпинат", words: ["spinach"] },
    { keys: ["сахар"], en: "sugar", label: "сахар", words: ["sugar"] },
    { keys: ["мук"], en: "flour", label: "мука", words: ["flour"] },
  ];

  const QUERY_MAP = [
    [/омлет/, "omelette"],
    [/яичниц/, "egg"],
    [/суп/, "soup"],
    [/салат/, "salad"],
    [/борщ/, "borscht"],
    [/паста|спагетти|макарон/, "pasta"],
    [/куриц/, "chicken"],
    [/говядин/, "beef"],
    [/свинин/, "pork"],
    [/рыб/, "fish"],
    [/рис/, "rice"],
    [/картоф/, "potato"],
    [/помидор|томат/, "tomato"],
    [/сыр/, "cheese"],
    [/яйц/, "egg"],
    [/десерт|торт/, "cake"],
    [/блин|оладь/, "pancake"],
    [/каша|овсян/, "porridge"],
  ];

  function normalize(name) {
    return String(name || "").toLocaleLowerCase("ru").replaceAll("ё", "е");
  }

  function hasKey(name, key) {
    return new RegExp(`(^|[^а-я])${key}`).test(normalize(name));
  }

  function includesWord(haystack, word) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}(?:es|s)?([^a-z]|$)`, "i").test(haystack);
  }

  function daysUntil(isoDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(`${isoDate}T00:00:00`);
    return Math.round((expiry - today) / 86400000);
  }

  function foodFor(name) {
    if (hasKey(name, "подсолнеч")) return FOODS.find((item) => item.en === "olive oil") || null;
    if (hasKey(name, "масло") || (hasKey(name, "сливочн") && !hasKey(name, "сливк"))) {
      return FOODS.find((item) => item.en === "butter") || null;
    }
    return FOODS.find((item) => item.en !== "butter" && item.en !== "olive oil" && item.keys.some((key) => hasKey(name, key))) || null;
  }

  function isPantry(name) {
    const value = name.toLowerCase();
    if (includesWord(value, "salt") || includesWord(value, "water")) return true;
    if (/black pepper|white pepper/.test(value) || value.trim() === "pepper") return true;
    if (/olive oil|vegetable oil|sunflower oil|cooking oil/.test(value) || value.trim() === "oil") return true;
    return false;
  }

  function loadFridge() {
    return window.FridgeCore.products
      .list()
      .filter((product) => !product.used)
      .map((product) => {
        const food = foodFor(product.name);
        return {
          ...product,
          days: daysUntil(product.expiry),
          en: food ? food.en : "",
          label: food ? food.label : product.name.trim(),
          words: food ? food.words : [],
        };
      })
      .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name, "ru"));
  }

  function ingredients(meal) {
    const parts = [];
    for (let index = 1; index <= 20; index += 1) {
      const name = (meal[`strIngredient${index}`] || "").trim();
      if (name) parts.push(name);
    }
    return parts;
  }

  function displayName(ingredient) {
    const food = FOODS.find((item) => item.words.some((word) => includesWord(ingredient, word)));
    return food ? food.label : ingredient;
  }

  function assess(meal, products) {
    const used = new Set();
    const have = [];
    const missing = [];
    ingredients(meal).forEach((name) => {
      if (isPantry(name)) return;
      const index = products.findIndex(
        (product, productIndex) => !used.has(productIndex) && product.words.some((word) => includesWord(name, word)),
      );
      if (index >= 0) {
        used.add(index);
        have.push({ product: products[index], ingredient: name });
      } else {
        missing.push(displayName(name));
      }
    });
    const uniqueMissing = [...new Set(missing)];
    return {
      have,
      missing: uniqueMissing,
      ok: have.length > 0 && uniqueMissing.length <= 3,
    };
  }

  function urgency(days) {
    if (days < 0) return 10;
    if (days <= 2) return 7;
    if (days <= 5) return 4;
    return 1;
  }

  function fridgeScore(have) {
    return have.reduce((total, item) => total + urgency(item.product.days), 0);
  }

  function toEnglishQuery(text) {
    const value = normalize(text).trim();
    if (!value) return "";
    if (/[a-z]/i.test(value) && !/[а-я]/.test(value)) return value;
    const hit = QUERY_MAP.find(([pattern]) => pattern.test(value));
    return hit ? hit[1] : "";
  }

  function expiryText(days) {
    if (days < 0) return `просрочено на ${Math.abs(days)} дн.`;
    if (days === 0) return "срок сегодня";
    if (days === 1) return "остался 1 день";
    return `осталось ${days} дн.`;
  }

  return {
    loadFridge,
    assess,
    fridgeScore,
    urgency,
    toEnglishQuery,
    expiryText,
    displayName,
    MAX_MISSING: 3,
  };
})();
