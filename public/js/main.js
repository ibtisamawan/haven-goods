// Progressive enhancements (the site still works without JavaScript)
document.addEventListener('DOMContentLoaded', () => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Quantity +/- buttons
  $$('.stepper').forEach((stepper) => {
    const input = $('input', stepper);
    $$('[data-step]', stepper).forEach((btn) => {
      btn.addEventListener('click', () => {
        const min = Number(input.min || 0);
        const max = Number(input.max) || Infinity;
        input.value = Math.min(max, Math.max(min, Number(input.value || 0) + Number(btn.dataset.step)));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  });

  // Auto-submit sort dropdown and filter checkboxes
  $$('[data-autosubmit]').forEach((el) => el.addEventListener('change', () => el.form.submit()));

  // Confirmation before destructive actions
  $$('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => { if (!window.confirm(form.dataset.confirm)) e.preventDefault(); });
  });

  // Category dropdown: hover works via CSS; click/Enter and Escape for keyboard and touch
  const catMenu = $('.cat-menu');
  if (catMenu) {
    const btn = $('.cat-menu-btn', catMenu);
    const setOpen = (open) => { catMenu.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); };
    btn.addEventListener('click', () => setOpen(!catMenu.classList.contains('open')));
    document.addEventListener('click', (e) => { if (!catMenu.contains(e.target)) setOpen(false); });
    catMenu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setOpen(false); btn.focus(); } });
  }

  // Filters start collapsed on small screens (unless a filter is active)
  const filters = $('#filters');
  if (filters && window.matchMedia('(max-width: 860px)').matches && !$('.chip-count', filters)) {
    filters.open = false;
  }

  // Home page banner carousel (pauses on hover/focus; no autoplay for reduced motion)
  const carousel = $('#carousel');
  if (carousel) {
    const slides = $$('.slide', carousel);
    const dots = $$('.car-dots button', carousel);
    let index = 0;
    let timer = null;
    const show = (i) => {
      index = (i + slides.length) % slides.length;
      slides.forEach((s, k) => {
        const active = k === index;
        s.classList.toggle('active', active);
        // hidden slides must not be read out or reachable with the Tab key
        if (active) { s.removeAttribute('aria-hidden'); s.removeAttribute('tabindex'); } else { s.setAttribute('aria-hidden', 'true'); s.setAttribute('tabindex', '-1'); }
      });
      dots.forEach((d, k) => { d.classList.toggle('active', k === index); if (k === index) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
    };
    const stop = () => { clearInterval(timer); timer = null; };
    const start = () => { if (!reducedMotion && !timer && slides.length > 1) timer = setInterval(() => show(index + 1), 6000); };
    $('.prev', carousel).addEventListener('click', () => show(index - 1));
    $('.next', carousel).addEventListener('click', () => show(index + 1));
    dots.forEach((d, k) => d.addEventListener('click', () => show(k)));
    carousel.addEventListener('mouseenter', stop);
    carousel.addEventListener('mouseleave', start);
    carousel.addEventListener('focusin', stop);
    carousel.addEventListener('focusout', (e) => { if (!carousel.contains(e.relatedTarget)) start(); });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    start();
  }

  // Flash sale countdown to midnight
  const countdown = $('#countdown');
  if (countdown) {
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const now = new Date();
      const end = new Date(now); end.setHours(24, 0, 0, 0);
      const s = Math.max(0, Math.floor((end - now) / 1000));
      $('[data-h]', countdown).textContent = pad(Math.floor(s / 3600));
      $('[data-m]', countdown).textContent = pad(Math.floor((s % 3600) / 60));
      $('[data-s]', countdown).textContent = pad(s % 60);
    };
    tick(); setInterval(tick, 1000);
  }

  // Product image gallery
  const mainImage = $('#main-image');
  if (mainImage) {
    $$('.thumb-btn').forEach((btn) => {
      const activate = () => {
        mainImage.src = btn.dataset.image;
        $$('.thumb-btn').forEach((b) => { b.classList.toggle('active', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
      };
      btn.addEventListener('mouseenter', activate);
      btn.addEventListener('click', activate);
    });
  }

  // Live search suggestions
  const searchInput = $('#search-input');
  const suggest = $('#suggest');
  if (searchInput && suggest) {
    let timer;
    let lastQuery = '';
    let controller = null;
    const money = (n) => `Rs. ${Number(n).toLocaleString('en-US')}`;
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const hide = () => { suggest.hidden = true; searchInput.setAttribute('aria-expanded', 'false'); };
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.setAttribute('aria-controls', 'suggest');
    searchInput.addEventListener('input', () => {
      clearTimeout(timer);
      const q = searchInput.value.trim();
      if (q.length < 2) { hide(); return; }
      timer = setTimeout(async () => {
        if (q === lastQuery) return;
        lastQuery = q;
        if (controller) controller.abort(); // cancel the previous, slower request
        controller = new AbortController();
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const items = await res.json();
          suggest.innerHTML = items.length
            ? items.map((p) => `<a href="/products/${Number(p.id)}" role="option"><img src="${esc(p.image)}" alt="" width="40" height="40"><span>${esc(p.name)}<small>${esc(p.category)}</small></span><b>${money(p.price)}</b></a>`).join('')
              + `<a class="suggest-all" href="/products?q=${encodeURIComponent(q)}">See all results for "${esc(q)}" ›</a>`
            : `<p class="suggest-none">No products found for "${esc(q)}"</p>`;
          suggest.hidden = false;
          searchInput.setAttribute('aria-expanded', 'true');
        } catch (err) {
          if (err.name === 'AbortError') return;
          lastQuery = '';
          hide();
          console.warn('Search suggestions are unavailable:', err.message);
        }
      }, 200);
    });
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) hide(); });
  }

  // Checkout: show the demo payment panel for the selected method
  const checkout = $('#checkout-form');
  if (checkout) {
    const button = $('#place-order');
    const update = () => {
      const method = $('input[name="payment_method"]:checked', checkout).value;
      $$('.pay-demo', checkout).forEach((p) => { p.hidden = p.dataset.for !== method; });
      button.textContent = method === 'COD' ? 'Place Order' : 'Pay Now (demo) & Place Order';
    };
    $$('input[name="payment_method"]', checkout).forEach((r) => r.addEventListener('change', update));
    update();
    checkout.addEventListener('submit', (e) => {
      const method = $('input[name="payment_method"]:checked', checkout).value;
      if (method === 'CARD' && $('#cc-number').value.replace(/\D/g, '').length < 12) {
        e.preventDefault(); window.alert('Please enter a sample card number, e.g. 4242 4242 4242 4242.'); return;
      }
      if (method === 'WALLET' && $('#wallet-no').value.replace(/\D/g, '').length < 10) {
        e.preventDefault(); window.alert('Please enter a wallet account number.'); return;
      }
      // Prevent double orders from a double click
      button.disabled = true;
      button.textContent = 'Placing your order…';
    });
  }
});
