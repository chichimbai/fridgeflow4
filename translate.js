window.FridgeTranslate = (() => {
  const CACHE_KEY = "fridgeflow.translate.v1";
  const MAX_ENTRIES = 320;
  const TTL_MS = 60 * 24 * 60 * 60 * 1000;
  const GOOGLE = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&q=";
  const MYMEMORY = "https://api.mymemory.translated.net/get";
  const DELIM = " ||| ";
  const CHUNK_CHARS = 1300;
  const CHUNK_LINES = 10;

  const CATEGORIES = {
    Beef: "Говядина", Breakfast: "Завтрак", Chicken: "Курица", Dessert: "Десерт",
    Goat: "Козлятина", Lamb: "Баранина", Miscellaneous: "Разное", Pasta: "Паста",
    Pork: "Свинина", Seafood: "Морепродукты", Side: "Гарнир", Starter: "Закуска",
    Vegan: "Веганское", Vegetarian: "Вегетарианское",
  };

  const AREAS = {
    American: "Американская", British: "Британская", Canadian: "Канадская", Chinese: "Китайская",
    Croatian: "Хорватская", Dutch: "Нидерландская", Egyptian: "Египетская", Filipino: "Филиппинская",
    French: "Французская", Greek: "Греческая", India: "Индийская", Indian: "Индийская", Irish: "Ирландская",
    Italian: "Итальянская", Jamaican: "Ямайская", Japanese: "Японская", Kenyan: "Кенийская",
    Malaysian: "Малайзийская", Mexican: "Мексиканская", Moroccan: "Марокканская", Polish: "Польская",
    Portuguese: "Португальская", Russian: "Русская", Spanish: "Испанская", Thai: "Тайская",
    Tunisian: "Тунисская", Turkish: "Турецкая", Ukrainian: "Украинская", Uruguayan: "Уругвайская",
    Vietnamese: "Вьетнамская", Unknown: "Неизвестная кухня",
  };

  const TAGS = {
    Vegetarian: "Вегетарианское", Vegan: "Веганское", Main: "Основное", Side: "Гарнир",
    Starter: "Закуска", Dessert: "Десерт", Breakfast: "Завтрак", Pasta: "Паста",
    Curry: "Карри", Seafood: "Морепродукты", Beef: "Говядина", Chicken: "Курица",
    Pork: "Свинина", Lamb: "Баранина", Pudding: "Пудинг", Cake: "Торт", Baking: "Выпечка",
    Quick: "Быстрое", Easy: "Простое", Special: "Праздничное", Christmas: "Рождественское",
    Halloween: "Хэллоуин", NewYear: "Новогоднее", ThanksGiving: "День благодарения",
    Eid: "Аль-Фитр", Budget: "Экономное", Bbq: "Барбекю",
  };

  /* Частые ингредиенты TheMealDB: машинный перевод путает Oil с нефтью,
     Butter с маслом для механизмов и т. п. */
  const INGREDIENTS = {
    Oil: "Масло", "Vegetable Oil": "Растительное масло", "Sunflower Oil": "Подсолнечное масло",
    "Olive Oil": "Оливковое масло", "Sesame Oil": "Кунжутное масло", Butter: "Сливочное масло",
    Margarine: "Маргарин", Flour: "Мука", "Plain Flour": "Пшеничная мука",
    "Self-raising Flour": "Мука с разрыхлителем", "Baking Powder": "Разрыхлитель",
    "Baking Soda": "Сода", Yeast: "Дрожжи", Sugar: "Сахар", "Brown Sugar": "Коричневый сахар",
    "Icing Sugar": "Сахарная пудра", "Caster Sugar": "Мелкий сахар", Honey: "Мёд",
    "Maple Syrup": "Кленовый сироп", "Golden Syrup": "Золотой сироп", Salt: "Соль",
    Pepper: "Перец", "Black Pepper": "Чёрный перец", "White Pepper": "Белый перец",
    "Chilli Powder": "Порошок чили", Paprika: "Паприка", Cumin: "Кумин", Turmeric: "Куркума",
    Cinnamon: "Корица", "Nutmeg": "Мускатный орех", Ginger: "Имбирь", Garlic: "Чеснок",
    "Garlic Clove": "Зубчик чеснока", Onion: "Лук", Onions: "Лук", "Red Onion": "Красный лук",
    "Spring Onions": "Зелёный лук", Egg: "Яйцо", Eggs: "Яйца", Milk: "Молоко",
    "Coconut Milk": "Кокосовое молоко", Cream: "Сливки", "Double Cream": "Жирные сливки",
    "Sour Cream": "Сметана", Yogurt: "Йогурт", "Greek Yogurt": "Греческий йогурт",
    Cheese: "Сыр", "Cheddar Cheese": "Сыр чеддер", Mozzarella: "Моцарелла",
    Parmesan: "Пармезан", "Feta": "Фета", "Cream Cheese": "Сливочный сыр",
    Chicken: "Курица", "Chicken Breast": "Куриная грудка", "Chicken Thighs": "Куриные бёдра",
    Beef: "Говядина", "Beef Mince": "Говяжий фарш", Pork: "Свинина", "Pork Chops": "Свиные отбивные",
    Lamb: "Баранина", Bacon: "Бекон", Ham: "Ветчина", Sausages: "Колбаски", Turkey: "Индейка",
    Prawns: "Креветки", Shrimp: "Креветки", Salmon: "Лосось", Tuna: "Тунец", Cod: "Треска",
    Rice: "Рис", Pasta: "Макароны", Spaghetti: "Спагетти", Noodles: "Лапша",
    Bread: "Хлеб", Breadcrumbs: "Панировочные сухари", Potato: "Картофель", Potatoes: "Картофель",
    Carrot: "Морковь", Carrots: "Морковь", Tomato: "Помидор", Tomatoes: "Помидоры",
    "Tomato Puree": "Томатное пюре", "Tomato Sauce": "Томатный соус", "Passata": "Томатная паста",
    Cucumber: "Огурец", Lettuce: "Салат", Spinach: "Шпинат", Broccoli: "Брокколи",
    Cauliflower: "Цветная капуста", Celery: "Сельдерей", Mushroom: "Гриб", Mushrooms: "Грибы",
    Peas: "Горошек", "Sweetcorn": "Кукуруза", Beans: "Фасоль", Chickpeas: "Нут",
    Lentils: "Чечевица", Avocado: "Авокадо", Lemon: "Лимон", Lime: "Лайм", Orange: "Апельсин",
    Apple: "Яблоко", Bananas: "Бананы", Banana: "Банан", Strawberries: "Клубника",
    Blueberries: "Черника", Raisins: "Изюм", Almonds: "Миндаль", Peanuts: "Арахис",
    Walnuts: "Грецкие орехи", Parsley: "Петрушка", Coriander: "Кориандр", Basil: "Базилик",
    Thyme: "Тимьян", Rosemary: "Розмарин", "Bay Leaves": "Лавровый лист", Oregano: "Орегано",
    "Soy Sauce": "Соевый соус", Vinegar: "Уксус", "Worcestershire Sauce": "Вустерширский соус",
    Stock: "Бульон", "Chicken Stock": "Куриный бульон", "Vegetable Stock": "Овощной бульон",
    "Beef Stock": "Говяжий бульон", Wine: "Вино", "White Wine": "Белое вино",
    "Red Wine": "Красное вино", Water: "Вода", "Chocolate": "Шоколад",
    "Cocoa Powder": "Какао-порошок", "Vanilla Extract": "Ванильный экстракт",
    "Condensed Milk": "Сгущённое молоко", Tofu: "Тофу", "Cornflour": "Кукурузный крахмал",
  };

  const MEASURES = {
    knob: "небольшой кусочек", stick: "брусок", pinch: "щепотка", handful: "горсть",
    splash: "немного", dash: "щепотка", bunch: "пучок", sprig: "веточка", clove: "зубчик",
    slice: "ломтик", can: "банка", tin: "банка", jar: "банка", bottle: "бутылка",
    packet: "упаковка", package: "упаковка", "to taste": "по вкусу", "for frying": "для жарки",
    "for garnish": "для подачи", "for serving": "для подачи", "as needed": "по необходимости",
    optional: "по желанию", "as required": "по необходимости",
  };

  const memory = new Map();
  let cache = loadCache();
  let queue = [];
  let scheduled = false;

  const LOOKUP = (() => {
    const map = new Map();
    [CATEGORIES, AREAS, TAGS, INGREDIENTS, MEASURES].forEach((dictionary) => {
      Object.entries(dictionary).forEach(([key, value]) => {
        const id = key.toLocaleLowerCase("en");
        if (!map.has(id)) map.set(id, value);
      });
    });
    return map;
  })();

  function dict(text) {
    return LOOKUP.get(text.toLocaleLowerCase("en")) || "";
  }

  function loadCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveCache() {
    const now = Date.now();
    const entries = Object.entries(cache)
      .filter(([, entry]) => entry && now - entry.at < TTL_MS)
      .sort(([, a], [, b]) => b.at - a.at)
      .slice(0, MAX_ENTRIES);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch {
      // Переполненное хранилище не должно ломать страницу.
    }
  }

  function hash(text) {
    let value = 5381;
    for (let index = 0; index < text.length; index += 1) {
      value = ((value << 5) + value + text.charCodeAt(index)) >>> 0;
    }
    return value.toString(36);
  }

  function keyOf(text) {
    return `${text.length}.${hash(text)}`;
  }

  function cached(text) {
    const key = keyOf(text);
    const entry = cache[key];
    if (entry && entry.t === text && Date.now() - entry.at < TTL_MS) {
      memory.set(text, entry.v);
      return entry.v;
    }
    if (memory.has(text)) return memory.get(text);
    return "";
  }

  function remember(text, value) {
    if (!value || value === text) return;
    memory.set(text, value);
    cache[keyOf(text)] = { t: text, v: value, at: Date.now() };
  }

  function clean(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function term(value) {
    const text = clean(value);
    if (!text) return "";
    return dict(text) || text;
  }

  function terms(value) {
    return String(value || "")
      .split(",")
      .map((item) => term(item))
      .filter(Boolean);
  }

  async function google(lines) {
    const query = lines.join(DELIM);
    const response = await fetch(GOOGLE + encodeURIComponent(query));
    if (!response.ok) throw new Error(`translate ${response.status}`);
    const data = await response.json();
    const joined = Array.isArray(data) && Array.isArray(data[0])
      ? data[0].map((segment) => (Array.isArray(segment) ? segment[0] || "" : "")).join("")
      : "";
    if (!joined) throw new Error("translate empty");
    const parts = joined.split(/\s*\|\|\|\s*/);
    if (parts.length !== lines.length) throw new Error("translate split");
    return parts;
  }

  async function mymemory(line) {
    const url = `${MYMEMORY}?q=${encodeURIComponent(line.slice(0, 480))}&langpair=en|ru`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`memory ${response.status}`);
    const data = await response.json();
    const value = data && data.responseData && data.responseData.translatedText;
    if (!value || /MYMEMORY WARNING|INVALID/i.test(value)) throw new Error("memory empty");
    return value;
  }

  function chunk(lines) {
    const groups = [];
    let current = [];
    let size = 0;
    lines.forEach((line) => {
      if (current.length && (current.length >= CHUNK_LINES || size + line.length + DELIM.length > CHUNK_CHARS)) {
        groups.push(current);
        current = [];
        size = 0;
      }
      current.push(line);
      size += line.length + DELIM.length;
    });
    if (current.length) groups.push(current);
    return groups;
  }

  async function translateLines(input) {
    const unique = [...new Set(input.map(clean).filter(Boolean))];
    const missing = unique.filter((text) => !cached(text));
    if (!missing.length) return;

    for (const group of chunk(missing)) {
      let translated = null;
      try {
        translated = await google(group);
      } catch {
        translated = null;
      }

      if (translated) {
        group.forEach((text, index) => remember(text, translated[index]));
        continue;
      }

      await Promise.all(group.map(async (text) => {
        try {
          remember(text, await google([text]).then((parts) => parts[0]));
        } catch {
          try {
            remember(text, await mymemory(text));
          } catch {
            // Оставляем оригинал, если оба источника недоступны.
          }
        }
      }));
    }

    saveCache();
  }

  function translate(text) {
    const value = clean(text);
    if (!value) return Promise.resolve("");
    const hit = cached(value);
    if (hit) return Promise.resolve(hit);
    return translateLines([value]).then(() => cached(value) || value);
  }

  function cap(value) {
    return value ? value.charAt(0).toLocaleUpperCase("ru") + value.slice(1) : value;
  }

  function apply(node, value, attribute, options) {
    if (!node || !node.isConnected) return;
    const text = options && options.capitalize ? cap(value) : value;
    if (attribute) node.setAttribute(attribute, text);
    else node.textContent = text;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(flush, 40);
  }

  function fill(node, text, attribute = "", options = {}) {
    if (!node) return;
    const value = clean(text);
    if (!value) return;
    // Русский текст и готовые словарные значения не нужно отправлять в переводчик.
    if (!/[A-Za-z]/.test(value)) {
      apply(node, value, attribute, options);
      return;
    }
    const known = dict(value);
    if (known) {
      if (node.isConnected) {
        apply(node, known, attribute, options);
        return;
      }
      queue.push({ node, text: value, attribute, options, resolved: known });
      schedule();
      return;
    }
    const hit = cached(value);
    if (hit) {
      if (node.isConnected) {
        apply(node, hit, attribute, options);
        return;
      }
      // Узел ещё не в документе — применим перевод после вставки.
      queue.push({ node, text: value, attribute, options });
      schedule();
      return;
    }
    queue.push({ node, text: value, attribute, options });
    apply(node, value, attribute, options);
    schedule();
  }

  async function flush() {
    const batch = queue;
    queue = [];
    scheduled = false;
    if (!batch.length) return;
    try {
      await translateLines(batch.map((item) => item.text));
    } catch {
      return;
    }
    batch.forEach((item) => {
      const value = item.resolved || cached(item.text);
      if (value) apply(item.node, value, item.attribute, item.options);
    });
  }

  return {
    term,
    terms,
    translate,
    fill,
  };
})();
