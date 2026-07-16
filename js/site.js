/* ==========================================================================
   BOARDLY — site.js
   Loaded on every page. Handles the three things every page has in
   common: the theme toggle, the mobile menu, and scroll-in animations.
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
  document.querySelectorAll("[data-theme-toggle]").forEach((el) => {
    el.addEventListener("click", () => {
      const now = document.documentElement.classList.contains("dark") ? "light" : "dark";
      setTheme(now);
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

// ---- sticky nav shadow on scroll --------------------------------------------------------
function initNavShadow() {
  const nav = document.getElementById("site-nav");
  if (!nav) return;
  const onScroll = () => nav.classList.toggle("shadow-md", window.scrollY > 8);
  document.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initMobileMenu();
  initScrollReveal();
  initNavShadow();
});
