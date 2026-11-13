window.FridgeUI = (() => {
  const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const motion = () => !reducedQuery.matches;
  const TOAST_LIMIT = 4;
  const ICONS = { ok: "✓", warn: "!", error: "✕", info: "i" };

  let region = null;

  function toastRegion() {
    if (region) return region;
    region = document.createElement("div");
    region.className = "toast-region";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.append(region);
    return region;
  }

  function toast(message, { tone = "ok", action = null, duration = 3800 } = {}) {
    const host = toastRegion();
    const node = document.createElement("div");
    node.className = `toast toast-${tone}`;

    const icon = document.createElement("span");
    icon.className = "toast-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = ICONS[tone] || ICONS.info;

    const text = document.createElement("p");
    text.textContent = message;
    node.append(icon, text);

    let timer = 0;
    let closed = false;
    const dismiss = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      node.classList.remove("is-in");
      node.classList.add("is-out");
      setTimeout(() => node.remove(), motion() ? 320 : 0);
    };

    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "toast-action";
      button.textContent = action.label;
      button.addEventListener("click", () => {
        action.run();
        dismiss();
      });
      node.append(button);
    }

    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast-close";
    close.setAttribute("aria-label", "Закрыть уведомление");
    close.textContent = "✕";
    close.addEventListener("click", dismiss);
    node.append(close);

    const progress = document.createElement("span");
    progress.className = "toast-timer";
    progress.style.animationDuration = `${duration}ms`;
    node.append(progress);

    const start = () => {
      timer = setTimeout(dismiss, duration);
    };
    node.addEventListener("pointerenter", () => {
      clearTimeout(timer);
      node.classList.add("is-paused");
    });
    node.addEventListener("pointerleave", () => {
      node.classList.remove("is-paused");
      start();
    });

    host.append(node);
    while (host.children.length > TOAST_LIMIT) host.firstElementChild.remove();
    requestAnimationFrame(() => node.classList.add("is-in"));
    start();
    return dismiss;
  }

  function error(problem) {
    const message = problem && problem.message ? problem.message : "Что-то пошло не так. Попробуйте ещё раз.";
    return toast(message, { tone: "error", duration: 5200 });
  }

  const observer =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              entry.target.classList.add("is-in");
              observer.unobserve(entry.target);
            });
          },
          { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
        )
      : null;

  function reveal(nodes) {
    [...nodes].forEach((node, index) => {
      node.classList.add("reveal");
      node.style.setProperty("--reveal-delay", `${Math.min(index, 6) * 70}ms`);
      if (!observer || !motion()) node.classList.add("is-in");
      else observer.observe(node);
    });
  }

  function stagger(container, selector = ":scope > *") {
    if (!motion()) return;
    [...container.querySelectorAll(selector)].forEach((node, index) => {
      node.style.setProperty("--i", String(Math.min(index, 12)));
      node.classList.remove("enter");
      void node.offsetWidth;
      node.classList.add("enter");
    });
  }

  function countUp(node, value, { format = (number) => String(Math.round(number)), duration = 900 } = {}) {
    const target = Number(value) || 0;
    const from = Number(node.dataset.countValue || 0);
    node.dataset.countValue = String(target);
    cancelAnimationFrame(node._countFrame || 0);
    if (!motion() || from === target) {
      node.textContent = format(target);
      return;
    }
    const begin = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - begin) / duration);
      const eased = 1 - (1 - progress) ** 3;
      node.textContent = format(from + (target - from) * eased);
      if (progress < 1) node._countFrame = requestAnimationFrame(step);
    };
    node._countFrame = requestAnimationFrame(step);
  }

  function burst(node, { count = 16, colors = ["#f5c400", "#7dcea0", "#e59a2f", "#2f7d57", "#ffd84a"] } = {}) {
    if (!motion() || !node) return;
    const rect = node.getBoundingClientRect();
    const layer = document.createElement("div");
    layer.className = "burst-layer";
    layer.style.left = `${rect.left + rect.width / 2}px`;
    layer.style.top = `${rect.top + rect.height / 2}px`;
    for (let index = 0; index < count; index += 1) {
      const piece = document.createElement("span");
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.4;
      const distance = 34 + Math.random() * 46;
      piece.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
      piece.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
      piece.style.setProperty("--spin", `${Math.round(Math.random() * 360)}deg`);
      piece.style.background = colors[index % colors.length];
      layer.append(piece);
    }
    document.body.append(layer);
    setTimeout(() => layer.remove(), 900);
  }

  function tilt(card, strength = 5) {
    if (!finePointer.matches || !motion()) return;
    card.classList.add("is-tiltable");
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.setProperty("--ry", `${(x * strength).toFixed(2)}deg`);
      card.style.setProperty("--rx", `${(-y * strength).toFixed(2)}deg`);
      card.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty("--gy", `${((y + 0.5) * 100).toFixed(1)}%`);
    });
    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
    });
  }

  function replay(node, className) {
    if (!node || !motion()) return;
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
    node.addEventListener("animationend", () => node.classList.remove(className), { once: true });
  }

  function clearFieldErrors(form) {
    form.querySelectorAll(".field-error").forEach((node) => node.remove());
    form.querySelectorAll("[aria-invalid='true']").forEach((node) => node.removeAttribute("aria-invalid"));
  }

  function fieldErrors(form, fields) {
    clearFieldErrors(form);
    let first = null;
    Object.entries(fields || {}).forEach(([name, message]) => {
      const control = form.elements[name];
      const target = control instanceof RadioNodeList ? control[0] : control;
      const anchor = target ? target.closest("label, fieldset") || target : form.querySelector(`[data-field="${name}"]`);
      if (!anchor) return;
      if (target) target.setAttribute("aria-invalid", "true");
      const note = document.createElement("p");
      note.className = "field-error";
      note.textContent = message;
      anchor.after(note);
      if (!first) first = target || anchor;
    });
    replay(form, "is-shaking");
    if (first && typeof first.focus === "function") first.focus({ preventScroll: false });
  }

  function handle(problem, form) {
    if (problem && problem.code === "validation" && form && problem.fields && Object.keys(problem.fields).length) {
      fieldErrors(form, problem.fields);
      return;
    }
    if (problem && problem.name !== "CoreError" && problem.name !== "SourceError") console.error(problem);
    error(problem);
  }

  document.addEventListener("pointerdown", (event) => {
    if (!motion() || event.button !== 0) return;
    const target = event.target.closest(".action, .chip-btn, .ripple");
    if (!target || target.disabled) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.6;
    const ink = document.createElement("span");
    ink.className = "ripple-ink";
    ink.style.width = `${size}px`;
    ink.style.height = `${size}px`;
    ink.style.left = `${event.clientX - rect.left - size / 2}px`;
    ink.style.top = `${event.clientY - rect.top - size / 2}px`;
    target.append(ink);
    ink.addEventListener("animationend", () => ink.remove(), { once: true });
  });

  return { motion, toast, error, handle, reveal, stagger, countUp, burst, tilt, replay, fieldErrors, clearFieldErrors };
})();
