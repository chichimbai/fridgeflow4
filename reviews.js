const Core = window.FridgeCore;
const UI = window.FridgeUI;

const form = document.querySelector("#review-form");
const starPicker = document.querySelector("#star-picker");
const rateHint = document.querySelector("#rate-hint");
const textarea = form.elements.text;
const textCount = document.querySelector("#text-count");
const submitButton = document.querySelector("#review-submit");
const deleteButton = document.querySelector("#review-delete");
const confirmRow = document.querySelector("#review-confirm");
const listNode = document.querySelector("#review-list");
const hiddenDrawer = document.querySelector("#hidden-drawer");
const hiddenList = document.querySelector("#hidden-list");

const LABELS = { 1: "Плохо", 2: "Так себе", 3: "Нормально", 4: "Хорошо", 5: "Отлично" };

let rating = 0;
let sort = "new";
let filter = 0;
let suppress = false;

init();

function init() {
  buildStars();
  prefill();

  textarea.addEventListener("input", () => {
    textCount.textContent = `${textarea.value.length} / 400`;
    clearError("text");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    save();
  });

  deleteButton.addEventListener("click", () => {
    confirmRow.hidden = false;
    deleteButton.hidden = true;
    confirmRow.querySelector("button").focus();
  });

  document.querySelector("#review-delete-no").addEventListener("click", () => {
    confirmRow.hidden = true;
    deleteButton.hidden = false;
  });

  document.querySelector("#review-delete-yes").addEventListener("click", remove);

  document.querySelectorAll(".seg-btn").forEach((button) => {
    button.addEventListener("click", () => {
      sort = button.dataset.sort;
      document.querySelectorAll(".seg-btn").forEach((node) => node.classList.toggle("is-active", node === button));
      renderList();
    });
  });

  document.querySelector("#star-filter").addEventListener("change", (event) => {
    filter = Number(event.target.value);
    renderList();
  });

  Core.on("reviews", () => {
    if (suppress) return;
    renderSummary();
    renderList();
    renderHidden();
  });

  renderSummary();
  renderList();
  renderHidden();
  UI.reveal(document.querySelectorAll(".page-hero, .reviews-layout > .panel, .page-shell > .panel:last-child"));
}

/* ---------- star picker ---------- */

function buildStars() {
  for (let value = 1; value <= 5; value += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rate-star";
    button.dataset.value = String(value);
    button.textContent = "★";
    button.setAttribute("aria-label", `${value} — ${LABELS[value]}`);
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("pointerenter", () => paint(value, "preview"));
    button.addEventListener("focus", () => paint(value, "preview"));
    button.addEventListener("pointerleave", () => paint(rating, "value"));
    button.addEventListener("blur", () => paint(rating, "value"));
    button.addEventListener("click", () => {
      rating = value;
      paint(rating, "value");
      clearError("stars");
      UI.replay(button, "chip-pop");
      textarea.focus();
    });
    starPicker.append(button);
  }
}

function paint(value, mode) {
  const stars = starPicker.querySelectorAll(".rate-star");
  stars.forEach((button, index) => {
    button.classList.toggle(mode === "value" ? "is-on" : "is-preview", index < value);
    if (mode === "value") button.classList.remove("is-preview");
  });
  if (mode === "preview") {
    rateHint.innerHTML = value ? `<strong>${value} ★</strong> — ${LABELS[value]}` : rateHintDefault();
    return;
  }
  rateHint.innerHTML = value ? `<strong>${value} ★</strong> — ${LABELS[value]}. Можно изменить.` : rateHintDefault();
}

function rateHintDefault() {
  return "Нажмите на звезду, чтобы поставить оценку.";
}

function clearError(name) {
  const control = form.elements[name];
  const anchor = control ? control.closest("label, fieldset") : form.querySelector(`[data-field="${name}"]`);
  const note = anchor && anchor.nextElementSibling;
  if (note && note.classList.contains("field-error")) note.remove();
}

/* ---------- save / delete ---------- */

function prefill() {
  const mine = Core.reviews.mine();
  if (!mine) return;
  rating = mine.stars;
  textarea.value = mine.text;
  textCount.textContent = `${mine.text.length} / 400`;
  paint(rating, "value");
  submitButton.textContent = "Обновить отзыв";
  deleteButton.hidden = false;
}

function save() {
  try {
    const result = Core.reviews.saveMine({ stars: rating, text: textarea.value });
    if (!result.changed) {
      UI.toast("Отзыв не изменился — всё уже сохранено.", { tone: "info", duration: 2400 });
      return;
    }
    prefill();
    confirmRow.hidden = true;
    deleteButton.hidden = false;
    UI.burst(submitButton, { count: 18 });
    UI.toast(result.created ? "Отзыв опубликован. Спасибо!" : "Отзыв обновлён.", { tone: "ok" });
  } catch (problem) {
    UI.handle(problem, form);
  }
}

function remove() {
  if (!Core.reviews.removeMine()) {
    UI.toast("Отзыв уже удалён.", { tone: "info" });
    return;
  }
  form.reset();
  textarea.value = "";
  textCount.textContent = "0 / 400";
  rating = 0;
  paint(0, "value");
  submitButton.textContent = "Опубликовать";
  deleteButton.hidden = true;
  confirmRow.hidden = true;
  UI.clearFieldErrors(form);
  UI.toast("Отзыв удалён.", { tone: "info" });
}

/* ---------- summary ---------- */

function renderSummary() {
  const summary = Core.reviews.summary();
  const mine = Core.reviews.mine();
  const rounded = Math.round(summary.average);

  UI.countUp(document.querySelector("#score-average"), summary.average, {
    format: (value) => value.toFixed(1),
    duration: 700,
  });
  document.querySelector("#score-stars").textContent = "★".repeat(rounded) + "☆".repeat(Math.max(0, 5 - rounded));
  document.querySelector("#score-count").textContent = `${summary.count} ${Core.text.plural(summary.count, "отзыв", "отзыва", "отзывов")}`;

  document.querySelector("#hero-average").textContent = summary.average.toFixed(1);
  document.querySelector("#hero-count").textContent = String(summary.count);
  document.querySelector("#hero-positive").textContent = `${summary.positiveShare}%`;
  document.querySelector("#hero-mine").textContent = mine ? `${mine.stars} ★` : "—";

  const bars = document.querySelector("#rating-bars");
  bars.replaceChildren();
  for (let value = 5; value >= 1; value -= 1) {
    const count = summary.distribution[value] || 0;
    const share = summary.count ? (count / summary.count) * 100 : 0;
    const row = document.createElement("li");
    row.className = "rating-row";
    const label = document.createElement("b");
    label.textContent = `${value} ★`;
    const track = document.createElement("span");
    track.className = "rating-track";
    const fill = document.createElement("span");
    fill.className = "rating-fill";
    track.append(fill);
    const total = document.createElement("span");
    total.textContent = String(count);
    row.append(label, track, total);
    bars.append(row);
    requestAnimationFrame(() => {
      fill.style.width = `${share}%`;
    });
  }

  const chips = document.querySelector("#summary-chips");
  chips.replaceChildren();
  chips.append(chip("4–5 ★", `${summary.positiveShare}%`));
  chips.append(chip("5 ★", String(summary.distribution[5] || 0)));
  chips.append(chip("Ваш отзыв", mine ? "есть" : "нет"));

  renderTopics(summary);
}

function renderTopics(summary) {
  const node = document.querySelector("#topic-summary");
  node.replaceChildren();
  const topics = (summary.topics || []).slice(0, 3);
  const gaps = (summary.gaps || []).slice(0, 2);
  node.hidden = !topics.length && !gaps.length;
  if (node.hidden) return;

  if (topics.length) node.append(topicRow("Чаще хвалят", topics, "is-good"));
  if (gaps.length) node.append(topicRow("Просят доработать", gaps, "is-gap"));
}

function topicRow(label, items, tone) {
  const row = document.createElement("div");
  row.className = `topic-row ${tone}`;
  const caption = document.createElement("span");
  caption.className = "topic-label";
  caption.textContent = label;
  const list = document.createElement("span");
  list.className = "topic-chips";
  items.forEach((item) => {
    const tag = document.createElement("span");
    tag.className = "topic-chip";
    tag.append(document.createTextNode(item.label), Object.assign(document.createElement("b"), { textContent: String(item.value) }));
    list.append(tag);
  });
  row.append(caption, list);
  return row;
}

function chip(label, value) {
  const node = document.createElement("span");
  node.className = "chip";
  node.append(document.createTextNode(label), Object.assign(document.createElement("strong"), { textContent: value }));
  return node;
}

/* ---------- list ---------- */

function renderList() {
  const data = Core.reviews.list({ sort, stars: filter });
  listNode.replaceChildren();
  const cards = [];
  if (data.own) cards.push(reviewCard(data.own, true));
  data.visible.forEach((review) => cards.push(reviewCard(review, false)));
  document.querySelector("#list-count").textContent = String(cards.length);

  if (!cards.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const strong = document.createElement("strong");
    strong.textContent = "Пока пусто";
    const text = document.createElement("p");
    text.textContent = filter
      ? "С такой оценкой отзывов нет. Выберите другую или сбросьте фильтр."
      : "Ни одного отзыва ещё нет — станьте первым.";
    empty.append(strong, text);
    listNode.append(empty);
    return;
  }

  cards.forEach((card, index) => {
    card.style.setProperty("--i", String(Math.min(index, 10)));
    listNode.append(card);
  });
}

function reviewCard(review, own) {
  const card = document.createElement("article");
  card.className = `review-card${own ? " is-own" : ""}`;
  card.dataset.id = review.id;

  const head = document.createElement("div");
  head.className = "review-card-head";
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.textContent = Core.profile.initials(review.author);
  const author = document.createElement("span");
  author.className = "review-author";
  author.append(
    Object.assign(document.createElement("strong"), { textContent: review.author }),
    Object.assign(document.createElement("span"), {
      className: "review-about",
      textContent: review.about || (own ? "Это вы" : "Пользователь FridgeFlow"),
    }),
  );
  const right = document.createElement("div");
  right.className = "review-head-right";
  const stars = document.createElement("p");
  stars.className = "star-line";
  stars.textContent = "★".repeat(review.stars) + "☆".repeat(5 - review.stars);
  stars.setAttribute("aria-label", `Оценка ${review.stars} из 5`);
  right.append(stars);
  if (own) {
    const badge = document.createElement("span");
    badge.className = "own-badge";
    badge.textContent = "Ваш";
    right.append(badge);
  }
  head.append(avatar, author, right);

  const text = document.createElement("p");
  text.className = "review-text";
  text.textContent = review.text;

  const facts = document.createElement("p");
  facts.className = "review-facts";
  if (own) {
    const stats = Core.recipes.stats();
    facts.textContent = stats.cooked
      ? `Вы приготовили ${stats.cooked} ${Core.text.plural(stats.cooked, "рецепт", "рецепта", "рецептов")} · в избранном ${stats.favorites}`
      : "Пока нет приготовленных рецептов — это появится после первой отметки.";
  } else {
    const months = Core.text.plural(review.months, "месяц", "месяца", "месяцев");
    const cooked = Core.text.plural(review.cooked, "рецепт", "рецепта", "рецептов");
    facts.textContent = `С FridgeFlow ${review.months} ${months} · приготовлено ${review.cooked} ${cooked}`;
  }

  const tags = document.createElement("div");
  tags.className = "review-tags";
  if (!own) {
    review.tags.slice(0, 2).forEach((label) => {
      const tag = document.createElement("span");
      tag.className = "review-tag";
      tag.textContent = label;
      tags.append(tag);
    });
    review.gaps.slice(0, 1).forEach((label) => {
      const tag = document.createElement("span");
      tag.className = "review-tag is-gap";
      tag.textContent = `Нужно: ${label}`;
      tags.append(tag);
    });
  }
  tags.hidden = !tags.children.length;

  const foot = document.createElement("div");
  foot.className = "review-foot";
  const date = document.createElement("span");
  date.className = "review-date";
  date.textContent = Core.text.formatRelative(review.createdAt) + (review.edited ? " · изменён" : "");
  const spacer = document.createElement("span");
  spacer.className = "spacer";
  foot.append(date, spacer);

  if (own) {
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "link-quiet";
    edit.textContent = "Изменить";
    edit.addEventListener("click", () => {
      form.scrollIntoView({ behavior: UI.motion() ? "smooth" : "auto", block: "center" });
      textarea.focus({ preventScroll: true });
      UI.replay(form, "chip-pop");
    });
    foot.append(edit);
  } else {
    foot.append(voteButton(card, review, "like"), voteButton(card, review, "dislike"));

    const hide = document.createElement("button");
    hide.type = "button";
    hide.className = "link-quiet";
    hide.textContent = "Скрыть";
    hide.title = "Скрыть отзыв только у себя";
    hide.addEventListener("click", () => {
      card.classList.add("is-leaving");
      setTimeout(() => {
        Core.reviews.setHidden(review.id, true);
        UI.toast("Отзыв скрыт. Его можно вернуть в блоке «Скрытые отзывы».", { tone: "info", duration: 3600 });
      }, UI.motion() ? 220 : 0);
    });
    foot.append(hide);
  }

  card.append(head, text, facts);
  if (!tags.hidden) card.append(tags);
  card.append(foot);
  return card;
}

function voteButton(card, review, kind) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `vote-btn vote-${kind}${review.myVote === kind ? " is-on" : ""}`;
  button.dataset.vote = kind;
  button.setAttribute("aria-pressed", String(review.myVote === kind));
  renderVoteLabel(button, kind, review);
  button.addEventListener("click", () => vote(card, review, kind, button));
  return button;
}

function renderVoteLabel(button, kind, review) {
  const count = kind === "like" ? review.likes : review.dislikes;
  button.textContent = `${kind === "like" ? "▲" : "▼"} ${count}`;
  button.setAttribute("aria-label", `${kind === "like" ? "Полезно" : "Бесполезно"}: ${count}`);
}

function vote(card, review, kind, button) {
  const before = review.myVote;
  let after = "";
  suppress = true;
  try {
    after = Core.reviews.vote(review.id, kind);
  } catch (problem) {
    UI.handle(problem);
    return;
  } finally {
    suppress = false;
  }

  review.likes += (after === "like" ? 1 : 0) - (before === "like" ? 1 : 0);
  review.dislikes += (after === "dislike" ? 1 : 0) - (before === "dislike" ? 1 : 0);
  review.myVote = after;

  card.querySelectorAll(".vote-btn").forEach((node) => {
    const nodeKind = node.dataset.vote;
    node.classList.toggle("is-on", nodeKind === after);
    node.setAttribute("aria-pressed", String(nodeKind === after));
    renderVoteLabel(node, nodeKind, review);
  });
  UI.replay(button, "is-bump");
}

/* ---------- hidden ---------- */

function renderHidden() {
  const data = Core.reviews.list({ sort: "new", stars: 0 });
  const hidden = data.hidden;
  hiddenDrawer.hidden = !hidden.length;
  document.querySelector("#hidden-count").textContent = String(hidden.length);
  hiddenList.replaceChildren();

  hidden.forEach((review) => {
    const row = document.createElement("li");
    row.className = "hidden-row";
    const label = document.createElement("span");
    label.textContent = `${review.author} · ${review.stars} ★`;
    const show = document.createElement("button");
    show.type = "button";
    show.className = "link-quiet";
    show.textContent = "Вернуть";
    show.addEventListener("click", () => {
      Core.reviews.setHidden(review.id, false);
      UI.toast("Отзыв снова в списке.", { tone: "ok", duration: 2200 });
    });
    row.append(label, show);
    hiddenList.append(row);
  });
}
