// Progressive enhancements (the site still works without JavaScript)
document.addEventListener('DOMContentLoaded', () => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Quantity +/- buttons
  $$('.stepper').forEach((stepper) => {
    const input = $('input', stepper);
    $$('[data-step]', stepper).forEach((btn) => {
      btn.addEventListener('click', () => {
        const min = Number(input.min || 0);
        const max = Number(input.max) || Infinity;
        input.value = Math.min(max, Math.max(min, Number(input.value || 0) + Number(btn.dataset.step)));
      });
    });
  });

  // Auto-submit sort dropdown and filter checkboxes
  $$('[data-autosubmit]').forEach((el) => el.addEventListener('change', () => el.form.submit()));

  // Confirmation before destructive actions
  $$('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => { if (!confirm(form.dataset.confirm)) e.preventDefault(); });
  });

  // Category dropdown (click for touch screens; hover works via CSS)
  const catMenu = $('.cat-menu');
  if (catMenu) {
    $('.cat-menu-btn', catMenu).addEventListener('click', () => catMenu.classList.toggle('open'));
    document.addEventListener('click', (e) => { if (!catMenu.contains(e.target)) catMenu.classList.remove('open'); });
  }

  // Home page banner carousel
  const carousel = $('#carousel');
  if (carousel) {
    const slides = $$('.slide', carousel);
    const dots = $$('.car-dots button', carousel);
    let index = 0;
    let timer;
    const show = (i) => {
      index = (i + slides.length) % slides.length;
      slides.forEach((s, k) => s.classList.toggle('active', k === index));
      dots.forEach((d, k) => d.classList.toggle('active', k === index));
    };
    const restart = () => { clearInterval(timer); timer = setInterval(() => show(index + 1), 5000); };
    $('.prev', carousel).addEventListener('click', () => { show(index - 1); restart(); });
    $('.next', carousel).addEventListener('click', () => { show(index + 1); restart(); });
    dots.forEach((d, k) => d.addEventListener('click', () => { show(k); restart(); }));
    restart();
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
  $$('.thumb-btn').forEach((btn) => {
    const activate = () => {
      mainImage.src = btn.dataset.image;
      $$('.thumb-btn').forEach((b) => b.classList.toggle('active', b === btn));
    };
    btn.addEventListener('mouseenter', activate);
    btn.addEventListener('click', activate);
  });

  // Live search suggestions
  const searchInput = $('#search-input');
  const suggest = $('#suggest');
  if (searchInput && suggest) {
    let timer;
    const money = (n) => `Rs. ${Number(n).toLocaleString('en-US')}`;
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    searchInput.addEventListener('input', () => {
      clearTimeout(timer);
      const q = searchInput.value.trim();
      if (q.length < 2) { suggest.hidden = true; return; }
      timer = setTimeout(async () => {
        try {
          const items = await (await fetch(`/api/search?q=${encodeURIComponent(q)}`)).json();
          suggest.innerHTML = items.length
            ? items.map((p) => `<a href="/products/${p.id}"><img src="${esc(p.image)}" alt=""><span>${esc(p.name)}<small>${esc(p.category)}</small></span><b>${money(p.price)}</b></a>`).join('')
              + `<a class="suggest-all" href="/products?q=${encodeURIComponent(q)}">See all results for "${esc(q)}" ›</a>`
            : `<p class="suggest-none">No products found for "${esc(q)}"</p>`;
          suggest.hidden = false;
        } catch (e) { suggest.hidden = true; }
      }, 200);
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) suggest.hidden = true; });
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
        e.preventDefault(); alert('Please enter a sample card number, e.g. 4242 4242 4242 4242.');
      }
      if (method === 'WALLET' && $('#wallet-no').value.replace(/\D/g, '').length < 10) {
        e.preventDefault(); alert('Please enter a wallet account number.');
      }
    });
  }
});
