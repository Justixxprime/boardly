// Field Notes shared behavior, cinematic revision

(function () {
  // register service worker for real installability (top level pages only,
  // registration persists site wide once the browser has seen it)
  if ('serviceWorker' in navigator && !location.pathname.includes('/projects/') && !location.pathname.includes('/notes/')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(() => {});
    });
  }

  // apply saved theme before paint as much as possible
  var saved = localStorage.getItem('fn-theme') || 'dark';
  applyTheme(saved, true);

  function computeIsNight(lat, lon) {
    // simplified solar position estimate, good enough for a day/night proxy
    var now = new Date();
    var dayMs = 86400000;
    var start = new Date(now.getFullYear(), 0, 0);
    var dayOfYear = Math.floor((now - start) / dayMs);
    var decl = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));
    var latRad = lat * Math.PI / 180;
    var declRad = decl * Math.PI / 180;
    var cosHourAngle = -Math.tan(latRad) * Math.tan(declRad);
    cosHourAngle = Math.max(-1, Math.min(1, cosHourAngle));
    var hourAngle = Math.acos(cosHourAngle) * 180 / Math.PI;
    var daylightHours = (2 * hourAngle) / 15;
    var solarNoonUTC = 12 - (lon / 15);
    var sunriseUTC = solarNoonUTC - daylightHours / 2;
    var sunsetUTC = solarNoonUTC + daylightHours / 2;
    var utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
    return !(utcHour > sunriseUTC && utcHour < sunsetUTC);
  }

  function resolveAutoLocal(cb) {
    if (!navigator.geolocation) {
      var hr = new Date().getHours();
      cb(hr < 6 || hr >= 19);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        cb(computeIsNight(pos.coords.latitude, pos.coords.longitude));
      },
      function () {
        var hr = new Date().getHours();
        cb(hr < 6 || hr >= 19);
      },
      { timeout: 3000 }
    );
  }

  function applyTheme(mode, initial) {
    document.documentElement.setAttribute('data-fn-mode', mode);
    if (mode === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (mode === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else if (mode === 'device') {
      var prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      document.documentElement.setAttribute('data-theme', prefersLight ? 'light' : 'dark');
    } else if (mode === 'local') {
      resolveAutoLocal(function (isNight) {
        document.documentElement.setAttribute('data-theme', isNight ? 'dark' : 'light');
      });
    }
    localStorage.setItem('fn-theme', mode);
    if (!initial) updateThemeButtons(mode);
  }

  function updateThemeButtons(mode) {
    document.querySelectorAll('[data-theme-set]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-theme-set') === mode);
    });
  }

  window.fnSetTheme = applyTheme;

  document.addEventListener('DOMContentLoaded', () => {
    updateThemeButtons(saved);

    document.querySelectorAll('[data-theme-set]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyTheme(btn.getAttribute('data-theme-set'), false);
      });
    });

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
        if (localStorage.getItem('fn-theme') === 'device') applyTheme('device', true);
      });
    }

    // page reveal
    document.body.classList.add('pre-reveal');
    requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('pre-reveal')));

    // mobile menu
    const openBtn = document.querySelector('[data-menu-open]');
    const closeBtn = document.querySelector('[data-menu-close]');
    const menu = document.getElementById('mobileMenu');
    function openMobileMenu() {
      menu.classList.add('open');
      document.body.style.overflow = 'hidden';
      if (closeBtn) closeBtn.focus();
    }
    function closeMobileMenu() {
      menu.classList.remove('open');
      document.body.style.overflow = '';
      if (openBtn) openBtn.focus();
    }
    if (openBtn && menu) openBtn.addEventListener('click', openMobileMenu);
    if (closeBtn && menu) closeBtn.addEventListener('click', closeMobileMenu);
    if (menu) {
      menu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMobileMenu));
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && menu.classList.contains('open')) closeMobileMenu();
      });
    }

    // scroll progress bar
    const bar = document.getElementById('scrollProgress');
    if (bar) {
      const update = () => {
        const h = document.documentElement;
        const scrolled = h.scrollTop;
        const height = h.scrollHeight - h.clientHeight;
        bar.style.width = height > 0 ? (scrolled / height * 100) + '%' : '0%';
      };
      document.addEventListener('scroll', update, { passive: true });
      update();
    }

    // work index accordion
    document.querySelectorAll('[data-work-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.work-item');
        const wasOpen = item.classList.contains('open');
        item.parentElement.querySelectorAll('.work-item.open').forEach(i => i.classList.remove('open'));
        if (!wasOpen) item.classList.add('open');
      });
    });
    const firstWork = document.querySelector('.work-item');
    if (firstWork) firstWork.classList.add('open');

    // testimonial rotator
    const slides = document.querySelectorAll('.testi-slide');
    const dots = document.querySelectorAll('.testi-dot');
    if (slides.length) {
      let active = 0;
      const show = (i) => {
        slides.forEach((s, idx) => s.classList.toggle('active', idx === i));
        dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
        active = i;
      };
      dots.forEach((d, idx) => d.addEventListener('click', () => show(idx)));
      setInterval(() => {
        if (!document.querySelector('.testi-stage:hover')) show((active + 1) % slides.length);
      }, 7000);
    }

    // work filters (archive page)
    const filterBtns = document.querySelectorAll('[data-filter]');
    if (filterBtns.length) {
      filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          filterBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const cat = btn.getAttribute('data-filter');
          document.querySelectorAll('[data-category]').forEach(item => {
            const show = cat === 'all' || item.getAttribute('data-category').includes(cat);
            item.style.display = show ? '' : 'none';
          });
        });
      });
    }

    // nav dropdown, click to open on touch, hover on desktop (css handles hover)
    document.querySelectorAll('.nav-item-dropdown > a').forEach(trigger => {
      trigger.addEventListener('click', (e) => {
        if (window.matchMedia('(hover: none)').matches) {
          e.preventDefault();
          trigger.closest('.nav-item-dropdown').classList.toggle('open');
        }
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.nav-item-dropdown.open').forEach(d => d.classList.remove('open'));
      }
    });

    // scroll reveal
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });
      document.querySelectorAll('[data-reveal], [data-reveal-clip]').forEach(el => io.observe(el));
    } else {
      document.querySelectorAll('[data-reveal], [data-reveal-clip]').forEach(el => el.classList.add('in-view'));
    }

    // animated stat counters, real numbers counting up once when scrolled into view
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll('.stat-num[data-count]').forEach(el => {
      const target = parseFloat(el.getAttribute('data-count'));
      const suffix = el.getAttribute('data-suffix') || '';
      if (reduceMotion || isNaN(target)) { el.textContent = target + suffix; return; }
      const countObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          countObserver.unobserve(el);
          const duration = 900;
          const start = performance.now();
          function tick(now) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(target * eased);
            el.textContent = current + suffix;
            if (progress < 1) requestAnimationFrame(tick);
            else el.textContent = target + suffix;
          }
          requestAnimationFrame(tick);
        });
      }, { threshold: 0.4 });
      countObserver.observe(el);
    });

    // custom cursor, desktop with hover support only
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const dot = document.createElement('div');
      dot.id = 'cursorDot';
      const ring = document.createElement('div');
      ring.id = 'cursorRing';
      document.body.appendChild(dot);
      document.body.appendChild(ring);
      document.body.classList.add('cursor-ready');

      let mx = 0, my = 0, rx = 0, ry = 0;
      document.addEventListener('mousemove', (e) => {
        mx = e.clientX; my = e.clientY;
        dot.style.left = mx + 'px'; dot.style.top = my + 'px';
      });
      function loop() {
        rx += (mx - rx) * 0.18;
        ry += (my - ry) * 0.18;
        ring.style.left = rx + 'px'; ring.style.top = ry + 'px';
        requestAnimationFrame(loop);
      }
      loop();

      document.querySelectorAll('a, button, [data-magnetic]').forEach(el => {
        el.addEventListener('mouseenter', () => ring.classList.add('hover'));
        el.addEventListener('mouseleave', () => ring.classList.remove('hover'));
      });

      // magnetic buttons
      document.querySelectorAll('[data-magnetic]').forEach(el => {
        el.addEventListener('mousemove', (e) => {
          const r = el.getBoundingClientRect();
          const relX = e.clientX - r.left - r.width / 2;
          const relY = e.clientY - r.top - r.height / 2;
          el.style.transform = `translate(${relX * 0.25}px, ${relY * 0.35}px)`;
        });
        el.addEventListener('mouseleave', () => { el.style.transform = ''; });
      });
    }
  });
  // command palette, Ctrl+K or Cmd+K
  (function () {
    const inProjects = location.pathname.includes('/projects/') || location.pathname.includes('/notes/');
    const p = inProjects ? '../' : '';
    const actions = [
      { label: 'Go home', href: p + 'index.html', icon: 'home' },
      { label: 'View work', href: p + 'work.html', icon: 'grid' },
      { label: 'About', href: p + 'about.html', icon: 'user' },
      { label: 'Experience', href: p + 'experience.html', icon: 'briefcase' },
      { label: 'Skills', href: p + 'skills.html', icon: 'tool' },
      { label: 'Notes', href: p + 'notes.html', icon: 'file' },
      { label: 'Resume', href: p + 'resume.html', icon: 'file' },
      { label: 'Contact', href: p + 'contact.html', icon: 'mail' },
      { label: 'Download CV (PDF)', href: p + 'assets/Obioma_Chibueze_Justice_CV.pdf', icon: 'download', external: true },
      { label: 'Open GitHub', href: 'https://github.com/Justixxprime', icon: 'external', external: true },
      { label: 'Open LinkedIn', href: 'https://www.linkedin.com/in/chibueze-obioma', icon: 'external', external: true },
      { label: 'Boardly case study', href: p + 'projects/boardly.html', icon: 'grid' },
      { label: 'Victorious Concept case study', href: p + 'projects/victorious-concept.html', icon: 'grid' },
      { label: 'Switch to light theme', action: () => window.fnSetTheme('light', false), icon: 'sun' },
      { label: 'Switch to dark theme', action: () => window.fnSetTheme('dark', false), icon: 'moon' },
    ];

    const overlay = document.createElement('div');
    overlay.id = 'cmdkOverlay';
    overlay.innerHTML = `
      <div id="cmdkBox" role="dialog" aria-modal="true" aria-label="Command palette">
        <input id="cmdkInput" type="text" placeholder="Type a command or search" autocomplete="off">
        <div id="cmdkList"></div>
      </div>`;
    document.body.appendChild(overlay);

    const style = document.createElement('style');
    style.textContent = `
      #cmdkOverlay{position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:90; display:none; align-items:flex-start; justify-content:center; padding-top:12vh;}
      #cmdkOverlay.open{display:flex;}
      #cmdkBox{width:min(560px, 90vw); background:var(--ink-raised); border:1px solid var(--line); box-shadow:0 30px 80px rgba(0,0,0,0.4);}
      #cmdkInput{width:100%; background:none; border:none; border-bottom:1px solid var(--line); color:var(--paper); font-family:'Newsreader', serif; font-size:1.05rem; padding:1rem 1.25rem; outline:none;}
      #cmdkList{max-height:50vh; overflow-y:auto; padding:0.5rem;}
      .cmdk-item{padding:0.65rem 0.9rem; font-size:0.92rem; color:var(--ink-soft); cursor:pointer; display:flex; justify-content:space-between;}
      .cmdk-item.active, .cmdk-item:hover{background:var(--line-soft); color:var(--paper);}
      .cmdk-item .k{font-family:'JetBrains Mono', monospace; font-size:0.7rem; color:var(--ink-faint);}
    `;
    document.head.appendChild(style);

    const listEl = overlay.querySelector('#cmdkList');
    const inputEl = overlay.querySelector('#cmdkInput');
    let filtered = actions.slice();
    let activeIndex = 0;

    function render() {
      listEl.innerHTML = '';
      filtered.forEach((a, i) => {
        const row = document.createElement('div');
        row.className = 'cmdk-item' + (i === activeIndex ? ' active' : '');
        row.innerHTML = `<span>${a.label}</span>` + (a.external ? '<span class="k">↗</span>' : '');
        row.addEventListener('click', () => runAction(a));
        listEl.appendChild(row);
      });
    }

    function runAction(a) {
      close();
      if (a.action) { a.action(); return; }
      if (a.external) { window.open(a.href, '_blank', 'noopener'); return; }
      window.location.href = a.href;
    }

    function open() {
      overlay.classList.add('open');
      inputEl.value = '';
      filtered = actions.slice();
      activeIndex = 0;
      render();
      setTimeout(() => inputEl.focus(), 30);
    }
    function close() { overlay.classList.remove('open'); }

    inputEl.addEventListener('input', () => {
      const q = inputEl.value.toLowerCase();
      filtered = actions.filter(a => a.label.toLowerCase().includes(q));
      activeIndex = 0;
      render();
    });

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, filtered.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIndex]) runAction(filtered[activeIndex]); }
      else if (e.key === 'Escape') { close(); }
    });

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        overlay.classList.contains('open') ? close() : open();
      }
    });

    const navStatus = document.querySelector('.nav-status');
    if (navStatus) {
      const hint = document.createElement('button');
      hint.textContent = navStatus.querySelector('.dot') ? 'Search' : 'Search';
      hint.setAttribute('aria-label', 'Open command palette');
      hint.style.cssText = 'background:none; border:1px solid var(--line); color:var(--ink-soft); font-size:0.72rem; padding:0.25rem 0.55rem; cursor:pointer; margin-left:0.75rem; font-family:JetBrains Mono, monospace;';
      hint.addEventListener('click', open);
      navStatus.appendChild(hint);
    }
  })();

})();
