/* ==========================================================================
   BOARDLY - site.js
   Loaded on every page. Handles the three things every page has in
   common: the theme toggle, the mobile menu, and scroll-in animations.
   ========================================================================== */

/* ==========================================================================
   BOARDLY - site.js
   Loaded on every page. Handles the three things every page has in
   common: the theme toggle, the mobile menu, and scroll-in animations -
   plus the cinematic layer added afterward (tilt, spotlight, magnetic
   buttons, page transitions, parallax, grain). See GUIDE.md for how
   each piece works.
   ========================================================================== */

// ---- theme (dark/light) ----------------------------------------------
// A tiny inline script in <head> already applied the saved theme before
// paint (so there's no flash). Here we just wire up any toggle switches.
function setTheme(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem("boardly-theme", theme);
  document.querySelectorAll("[data-theme-toggle]").forEach((el) => {
    if (el.type === "checkbox") el.checked = theme === "dark";
  });
}

function initTheme() {
  const current = localStorage.getItem("boardly-theme") || "light";
  setTheme(current);
  let transitionInFlight = false;
  document.querySelectorAll("[data-theme-toggle]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const now = document.documentElement.classList.contains("dark") ? "light" : "dark";
      // A circular reveal expanding from wherever you clicked, instead of
      // an instant flip - if the browser doesn't support View
      // Transitions, or a second click fires before the first finished,
      // this just falls straight through to the plain instant switch, so
      // nothing ever breaks.
      if (
        document.startViewTransition &&
        !transitionInFlight &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        const x = e.clientX, y = e.clientY;
        const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        transitionInFlight = true;
        const transition = document.startViewTransition(() => setTheme(now));
        transition.ready
          .then(() => {
            document.documentElement.animate(
              { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
              { duration: 550, easing: "cubic-bezier(.2,.8,.2,1)", pseudoElement: "::view-transition-new(root)" }
            );
          })
          .catch(() => {});
        transition.finished.finally(() => { transitionInFlight = false; });
      } else {
        setTheme(now);
      }
    });
  });
}

// ---- mobile menu --------------------------------------------------------
function initMobileMenu() {
  const openBtn = document.getElementById("hamburger-btn");
  const menu = document.getElementById("mobile-menu");
  if (!openBtn || !menu) return;

  const close = () => {
    menu.dataset.open = "false";
    openBtn.dataset.open = "false";
    openBtn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  };
  const open = () => {
    menu.dataset.open = "true";
    openBtn.dataset.open = "true";
    openBtn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  };

  openBtn.addEventListener("click", () => {
    const isOpen = menu.dataset.open === "true";
    isOpen ? close() : open();
  });
  menu.querySelectorAll("a, [data-close-menu]").forEach((el) => el.addEventListener("click", close));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}

// ---- scroll reveal --------------------------------------------------------
function initScrollReveal() {
  const items = document.querySelectorAll("[data-reveal]");
  if (!items.length) return;
  if (!("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );
  items.forEach((el) => observer.observe(el));
}

/**
 * A small notification that appears bottom-right and removes itself
 * after 3 seconds. Needs a `<div id="toast-wrap">` somewhere on the
 * page (every page that can show one already has it).
 */
function toast(message, kind = "ok") {
  const wrap = document.getElementById("toast-wrap");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = `toast font-mono text-xs px-3 py-2 rounded shadow border bg-card ${
    kind === "error" ? "border-orange text-orange" : "border-teal text-teal"
  }`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ---- sticky nav shadow on scroll --------------------------------------------------------
function initNavShadow() {
  const nav = document.getElementById("site-nav");
  if (!nav) return;
  const onScroll = () => nav.classList.toggle("shadow-md", window.scrollY > 8);
  document.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ---------------------------------------------------------------------
   3D TILT - a container with class "tilt-wrap" containing one child with
   class "tilt-el" gets a subtle perspective tilt that follows the
   pointer. One delegated listener on `document` covers every tilt-wrap
   on the page, including ones that might get added later.
--------------------------------------------------------------------- */
function initTilt() {
  document.addEventListener("pointermove", (e) => {
    const wrap = e.target?.closest?.(".tilt-wrap");
    if (!wrap) return;
    const el = wrap.querySelector(".tilt-el");
    if (!el) return;
    const maxDeg = parseFloat(wrap.dataset.tiltMax || "8");
    const r = wrap.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--ry", (px * maxDeg * 2).toFixed(2) + "deg");
    el.style.setProperty("--rx", (py * -maxDeg * 2).toFixed(2) + "deg");
  });
  document.addEventListener("pointerout", (e) => {
    const wrap = e.target?.closest?.(".tilt-wrap");
    if (!wrap || wrap.contains(e.relatedTarget)) return;
    const el = wrap.querySelector(".tilt-el");
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  });
}

/* ---------------------------------------------------------------------
   SPOTLIGHT - keeps --mx/--my pointed at the cursor inside any
   .ticket-hover card (the glow itself is pure CSS, this only ever
   updates two numbers).
--------------------------------------------------------------------- */
function initSpotlight() {
  document.addEventListener("pointermove", (e) => {
    const card = e.target?.closest?.(".ticket-hover");
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", (((e.clientX - r.left) / r.width) * 100).toFixed(1) + "%");
    card.style.setProperty("--my", (((e.clientY - r.top) / r.height) * 100).toFixed(1) + "%");
  });
}

/* ---------------------------------------------------------------------
   MAGNETIC BUTTONS
--------------------------------------------------------------------- */
function initMagnetic() {
  document.querySelectorAll(".magnetic").forEach((btn) => {
    btn.addEventListener("pointermove", (e) => {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      btn.style.setProperty("--mx-btn", (x * 0.25).toFixed(1) + "px");
      btn.style.setProperty("--my-btn", (y * 0.25).toFixed(1) + "px");
    });
    btn.addEventListener("pointerleave", () => {
      btn.style.setProperty("--mx-btn", "0px");
      btn.style.setProperty("--my-btn", "0px");
    });
  });
}

/* ---------------------------------------------------------------------
   PARALLAX - the blob decorations drift slightly slower than the page
   scrolls, layered on top of their own idle drift animation via a
   --py custom property the blob-drift keyframes read.
--------------------------------------------------------------------- */
function initParallax() {
  const blobs = document.querySelectorAll(".blob");
  if (!blobs.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let ticking = false;
  const speeds = Array.from(blobs).map((_, i) => 0.05 + (i % 3) * 0.04);
  const update = () => {
    const y = window.scrollY;
    blobs.forEach((b, i) => { b.style.setProperty("--py", (y * speeds[i]).toFixed(1) + "px"); });
    ticking = false;
  };
  document.addEventListener("scroll", () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
}

/* ---------------------------------------------------------------------
   HERO SCROLL-SCRUB - the hero ticket-stack mockup leans back and
   shrinks slightly as you scroll past it.
--------------------------------------------------------------------- */
function initHeroScrub() {
  const el = document.querySelector(".hero-scrub");
  if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let ticking = false;
  const update = () => {
    const r = el.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, -r.top / (r.height * 0.9)));
    el.style.setProperty("--scroll-rx", (progress * -10).toFixed(2) + "deg");
    el.style.setProperty("--scroll-scale", (1 - progress * 0.06).toFixed(3));
    ticking = false;
  };
  document.addEventListener("scroll", () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  update();
}

/* ---------------------------------------------------------------------
   CELEBRATE - a small burst of colored particles at a given element's
   position, for the moment a task actually gets marked done (dashboard.js
   calls this - see toggleComplete and the onAdd handler for the "done"
   column - but this function itself knows nothing about tasks, Supabase,
   or the board's state; it's pure "spawn some divs, animate them,
   remove them," safe to reuse anywhere a small celebration is warranted).
--------------------------------------------------------------------- */
function celebrate(fromEl) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = fromEl.getBoundingClientRect();
  const originX = r.left + r.width / 2;
  const originY = r.top + r.height / 2;
  const colors = ["var(--orange)", "var(--teal)", "var(--violet)", "var(--ink)"];
  const count = 14;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "confetti-piece";
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const distance = 40 + Math.random() * 50;
    p.style.setProperty("--dx", (Math.cos(angle) * distance).toFixed(0) + "px");
    p.style.setProperty("--dy", (Math.sin(angle) * distance - 20).toFixed(0) + "px");
    p.style.setProperty("--rot", (Math.random() * 360).toFixed(0) + "deg");
    p.style.left = originX + "px";
    p.style.top = originY + "px";
    p.style.background = colors[i % colors.length];
    document.body.appendChild(p);
    p.addEventListener("animationend", () => p.remove());
  }
}

/* ---------------------------------------------------------------------
   BACK TO TOP + NAV PROGRESS + GRAIN - injected once, on every page, so
   nothing needs editing in 8 separate HTML files to get them.
--------------------------------------------------------------------- */
// ---- cookie consent banner (dynamically created, shows once until accepted) --------------------
function initCookieBanner() {
  if (localStorage.getItem("boardly-cookies-accepted") === "1") return;

  const bar = document.createElement("div");
  bar.id = "cookie-banner";
  bar.className = "fixed bottom-0 left-0 right-0 z-50 border-t border-line bg-paper";
  bar.innerHTML = `
    <div class="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center gap-3 text-sm text-ink-soft text-center sm:text-left">
      <span class="flex-1"><i class="fa-solid fa-cookie-bite text-orange mr-1.5"></i>Boardly uses local storage and cookies for things like keeping you signed in and remembering your preferences (theme, sort order, and so on). No third-party tracking. <a href="cookies.html" class="text-orange hover:underline">Learn more</a></span>
      <button id="cookie-accept-btn" class="btn-pop shrink-0 bg-orange text-white font-semibold px-5 py-2 rounded-full hover:bg-orange-dark text-sm">Got it</button>
    </div>`;
  document.body.appendChild(bar);

  document.getElementById("cookie-accept-btn").addEventListener("click", () => {
    localStorage.setItem("boardly-cookies-accepted", "1");
    bar.remove();
  });
}

function initBackToTop() {
  const btn = document.createElement("button");
  btn.id = "back-to-top";
  btn.dataset.visible = "false";
  btn.setAttribute("aria-label", "Back to top");
  btn.className = "btn-pop fixed bottom-5 left-5 z-40 h-11 w-11 rounded-full bg-orange text-white flex items-center justify-center shadow-lg";
  btn.innerHTML = '<i class="fa-solid fa-arrow-up text-sm"></i>';
  document.body.appendChild(btn);
  const onScroll = () => { btn.dataset.visible = window.scrollY > 500 ? "true" : "false"; };
  document.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}

function initNavProgress() {
  const bar = document.createElement("div");
  bar.id = "nav-progress";
  document.body.appendChild(bar);
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a[href]");
    if (!link) return;
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("http") || link.target === "_blank") return;
    bar.classList.add("nav-progress-active");
    bar.style.width = "30%";
    requestAnimationFrame(() => { bar.style.width = "75%"; });
  });
  window.addEventListener("pageshow", () => {
    bar.style.width = "100%";
    setTimeout(() => { bar.classList.remove("nav-progress-active"); bar.style.width = "0%"; }, 200);
  });
}

/* ---------------------------------------------------------------------
   KINETIC TEXT - any element with `data-kinetic-text` gets its words
   wrapped in individual spans that fade/blur in with a staggered delay,
   instead of the whole headline just appearing at once. Walks the
   existing DOM instead of using textContent, on purpose: a naive
   "flatten to plain text and re-split" approach would destroy any
   <br> line breaks or colored <span> already inside the headline -
   this recurses through child nodes instead, only touching actual text,
   so existing markup survives untouched.
--------------------------------------------------------------------- */
function splitIntoKineticWords(node, counter) {
  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const parts = child.textContent.split(/(\s+)/).filter((w) => w.length > 0);
      const frag = document.createDocumentFragment();
      parts.forEach((part) => {
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(part));
        } else {
          const span = document.createElement("span");
          span.className = "kinetic-word";
          span.textContent = part;
          span.style.animationDelay = counter.i * 40 + "ms";
          counter.i++;
          frag.appendChild(span);
        }
      });
      node.replaceChild(frag, child);
    } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== "BR") {
      splitIntoKineticWords(child, counter);
    }
  });
}

function initKineticText() {
  document.querySelectorAll("[data-kinetic-text]").forEach((el) => {
    splitIntoKineticWords(el, { i: 0 });
  });
}

/* ---------------------------------------------------------------------
   MESH CANVAS - a small canvas animation behind any hero section: a
   handful of soft radial-gradient blobs drifting on independent slow
   sine/cosine paths, redrawn every frame. This is what gives the "video
   background" feeling without shipping an actual video file - a video
   would need to be recorded, encoded, and hosted, and would look
   identical every time you visit; this is generated live, is a few
   hundred bytes of code instead of a multi-megabyte file, and never
   repeats exactly the same way twice.

   Works on every element with class "mesh-canvas" on the page (there
   can be more than one - e.g. a page with two hero-like sections), each
   running its own independent animation loop.
--------------------------------------------------------------------- */
function initMeshCanvases() {
  const canvases = document.querySelectorAll(".mesh-canvas");
  if (!canvases.length) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const palette = [
    getComputedStyle(document.documentElement).getPropertyValue("--orange").trim() || "#f97316",
    getComputedStyle(document.documentElement).getPropertyValue("--violet").trim() || "#8b5cf6",
    getComputedStyle(document.documentElement).getPropertyValue("--teal").trim() || "#14b8a6",
  ];

  canvases.forEach((canvas, canvasIndex) => {
    const ctx = canvas.getContext("2d");
    const blobs = palette.map((color, i) => ({
      color,
      baseX: 0.2 + i * 0.3,
      baseY: 0.3 + (i % 2) * 0.35,
      speed: 0.00015 + i * 0.00006,
      radiusRatio: 0.28 + i * 0.03,
      phase: i * 2.1 + canvasIndex, // offset each canvas so multiple on one page don't move in lockstep
    }));

    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      blobs.forEach((b) => {
        const x = (b.baseX + Math.sin(t * b.speed + b.phase) * 0.12) * w;
        const y = (b.baseY + Math.cos(t * b.speed * 0.8 + b.phase) * 0.12) * h;
        const r = Math.max(w, h) * b.radiusRatio;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, b.color + "33");
        grad.addColorStop(1, b.color + "00");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      });
    }

    if (reduceMotion) { draw(0); return; }
    function loop(t) { draw(t); requestAnimationFrame(loop); }
    requestAnimationFrame(loop);
  });
}

/* ---------------------------------------------------------------------
   CURSOR TRAIL - a small string of dots that ease toward the cursor,
   each one lagging slightly behind the last (dot 2 chases dot 1, dot 3
   chases dot 2, and so on), which is what gives it a "trail" feel rather
   than dots just teleporting to the pointer position. Desktop only -
   skipped entirely on touch devices, where there's no real cursor to
   trail in the first place.
--------------------------------------------------------------------- */
function initCursorTrail() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (window.matchMedia("(pointer: coarse)").matches) return;
  const count = 5;
  const dots = [];
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "cursor-trail-dot";
    el.style.opacity = (0.5 - i * 0.09).toFixed(2);
    el.style.transform = `translate(-50%,-50%) scale(${(1 - i * 0.15).toFixed(2)})`;
    document.body.appendChild(el);
    dots.push({ el, x: -50, y: -50 });
  }
  let mouseX = -50, mouseY = -50;
  document.addEventListener("pointermove", (e) => { mouseX = e.clientX; mouseY = e.clientY; });
  function loop() {
    let targetX = mouseX, targetY = mouseY;
    dots.forEach((dot) => {
      dot.x += (targetX - dot.x) * 0.3;
      dot.y += (targetY - dot.y) * 0.3;
      dot.el.style.left = dot.x.toFixed(1) + "px";
      dot.el.style.top = dot.y.toFixed(1) + "px";
      targetX = dot.x; targetY = dot.y;
    });
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function initGrain() {
  const grain = document.createElement("div");
  grain.className = "grain-overlay";
  grain.setAttribute("aria-hidden", "true");
  document.body.appendChild(grain);
}

function initDeskLamp() {
  const lamp = document.createElement("div");
  lamp.id = "desk-lamp";
  lamp.setAttribute("aria-hidden", "true");
  document.body.appendChild(lamp);
  document.addEventListener("pointermove", (e) => {
    lamp.style.setProperty("--lamp-x", e.clientX + "px");
    lamp.style.setProperty("--lamp-y", e.clientY + "px");
  });
}

/**
 * A small notification that also shows an "Undo" button. Used for things
 * like deleting a task: the action is delayed until the toast expires
 * (or Undo is clicked), so clicking Undo genuinely reverses it instead
 * of just re-creating a new copy. Needs the same #toast-wrap every page
 * already has for the plain toast() above.
 *
 * @param {string} message
 * @param {object} opts
 * @param {Function} [opts.onUndo] - called if the user clicks Undo
 * @param {Function} [opts.onExpire] - called once the toast times out unactioned
 * @param {number} [opts.duration] - ms before it auto-expires (default 5000)
 */
function toastUndo(message, opts = {}) {
  const { onUndo, onExpire, duration = 5000 } = opts;
  const wrap = document.getElementById("toast-wrap");
  if (!wrap) { onExpire?.(); return; }

  const el = document.createElement("div");
  el.className = "toast font-mono text-xs px-3 py-2 rounded shadow border bg-card border-line text-ink flex items-center gap-3";
  el.innerHTML = `<span>${message}</span><button type="button" class="toast-undo-btn text-orange font-semibold hover:underline">Undo</button>`;
  wrap.appendChild(el);

  let settled = false;
  const finish = (expired) => {
    if (settled) return;
    settled = true;
    el.remove();
    if (expired) onExpire?.();
  };

  const timer = setTimeout(() => finish(true), duration);
  el.querySelector(".toast-undo-btn").addEventListener("click", () => {
    clearTimeout(timer);
    onUndo?.();
    finish(false);
  });
}

/* ---------------------------------------------------------------------
   PWA - registers the service worker (see sw.js) so the app shell works
   offline, and wires up an "Install app" button wherever one exists on
   the page (any element with [data-install-app]). The browser's install
   prompt only fires on its own terms (HTTPS, a valid manifest, some
   engagement) - this just captures that moment so a real page button
   can trigger it, instead of waiting on the browser's own address-bar
   icon.
--------------------------------------------------------------------- */
let deferredInstallPrompt = null;

function initPWA() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    document.querySelectorAll("[data-install-app]").forEach((btn) => btn.classList.remove("hidden"));
  });

  document.querySelectorAll("[data-install-app]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      document.querySelectorAll("[data-install-app]").forEach((b) => b.classList.add("hidden"));
    });
  });

  window.addEventListener("appinstalled", () => {
    document.querySelectorAll("[data-install-app]").forEach((b) => b.classList.add("hidden"));
  });
}

// ---- active-page highlighting (desktop nav, mobile menu, footer - anywhere with a matching link) ----
function initActiveNav() {
  const current = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll('#site-nav a[href]:not(:has(svg)), #mobile-panel a[href], footer a[href]:not(:has(svg))').forEach((a) => {
    const hrefPath = a.getAttribute("href").split("#")[0].split("?")[0];
    if (hrefPath && hrefPath === current) a.classList.add("nav-active");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initMobileMenu();
  initScrollReveal();
  initNavShadow();
  initTilt();
  initSpotlight();
  initMagnetic();
  initParallax();
  initHeroScrub();
  initMeshCanvases();
  initKineticText();
  initBackToTop();
  initNavProgress();
  initGrain();
  initDeskLamp();
  initCursorTrail();
  initPWA();
  initActiveNav();
  initCookieBanner();
});
