/** Instant hover tooltips.
 *
 *  The native `title` attribute only shows after a ~1s browser delay that can't
 *  be tuned. Elements that opt in with `data-tip="…"` get this instead: a single
 *  fixed-position bubble appended to <body> (so it escapes any `overflow:hidden`
 *  ancestor) that appears the moment the pointer or keyboard focus lands.
 *
 *  Call once on boot. Idempotent.
 */

let started = false;

export function initTooltips() {
  if (started || typeof document === "undefined") return;
  started = true;

  const pop = document.createElement("div");
  pop.className = "tip-pop";
  pop.setAttribute("role", "tooltip");
  pop.hidden = true;
  document.body.appendChild(pop);

  let current: Element | null = null;

  const text = (el: Element) => (el.getAttribute("data-tip") ?? "").trim();

  const place = (el: Element) => {
    const r = el.getBoundingClientRect();
    // Measure with the real content already set by show().
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const gap = 8;
    const margin = 6;

    let top = r.top - ph - gap;
    let below = false;
    if (top < margin) {
      top = r.bottom + gap;
      below = true;
    }

    let left = r.left + r.width / 2 - pw / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - pw - margin));

    pop.style.top = `${Math.round(top)}px`;
    pop.style.left = `${Math.round(left)}px`;
    pop.dataset.side = below ? "below" : "above";
  };

  const show = (el: Element) => {
    const t = text(el);
    if (!t) return hide();
    current = el;
    pop.textContent = t;
    pop.hidden = false;
    place(el);
  };

  const hide = () => {
    current = null;
    pop.hidden = true;
  };

  const target = (node: EventTarget | null) =>
    node instanceof Element ? node.closest("[data-tip]") : null;

  document.addEventListener(
    "pointerover",
    (e) => {
      if ((e as PointerEvent).pointerType === "touch") return;
      const el = target(e.target);
      if (el && el !== current) show(el);
    },
    true,
  );

  document.addEventListener(
    "pointerout",
    (e) => {
      const el = target(e.target);
      if (!el || el !== current) return;
      // Ignore moves that stay inside the same tipped element (e.g. onto a
      // child icon) — only hide when the pointer actually leaves it.
      const to = (e as PointerEvent).relatedTarget;
      if (to instanceof Node && el.contains(to)) return;
      hide();
    },
    true,
  );

  document.addEventListener("focusin", (e) => {
    const el = target(e.target);
    if (el) show(el);
  });
  document.addEventListener("focusout", (e) => {
    if (target(e.target) === current) hide();
  });

  // Any interaction or layout shift dismisses it rather than leaving it stranded.
  document.addEventListener("pointerdown", hide, true);
  document.addEventListener("keydown", hide, true);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
}
