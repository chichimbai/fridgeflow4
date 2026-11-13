window.FridgeCore = (() => {
  const SCHEMA_VERSION = 2;
  const KEYS = {
    meta: "fridgeflow-meta",
    products: "fridgeflow-products",
    recommendations: "fridgeflow-recommendations",
    name: "fridgeflow-name",
    about: "fridgeflow-about",
    currency: "fridgeflow-currency",
    review: "fridgeflow-review",
    votes: "fridgeflow-review-votes",
    blocked: "fridgeflow-review-blocked",
    history: "fridgeflow-recipe-history",
    views: "fridgeflow-recipe-views",
    uses: "fridgeflow-recipe-uses",
    favorites: "fridgeflow-recipe-favorites",
    progress: "fridgeflow-recipe-progress",
    searches: "fridgeflow-recipe-searches",
    journal: "fridgeflow-journal",
    mealCache: "fridgeflow-meal-cache",
  };
  const TEXT_KEYS = new Set([KEYS.name, KEYS.about, KEYS.currency]);
  const TOPIC_BY_KEY = {
    [KEYS.products]: "products",
    [KEYS.recommendations]: "products",
    [KEYS.name]: "profile",
    [KEYS.about]: "profile",
    [KEYS.currency]: "settings",
    [KEYS.review]: "reviews",
    [KEYS.votes]: "reviews",
    [KEYS.blocked]: "reviews",
    [KEYS.history]: "recipes",
    [KEYS.views]: "recipes",
    [KEYS.uses]: "recipes",
    [KEYS.favorites]: "recipes",
    [KEYS.progress]: "recipes",
    [KEYS.searches]: "recipes",
    [KEYS.journal]: "journal",
  };
  const ALL_TOPICS = ["products", "profile", "settings", "reviews", "recipes", "journal"];

  class CoreError extends Error {
    constructor(message, code = "error", fields = {}) {
      super(message);
      this.name = "CoreError";
      this.code = code;
      this.fields = fields;
    }
  }

  function invalid(fields) {
    throw new CoreError(Object.values(fields)[0], "validation", fields);
  }

  /* ---------- storage ---------- */

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null || raw === "") return fallback;
      const value = JSON.parse(raw);
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function readText(key, fallback = "") {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function writeRaw(key, raw) {
    try {
      localStorage.setItem(key, raw);
    } catch {
      // Кэш рецептов можно пересобрать из сети, поэтому при переполнении жертвуем им.
      if (key !== KEYS.mealCache && localStorage.getItem(KEYS.mealCache) != null) {
        localStorage.removeItem(KEYS.mealCache);
        try {
          localStorage.setItem(key, raw);
          return;
        } catch {
          // упадём ниже
        }
      }
      throw new CoreError("Хранилище браузера переполнено. Освободите место и повторите.", "storage");
    }
  }

  function writeJSON(key, value) {
    writeRaw(key, JSON.stringify(value));
  }

  function remove(key) {
    localStorage.removeItem(key);
  }

  /* ---------- events ---------- */

  const listeners = new Map();

  function on(topics, handler) {
    const list = String(topics).split(/\s+/).filter(Boolean);
    list.forEach((topic) => {
      if (!listeners.has(topic)) listeners.set(topic, new Set());
      listeners.get(topic).add(handler);
    });
    return () => list.forEach((topic) => listeners.get(topic)?.delete(handler));
  }

  function emit(topic, detail = {}) {
    (listeners.get(topic) || []).forEach((handler) => {
      try {
        handler({ topic, ...detail });
      } catch (error) {
        console.error(error);
      }
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key === null) {
      ALL_TOPICS.forEach((topic) => emit(topic, { remote: true }));
      return;
    }
    const topic = TOPIC_BY_KEY[event.key];
    if (topic) emit(topic, { remote: true });
  });

  /* ---------- helpers ---------- */

  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

  function todayISO(date = new Date()) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function shiftISO(iso, days) {
    const date = new Date(`${iso}T00:00:00`);
    date.setDate(date.getDate() + days);
    return todayISO(date);
  }

  function isISODate(value) {
    if (typeof value !== "string" || !ISO_RE.test(value)) return false;
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime()) && todayISO(date) === value;
  }

  function daysUntil(iso) {
    const today = new Date(`${todayISO()}T00:00:00`);
    const target = new Date(`${iso}T00:00:00`);
    return Math.round((target - today) / 86400000);
  }

  function uid() {
    if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function normalizeKey(text) {
    return String(text ?? "").trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
  }

  function cleanText(text) {
    return String(text ?? "").replace(/\s+/g, " ").trim();
  }

  function plural(count, one, few, many) {
    const mod10 = Math.abs(count) % 10;
    const mod100 = Math.abs(count) % 100;
    if (mod100 > 10 && mod100 < 20) return many;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;
    return many;
  }

  const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

  function formatDate(iso) {
    const [year, month, day] = String(iso).slice(0, 10).split("-").map(Number);
    if (!year || !month || !day) return String(iso);
    return `${day} ${MONTHS[month - 1]} ${year}`;
  }

  function formatRelative(isoDateTime) {
    const time = new Date(isoDateTime).getTime();
    if (Number.isNaN(time)) return "";
    const minutes = Math.round((Date.now() - time) / 60000);
    if (minutes < 1) return "только что";
    if (minutes < 60) return `${minutes} ${plural(minutes, "минуту", "минуты", "минут")} назад`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} ${plural(hours, "час", "часа", "часов")} назад`;
    const days = Math.round(hours / 24);
    if (days === 1) return "вчера";
    if (days < 30) return `${days} ${plural(days, "день", "дня", "дней")} назад`;
    return formatDate(todayISO(new Date(time)));
  }

  /* ---------- moderation ---------- */

  const BANNED = ["хуй", "хуе", "пизд", "еба", "ёба", "ебл", "бля", "сука", "суки", "муда", "пидор", "пидар", "гандон", "fuck", "shit", "bitch"];

  function moderate(text, { min = 0, max = Infinity, label = "Текст", strict = true } = {}) {
    const value = cleanText(text);
    if (value.length < min) {
      return min === 1 ? `${label}: поле не может быть пустым.` : `${label}: минимум ${min} ${plural(min, "символ", "символа", "символов")}.`;
    }
    if (value.length > max) return `${label}: не длиннее ${max} ${plural(max, "символа", "символов", "символов")}.`;
    const lower = normalizeKey(value);
    const banned = BANNED.some((root) => new RegExp(`(^|[^а-яa-z])${normalizeKey(root)}`).test(lower));
    if (banned) return "В тексте есть недопустимые слова.";
    if (!strict) return "";
    if (/(.)\1{5,}/u.test(value)) return "Слишком много повторяющихся символов подряд.";
    if (/https?:\/\/|www\./i.test(value)) return "Ссылки в тексте не допускаются.";
    const letters = value.replace(/[^a-zа-яё]/gi, "");
    if (letters.length >= 12) {
      const upper = letters.replace(/[^A-ZА-ЯЁ]/g, "").length;
      if (upper / letters.length > 0.7) return "Пожалуйста, не пишите заглавными буквами.";
    }
    return "";
  }

  /* ---------- journal ---------- */

  const JOURNAL_LIMIT = 150;

  const journal = {
    list(limit = JOURNAL_LIMIT) {
      const entries = readJSON(KEYS.journal, []);
      return (Array.isArray(entries) ? entries : []).filter((entry) => entry && entry.at && entry.text).slice(0, limit);
    },
    add(type, text) {
      const entries = journal.list();
      entries.unshift({ id: uid(), type, text, at: nowISO() });
      try {
        writeJSON(KEYS.journal, entries.slice(0, JOURNAL_LIMIT));
      } catch {
        return;
      }
      emit("journal");
    },
    clear() {
      remove(KEYS.journal);
      emit("journal");
    },
  };

  /* ---------- products ---------- */

  const UNITS = { g: "г", kg: "кг", ml: "мл", l: "л", pcs: "шт" };
  const ALMOST_MAX_DAYS = 2;
  const SOON_MAX_DAYS = 5;
  const MAX_AMOUNT = 100000;
  const MAX_PRICE = 1e9;

  function currencyCodes() {
    return typeof FridgePrices !== "undefined"
      ? FridgePrices.CURRENCIES.map((currency) => currency.code)
      : ["KZT", "USD", "EUR", "RUB", "CNY", "GBP", "TRY", "JPY", "AED", "KRW"];
  }

  function sanitizeProduct(entry) {
    if (!entry || typeof entry !== "object") return null;
    const name = cleanText(entry.name).slice(0, 60);
    const amount = Number(entry.amount);
    if (!name || !Number.isFinite(amount) || amount <= 0 || !isISODate(entry.expiry)) return null;
    const price = entry.price == null || entry.price === "" ? null : Number(entry.price);
    const validPrice = price != null && Number.isFinite(price) && price >= 0 ? price : null;
    const used = Boolean(entry.used);
    return {
      id: typeof entry.id === "string" && entry.id ? entry.id : uid(),
      name,
      amount,
      unit: UNITS[entry.unit] ? entry.unit : "g",
      expiry: entry.expiry,
      used,
      usedOn: used ? (isISODate(entry.usedOn) ? entry.usedOn : todayISO()) : null,
      price: validPrice,
      priceCurrency: validPrice == null ? null : currencyCodes().includes(entry.priceCurrency) ? entry.priceCurrency : "KZT",
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : nowISO(),
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : nowISO(),
    };
  }

  function validateProduct(input) {
    const errors = {};
    const name = cleanText(input.name);
    const nameError = moderate(name, { min: 1, max: 60, label: "Название", strict: false });
    if (nameError) errors.name = nameError;

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) errors.amount = "Количество должно быть больше нуля.";
    else if (amount > MAX_AMOUNT) errors.amount = `Количество не больше ${MAX_AMOUNT.toLocaleString("ru-RU")}.`;

    const unit = String(input.unit || "");
    if (!UNITS[unit]) errors.unit = "Выберите единицу измерения.";

    const expiry = String(input.expiry || "");
    if (!isISODate(expiry)) errors.expiry = "Укажите корректную дату срока годности.";
    else if (daysUntil(expiry) > 3650) errors.expiry = "Срок годности больше 10 лет — проверьте дату.";

    let price = null;
    if (input.price != null && String(input.price).trim() !== "") {
      price = Number(input.price);
      if (!Number.isFinite(price) || price < 0) errors.price = "Цена не может быть отрицательной.";
      else if (price > MAX_PRICE) errors.price = "Цена выглядит слишком большой.";
    }
    let priceCurrency = null;
    if (price != null) {
      priceCurrency = String(input.priceCurrency || "KZT");
      if (!currencyCodes().includes(priceCurrency)) errors.price = "Неизвестная валюта цены.";
    }

    if (Object.keys(errors).length) invalid(errors);
    return { name, amount: Math.round(amount * 1000) / 1000, unit, expiry, price, priceCurrency };
  }

  function seedProducts() {
    const today = todayISO();
    const seed = (name, amount, unit, offset, used = false) =>
      sanitizeProduct({ name, amount, unit, expiry: shiftISO(today, offset), used, usedOn: used ? today : null });
    return [
      seed("Молоко", 250, "ml", 2),
      seed("Помидоры", 500, "g", 3),
      seed("Йогурт", 200, "g", 4),
      seed("Сыр", 180, "g", -1),
      seed("Яйца", 10, "pcs", 12, true),
      seed("Огурец", 2, "pcs", 6, true),
    ];
  }

  function classify(product) {
    if (product.used) return "used";
    const days = daysUntil(product.expiry);
    if (days < 0) return "expired";
    if (days <= ALMOST_MAX_DAYS) return "almost";
    if (days <= SOON_MAX_DAYS) return "soon";
    return "fresh";
  }

  function saveProducts(list, journalType, journalText) {
    writeJSON(KEYS.products, list);
    if (journalType) journal.add(journalType, journalText);
    emit("products");
  }

  const products = {
    UNITS,
    classify,
    daysLeft: (product) => daysUntil(product.expiry),
    list() {
      const stored = readJSON(KEYS.products, null);
      if (!Array.isArray(stored)) {
        const seeded = seedProducts();
        writeJSON(KEYS.products, seeded);
        return seeded;
      }
      return stored.map(sanitizeProduct).filter(Boolean);
    },
    get(id) {
      return products.list().find((product) => product.id === id) || null;
    },
    validate: validateProduct,
    create(input) {
      const data = validateProduct(input);
      const list = products.list();
      const product = { id: uid(), used: false, usedOn: null, ...data, createdAt: nowISO(), updatedAt: nowISO() };
      list.push(product);
      saveProducts(list, "product.create", `Добавлен продукт «${product.name}»`);
      return product;
    },
    update(id, input) {
      const data = validateProduct(input);
      const list = products.list();
      const index = list.findIndex((product) => product.id === id);
      if (index < 0) throw new CoreError("Продукт не найден — возможно, его удалили в другой вкладке.", "not_found");
      list[index] = { ...list[index], ...data, updatedAt: nowISO() };
      saveProducts(list, "product.update", `Изменён продукт «${list[index].name}»`);
      return list[index];
    },
    markUsed(id) {
      const list = products.list();
      const product = list.find((entry) => entry.id === id);
      if (!product) throw new CoreError("Продукт не найден.", "not_found");
      if (product.used) return product;
      product.used = true;
      product.usedOn = todayISO();
      product.updatedAt = nowISO();
      recommendations.rememberUse(product);
      saveProducts(list, "product.use", `Использован продукт «${product.name}»`);
      return product;
    },
    remove(id) {
      const list = products.list();
      const product = list.find((entry) => entry.id === id);
      if (!product) throw new CoreError("Продукт не найден.", "not_found");
      saveProducts(list.filter((entry) => entry.id !== id), "product.delete", `Удалён продукт «${product.name}»`);
      return product;
    },
    restore(snapshot) {
      const product = sanitizeProduct(snapshot);
      if (!product) throw new CoreError("Не удалось восстановить продукт.", "validation");
      const list = products.list().filter((entry) => entry.id !== product.id);
      list.push(product);
      saveProducts(list, "product.restore", `Возвращён продукт «${product.name}»`);
      return product;
    },
    importMany(items) {
      if (!Array.isArray(items)) throw new CoreError("Неверный формат файла.", "validation");
      const restored = items.map(sanitizeProduct).filter(Boolean);
      if (!restored.length) throw new CoreError("В файле нет подходящих продуктов.", "validation");
      saveProducts(restored, "product.import", `Загружена копия: ${restored.length} ${plural(restored.length, "продукт", "продукта", "продуктов")}`);
      return { imported: restored.length, skipped: items.length - restored.length };
    },
  };

  /* ---------- recommendations ---------- */

  function loadRecommendations() {
    const saved = readJSON(KEYS.recommendations, {});
    return {
      log: Array.isArray(saved.log) ? saved.log.filter((name) => typeof name === "string") : [],
      manual: Array.isArray(saved.manual) ? saved.manual.filter((item) => item && item.name) : [],
      templates: saved.templates && typeof saved.templates === "object" ? saved.templates : {},
    };
  }

  function templateFrom(product) {
    return {
      name: cleanText(product.name),
      amount: Number(product.amount) || null,
      unit: UNITS[product.unit] ? product.unit : "g",
      price: product.price ?? null,
      priceCurrency: product.priceCurrency ?? null,
    };
  }

  const recommendations = {
    add(entry) {
      const template = templateFrom(entry);
      const key = normalizeKey(template.name);
      if (!key) invalid({ name: "Сначала впишите название продукта." });
      const data = loadRecommendations();
      data.manual = data.manual.filter((item) => normalizeKey(item.name) !== key);
      data.manual.push(template);
      data.templates[key] = template;
      writeJSON(KEYS.recommendations, data);
      journal.add("recommend.add", `«${template.name}» добавлен в частые покупки`);
      emit("products");
      return template;
    },
    rememberUse(product) {
      const template = templateFrom(product);
      if (!template.name) return;
      const data = loadRecommendations();
      data.log = [...data.log, template.name].slice(-300);
      data.templates[normalizeKey(template.name)] = template;
      writeJSON(KEYS.recommendations, data);
    },
    suggestions() {
      const data = loadRecommendations();
      const repeated = new Set();
      for (let index = 1; index < data.log.length; index += 1) {
        const current = normalizeKey(data.log[index]);
        if (current && current === normalizeKey(data.log[index - 1])) repeated.add(current);
      }
      const counts = new Map();
      data.log.forEach((name) => {
        const key = normalizeKey(name);
        if (key) counts.set(key, (counts.get(key) || 0) + 1);
      });
      const items = new Map();
      repeated.forEach((key) => {
        items.set(key, { ...(data.templates[key] || { name: key }), key, count: counts.get(key) || 0 });
      });
      data.manual.forEach((item) => {
        const key = normalizeKey(item.name);
        if (!key) return;
        items.set(key, { ...(items.get(key) || {}), ...item, key, count: counts.get(key) || 0 });
      });
      return [...items.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"));
    },
    topUsed(limit = 5) {
      const counts = new Map();
      loadRecommendations().log.forEach((name) => {
        const key = normalizeKey(name);
        if (!key) return;
        const current = counts.get(key) || { name: cleanText(name), count: 0 };
        current.count += 1;
        counts.set(key, current);
      });
      return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit);
    },
  };

  /* ---------- profile ---------- */

  const DEFAULT_NAME = "Алия";

  const profile = {
    get() {
      return {
        name: cleanText(readText(KEYS.name)) || DEFAULT_NAME,
        about: cleanText(readText(KEYS.about)),
      };
    },
    initials(name = profile.get().name) {
      const parts = cleanText(name).split(" ").filter(Boolean);
      return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toLocaleUpperCase("ru") || "?";
    },
    update(input) {
      const current = profile.get();
      const name = input.name === undefined ? current.name : cleanText(input.name);
      const about = input.about === undefined ? current.about : cleanText(input.about);
      const errors = {};
      const nameError = moderate(name, { min: 1, max: 40, label: "Имя", strict: false });
      if (nameError) errors.name = nameError;
      const aboutError = about ? moderate(about, { max: 180, label: "О себе" }) : "";
      if (aboutError) errors.about = aboutError;
      else if (about && about.split(" ").length > 15) errors.about = "Описание должно быть не длиннее 15 слов.";
      if (Object.keys(errors).length) invalid(errors);
      writeRaw(KEYS.name, name);
      writeRaw(KEYS.about, about);
      if (name !== current.name || about !== current.about) {
        journal.add("profile.update", name !== current.name ? `Имя изменено на «${name}»` : "Обновлено описание профиля");
      }
      emit("profile");
      return { name, about };
    },
  };

  /* ---------- reviews ---------- */

  const REVIEW_SEEDS = [
    { id: "dina", author: "Дина", about: "Следит за молочным", stars: 5, daysAgo: 2, likes: 4, dislikes: 1,
      months: 2, cooked: 9, tags: ["Сроки", "Молочное"], gaps: ["Напоминания"],
      text: "Пользуюсь два месяца: молоко и творог перестали залёживаться в глубине полки. Один раз забыла внести покупку, но сроки всё равно видно сразу. Не хватает только напоминания в телефоне." },
    { id: "erlan", author: "Ерлан", about: "Готовит по вечерам", stars: 4, daysAgo: 5, likes: 3, dislikes: 1,
      months: 3, cooked: 14, tags: ["Рецепты", "Подбор по продуктам"], gaps: ["Больше вариантов из пустого холодильника"],
      text: "Готовлю по вечерам, за три месяца отметил 14 рецептов. Понравилось, что сверху блюда без лишних покупок. Когда холодильник почти пуст, выбор действительно маленький — приходится докупать." },
    { id: "saule", author: "Сауле", about: "Считает расходы на еду", stars: 4, daysAgo: 9, likes: 2, dislikes: 0,
      months: 4, cooked: 21, tags: ["Экономия", "Цены"], gaps: ["Точность цен"],
      text: "Считаю расходы на еду. Сумма в кабинете близка к магазинной, расхождение — рублей 100–150 за неделю. Зато видно, сколько продуктов ушло в готовку, а сколько пропало." },
    { id: "aigerim", author: "Айгерим", about: "Ходит в магазин со списком", stars: 5, daysAgo: 12, likes: 5, dislikes: 1,
      months: 1, cooked: 7, tags: ["Сроки", "Списки"], gaps: [],
      text: "Записываю продукты перед магазином, за месяц стало на треть меньше импульсивных покупок. Сроки видно прямо в списке, поэтому йогурт больше не прячется в глубине полки." },
    { id: "nurlan", author: "Нурлан", about: "Закупается на неделю", stars: 3, daysAgo: 16, likes: 2, dislikes: 2,
      months: 2, cooked: 5, tags: ["Простота"], gaps: ["Напоминания", "Автоматизация"],
      text: "Список простой, разобрался за вечер. Главное неудобство — нет уведомлений: если не зайти самому, про сроки можно забыть. Для полки с молоком хватает, но автоматики не достаёт." },
    { id: "madina", author: "Мадина", about: "Любит завтраки", stars: 5, daysAgo: 21, likes: 3, dislikes: 0,
      months: 5, cooked: 32, tags: ["Рецепты", "Завтраки"], gaps: [],
      text: "Чаще всего готовлю завтраки. Открыла рецепт омлета и сразу увидела, что не хватает только зелени — в магазин за одним пучком идти не пришлось. За пять месяцев отметила 32 приготовления." },
    { id: "timur", author: "Тимур", about: "Живёт один", stars: 2, daysAgo: 27, likes: 1, dislikes: 4,
      months: 1, cooked: 3, tags: [], gaps: ["Напоминания", "Импорт покупок"],
      text: "Живу один и часто забываю вносить покупки. Через неделю список уже не совпадает с полкой, а без напоминаний на телефон приходится всё проверять вручную. Пользы пока меньше, чем ожидал." },
    { id: "gulnara", author: "Гульнара", about: "Готовит на семью", stars: 5, daysAgo: 1, likes: 6, dislikes: 0,
      months: 3, cooked: 18, tags: ["Сроки", "Семья"], gaps: [],
      text: "Готовлю на семью из четырёх человек. Молоко и зелень больше не пропадают: сроки видно сразу, а рецепты подсказывают, что использовать первым. За три месяца выбросила заметно меньше еды." },
    { id: "asel", author: "Асель", about: "Ищет блюда из того, что есть", stars: 5, daysAgo: 4, likes: 4, dislikes: 1,
      months: 2, cooked: 11, tags: ["Поиск рецептов", "Вкус и тип блюда"], gaps: [],
      text: "Нравится выбирать вкус и тип блюда: ищу «острое» и «суп» — получаю именно супы, а не всё подряд. Сверху те рецепты, где докупить почти нечего. За два месяца — 11 новых блюд." },
    { id: "ivan", author: "Иван", about: "Не любит выбрасывать еду", stars: 5, daysAgo: 7, likes: 3, dislikes: 0,
      months: 6, cooked: 27, tags: ["Рецепты", "Сроки"], gaps: [],
      text: "За полгода выбросил почти вдвое меньше продуктов. Отдельное спасибо за блок «Вот-вот» — он честно показывает, что нужно съесть в ближайшие два дня." },
    { id: "zhanar", author: "Жанар", about: "Контролирует траты", stars: 5, daysAgo: 14, likes: 2, dislikes: 1,
      months: 4, cooked: 16, tags: ["Экономия", "Кабинет"], gaps: [],
      text: "В кабинете видно, сколько денег ушло в готовку, а сколько в мусор. Цифры отрезвляют: за месяц сэкономила около 1 640 ₸ и стала покупать аккуратнее." },
    { id: "sergey", author: "Сергей", about: "Готовит по выходным", stars: 5, daysAgo: 24, likes: 1, dislikes: 2,
      months: 8, cooked: 24, tags: ["Интерфейс", "Рецепты"], gaps: [],
      text: "Пользуюсь по выходным, когда разбираю холодильник. Интерфейс не перегружен: продукты, сроки и рецепты находятся с первого взгляда. За восемь месяцев — 24 приготовленных блюда." },
  ];

  function wilson(up, down) {
    const total = up + down;
    if (!total) return 0;
    const z = 1.96;
    const phat = up / total;
    return (phat + (z * z) / (2 * total) - z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * total)) / total)) / (1 + (z * z) / total);
  }

  function loadMine() {
    const saved = readJSON(KEYS.review, null);
    if (!saved || typeof saved.text !== "string" || !saved.text) return null;
    const stars = Math.min(5, Math.max(1, Math.round(Number(saved.stars) || 0)));
    return { ...saved, stars };
  }

  function loadVotes() {
    const saved = readJSON(KEYS.votes, {});
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  }

  function loadBlocked() {
    const saved = readJSON(KEYS.blocked, []);
    return new Set(Array.isArray(saved) ? saved : []);
  }

  const reviews = {
    mine: loadMine,
    saveMine(input) {
      const errors = {};
      const stars = Number(input.stars);
      if (!Number.isInteger(stars) || stars < 1 || stars > 5) errors.stars = "Поставьте оценку от 1 до 5.";
      const text = cleanText(input.text);
      const textError = moderate(text, { min: 10, max: 400, label: "Отзыв" });
      if (textError) errors.text = textError;
      if (Object.keys(errors).length) invalid(errors);
      const current = loadMine();
      if (current && current.text === text && current.stars === stars) return { review: current, changed: false, created: false };
      const review = current
        ? { ...current, text, stars, updatedAt: nowISO(), edits: (current.edits || 0) + 1 }
        : { id: "mine", text, stars, createdAt: nowISO(), updatedAt: nowISO(), edits: 0 };
      writeJSON(KEYS.review, review);
      journal.add(current ? "review.update" : "review.create", current ? "Отзыв изменён" : `Опубликован отзыв на ${stars} ${plural(stars, "звезду", "звезды", "звёзд")}`);
      emit("reviews");
      return { review, changed: true, created: !current };
    },
    removeMine() {
      if (!loadMine()) return false;
      remove(KEYS.review);
      journal.add("review.delete", "Отзыв удалён");
      emit("reviews");
      return true;
    },
    vote(id, kind) {
      if (!REVIEW_SEEDS.some((review) => review.id === id)) throw new CoreError("Отзыв не найден.", "not_found");
      if (kind !== "like" && kind !== "dislike") throw new CoreError("Неизвестный голос.", "validation");
      const votes = loadVotes();
      votes[id] = votes[id] === kind ? undefined : kind;
      if (!votes[id]) delete votes[id];
      writeJSON(KEYS.votes, votes);
      emit("reviews");
      return votes[id] || "";
    },
    setHidden(id, hidden) {
      const blocked = loadBlocked();
      if (hidden) blocked.add(id);
      else blocked.delete(id);
      writeJSON(KEYS.blocked, [...blocked]);
      emit("reviews");
    },
    list({ sort = "new", stars = 0 } = {}) {
      const votes = loadVotes();
      const blocked = loadBlocked();
      const now = Date.now();
      const all = REVIEW_SEEDS.map((seed) => {
        const myVote = votes[seed.id] || "";
        const likes = seed.likes + (myVote === "like" ? 1 : 0);
        const dislikes = seed.dislikes + (myVote === "dislike" ? 1 : 0);
        return {
          id: seed.id,
          author: seed.author,
          about: seed.about,
          stars: seed.stars,
          text: seed.text,
          months: seed.months || 0,
          cooked: seed.cooked || 0,
          tags: seed.tags || [],
          gaps: seed.gaps || [],
          createdAt: new Date(now - seed.daysAgo * 86400000).toISOString(),
          likes,
          dislikes,
          myVote,
          score: wilson(likes, dislikes),
          own: false,
          hidden: blocked.has(seed.id),
        };
      });
      const mine = loadMine();
      const me = profile.get();
      const own = mine
        ? {
            id: "mine",
            author: me.name,
            about: me.about,
            stars: mine.stars,
            text: mine.text,
            createdAt: mine.createdAt || nowISO(),
            edited: (mine.edits || 0) > 0,
            likes: 0,
            dislikes: 0,
            own: true,
            hidden: false,
          }
        : null;
      const comparators = {
        new: (a, b) => b.createdAt.localeCompare(a.createdAt),
        useful: (a, b) => b.score - a.score || b.likes - a.likes,
        high: (a, b) => b.stars - a.stars || b.createdAt.localeCompare(a.createdAt),
        low: (a, b) => a.stars - b.stars || b.createdAt.localeCompare(a.createdAt),
      };
      const byStars = (review) => !stars || review.stars === stars;
      const visible = all.filter((review) => !review.hidden && byStars(review)).sort(comparators[sort] || comparators.new);
      return {
        own: own && byStars(own) ? own : null,
        visible,
        hidden: all.filter((review) => review.hidden),
      };
    },
    summary() {
      const mine = loadMine();
      const ratings = REVIEW_SEEDS.map((review) => review.stars);
      if (mine) ratings.push(mine.stars);
      const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      ratings.forEach((value) => {
        distribution[value] += 1;
      });
      const count = ratings.length;
      const average = count ? ratings.reduce((sum, value) => sum + value, 0) / count : 0;
      const tally = (field) => {
        const map = new Map();
        REVIEW_SEEDS.forEach((seed) => (seed[field] || []).forEach((label) => map.set(label, (map.get(label) || 0) + 1)));
        return [...map.entries()]
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "ru"));
      };
      return {
        count,
        average: Math.round(average * 10) / 10,
        distribution,
        positiveShare: count ? Math.round((ratings.filter((value) => value >= 4).length / count) * 100) : 0,
        topics: tally("tags"),
        gaps: tally("gaps"),
      };
    },
  };

  /* ---------- recipes ---------- */

  const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

  function loadHistory() {
    const saved = readJSON(KEYS.history, []);
    return (Array.isArray(saved) ? saved : []).filter((entry) => entry && entry.id);
  }

  function loadViews() {
    const saved = readJSON(KEYS.views, []);
    return (Array.isArray(saved) ? saved : []).filter((entry) => entry && entry.id);
  }

  function loadFavorites() {
    const saved = readJSON(KEYS.favorites, {});
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  }

  function loadProgress() {
    const saved = readJSON(KEYS.progress, {});
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  }

  function mealSummary(meal) {
    return {
      id: String(meal.idMeal || meal.id || ""),
      title: meal.strMeal || meal.title || "Рецепт",
      thumb: meal.strMealThumb || meal.thumb || "",
      category: meal.strCategory || meal.category || "",
      area: meal.strArea || meal.area || "",
    };
  }

  function titleHit(title, query) {
    const value = normalizeKey(query);
    if (!value) return true;
    const name = String(title || "").toLowerCase();
    if (name.includes(value)) return true;
    const english = window.FridgeMatch ? window.FridgeMatch.toEnglishQuery(value) : "";
    return Boolean(english && name.includes(english));
  }

  const recipes = {
    history: loadHistory,
    views() {
      return loadViews();
    },
    visit(meal) {
      const summary = mealSummary(meal);
      if (!summary.id) return;
      const views = loadViews().filter((entry) => entry.id !== summary.id);
      views.unshift({ ...summary, at: nowISO() });
      writeJSON(KEYS.views, views.slice(0, 200));
      emit("recipes");
    },
    markCooked(meal) {
      const summary = mealSummary(meal);
      if (!summary.id) throw new CoreError("У рецепта нет идентификатора.", "validation");
      const history = loadHistory();
      const last = [...history].reverse().find((entry) => entry.id === summary.id);
      if (last && Date.now() - new Date(last.at).getTime() < DUPLICATE_WINDOW_MS) {
        return { duplicate: true, count: history.filter((entry) => entry.id === summary.id).length };
      }
      history.push({ ...summary, at: nowISO() });
      writeJSON(KEYS.history, history.slice(-500));
      const uses = readJSON(KEYS.uses, {});
      uses[summary.id] = Number(uses[summary.id] || 0) + 1;
      writeJSON(KEYS.uses, uses);
      journal.add("recipe.cook", `Приготовлено блюдо «${summary.title}»`);
      emit("recipes");
      return { duplicate: false, count: uses[summary.id] };
    },
    groups(query = "") {
      const groups = new Map();
      loadHistory().forEach((entry) => {
        const current = groups.get(entry.id);
        if (!current) {
          groups.set(entry.id, { ...entry, count: 1, firstAt: entry.at });
          return;
        }
        current.count += 1;
        if ((entry.at || "") > (current.at || "")) Object.assign(current, { ...entry, count: current.count, firstAt: current.firstAt });
      });
      return [...groups.values()]
        .filter((recipe) => titleHit(recipe.title, query))
        .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    },
    favorites() {
      return Object.values(loadFavorites()).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    },
    isFavorite(id) {
      return Boolean(loadFavorites()[id]);
    },
    toggleFavorite(meal) {
      const summary = mealSummary(meal);
      if (!summary.id) throw new CoreError("У рецепта нет идентификатора.", "validation");
      const favorites = loadFavorites();
      const next = !favorites[summary.id];
      if (next) {
        if (Object.keys(favorites).length >= 60) throw new CoreError("В избранном уже 60 рецептов. Уберите лишние.", "limit");
        favorites[summary.id] = { ...summary, at: nowISO() };
      } else {
        delete favorites[summary.id];
      }
      writeJSON(KEYS.favorites, favorites);
      journal.add(next ? "recipe.favorite" : "recipe.unfavorite", next ? `«${summary.title}» в избранном` : `«${summary.title}» убран из избранного`);
      emit("recipes");
      return next;
    },
    progress(id) {
      const entry = loadProgress()[id];
      return {
        ingredients: Array.isArray(entry?.ingredients) ? entry.ingredients : [],
        steps: Array.isArray(entry?.steps) ? entry.steps : [],
      };
    },
    toggleProgress(id, kind, index) {
      if (kind !== "ingredients" && kind !== "steps") throw new CoreError("Неизвестный раздел.", "validation");
      const all = loadProgress();
      const entry = { ...recipes.progress(id) };
      const set = new Set(entry[kind]);
      if (set.has(index)) set.delete(index);
      else set.add(index);
      entry[kind] = [...set].sort((a, b) => a - b);
      all[id] = { ...entry, at: nowISO() };
      const trimmed = Object.fromEntries(
        Object.entries(all)
          .sort(([, a], [, b]) => (b.at || "").localeCompare(a.at || ""))
          .slice(0, 30),
      );
      writeJSON(KEYS.progress, trimmed);
      return entry;
    },
    resetProgress(id) {
      const all = loadProgress();
      delete all[id];
      writeJSON(KEYS.progress, all);
    },
    searches() {
      const saved = readJSON(KEYS.searches, []);
      return (Array.isArray(saved) ? saved : []).filter((entry) => entry && entry.signature);
    },
    saveSearch({ wish = "", tastes = [], dishes = [] }) {
      const entry = { wish: cleanText(wish).slice(0, 200), tastes: [...tastes].sort(), dishes: [...dishes].sort() };
      entry.signature = JSON.stringify([normalizeKey(entry.wish), entry.tastes, entry.dishes]);
      if (!entry.wish && !entry.tastes.length && !entry.dishes.length) return;
      const list = recipes.searches().filter((item) => item.signature !== entry.signature);
      list.unshift({ ...entry, at: nowISO() });
      writeJSON(KEYS.searches, list.slice(0, 5));
      emit("recipes");
    },
    clearSearches() {
      remove(KEYS.searches);
      emit("recipes");
    },
    stats() {
      const history = loadHistory();
      const counter = (field) => {
        const counts = new Map();
        history.forEach((entry) => {
          if (entry[field]) counts.set(entry[field], (counts.get(entry[field]) || 0) + 1);
        });
        return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      };
      return {
        cooked: history.length,
        unique: new Set(history.map((entry) => entry.id)).size,
        favorites: Object.keys(loadFavorites()).length,
        topCategory: counter("category"),
        topArea: counter("area"),
      };
    },
  };

  /* ---------- stats & achievements ---------- */

  function pricesApi() {
    return typeof FridgePrices !== "undefined" ? FridgePrices : null;
  }

  function moneyRows(list, currency) {
    const prices = pricesApi();
    if (!prices) return [];
    return list
      .map((product) => {
        const money = prices.moneyIn(product, currency);
        return money ? { product, ...money } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.amount - a.amount);
  }

  const LEVELS = [
    { at: 0, title: "Новичок" },
    { at: 60, title: "Хранитель полки" },
    { at: 150, title: "Знаток сроков" },
    { at: 280, title: "Домашний повар" },
    { at: 450, title: "Мастер без отходов" },
    { at: 700, title: "Легенда холодильника" },
  ];

  const stats = {
    overview(currency = pricesApi()?.currentCurrency() || "KZT") {
      const list = products.list();
      const groups = { fresh: [], soon: [], almost: [], expired: [], used: [] };
      list.forEach((product) => groups[classify(product)].push(product));
      const savedRows = moneyRows(groups.used, currency);
      const lostRows = moneyRows(groups.expired, currency);
      const sum = (rows) => rows.reduce((total, row) => total + row.amount, 0);
      const finished = groups.used.length + groups.expired.length;
      const lastWaste = groups.expired.map((product) => product.expiry).sort().pop();
      const firstAdded = list.map((product) => String(product.createdAt || "").slice(0, 10)).filter(isISODate).sort()[0];
      const cleanFrom = lastWaste || firstAdded;
      return {
        currency,
        total: list.length,
        active: list.length - groups.used.length,
        counts: Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, value.length])),
        groups,
        savedRows,
        lostRows,
        saved: sum(savedRows),
        lost: sum(lostRows),
        useRate: finished ? Math.round((groups.used.length / finished) * 100) : 0,
        daysClean: cleanFrom ? Math.max(0, -daysUntil(cleanFrom)) : 0,
      };
    },
    daily(days = 14) {
      const list = products.list();
      const today = todayISO();
      return Array.from({ length: days }, (_, index) => {
        const day = shiftISO(today, index - days + 1);
        return {
          day,
          used: list.filter((product) => product.used && product.usedOn === day).length,
          expired: list.filter((product) => !product.used && product.expiry === day && daysUntil(day) < 0).length,
        };
      });
    },
    achievements() {
      const overview = stats.overview("KZT");
      const recipeStats = recipes.stats();
      const used = overview.counts.used;
      const expired = overview.counts.expired;
      const make = (id, icon, title, description, current, target) => ({
        id,
        icon,
        title,
        description,
        current: Math.min(current, target),
        target,
        progress: Math.min(1, current / target),
        unlocked: current >= target,
      });
      return [
        make("first-use", "check", "Первый шаг", "Отметьте первый продукт как использованный", used, 1),
        make("ten-used", "leaf", "Хозяйственный", "Используйте 10 продуктов", used, 10),
        make("zero-waste", "shield", "Ноль отходов", "5 использованных и ни одного просроченного", expired ? 0 : used, 5),
        make("first-cook", "pot", "Первое блюдо", "Приготовьте блюдо по рецепту", recipeStats.cooked, 1),
        make("chef", "chef", "Шеф", "Приготовьте 5 разных рецептов", recipeStats.unique, 5),
        make("collector", "heart", "Коллекционер", "Добавьте 3 рецепта в избранное", recipeStats.favorites, 3),
        make("critic", "pen", "Критик", "Оставьте отзыв о FridgeFlow", loadMine() ? 1 : 0, 1),
        make("saver", "coin", "Экономист", "Сэкономьте 10 000 KZT", Math.round(overview.saved), 10000),
      ];
    },
    level() {
      const overview = stats.overview("KZT");
      const recipeStats = recipes.stats();
      const unlocked = stats.achievements().filter((item) => item.unlocked).length;
      const xp = overview.counts.used * 10 + recipeStats.cooked * 15 + (loadMine() ? 20 : 0) + unlocked * 25;
      let index = 0;
      LEVELS.forEach((level, levelIndex) => {
        if (xp >= level.at) index = levelIndex;
      });
      const next = LEVELS[index + 1];
      return {
        level: index + 1,
        title: LEVELS[index].title,
        xp,
        nextAt: next ? next.at : null,
        progress: next ? (xp - LEVELS[index].at) / (next.at - LEVELS[index].at) : 1,
      };
    },
  };

  /* ---------- backup ---------- */

  const BACKUP_KEYS = Object.values(KEYS).filter((key) => key !== KEYS.meta && key !== KEYS.mealCache);

  const backup = {
    export() {
      const data = {};
      BACKUP_KEYS.forEach((key) => {
        if (TEXT_KEYS.has(key)) {
          const value = readText(key, null);
          if (value != null) data[key] = value;
        } else {
          const value = readJSON(key, undefined);
          if (value !== undefined) data[key] = value;
        }
      });
      return { app: "FridgeFlow", schemaVersion: SCHEMA_VERSION, exportedAt: nowISO(), data };
    },
    import(payload) {
      if (!payload || payload.app !== "FridgeFlow" || !payload.data || typeof payload.data !== "object") {
        throw new CoreError("Это не резервная копия FridgeFlow.", "validation");
      }
      const version = Number(payload.schemaVersion) || 0;
      if (version > SCHEMA_VERSION) throw new CoreError("Копия создана более новой версией сайта.", "validation");
      const entries = Object.entries(payload.data).filter(([key]) => BACKUP_KEYS.includes(key));
      if (!entries.length) throw new CoreError("В копии нет данных.", "validation");
      BACKUP_KEYS.forEach((key) => remove(key));
      entries.forEach(([key, value]) => {
        if (TEXT_KEYS.has(key)) writeRaw(key, String(value));
        else writeJSON(key, value);
      });
      writeJSON(KEYS.meta, { schemaVersion: version });
      migrate();
      journal.add("backup.import", "Данные восстановлены из резервной копии");
      ALL_TOPICS.forEach((topic) => emit(topic));
      return { keys: entries.length };
    },
    reset() {
      Object.values(KEYS).forEach((key) => remove(key));
      migrate();
      ALL_TOPICS.forEach((topic) => emit(topic));
    },
    usage() {
      let bytes = 0;
      Object.values(KEYS).forEach((key) => {
        const raw = readText(key, "");
        bytes += (key.length + raw.length) * 2;
      });
      return bytes;
    },
  };

  /* ---------- migrations ---------- */

  const MIGRATIONS = {
    1() {
      const stored = readJSON(KEYS.products, null);
      if (Array.isArray(stored)) writeJSON(KEYS.products, stored.map(sanitizeProduct).filter(Boolean));
    },
    2() {
      const mine = readJSON(KEYS.review, null);
      if (mine && mine.text && !mine.createdAt) {
        writeJSON(KEYS.review, { ...mine, createdAt: nowISO(), updatedAt: nowISO(), edits: 0 });
      }
      const history = readJSON(KEYS.history, null);
      if (Array.isArray(history)) {
        writeJSON(KEYS.history, history.filter((entry) => entry && entry.id).map((entry) => ({ ...entry, at: entry.at || nowISO() })));
      }
    },
  };

  function migrate() {
    const meta = readJSON(KEYS.meta, {});
    let version = Number(meta.schemaVersion) || 0;
    if (version >= SCHEMA_VERSION) return;
    while (version < SCHEMA_VERSION) {
      version += 1;
      MIGRATIONS[version]();
    }
    writeJSON(KEYS.meta, { schemaVersion: SCHEMA_VERSION, migratedAt: nowISO() });
  }

  migrate();

  return {
    SCHEMA_VERSION,
    KEYS,
    CoreError,
    storage: { readJSON, writeJSON, readText, writeRaw, remove },
    on,
    emit,
    time: { todayISO, shiftISO, daysUntil, isISODate },
    text: { normalizeKey, cleanText, plural, formatDate, formatRelative },
    moderate,
    journal,
    products,
    recommendations,
    profile,
    reviews,
    recipes,
    stats,
    backup,
  };
})();
