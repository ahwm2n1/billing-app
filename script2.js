/* ═══════════════════════════════════════════════════════════════
   MELA STALL MANAGER — script.js  (v2.0 — Full Feature Edition)
   Bugs Fixed: LocalStorage, Modal close, Date filter, Restock,
               Expense chart, Dashboard refresh
   New Features: Calculator, POS, Image Upload, Import JSON/Excel,
                 Sales History, PWA support, Move-to-stock with retail price
═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────
   1. STATE & STORAGE
───────────────────────────────────────────────────────────── */
const KEYS = {
  products:  'mela_products',
  shopping:  'mela_shopping',
  expenses:  'mela_expenses',
  tasks:     'mela_tasks',
  sales:     'mela_sales',
  theme:     'mela_theme',
  page:      'mela_page',
};

const state = {
  products:        [],
  shopping:        [],
  expenses:        [],
  tasks:           [],
  sales:           [],  // NEW: POS sales history
  cart:            [],  // NEW: POS cart (not persisted)
  currentPage:     'dashboard',
  expenseChart:    null,
  confirmCallback: null,
  restockProductId: null,
};

/* Save a specific key to localStorage */
function save(key) {
  try {
    localStorage.setItem(KEYS[key], JSON.stringify(state[key]));
  } catch(e) { console.warn('Storage save error:', e); }
}

/* Load all data from localStorage on startup */
function load() {
  ['products','shopping','expenses','tasks','sales'].forEach(k => {
    try {
      const raw = localStorage.getItem(KEYS[k]);
      if (raw) state[k] = JSON.parse(raw);
    } catch(e) {
      console.warn(`Error loading ${k}:`, e);
      state[k] = [];
    }
  });
}

/* Generate unique ID */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ─────────────────────────────────────────────────────────────
   2. UTILITY HELPERS
───────────────────────────────────────────────────────────── */
function fmtPKR(n) {
  const num = Number(n) || 0;
  return 'PKR ' + num.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}

function nowTime() {
  return new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
}

function isToday(dateStr)  { return dateStr === today(); }
function isPast(dateStr)   { return dateStr && dateStr < today(); }

function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function qs(sel, ctx = document)  { return ctx.querySelector(sel); }
function qsa(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

/* ─────────────────────────────────────────────────────────────
   3. TOAST NOTIFICATIONS
───────────────────────────────────────────────────────────── */
function toast(msg, type = 'success', title = '') {
  const icons  = { success:'fa-circle-check', danger:'fa-circle-xmark', warning:'fa-triangle-exclamation', info:'fa-circle-info' };
  const titles = { success:'Done!', danger:'Error', warning:'Warning', info:'Info' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <span class="toast-icon"><i class="fa-solid ${icons[type]||icons.info}"></i></span>
    <div class="toast-body">
      <div class="toast-title">${escHtml(title || titles[type])}</div>
      <div class="toast-msg">${escHtml(msg)}</div>
    </div>`;
  qs('#toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

/* ─────────────────────────────────────────────────────────────
   4. CONFIRM DIALOG
───────────────────────────────────────────────────────────── */
function confirmDialog(msg, onOk, title = 'Confirm') {
  qs('#confirm-dialog-title').textContent   = title;
  qs('#confirm-dialog-message').textContent = msg;
  state.confirmCallback = onOk;
  qs('#confirm-dialog').showModal();
}

/* ─────────────────────────────────────────────────────────────
   5. MODAL HELPERS (Bug Fix: backdrop click + close buttons)
───────────────────────────────────────────────────────────── */
function openModal(id) {
  const dlg = qs(`#${id}`);
  if (dlg && !dlg.open) dlg.showModal();
}

function closeModal(id) {
  const dlg = qs(`#${id}`);
  if (dlg && dlg.open) dlg.close();
}

/* Close on backdrop click (clicking the <dialog> element itself) */
document.addEventListener('click', e => {
  if (e.target.tagName === 'DIALOG' && e.target.open) {
    e.target.close();
  }
});

/* Close via [data-close-modal] buttons */
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-close-modal]');
  if (btn) closeModal(btn.dataset.closeModal);
});

/* ─────────────────────────────────────────────────────────────
   6. NAVIGATION / PAGE SWITCHING
───────────────────────────────────────────────────────────── */
const PAGE_TITLES = {
  dashboard: 'Dashboard',
  products:  'Product Manager',
  pos:       'POS / Sell',
  shopping:  'Shopping List',
  expenses:  'Expenses & Travel',
  tasks:     'Tasks & Timeline',
  reports:   'Reports & Export',
};

function switchPage(pageId) {
  qsa('.page').forEach(p => p.classList.remove('active'));
  qsa('.nav-link').forEach(l => l.classList.remove('active'));

  const page = qs(`#page-${pageId}`);
  if (page) page.classList.add('active');

  const link = qs(`.nav-link[data-target="${pageId}"]`);
  if (link) link.classList.add('active');

  state.currentPage = pageId;
  localStorage.setItem(KEYS.page, pageId);
  qs('#current-page-title').textContent = PAGE_TITLES[pageId] || pageId;
  document.body.dataset.page = pageId;

  /* Close sidebar on mobile */
  if (window.innerWidth < 1024) {
    qs('#sidebar').classList.remove('open');
    qs('#nav-overlay').classList.remove('visible');
  }

  /* Page-specific rendering */
  if (pageId === 'dashboard') renderDashboard();
  if (pageId === 'products')  renderProducts();
  if (pageId === 'pos')       renderPOS();
  if (pageId === 'shopping')  renderShopping();
  if (pageId === 'expenses')  renderExpenses();
  if (pageId === 'tasks')     renderTasks();
  if (pageId === 'reports')   renderReportPreview();
}

/* Nav link clicks */
document.addEventListener('click', e => {
  const link = e.target.closest('.nav-link[data-target]');
  if (link) { e.preventDefault(); switchPage(link.dataset.target); }

  const panelLink = e.target.closest('.dash-panel-link[data-target]');
  if (panelLink) switchPage(panelLink.dataset.target);

  const trigBtn = e.target.closest('[data-trigger]');
  if (trigBtn) {
    const btn = qs(`#${trigBtn.dataset.trigger}`);
    if (btn) btn.click();
  }
});

/* ─────────────────────────────────────────────────────────────
   7. SIDEBAR & DARK MODE
───────────────────────────────────────────────────────────── */
function initSidebar() {
  const sidebar  = qs('#sidebar');
  const overlay  = qs('#nav-overlay');
  const hamBtn   = qs('#hamburger-btn');
  const closeBtn = qs('#sidebar-close-btn');

  function openSidebar()  { sidebar.classList.add('open');    overlay.classList.add('visible'); }
  function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('visible'); }

  hamBtn.addEventListener('click', openSidebar);
  closeBtn.addEventListener('click', closeSidebar);
  overlay.addEventListener('click', closeSidebar);
}

function initDarkMode() {
  const btn  = qs('#dark-mode-toggle');
  const icon = qs('#theme-icon');
  const saved = localStorage.getItem(KEYS.theme) || 'light';
  applyTheme(saved);

  btn.addEventListener('click', () => {
    const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem(KEYS.theme, next);
  });

  function applyTheme(t) {
    document.body.dataset.theme = t;
    icon.className = t === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }
}

/* ─────────────────────────────────────────────────────────────
   8. CALCULATOR (NEW FEATURE)
───────────────────────────────────────────────────────────── */
function initCalculator() {
  qs('#calculator-btn').addEventListener('click', () => openModal('calculator-modal'));

  let calcExpr    = '';
  let calcDisplay = '0';
  let justCalc    = false;

  function updateCalcDisplay() {
    qs('#calc-display').textContent = calcDisplay || '0';
  }

  qs('.calc-grid').addEventListener('click', e => {
    const btn = e.target.closest('.calc-btn');
    if (!btn) return;
    const val = btn.dataset.calc;

    if (val === 'AC') {
      calcExpr = ''; calcDisplay = '0'; justCalc = false;
      qs('#calc-history').textContent = '';
    } else if (val === '+/-') {
      if (calcDisplay !== '0') calcDisplay = calcDisplay.startsWith('-') ? calcDisplay.slice(1) : '-' + calcDisplay;
    } else if (val === '%') {
      try { calcDisplay = String(parseFloat(calcDisplay) / 100); } catch(e) {}
    } else if (val === '=') {
      try {
        /* Replace display operators with JS operators */
        const expr = calcExpr.replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-');
        const result = Function('"use strict"; return (' + expr + ')')();
        qs('#calc-history').textContent = calcExpr + ' =';
        calcDisplay = String(Math.round(result * 1e10) / 1e10);
        calcExpr = calcDisplay;
        justCalc = true;
      } catch(e) {
        calcDisplay = 'Error'; calcExpr = '';
      }
    } else if (['+', '−', '×', '÷'].includes(val)) {
      if (justCalc) { calcExpr = calcDisplay; justCalc = false; }
      else if (calcExpr && ['+','−','×','÷'].includes(calcExpr.slice(-1))) {
        calcExpr = calcExpr.slice(0, -1);
      }
      calcExpr += val;
      calcDisplay = val;
    } else {
      if (justCalc || calcDisplay === '0' || ['+','−','×','÷'].includes(calcDisplay)) {
        calcDisplay = val; justCalc = false;
      } else if (val === '.' && calcDisplay.includes('.')) {
        /* ignore duplicate dot */
      } else {
        calcDisplay += val;
      }
      if (justCalc) calcExpr = '';
      calcExpr += val;
    }

    updateCalcDisplay();
  });
}

/* ─────────────────────────────────────────────────────────────
   9. DASHBOARD
───────────────────────────────────────────────────────────── */
function calcSummary() {
  const wholesaleCost = state.products.reduce((s, p) => s + (p.wholesalePrice * p.qty), 0);
  const revenue       = state.products.reduce((s, p) => s + (p.retailPrice   * p.qty), 0);
  const totalExpenses = state.expenses.reduce((s, e) => s + e.amount, 0);
  const profit        = revenue - wholesaleCost - totalExpenses;
  const pendingTasks  = state.tasks.filter(t => t.status !== 'Completed').length;
  const lowStock      = state.products.filter(p => p.qty > 0 && p.qty < 3);
  const pendingShop   = state.shopping.filter(s => !s.purchased);

  /* Today's sales */
  const todaySales = state.sales.filter(s => s.date === today());
  const todaySalesTotal  = todaySales.reduce((sum, s) => sum + (s.qty * s.retailPrice), 0);
  const todaySalesProfit = todaySales.reduce((sum, s) => sum + (s.qty * (s.retailPrice - s.wholesalePrice)), 0);

  return { wholesaleCost, revenue, totalExpenses, profit, pendingTasks, lowStock, pendingShop, todaySalesTotal, todaySalesProfit };
}

function renderDashboard() {
  const s = calcSummary();

  qs('#kpi-val-products').textContent     = state.products.length;
  qs('#kpi-val-revenue').textContent      = fmtPKR(s.revenue);
  qs('#kpi-val-cost').textContent         = fmtPKR(s.wholesaleCost);
  qs('#kpi-val-expenses').textContent     = fmtPKR(s.totalExpenses);
  qs('#kpi-val-profit').textContent       = fmtPKR(s.profit);
  qs('#kpi-val-tasks').textContent        = s.pendingTasks;
  qs('#kpi-val-sales').textContent        = fmtPKR(s.todaySalesTotal);
  qs('#kpi-val-today-profit').textContent = fmtPKR(s.todaySalesProfit);

  /* Profit bar */
  const pct = Math.min(100, Math.max(0, s.revenue ? (s.profit / s.revenue) * 100 : 0));
  qs('#kpi-profit-fill').style.width = pct + '%';
  qs('#kpi-profit').style.borderColor = s.profit >= 0 ? 'var(--clr-success)' : 'var(--clr-danger)';

  /* Alerts */
  const alertsRow = qs('#alerts-row');
  alertsRow.innerHTML = '';
  if (s.lowStock.length)
    alertsRow.insertAdjacentHTML('beforeend', `<div class="alert alert-warning"><i class="fa-solid fa-triangle-exclamation"></i> <b>${s.lowStock.length}</b> product(s) ka stock khatam hone wala hai (qty &lt; 3)</div>`);
  if (s.profit < 0)
    alertsRow.insertAdjacentHTML('beforeend', `<div class="alert alert-danger"><i class="fa-solid fa-circle-xmark"></i> Net profit abhi negative hai. Expenses ya wholesale cost check karo.</div>`);
  const overdueT = state.tasks.filter(t => t.status !== 'Completed' && isPast(t.deadlineDate));
  if (overdueT.length)
    alertsRow.insertAdjacentHTML('beforeend', `<div class="alert alert-danger"><i class="fa-solid fa-fire"></i> <b>${overdueT.length}</b> overdue task(s) hain!</div>`);

  /* Low stock list */
  const lsEl = qs('#low-stock-list');
  qs('#low-stock-count').textContent = s.lowStock.length + ' items';
  lsEl.innerHTML = s.lowStock.length
    ? s.lowStock.map(p => `
      <div class="low-stock-item">
        <span class="low-stock-item-name">${escHtml(p.name)}</span>
        <span class="low-stock-item-qty">Qty: ${p.qty}</span>
      </div>`).join('')
    : `<div class="empty-state-small"><i class="fa-solid fa-box-open"></i><span>Sab theek hai!</span></div>`;

  /* Pending shopping */
  const psEl = qs('#pending-shopping-list');
  psEl.innerHTML = s.pendingShop.length
    ? s.pendingShop.slice(0, 5).map(i => `
      <div class="pending-shop-item">
        <span class="pending-shop-name">${escHtml(i.name)}</span>
        <span class="pending-shop-cost">${fmtPKR(i.wholesalePrice * i.qty)}</span>
      </div>`).join('')
    : `<div class="empty-state-small"><i class="fa-solid fa-check-circle"></i><span>Sab khareed liya!</span></div>`;

  /* Today's tasks (Bug Fix: re-renders properly) */
  const todayTasks = state.tasks.filter(t => t.deadlineDate === today() && t.status !== 'Completed');
  const ttEl = qs('#today-tasks-list');
  ttEl.innerHTML = todayTasks.length
    ? todayTasks.slice(0, 5).map(t => `
      <div class="today-task-item">
        <span class="status-badge priority-${t.priority.toLowerCase()}">${t.priority}</span>
        <span class="today-task-name">${escHtml(t.name)}</span>
        <span class="today-task-time">${t.deadlineTime || ''}</span>
      </div>`).join('')
    : `<div class="empty-state-small"><i class="fa-regular fa-calendar-check"></i><span>Aaj ke liye koi task nahi</span></div>`;

  qs('#last-updated').textContent = 'Updated: ' + new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
  updateNavBadges();
}

function updateNavBadges() {
  setNavBadge('products', state.products.filter(p => p.qty < 3 && p.qty > 0).length);
  setNavBadge('shopping', state.shopping.filter(i => !i.purchased).length);
  setNavBadge('tasks',    state.tasks.filter(t => t.status !== 'Completed').length);
}

function setNavBadge(page, count) {
  const el = qs(`#nav-badge-${page}`);
  if (!el) return;
  el.textContent = count > 0 ? count : '';
}

/* Quick Expense from Dashboard */
function initQuickExpense() {
  qs('#quick-expense-form').addEventListener('submit', e => {
    e.preventDefault();
    const cat  = qs('#qe-category').value;
    const amt  = parseFloat(qs('#qe-amount').value);
    const desc = qs('#qe-description').value.trim();
    if (!cat || !amt || amt <= 0) { toast('Category aur amount zaroor bharein', 'warning'); return; }
    state.expenses.push({ id: genId(), category: cat, amount: amt, date: today(), description: desc, receipt: 'no' });
    save('expenses');
    qs('#quick-expense-form').reset();
    renderDashboard();
    toast(`${cat} — ${fmtPKR(amt)} add ho gaya`);
  });

  qs('#quick-expense-btn').addEventListener('click', () => {
    switchPage('dashboard');
    setTimeout(() => qs('#panel-quick-expense').scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  });
}

/* ─────────────────────────────────────────────────────────────
   10. PRODUCTS
───────────────────────────────────────────────────────────── */
function getFilteredProducts() {
  const search = (qs('#product-search')?.value || '').toLowerCase();
  const cat    = qs('#product-category-filter')?.value || '';
  const sort   = qs('#product-sort')?.value || 'name-asc';

  let list = [...state.products];
  if (search) list = list.filter(p => p.name.toLowerCase().includes(search));
  if (cat)    list = list.filter(p => p.category === cat);

  list.sort((a, b) => {
    if (sort === 'name-asc')    return a.name.localeCompare(b.name);
    if (sort === 'price-asc')   return a.wholesalePrice - b.wholesalePrice;
    if (sort === 'price-desc')  return b.wholesalePrice - a.wholesalePrice;
    if (sort === 'qty-asc')     return a.qty - b.qty;
    if (sort === 'qty-desc')    return b.qty - a.qty;
    if (sort === 'profit-desc') return ((b.retailPrice - b.wholesalePrice) * b.qty) - ((a.retailPrice - a.wholesalePrice) * a.qty);
    return 0;
  });
  return list;
}

function renderProducts() {
  const list   = getFilteredProducts();
  const tbody  = qs('#products-tbody');
  const tfoot  = qs('#products-tfoot');
  const empty  = qs('#products-empty-state');
  const wrapper= qs('#products-table-wrapper');

  const totalWholesale = state.products.reduce((s, p) => s + (p.wholesalePrice * p.qty), 0);
  const totalRevenue   = state.products.reduce((s, p) => s + (p.retailPrice   * p.qty), 0);
  const totalProfit    = totalRevenue - totalWholesale;
  const soldOut        = state.products.filter(p => p.qty === 0).length;

  qs('#stat-total-stock-value').textContent = fmtPKR(totalWholesale);
  qs('#stat-potential-revenue').textContent = fmtPKR(totalRevenue);
  qs('#stat-total-profit').textContent      = fmtPKR(totalProfit);
  qs('#stat-sold-out').textContent          = soldOut;

  if (!state.products.length) {
    wrapper.querySelector('table').style.display = 'none';
    empty.hidden = false; tfoot.innerHTML = '';
    return;
  }
  wrapper.querySelector('table').style.display = '';
  empty.hidden = true;

  tbody.innerHTML = list.map(p => {
    const profitPc    = p.retailPrice - p.wholesalePrice;
    const profitTotal = profitPc * p.qty;
    const profitClass = profitPc >= 0 ? 'profit-pos' : 'profit-neg';
    let statusHtml;
    if      (p.qty === 0) statusHtml = `<span class="status-badge status-soldout">Sold Out</span>`;
    else if (p.qty < 3)   statusHtml = `<span class="status-badge status-lowstock">Low Stock</span>`;
    else                  statusHtml = `<span class="status-badge status-instock">In Stock</span>`;

    /* Thumbnail */
    const thumbHtml = p.image
      ? `<img class="product-thumb" src="${p.image}" alt="" />`
      : `<span class="product-thumb-placeholder"><i class="fa-solid fa-box"></i></span>`;

    return `<tr class="${p.qty === 0 ? 'row-soldout' : ''}">
      <td><input type="checkbox" class="product-cb" data-id="${p.id}" /></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          ${thumbHtml}
          <div>
            <b>${escHtml(p.name)}</b>
            ${p.notes ? `<br><small class="text-muted">${escHtml(p.notes)}</small>` : ''}
          </div>
        </div>
      </td>
      <td><span class="cat-pill">${escHtml(p.category || '—')}</span></td>
      <td class="num">${fmtPKR(p.wholesalePrice)}</td>
      <td class="num">${p.qty}</td>
      <td class="num">${fmtPKR(p.retailPrice)}</td>
      <td class="num ${profitClass}">${fmtPKR(profitPc)}</td>
      <td class="num ${profitClass}">${fmtPKR(profitTotal)}</td>
      <td>${statusHtml}</td>
      <td>
        <div class="action-row">
          <button class="btn-action" title="Edit" onclick="openEditProduct('${p.id}')"><i class="fa-solid fa-pen"></i></button>
          ${p.qty === 0
            ? `<button class="btn-action btn-action-restock" title="Restock" onclick="openRestockModal('${p.id}')"><i class="fa-solid fa-plus"></i></button>`
            : `<button class="btn-action btn-action-success" title="Mark Sold Out" onclick="markSoldOut('${p.id}')"><i class="fa-solid fa-ban"></i></button>`}
          <button class="btn-action btn-action-danger" title="Delete" onclick="deleteProduct('${p.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const fWholesale = list.reduce((s, p) => s + (p.wholesalePrice * p.qty), 0);
  const fRevenue   = list.reduce((s, p) => s + (p.retailPrice   * p.qty), 0);
  const fProfit    = fRevenue - fWholesale;
  tfoot.innerHTML = `<tr>
    <td colspan="3"><b>Filtered Total (${list.length} items)</b></td>
    <td class="num"><b>${fmtPKR(fWholesale)}</b></td>
    <td></td>
    <td class="num"><b>${fmtPKR(fRevenue)}</b></td>
    <td></td>
    <td class="num ${fProfit >= 0 ? 'profit-pos' : 'profit-neg'}"><b>${fmtPKR(fProfit)}</b></td>
    <td colspan="2"></td>
  </tr>`;
}

function openAddProduct() {
  qs('#product-modal-title').textContent = 'Add New Product';
  qs('#product-form').reset();
  qs('#product-id-field').value  = '';
  qs('#pf-image-data').value     = '';
  qs('#product-image-preview').style.display = 'none';
  qs('#image-upload-placeholder').style.display = 'flex';
  openModal('product-modal');
}

function openEditProduct(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  qs('#product-modal-title').textContent = 'Edit Product';
  qs('#product-id-field').value  = p.id;
  qs('#pf-name').value           = p.name;
  qs('#pf-category').value       = p.category || 'Toy';
  qs('#pf-wholesale').value      = p.wholesalePrice;
  qs('#pf-qty').value            = p.qty;
  qs('#pf-retail').value         = p.retailPrice;
  qs('#pf-margin').value         = '';
  qs('#pf-notes').value          = p.notes || '';
  /* Image preview */
  qs('#pf-image-data').value = p.image || '';
  if (p.image) {
    qs('#product-image-preview').src = p.image;
    qs('#product-image-preview').style.display = 'block';
    qs('#image-upload-placeholder').style.display = 'none';
  } else {
    qs('#product-image-preview').style.display = 'none';
    qs('#image-upload-placeholder').style.display = 'flex';
  }
  openModal('product-modal');
}

function saveProduct() {
  const id        = qs('#product-id-field').value;
  const name      = qs('#pf-name').value.trim();
  const category  = qs('#pf-category').value;
  const wholesale = parseFloat(qs('#pf-wholesale').value);
  const qty       = parseInt(qs('#pf-qty').value);
  let   retail    = parseFloat(qs('#pf-retail').value);
  const margin    = parseFloat(qs('#pf-margin').value);
  const notes     = qs('#pf-notes').value.trim();
  const image     = qs('#pf-image-data').value || '';

  if (!name)                          { toast('Product ka naam zaroor likhein', 'warning'); return; }
  if (isNaN(wholesale) || wholesale < 0) { toast('Wholesale price sahi bharein', 'warning'); return; }
  if (isNaN(qty) || qty < 0)          { toast('Quantity sahi bharein', 'warning'); return; }

  if ((!retail || isNaN(retail)) && margin > 0) retail = wholesale * (1 + margin / 100);
  if (isNaN(retail)) retail = wholesale;

  const product = { id: id || genId(), name, category, wholesalePrice: wholesale, qty, retailPrice: retail, notes, image, createdAt: today() };

  if (id) {
    const idx = state.products.findIndex(x => x.id === id);
    if (idx !== -1) { product.createdAt = state.products[idx].createdAt || today(); state.products[idx] = product; }
    toast(`"${name}" update ho gaya`);
  } else {
    state.products.push(product);
    toast(`"${name}" stock mein add ho gaya`);
  }

  save('products');
  closeModal('product-modal');
  renderProducts();
  updateNavBadges();
}

function markSoldOut(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  confirmDialog(`"${p.name}" ko Sold Out mark karna chahte ho?`, () => {
    p.qty = 0;
    save('products');
    renderProducts();
    renderDashboard();
    toast(`"${p.name}" sold out mark ho gaya`, 'info');
  });
}

/* NEW: Restock modal */
function openRestockModal(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  state.restockProductId = id;
  qs('#restock-product-name').textContent = `Product: ${p.name}`;
  qs('#restock-qty-input').value = 10;
  openModal('restock-modal');
}

function saveRestock() {
  const id  = state.restockProductId;
  const qty = parseInt(qs('#restock-qty-input').value);
  const p   = state.products.find(x => x.id === id);
  if (!p || isNaN(qty) || qty < 1) { toast('Sahi quantity likhein', 'warning'); return; }
  p.qty += qty;
  save('products');
  closeModal('restock-modal');
  renderProducts();
  renderDashboard();
  toast(`${p.name} — ${qty} units restock ho gaye!`, 'success', 'Restock Done');
}

function deleteProduct(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  confirmDialog(`"${p.name}" delete karna chahte ho? Yeh wapas nahi aayega.`, () => {
    state.products = state.products.filter(x => x.id !== id);
    save('products');
    renderProducts();
    updateNavBadges();
    toast(`"${p.name}" delete ho gaya`, 'danger');
  }, 'Delete Product');
}

function initProducts() {
  qs('#add-product-btn').addEventListener('click', openAddProduct);
  qs('#product-save-btn').addEventListener('click', saveProduct);
  qs('#restock-save-btn').addEventListener('click', saveRestock);

  /* Image upload handler */
  qs('#product-image-area').addEventListener('click', () => qs('#pf-image').click());
  qs('#pf-image').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast('Image 2MB se chhoti honi chahiye', 'warning'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      qs('#pf-image-data').value = ev.target.result;
      qs('#product-image-preview').src = ev.target.result;
      qs('#product-image-preview').style.display = 'block';
      qs('#image-upload-placeholder').style.display = 'none';
    };
    reader.readAsDataURL(file);
  });

  /* Select all */
  qs('#select-all-products').addEventListener('change', function () {
    qsa('.product-cb').forEach(cb => cb.checked = this.checked);
  });

  /* Bulk update */
  qs('#bulk-update-btn').addEventListener('click', () => {
    const selected  = qsa('.product-cb:checked').map(cb => cb.dataset.id);
    const products  = selected.length ? state.products.filter(p => selected.includes(p.id)) : state.products;
    if (!products.length) { toast('Koi product nahi mila', 'warning'); return; }
    qs('#bulk-modal-body').innerHTML = `
      <p class="text-muted text-small" style="margin-bottom:8px;">${products.length} product(s) ki quantity update karo:</p>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;">
        ${products.map(p => `
          <div style="display:flex;align-items:center;gap:12px;padding:8px;border:1.5px solid var(--clr-border);border-radius:8px;">
            <span style="flex:1;font-weight:600;font-size:0.86rem">${escHtml(p.name)}</span>
            <input type="number" class="form-input form-input-sm" style="width:80px"
              data-bulk-id="${p.id}" value="${p.qty}" min="0" />
          </div>`).join('')}
      </div>`;
    openModal('bulk-modal');
  });

  qs('#bulk-save-btn').addEventListener('click', () => {
    qsa('[data-bulk-id]').forEach(inp => {
      const p = state.products.find(x => x.id === inp.dataset.bulkId);
      if (p) p.qty = parseInt(inp.value) || 0;
    });
    save('products');
    closeModal('bulk-modal');
    renderProducts();
    updateNavBadges();
    toast('Quantities update ho gayi');
  });

  /* Filters */
  ['product-search', 'product-category-filter', 'product-sort'].forEach(id => {
    qs(`#${id}`)?.addEventListener('input', renderProducts);
    qs(`#${id}`)?.addEventListener('change', renderProducts);
  });

  /* Import Excel for products */
  qs('#import-excel-products')?.addEventListener('change', e => {
    importExcelProducts(e.target.files[0]);
    e.target.value = '';
  });

  /* Import JSON for products */
  qs('#import-json-products')?.addEventListener('change', e => {
    importJSONProducts(e.target.files[0]);
    e.target.value = '';
  });
}

/* NEW: Import Excel (products only) */
function importExcelProducts(file) {
  if (!file) return;
  if (!window.XLSX) { toast('SheetJS library load nahi hui', 'danger'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'binary' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      if (!rows.length) { toast('Excel file mein data nahi mila', 'warning'); return; }

      confirmDialog(`${rows.length} products import hone waale hain (existing data mein merge ho ga). Sure?`, () => {
        let added = 0;
        rows.forEach(row => {
          const name = row['Name'] || row['name'] || row['Product Name'] || '';
          if (!name) return;
          const existing = state.products.find(p => p.name.toLowerCase() === name.toLowerCase());
          if (!existing) {
            state.products.push({
              id: genId(), name,
              category:       row['Category'] || 'Toy',
              wholesalePrice: Number(row['Wholesale Price'] || row['wholesale'] || 0),
              qty:            Number(row['Qty'] || row['Quantity'] || 0),
              retailPrice:    Number(row['Retail Price'] || row['retail'] || 0),
              notes:          row['Notes'] || '',
              image:          '',
              createdAt:      today(),
            });
            added++;
          }
        });
        save('products');
        renderProducts();
        updateNavBadges();
        toast(`${added} naye products import ho gaye!`, 'success', 'Import Complete');
      }, 'Import Products');
    } catch (err) {
      toast('Excel file padh nahi saka. Valid file chunein.', 'danger');
    }
  };
  reader.readAsBinaryString(file);
}

/* NEW: Import JSON (products only) */
function importJSONProducts(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      const items = Array.isArray(data) ? data : (data.products || []);
      if (!items.length) { toast('JSON mein products nahi mile', 'warning'); return; }
      confirmDialog(`${items.length} products merge hone waale hain. Sure?`, () => {
        let added = 0;
        items.forEach(p => {
          if (!p.name) return;
          if (!state.products.find(x => x.name.toLowerCase() === p.name.toLowerCase())) {
            state.products.push({ ...p, id: genId(), createdAt: today() });
            added++;
          }
        });
        save('products');
        renderProducts();
        toast(`${added} products imported!`, 'success');
      });
    } catch (err) {
      toast('Invalid JSON file', 'danger');
    }
  };
  reader.readAsText(file);
}

/* ─────────────────────────────────────────────────────────────
   11. POS / SELL (NEW FEATURE)
───────────────────────────────────────────────────────────── */
function renderPOS() {
  const search = (qs('#pos-search')?.value || '').toLowerCase();
  const grid   = qs('#pos-products-grid');
  if (!grid) return;

  const products = state.products.filter(p => !search || p.name.toLowerCase().includes(search));

  if (!products.length) {
    grid.innerHTML = `<div class="empty-state-small" style="grid-column:1/-1;padding:40px;">
      <i class="fa-solid fa-box-open"></i><span>Koi product nahi mila</span>
    </div>`;
    return;
  }

  grid.innerHTML = products.map(p => {
    const imgHtml = p.image
      ? `<img class="pos-product-img" src="${p.image}" alt="" />`
      : `<div class="pos-product-img-placeholder">🎁</div>`;
    return `
      <div class="pos-product-card ${p.qty === 0 ? 'out-of-stock' : ''}" onclick="addToCart('${p.id}')">
        ${p.qty === 0 ? `<span class="pos-product-badge">Out</span>` : p.qty < 3 ? `<span class="pos-product-badge" style="background:var(--clr-warning)">Low</span>` : ''}
        ${imgHtml}
        <div class="pos-product-name">${escHtml(p.name)}</div>
        <div class="pos-product-price">${fmtPKR(p.retailPrice)}</div>
        <div class="pos-product-stock">Stock: ${p.qty}</div>
      </div>`;
  }).join('');

  renderCart();
}

function addToCart(productId) {
  const p = state.products.find(x => x.id === productId);
  if (!p || p.qty === 0) return;

  const existing = state.cart.find(c => c.productId === productId);
  if (existing) {
    if (existing.qty >= p.qty) { toast('Itna stock nahi hai', 'warning'); return; }
    existing.qty++;
  } else {
    state.cart.push({ productId, qty: 1, name: p.name, retailPrice: p.retailPrice, wholesalePrice: p.wholesalePrice });
  }
  renderCart();
}

function renderCart() {
  const container = qs('#pos-cart-items');
  if (!state.cart.length) {
    container.innerHTML = `<div class="empty-state-small"><i class="fa-solid fa-cart-plus"></i><span>Cart khaali hai</span></div>`;
    qs('#pos-total-items').textContent  = '0';
    qs('#pos-total-amount').textContent = 'PKR 0';
    qs('#pos-total-profit').textContent = 'PKR 0';
    return;
  }

  container.innerHTML = state.cart.map(item => `
    <div class="pos-cart-item" data-pid="${item.productId}">
      <div class="pos-cart-item-name">${escHtml(item.name)}</div>
      <div class="pos-cart-qty-controls">
        <button class="pos-qty-btn" onclick="changeCartQty('${item.productId}',-1)">−</button>
        <span class="pos-cart-qty">${item.qty}</span>
        <button class="pos-qty-btn" onclick="changeCartQty('${item.productId}',1)">+</button>
      </div>
      <div class="pos-cart-item-total">${fmtPKR(item.qty * item.retailPrice)}</div>
      <button class="pos-cart-item-remove" onclick="removeFromCart('${item.productId}')"><i class="fa-solid fa-xmark"></i></button>
    </div>`).join('');

  const total  = state.cart.reduce((s, c) => s + c.qty * c.retailPrice, 0);
  const profit = state.cart.reduce((s, c) => s + c.qty * (c.retailPrice - c.wholesalePrice), 0);
  const items  = state.cart.reduce((s, c) => s + c.qty, 0);

  qs('#pos-total-items').textContent  = items;
  qs('#pos-total-amount').textContent = fmtPKR(total);
  qs('#pos-total-profit').textContent = fmtPKR(profit);
}

function changeCartQty(productId, delta) {
  const item = state.cart.find(c => c.productId === productId);
  if (!item) return;
  const p = state.products.find(x => x.id === productId);
  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(productId); return; }
  if (p && item.qty > p.qty) { item.qty = p.qty; toast('Itna stock nahi', 'warning'); }
  renderCart();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter(c => c.productId !== productId);
  renderCart();
}

function posCheckout() {
  if (!state.cart.length) { toast('Cart khaali hai. Pehle items add karo.', 'warning'); return; }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });

  state.cart.forEach(item => {
    /* Record sale */
    state.sales.push({
      id:           genId(),
      date:         dateStr,
      time:         timeStr,
      productId:    item.productId,
      productName:  item.name,
      qty:          item.qty,
      retailPrice:  item.retailPrice,
      wholesalePrice: item.wholesalePrice,
    });
    /* Reduce stock */
    const p = state.products.find(x => x.id === item.productId);
    if (p) p.qty = Math.max(0, p.qty - item.qty);
  });

  save('sales');
  save('products');
  state.cart = [];
  renderCart();
  renderPOS();
  renderDashboard();
  toast(`Sale record ho gaya! ${fmtPKR(state.sales.slice(-state.cart.length).reduce((s, x) => s + x.qty * x.retailPrice, 0))}`, 'success', 'Checkout Done');
}

function renderSalesHistory() {
  const tbody = qs('#sales-history-tbody');
  if (!tbody) return;
  if (!state.sales.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--clr-text-faint);">Koi sale record nahi</td></tr>`;
    return;
  }
  tbody.innerHTML = [...state.sales].reverse().map(s => `
    <tr>
      <td>${fmtDate(s.date)}</td>
      <td>${s.time || '—'}</td>
      <td><b>${escHtml(s.productName)}</b></td>
      <td class="num">${s.qty}</td>
      <td class="num">${fmtPKR(s.retailPrice)}</td>
      <td class="num">${fmtPKR(s.qty * s.retailPrice)}</td>
      <td class="num profit-pos">${fmtPKR(s.qty * (s.retailPrice - s.wholesalePrice))}</td>
    </tr>`).join('');
}

function initPOS() {
  qs('#pos-search')?.addEventListener('input', renderPOS);
  qs('#pos-clear-cart-btn')?.addEventListener('click', () => {
    state.cart = [];
    renderCart();
  });
  qs('#pos-checkout-btn')?.addEventListener('click', posCheckout);
  qs('#pos-sales-history-btn')?.addEventListener('click', () => {
    renderSalesHistory();
    openModal('sales-history-modal');
  });
}

/* Expose for inline onclick */
window.addToCart        = addToCart;
window.changeCartQty    = changeCartQty;
window.removeFromCart   = removeFromCart;

/* ─────────────────────────────────────────────────────────────
   12. SHOPPING LIST
───────────────────────────────────────────────────────────── */
function getFilteredShopping() {
  const search = (qs('#shopping-search')?.value || '').toLowerCase();
  const status = qs('#shopping-status-filter')?.value || '';
  let list = [...state.shopping];
  if (search) list = list.filter(i => i.name.toLowerCase().includes(search));
  if (status === 'purchased') list = list.filter(i =>  i.purchased);
  if (status === 'pending')   list = list.filter(i => !i.purchased);
  return list;
}

function renderShopping() {
  const list    = getFilteredShopping();
  const tbody   = qs('#shopping-tbody');
  const tfoot   = qs('#shopping-tfoot');
  const empty   = qs('#shopping-empty-state');
  const wrapper = qs('#shopping-table-wrapper');

  const total     = state.shopping.length;
  const purchased = state.shopping.filter(i => i.purchased).length;
  const remaining = total - purchased;
  const budget    = state.shopping.filter(i => !i.purchased).reduce((s, i) => s + (i.wholesalePrice * i.qty), 0);

  qs('#stat-shopping-total').textContent     = total;
  qs('#stat-shopping-purchased').textContent = purchased;
  qs('#stat-shopping-remaining').textContent = remaining;
  qs('#stat-shopping-budget').textContent    = fmtPKR(budget);

  if (!state.shopping.length) {
    wrapper.querySelector('table').style.display = 'none';
    empty.hidden = false; return;
  }
  wrapper.querySelector('table').style.display = '';
  empty.hidden = true;

  tbody.innerHTML = list.map(i => `
    <tr class="${i.purchased ? 'row-purchased' : ''}">
      <td><input type="checkbox" ${i.purchased ? 'checked' : ''} onchange="togglePurchased('${i.id}',this.checked)" /></td>
      <td><b>${escHtml(i.name)}</b>${i.shopNo ? `<br><small class="text-muted">📍 ${escHtml(i.shopNo)}</small>` : ''}</td>
      <td class="num">${fmtPKR(i.wholesalePrice)}</td>
      <td class="num">${i.qty}</td>
      <td class="num"><b>${fmtPKR(i.wholesalePrice * i.qty)}</b></td>
      <td>${escHtml(i.notes || '—')}</td>
      <td><span class="status-badge ${i.purchased ? 'status-purchased' : 'status-pending'}">${i.purchased ? '✓ Purchased' : 'Pending'}</span></td>
      <td>
        <div class="action-row">
          <button class="btn-action" title="Edit" onclick="openEditShopping('${i.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-action btn-action-danger" title="Delete" onclick="deleteShoppingItem('${i.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');

  const totalCost = list.reduce((s, i) => s + (i.wholesalePrice * i.qty), 0);
  tfoot.innerHTML = `<tr><td colspan="4"><b>Total (${list.length} items)</b></td><td class="num"><b>${fmtPKR(totalCost)}</b></td><td colspan="3"></td></tr>`;
}

function togglePurchased(id, val) {
  const item = state.shopping.find(x => x.id === id);
  if (item) { item.purchased = val; save('shopping'); renderShopping(); updateNavBadges(); }
}

function openAddShopping() {
  qs('#shopping-modal-title').textContent = 'Add Shopping Item';
  qs('#shopping-form').reset();
  qs('#shopping-id-field').value = '';
  openModal('shopping-modal');
}

function openEditShopping(id) {
  const i = state.shopping.find(x => x.id === id);
  if (!i) return;
  qs('#shopping-modal-title').textContent = 'Edit Shopping Item';
  qs('#shopping-id-field').value = i.id;
  qs('#sf-name').value           = i.name;
  qs('#sf-wholesale').value      = i.wholesalePrice;
  qs('#sf-qty').value            = i.qty;
  qs('#sf-shop-no').value        = i.shopNo || '';
  qs('#sf-notes').value          = i.notes  || '';
  openModal('shopping-modal');
}

function saveShopping() {
  const id     = qs('#shopping-id-field').value;
  const name   = qs('#sf-name').value.trim();
  const price  = parseFloat(qs('#sf-wholesale').value);
  const qty    = parseInt(qs('#sf-qty').value);
  const shopNo = qs('#sf-shop-no').value.trim();
  const notes  = qs('#sf-notes').value.trim();

  if (!name)                  { toast('Item ka naam zaroor likhein', 'warning'); return; }
  if (isNaN(price) || price < 0) { toast('Price sahi bharein', 'warning'); return; }
  if (isNaN(qty) || qty < 1)  { toast('Quantity sahi bharein', 'warning'); return; }

  const item = { id: id || genId(), name, wholesalePrice: price, qty, shopNo, notes, purchased: false };
  if (id) {
    const idx = state.shopping.findIndex(x => x.id === id);
    if (idx !== -1) { item.purchased = state.shopping[idx].purchased; state.shopping[idx] = item; }
    toast(`"${name}" update ho gaya`);
  } else {
    state.shopping.push(item);
    toast(`"${name}" shopping list mein add ho gaya`);
  }

  save('shopping');
  closeModal('shopping-modal');
  renderShopping();
  updateNavBadges();
}

function deleteShoppingItem(id) {
  const i = state.shopping.find(x => x.id === id);
  if (!i) return;
  confirmDialog(`"${i.name}" shopping list se delete karna chahte ho?`, () => {
    state.shopping = state.shopping.filter(x => x.id !== id);
    save('shopping');
    renderShopping();
    updateNavBadges();
    toast(`"${i.name}" delete ho gaya`, 'danger');
  });
}

/* NEW: Move purchased to stock with retail price popup */
function movePurchasedToProducts() {
  const purchased = state.shopping.filter(i => i.purchased);
  if (!purchased.length) { toast('Koi purchased item nahi mila', 'warning'); return; }

  /* Build form for retail prices */
  qs('#move-retail-prices-list').innerHTML = purchased.map(item => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:8px;border:1px solid var(--clr-border);border-radius:8px;">
      <div style="flex:1;">
        <div style="font-weight:700;font-size:0.86rem;">${escHtml(item.name)}</div>
        <div style="font-size:0.78rem;color:var(--clr-text-muted);">Wholesale: ${fmtPKR(item.wholesalePrice)}</div>
      </div>
      <div>
        <label style="font-size:0.75rem;font-weight:700;color:var(--clr-text-muted);display:block;margin-bottom:2px;">Retail Price (PKR)</label>
        <input type="number" class="form-input form-input-sm" style="width:110px;"
          data-move-id="${item.id}" data-wholesale="${item.wholesalePrice}"
          value="${Math.round(item.wholesalePrice * 2)}" min="0" />
      </div>
    </div>`).join('');

  openModal('move-to-stock-modal');
}

function confirmMoveToStock() {
  const purchased = state.shopping.filter(i => i.purchased);
  let added = 0, updated = 0;

  purchased.forEach(item => {
    const input       = qs(`[data-move-id="${item.id}"]`);
    const retailPrice = input ? parseFloat(input.value) || (item.wholesalePrice * 2) : item.wholesalePrice * 2;

    const existing = state.products.find(p => p.name.toLowerCase() === item.name.toLowerCase());
    if (existing) {
      existing.qty += item.qty;
      updated++;
    } else {
      state.products.push({
        id: genId(), name: item.name, category: 'Toy',
        wholesalePrice: item.wholesalePrice, qty: item.qty,
        retailPrice, notes: item.notes || '', image: '', createdAt: today(),
      });
      added++;
    }
  });

  state.shopping = state.shopping.filter(i => !i.purchased);
  save('products'); save('shopping');
  closeModal('move-to-stock-modal');
  renderShopping();
  updateNavBadges();
  toast(`${added} naye products add, ${updated} update — Stock mein aa gaye!`, 'success', 'Move Complete');
}

function initShopping() {
  qs('#add-shopping-item-btn').addEventListener('click', openAddShopping);
  qs('#shopping-save-btn').addEventListener('click', saveShopping);
  qs('#move-to-products-btn').addEventListener('click', movePurchasedToProducts);
  qs('#move-stock-confirm-btn')?.addEventListener('click', confirmMoveToStock);

  ['shopping-search', 'shopping-status-filter'].forEach(id => {
    qs(`#${id}`)?.addEventListener('input', renderShopping);
    qs(`#${id}`)?.addEventListener('change', renderShopping);
  });
}

/* ─────────────────────────────────────────────────────────────
   13. EXPENSES
───────────────────────────────────────────────────────────── */
function getFilteredExpenses() {
  const search = (qs('#expense-search')?.value || '').toLowerCase();
  const cat    = qs('#expense-category-filter')?.value || '';
  const date   = qs('#expense-date-filter')?.value     || '';
  let list = [...state.expenses];
  if (search) list = list.filter(e => (e.description || '').toLowerCase().includes(search) || (e.category || '').toLowerCase().includes(search));
  if (cat)    list = list.filter(e => e.category === cat);
  if (date)   list = list.filter(e => e.date === date);
  return list.sort((a, b) => b.date.localeCompare(a.date));
}

function renderExpenses() {
  const list    = getFilteredExpenses();
  const tbody   = qs('#expenses-tbody');
  const tfoot   = qs('#expenses-tfoot');
  const empty   = qs('#expenses-empty-state');
  const wrapper = qs('#expenses-table-wrapper');

  const travelCats = ['Travel','Toll','Parking'];
  const foodCats   = ['Lunch','Tea/Chai'];
  const travel = state.expenses.filter(e =>  travelCats.includes(e.category)).reduce((s, e) => s + e.amount, 0);
  const food   = state.expenses.filter(e =>  foodCats.includes(e.category)).reduce((s, e) => s + e.amount, 0);
  const other  = state.expenses.filter(e => !travelCats.includes(e.category) && !foodCats.includes(e.category)).reduce((s, e) => s + e.amount, 0);
  const total  = state.expenses.reduce((s, e) => s + e.amount, 0);

  qs('#stat-total-expenses').textContent = fmtPKR(total);
  qs('#stat-travel-cost').textContent    = fmtPKR(travel);
  qs('#stat-food-cost').textContent      = fmtPKR(food);
  qs('#stat-other-cost').textContent     = fmtPKR(other);

  /* Bug Fix: Always render chart when expenses page opens */
  renderExpenseChart();

  if (!state.expenses.length) {
    wrapper.querySelector('table').style.display = 'none';
    empty.hidden = false; tfoot.innerHTML = ''; return;
  }
  wrapper.querySelector('table').style.display = '';
  empty.hidden = true;

  tbody.innerHTML = list.map(e => {
    const receiptHtml = e.receipt === 'yes' ? '<span style="color:var(--clr-success)">✓ Hai</span>' : '—';
    return `<tr>
      <td>${fmtDate(e.date)}</td>
      <td><span class="cat-pill">${escHtml(e.category)}</span></td>
      <td class="num"><b>${fmtPKR(e.amount)}</b></td>
      <td>${escHtml(e.description || '—')}</td>
      <td>${receiptHtml}</td>
      <td>
        <div class="action-row">
          <button class="btn-action" title="Edit" onclick="openEditExpense('${e.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-action btn-action-danger" title="Delete" onclick="deleteExpense('${e.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const filteredTotal = list.reduce((s, e) => s + e.amount, 0);
  tfoot.innerHTML = `<tr><td colspan="2"><b>Total (${list.length} items)</b></td><td class="num"><b>${fmtPKR(filteredTotal)}</b></td><td colspan="3"></td></tr>`;
}

/* Bug Fix: Reliable chart rendering */
function renderExpenseChart() {
  const canvas = qs('#expense-chart');
  if (!canvas) return;
  if (typeof Chart === 'undefined') return;

  const groups = {};
  state.expenses.forEach(e => { groups[e.category] = (groups[e.category] || 0) + e.amount; });
  const labels = Object.keys(groups);
  const values = labels.map(k => groups[k]);

  const COLORS = ['#0f7173','#f4a100','#d62828','#2d9a47','#1565c0','#9c27b0','#ff5722','#607d8b'];

  if (state.expenseChart) { state.expenseChart.destroy(); state.expenseChart = null; }
  if (!labels.length) { canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); return; }

  const chartType = qs('.chart-type-btn.active')?.dataset.chartType || 'pie';

  try {
    state.expenseChart = new Chart(canvas, {
      type: chartType === 'bar' ? 'bar' : 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: COLORS.slice(0, labels.length),
          borderWidth: 2,
          borderColor: getComputedStyle(document.body).getPropertyValue('--clr-surface') || '#fff',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: chartType === 'bar' ? 'top' : 'bottom',
            labels: { font: { size: 11 }, color: getComputedStyle(document.body).color || '#333', padding: 10 }
          },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: PKR ${ctx.parsed.toLocaleString()}` } }
        },
        scales: chartType === 'bar' ? { y: { beginAtZero: true, ticks: { callback: v => 'PKR ' + v.toLocaleString() } } } : {},
      }
    });
  } catch (err) {
    console.warn('Chart render error:', err);
  }
}

function openAddExpense() {
  qs('#expense-modal-title').textContent = 'Add Expense';
  qs('#expense-form').reset();
  qs('#expense-id-field').value = '';
  qs('#ef-date').value = today();
  openModal('expense-modal');
}

function openEditExpense(id) {
  const e = state.expenses.find(x => x.id === id);
  if (!e) return;
  qs('#expense-modal-title').textContent = 'Edit Expense';
  qs('#expense-id-field').value  = e.id;
  qs('#ef-category').value       = e.category;
  qs('#ef-amount').value         = e.amount;
  qs('#ef-date').value           = e.date;
  qs('#ef-description').value    = e.description || '';
  qs('#ef-receipt').value        = e.receipt     || 'no';
  openModal('expense-modal');
}

function saveExpense() {
  const id   = qs('#expense-id-field').value;
  const cat  = qs('#ef-category').value;
  const amt  = parseFloat(qs('#ef-amount').value);
  const date = qs('#ef-date').value;
  const desc = qs('#ef-description').value.trim();
  const rcpt = qs('#ef-receipt').value;

  if (!cat)                   { toast('Category zaroor chunein', 'warning'); return; }
  if (isNaN(amt) || amt <= 0) { toast('Amount sahi bharein', 'warning'); return; }
  if (!date)                  { toast('Date zaroor chunein', 'warning'); return; }

  const expense = { id: id || genId(), category: cat, amount: amt, date, description: desc, receipt: rcpt };
  if (id) {
    const idx = state.expenses.findIndex(x => x.id === id);
    if (idx !== -1) state.expenses[idx] = expense;
    toast('Expense update ho gaya');
  } else {
    state.expenses.push(expense);
    toast(`${cat} — ${fmtPKR(amt)} add ho gaya`);
  }

  save('expenses');
  closeModal('expense-modal');
  renderExpenses();
}

function deleteExpense(id) {
  const e = state.expenses.find(x => x.id === id);
  if (!e) return;
  confirmDialog(`Yeh expense delete karna chahte ho? "${e.category} — ${fmtPKR(e.amount)}"`, () => {
    state.expenses = state.expenses.filter(x => x.id !== id);
    save('expenses');
    renderExpenses();
    toast('Expense delete ho gaya', 'danger');
  });
}

function initExpenses() {
  qs('#add-expense-btn').addEventListener('click', openAddExpense);
  qs('#expense-save-btn').addEventListener('click', saveExpense);

  ['expense-search', 'expense-category-filter', 'expense-date-filter'].forEach(id => {
    qs(`#${id}`)?.addEventListener('input', renderExpenses);
    qs(`#${id}`)?.addEventListener('change', renderExpenses);
  });

  qsa('.chart-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.chart-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderExpenseChart();
    });
  });
}

/* ─────────────────────────────────────────────────────────────
   14. TASKS
───────────────────────────────────────────────────────────── */
function getFilteredTasks() {
  const search   = (qs('#task-search')?.value || '').toLowerCase();
  const status   = qs('#task-status-filter')?.value   || '';
  const priority = qs('#task-priority-filter')?.value || '';
  const sort     = qs('#task-sort')?.value            || 'deadline-asc';

  let list = [...state.tasks];
  if (search)   list = list.filter(t => t.name.toLowerCase().includes(search));
  if (status)   list = list.filter(t => t.status   === status);
  if (priority) list = list.filter(t => t.priority === priority);

  const pOrd = { High: 0, Medium: 1, Low: 2 };
  list.sort((a, b) => {
    if (sort === 'deadline-asc')  return (a.deadlineDate || '').localeCompare(b.deadlineDate || '');
    if (sort === 'priority-desc') return (pOrd[a.priority] || 1) - (pOrd[b.priority] || 1);
    if (sort === 'status') {
      const sOrd = { Pending: 0, 'In Progress': 1, Completed: 2 };
      return (sOrd[a.status] || 0) - (sOrd[b.status] || 0);
    }
    return 0;
  });
  return list;
}

function renderTasks() {
  const list = getFilteredTasks();

  const todayTasks    = list.filter(t => t.deadlineDate === today() && t.status !== 'Completed');
  const overdueTasks  = list.filter(t => t.status !== 'Completed'  && isPast(t.deadlineDate));
  const upcomingTasks = list.filter(t => t.status !== 'Completed'  && t.deadlineDate > today());
  const completedTasks= list.filter(t => t.status === 'Completed');

  function renderGroup(tasks, containerId, countId) {
    const el  = qs(`#${containerId}`);
    const cnt = qs(`#${countId}`);
    if (cnt) cnt.textContent = tasks.length;
    if (!el) return;
    el.innerHTML = tasks.length
      ? tasks.map(t => buildTaskRow(t)).join('')
      : '<div style="padding:12px 18px;color:var(--clr-text-faint);font-size:0.82rem;">Koi task nahi</div>';
  }

  renderGroup(todayTasks,    'task-group-today-items',    'task-group-today-count');
  renderGroup(overdueTasks,  'task-group-overdue-items',  'task-group-overdue-count');
  renderGroup(upcomingTasks, 'task-group-upcoming-items', 'task-group-upcoming-count');
  renderGroup(completedTasks,'task-group-completed-items','task-group-completed-count');

  const emptyState = qs('#tasks-empty-state');
  const wrapper    = qs('#tasks-list-wrapper');
  if (!state.tasks.length) {
    wrapper.style.display = 'none'; emptyState.hidden = false;
  } else {
    wrapper.style.display = ''; emptyState.hidden = true;
  }
}

function buildTaskRow(t) {
  const isComp      = t.status === 'Completed';
  const deadlineStr = t.deadlineDate ? fmtDate(t.deadlineDate) + (t.deadlineTime ? ' ' + t.deadlineTime : '') : '';
  return `
    <div class="task-row ${isComp ? 'task-completed' : ''} ${isToday(t.deadlineDate) && !isComp ? 'highlight-today' : ''} ${isPast(t.deadlineDate) && !isComp ? 'highlight-overdue' : ''}">
      <input type="checkbox" class="task-row-check" ${isComp ? 'checked' : ''}
        onchange="toggleTaskComplete('${t.id}',this.checked)" />
      <div class="task-row-body">
        <div class="task-row-name">${escHtml(t.name)}</div>
        <div class="task-row-meta">
          <span class="status-badge priority-${t.priority.toLowerCase()}">${t.priority}</span>
          <span class="status-badge status-${t.status.toLowerCase().replace(' ','')}">${t.status}</span>
          ${deadlineStr ? `<span class="task-row-deadline">⏰ ${deadlineStr}</span>` : ''}
        </div>
        ${t.description ? `<div class="task-row-desc">${escHtml(t.description)}</div>` : ''}
      </div>
      <div class="task-row-actions">
        <button class="btn-action" title="Edit" onclick="openEditTask('${t.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-action btn-action-danger" title="Delete" onclick="deleteTask('${t.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
}

function toggleTaskComplete(id, val) {
  const t = state.tasks.find(x => x.id === id);
  if (t) {
    t.status = val ? 'Completed' : 'Pending';
    save('tasks');
    renderTasks();
    updateNavBadges();
    /* Bug Fix: also refresh dashboard today's tasks */
    if (state.currentPage === 'tasks') renderDashboard();
  }
}

function openAddTask() {
  qs('#task-modal-title').textContent = 'Add Task';
  qs('#task-form').reset();
  qs('#task-id-field').value     = '';
  qs('#tf-deadline-date').value  = today();
  qs('#tf-priority').value       = 'Medium';
  qs('#tf-status').value         = 'Pending';
  openModal('task-modal');
}

function openEditTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  qs('#task-modal-title').textContent = 'Edit Task';
  qs('#task-id-field').value       = t.id;
  qs('#tf-name').value             = t.name;
  qs('#tf-deadline-date').value    = t.deadlineDate || '';
  qs('#tf-deadline-time').value    = t.deadlineTime || '';
  qs('#tf-priority').value         = t.priority;
  qs('#tf-status').value           = t.status;
  qs('#tf-description').value      = t.description || '';
  openModal('task-modal');
}

function saveTask() {
  const id    = qs('#task-id-field').value;
  const name  = qs('#tf-name').value.trim();
  const dDate = qs('#tf-deadline-date').value;
  const dTime = qs('#tf-deadline-time').value;
  const prio  = qs('#tf-priority').value;
  const status= qs('#tf-status').value;
  const desc  = qs('#tf-description').value.trim();

  if (!name)  { toast('Task ka naam zaroor likhein', 'warning'); return; }
  if (!dDate) { toast('Deadline date zaroor chunein', 'warning'); return; }

  const task = { id: id || genId(), name, deadlineDate: dDate, deadlineTime: dTime, priority: prio, status, description: desc };
  if (id) {
    const idx = state.tasks.findIndex(x => x.id === id);
    if (idx !== -1) state.tasks[idx] = task;
    toast(`"${name}" update ho gaya`);
  } else {
    state.tasks.push(task);
    toast(`"${name}" tasks mein add ho gaya`);
  }

  save('tasks');
  closeModal('task-modal');
  renderTasks();
  updateNavBadges();
  /* Bug Fix: refresh dashboard today's tasks panel */
  renderDashboard();
}

function deleteTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  confirmDialog(`"${t.name}" delete karna chahte ho?`, () => {
    state.tasks = state.tasks.filter(x => x.id !== id);
    save('tasks');
    renderTasks();
    updateNavBadges();
    /* Bug Fix: refresh dashboard */
    renderDashboard();
    toast('Task delete ho gaya', 'danger');
  });
}

function initTasks() {
  qs('#add-task-btn').addEventListener('click', openAddTask);
  qs('#task-save-btn').addEventListener('click', saveTask);
  ['task-search','task-status-filter','task-priority-filter','task-sort'].forEach(id => {
    qs(`#${id}`)?.addEventListener('input', renderTasks);
    qs(`#${id}`)?.addEventListener('change', renderTasks);
  });
}

/* ─────────────────────────────────────────────────────────────
   15. REPORTS & EXPORT
───────────────────────────────────────────────────────────── */
function getDateRange() {
  return {
    from: qs('#report-date-from')?.value || '',
    to:   qs('#report-date-to')?.value   || '',
  };
}

function filterByDate(list, from, to, dateField = 'date') {
  return list.filter(item => {
    const d = item[dateField];
    if (!d) return !from && !to;
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  });
}

function exportPDF() {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) { toast('jsPDF library load nahi hui', 'danger'); return; }

  const { from, to } = getDateRange();
  const inclProducts = qs('#pdf-include-products')?.checked;
  const inclExpenses = qs('#pdf-include-expenses')?.checked;
  const inclTasks    = qs('#pdf-include-tasks')?.checked;
  const inclShopping = qs('#pdf-include-shopping')?.checked;
  const inclSales    = qs('#pdf-include-sales')?.checked;

  const doc  = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const s    = calcSummary();
  const pageW = 210;
  let y = 15;

  doc.setFillColor(15, 113, 115);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text('Mela Stall Manager — Business Report', 14, 14);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString('en-PK')}${from ? ' | From: ' + from : ''}${to ? ' | To: ' + to : ''}`, 14, 20);
  doc.setTextColor(0, 0, 0);
  y = 30;

  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Business Summary', 14, y); y += 5;
  doc.autoTable({
    startY: y, margin: { left: 14, right: 14 },
    head: [['Metric', 'Amount']],
    body: [
      ['Expected Revenue',    fmtPKR(s.revenue)],
      ['Wholesale Cost',      fmtPKR(s.wholesaleCost)],
      ['Travel & Expenses',   fmtPKR(s.totalExpenses)],
      ['Net Expected Profit', fmtPKR(s.profit)],
      ["Today's Sales",       fmtPKR(s.todaySalesTotal)],
      ["Today's Profit",      fmtPKR(s.todaySalesProfit)],
      ['Total Products',      state.products.length],
      ['Pending Tasks',       s.pendingTasks],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 113, 115] },
    alternateRowStyles: { fillColor: [240, 248, 248] },
  });
  y = doc.lastAutoTable.finalY + 10;

  if (inclProducts && state.products.length) {
    if (y > 220) { doc.addPage(); y = 15; }
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text('Products', 14, y); y += 4;
    const products = (from || to) ? filterByDate(state.products, from, to, 'createdAt') : state.products;
    doc.autoTable({
      startY: y, margin: { left: 14, right: 14 },
      head: [['Name','Category','Wholesale','Qty','Retail','Profit/Pc','Total Profit']],
      body: products.map(p => [p.name, p.category||'—', fmtPKR(p.wholesalePrice), p.qty, fmtPKR(p.retailPrice), fmtPKR(p.retailPrice-p.wholesalePrice), fmtPKR((p.retailPrice-p.wholesalePrice)*p.qty)]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [15,113,115] }, alternateRowStyles: { fillColor: [240,248,248] },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  if (inclExpenses && state.expenses.length) {
    if (y > 220) { doc.addPage(); y = 15; }
    const expenses = filterByDate(state.expenses, from, to);
    doc.setFontSize(11); doc.setFont('helvetica','bold');
    doc.text('Expenses', 14, y); y += 4;
    doc.autoTable({
      startY: y, margin: { left: 14, right: 14 },
      head: [['Date','Category','Amount','Description']],
      body: expenses.map(e => [fmtDate(e.date), e.category, fmtPKR(e.amount), e.description||'—']),
      foot: [['','Total', fmtPKR(expenses.reduce((s,e)=>s+e.amount,0)), '']],
      styles: { fontSize: 8 }, headStyles: { fillColor: [15,113,115] }, footStyles: { fontStyle:'bold' }, alternateRowStyles: { fillColor:[240,248,248] },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  if (inclSales && state.sales.length) {
    if (y > 220) { doc.addPage(); y = 15; }
    const sales = filterByDate(state.sales, from, to);
    doc.setFontSize(11); doc.setFont('helvetica','bold');
    doc.text('Sales History', 14, y); y += 4;
    doc.autoTable({
      startY: y, margin: { left: 14, right: 14 },
      head: [['Date','Product','Qty','Total','Profit']],
      body: sales.map(s => [fmtDate(s.date), s.productName, s.qty, fmtPKR(s.qty*s.retailPrice), fmtPKR(s.qty*(s.retailPrice-s.wholesalePrice))]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [15,113,115] }, alternateRowStyles: { fillColor:[240,248,248] },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  if (inclTasks && state.tasks.length) {
    if (y > 220) { doc.addPage(); y = 15; }
    const tasks = filterByDate(state.tasks, from, to, 'deadlineDate');
    doc.setFontSize(11); doc.setFont('helvetica','bold');
    doc.text('Tasks', 14, y); y += 4;
    doc.autoTable({
      startY: y, margin: { left: 14, right: 14 },
      head: [['Task','Priority','Status','Deadline']],
      body: tasks.map(t => [t.name, t.priority, t.status, fmtDate(t.deadlineDate)]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [15,113,115] }, alternateRowStyles: { fillColor:[240,248,248] },
    });
  }

  if (inclShopping && state.shopping.length) {
    doc.addPage(); y = 15;
    doc.setFontSize(11); doc.setFont('helvetica','bold');
    doc.text('Shopping List', 14, y); y += 4;
    doc.autoTable({
      startY: y, margin: { left: 14, right: 14 },
      head: [['Product','Wholesale Price','Qty','Total Cost','Status']],
      body: state.shopping.map(i => [i.name, fmtPKR(i.wholesalePrice), i.qty, fmtPKR(i.wholesalePrice*i.qty), i.purchased?'Purchased':'Pending']),
      styles: { fontSize: 8 }, headStyles: { fillColor: [15,113,115] }, alternateRowStyles: { fillColor:[240,248,248] },
    });
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text(`Page ${i} of ${pageCount} — Mela Stall Manager`, 14, 290);
    doc.text('PKR Report — Shah Alam Market', pageW - 14, 290, { align: 'right' });
  }

  doc.save(`MelaReport_${today()}.pdf`);
  toast('PDF download ho raha hai!');
}

function exportExcel() {
  if (!window.XLSX) { toast('SheetJS library load nahi hui', 'danger'); return; }
  const { from, to } = getDateRange();
  const wb = XLSX.utils.book_new();

  if (qs('#excel-include-products')?.checked && state.products.length) {
    const data = [['Name','Category','Wholesale Price','Qty','Retail Price','Profit/Piece','Total Profit','Status']];
    state.products.forEach(p => data.push([p.name, p.category||'', p.wholesalePrice, p.qty, p.retailPrice, p.retailPrice-p.wholesalePrice, (p.retailPrice-p.wholesalePrice)*p.qty, p.qty===0?'Sold Out':p.qty<3?'Low Stock':'In Stock']));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Products');
  }
  if (qs('#excel-include-expenses')?.checked && state.expenses.length) {
    const expenses = filterByDate(state.expenses, from, to);
    const data = [['Date','Category','Amount (PKR)','Description','Receipt']];
    expenses.forEach(e => data.push([e.date, e.category, e.amount, e.description||'', e.receipt||'']));
    data.push(['', 'Total', expenses.reduce((s,e)=>s+e.amount,0), '', '']);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Expenses');
  }
  if (qs('#excel-include-tasks')?.checked && state.tasks.length) {
    const tasks = filterByDate(state.tasks, from, to, 'deadlineDate');
    const data = [['Task Name','Priority','Status','Deadline Date','Deadline Time','Description']];
    tasks.forEach(t => data.push([t.name, t.priority, t.status, t.deadlineDate||'', t.deadlineTime||'', t.description||'']));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Tasks');
  }
  if (qs('#excel-include-shopping')?.checked && state.shopping.length) {
    const data = [['Product Name','Wholesale Price','Qty','Total Cost','Shop No.','Notes','Purchased']];
    state.shopping.forEach(i => data.push([i.name, i.wholesalePrice, i.qty, i.wholesalePrice*i.qty, i.shopNo||'', i.notes||'', i.purchased?'Yes':'No']));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Shopping');
  }
  if (qs('#excel-include-sales')?.checked && state.sales.length) {
    const sales = filterByDate(state.sales, from, to);
    const data = [['Date','Time','Product','Qty','Unit Price','Total','Profit']];
    sales.forEach(s => data.push([s.date, s.time||'', s.productName, s.qty, s.retailPrice, s.qty*s.retailPrice, s.qty*(s.retailPrice-s.wholesalePrice)]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Sales');
  }

  const s       = calcSummary();
  const sumData = [
    ['Mela Stall Manager — Summary Report'],
    ['Generated', new Date().toLocaleDateString('en-PK')], [],
    ['Metric','Value'],
    ['Total Products', state.products.length],
    ['Expected Revenue (PKR)', s.revenue],
    ['Wholesale Cost (PKR)', s.wholesaleCost],
    ['Total Expenses (PKR)', s.totalExpenses],
    ['Net Expected Profit (PKR)', s.profit],
    ["Today's Sales (PKR)", s.todaySalesTotal],
    ["Today's Profit (PKR)", s.todaySalesProfit],
    ['Pending Tasks', s.pendingTasks],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumData), 'Summary');

  if (!wb.SheetNames.length) { toast('Koi data select nahi kiya', 'warning'); return; }
  XLSX.writeFile(wb, `MelaStall_${today()}.xlsx`);
  toast('Excel file download ho rahi hai!');
}

function exportDocs() {
  const { from, to } = getDateRange();
  const inclSummary  = qs('#docs-include-summary')?.checked;
  const inclProducts = qs('#docs-include-products')?.checked;
  const inclShopping = qs('#docs-include-shopping')?.checked;
  const s = calcSummary();

  let content = `<html><body style="font-family:Arial,sans-serif;margin:30px;">
    <h1 style="color:#0f7173;">🎪 Mela Stall Manager — Business Report</h1>
    <p style="color:#666;">Generated: ${new Date().toLocaleDateString('en-PK')}${from?' | From: '+from:''}${to?' | To: '+to:''}</p><hr/>`;

  if (inclSummary) {
    content += `<h2 style="color:#0f7173;">Business Summary</h2>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:500px;">
      <tr style="background:#0f7173;color:white;"><th>Metric</th><th>Value</th></tr>
      <tr><td>Expected Revenue</td><td>${fmtPKR(s.revenue)}</td></tr>
      <tr><td>Wholesale Cost</td><td>${fmtPKR(s.wholesaleCost)}</td></tr>
      <tr><td>Travel &amp; Expenses</td><td>${fmtPKR(s.totalExpenses)}</td></tr>
      <tr style="font-weight:bold;background:#e0f5f5;"><td>Net Expected Profit</td><td>${fmtPKR(s.profit)}</td></tr>
    </table><br/>`;
  }

  if (inclProducts && state.products.length) {
    content += `<h2 style="color:#0f7173;">Products</h2>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px;">
      <tr style="background:#0f7173;color:white;"><th>Name</th><th>Category</th><th>Wholesale</th><th>Qty</th><th>Retail</th></tr>`;
    state.products.forEach(p => {
      content += `<tr><td>${escHtml(p.name)}</td><td>${escHtml(p.category||'')}</td><td>${fmtPKR(p.wholesalePrice)}</td><td>${p.qty}</td><td>${fmtPKR(p.retailPrice)}</td></tr>`;
    });
    content += `</table><br/>`;
  }

  if (inclShopping && state.shopping.length) {
    content += `<h2 style="color:#0f7173;">Shopping List</h2>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px;">
      <tr style="background:#0f7173;color:white;"><th>Product</th><th>Price</th><th>Qty</th><th>Total</th><th>Status</th></tr>`;
    state.shopping.forEach(i => {
      content += `<tr><td>${escHtml(i.name)}</td><td>${fmtPKR(i.wholesalePrice)}</td><td>${i.qty}</td><td>${fmtPKR(i.wholesalePrice*i.qty)}</td><td>${i.purchased?'✓ Purchased':'Pending'}</td></tr>`;
    });
    content += `</table><br/>`;
  }

  content += `</body></html>`;
  const blob = new Blob(['\ufeff', content], { type: 'application/msword;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `MelaReport_${today()}.doc`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  toast('Word document download ho raha hai!');
}

function exportJSON() {
  const backup = {
    version:    '2.0',
    exportedAt: new Date().toISOString(),
    products:   state.products,
    shopping:   state.shopping,
    expenses:   state.expenses,
    tasks:      state.tasks,
    sales:      state.sales,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `MelaBackup_${today()}.json`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  toast('JSON backup download ho raha hai!');
}

function importJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      confirmDialog('Yeh backup restore karega. Sure ho?', () => {
        if (Array.isArray(data.products)) state.products = data.products;
        if (Array.isArray(data.shopping)) state.shopping = data.shopping;
        if (Array.isArray(data.expenses)) state.expenses = data.expenses;
        if (Array.isArray(data.tasks))    state.tasks    = data.tasks;
        if (Array.isArray(data.sales))    state.sales    = data.sales;
        ['products','shopping','expenses','tasks','sales'].forEach(k => save(k));
        renderDashboard(); updateNavBadges();
        toast('Backup restore ho gaya!', 'success', 'Restore Complete');
      }, 'Restore Backup');
    } catch (err) {
      toast('Invalid JSON file. Sahi backup file chunein.', 'danger');
    }
  };
  reader.readAsText(file);
}

function renderReportPreview() {
  const { from, to } = getDateRange();
  const s = calcSummary();

  const summaryHtml = `
    <div class="report-section-title">Summary</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;">
      ${[
        ['Revenue', fmtPKR(s.revenue)],
        ['Wholesale Cost', fmtPKR(s.wholesaleCost)],
        ['Expenses', fmtPKR(s.totalExpenses)],
        ['Net Profit', fmtPKR(s.profit)],
        ["Today's Sales", fmtPKR(s.todaySalesTotal)],
        ['Products', state.products.length],
        ['Pending Tasks', s.pendingTasks],
      ].map(([label, val]) => `
        <div style="background:var(--clr-surface-2);border:1px solid var(--clr-border);border-radius:8px;padding:8px 12px;">
          <div style="font-size:0.72rem;font-weight:700;color:var(--clr-text-muted);text-transform:uppercase;">${label}</div>
          <div style="font-family:var(--font-mono);font-size:0.95rem;font-weight:800;color:var(--clr-text);">${val}</div>
        </div>`).join('')}
    </div>`;

  const products = (from || to) ? filterByDate(state.products, from, to, 'createdAt') : state.products;
  const expenses = filterByDate(state.expenses, from, to);
  const sales    = filterByDate(state.sales, from, to);

  const prodHtml = products.length
    ? `<div class="report-section-title">Top Products (by Profit)</div>
       <table class="data-table" style="font-size:0.82rem;">
         <thead><tr><th>Name</th><th>Qty</th><th>Retail</th><th>Total Profit</th></tr></thead>
         <tbody>
           ${[...products].sort((a,b) => ((b.retailPrice-b.wholesalePrice)*b.qty) - ((a.retailPrice-a.wholesalePrice)*a.qty)).slice(0, 5).map(p => `
             <tr><td>${escHtml(p.name)}</td><td>${p.qty}</td><td>${fmtPKR(p.retailPrice)}</td><td class="profit-pos">${fmtPKR((p.retailPrice-p.wholesalePrice)*p.qty)}</td></tr>
           `).join('')}
         </tbody>
       </table>`
    : '<p class="text-muted text-small">No products in this range.</p>';

  const expHtml = expenses.length
    ? `<div class="report-section-title">Recent Expenses</div>
       <table class="data-table" style="font-size:0.82rem;">
         <thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Description</th></tr></thead>
         <tbody>
           ${[...expenses].sort((a,b)=>b.date.localeCompare(a.date)).slice(0, 5).map(e => `
             <tr><td>${fmtDate(e.date)}</td><td>${escHtml(e.category)}</td><td>${fmtPKR(e.amount)}</td><td>${escHtml(e.description||'—')}</td></tr>
           `).join('')}
         </tbody>
       </table>`
    : '<p class="text-muted text-small">No expenses in this range.</p>';

  const salesHtml = sales.length
    ? `<div class="report-section-title">Sales Summary</div>
       <table class="data-table" style="font-size:0.82rem;">
         <thead><tr><th>Date</th><th>Product</th><th>Qty</th><th>Total</th><th>Profit</th></tr></thead>
         <tbody>
           ${[...sales].reverse().slice(0, 5).map(s => `
             <tr><td>${fmtDate(s.date)}</td><td>${escHtml(s.productName)}</td><td>${s.qty}</td><td>${fmtPKR(s.qty*s.retailPrice)}</td><td class="profit-pos">${fmtPKR(s.qty*(s.retailPrice-s.wholesalePrice))}</td></tr>
           `).join('')}
         </tbody>
       </table>`
    : '<p class="text-muted text-small">No sales in this range.</p>';

  qs('#preview-summary').innerHTML  = summaryHtml;
  qs('#preview-products').innerHTML = prodHtml;
  qs('#preview-expenses').innerHTML = expHtml;
  if (qs('#preview-sales')) qs('#preview-sales').innerHTML = salesHtml;
}

function initReports() {
  qs('#export-pdf-btn').addEventListener('click', exportPDF);
  qs('#export-excel-btn').addEventListener('click', exportExcel);
  qs('#export-docs-btn').addEventListener('click', exportDocs);
  qs('#export-json-btn').addEventListener('click', exportJSON);
  qs('#print-btn').addEventListener('click', () => window.print());

  qs('#import-json-input').addEventListener('change', e => {
    importJSON(e.target.files[0]);
    e.target.value = '';
  });

  qsa('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.btn-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const preset = btn.dataset.preset;
      const now = new Date();
      if (preset === 'today') {
        qs('#report-date-from').value = today();
        qs('#report-date-to').value   = today();
      } else if (preset === 'week') {
        const start = new Date(now); start.setDate(now.getDate() - 7);
        qs('#report-date-from').value = start.toISOString().slice(0, 10);
        qs('#report-date-to').value   = today();
      } else if (preset === 'month') {
        qs('#report-date-from').value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        qs('#report-date-to').value   = today();
      } else {
        qs('#report-date-from').value = '';
        qs('#report-date-to').value   = '';
      }
      renderReportPreview();
    });
  });

  ['report-date-from', 'report-date-to'].forEach(id => {
    qs(`#${id}`)?.addEventListener('change', renderReportPreview);
  });
}

/* ─────────────────────────────────────────────────────────────
   16. DEMO DATA
───────────────────────────────────────────────────────────── */
function loadDemoData() {
  confirmDialog('Demo data load hoga. Existing data replace ho jayega. Sure?', () => {
    state.products = [
      { id: genId(), name: 'Water Pistol Gun (Small)', category: 'Gun',        wholesalePrice: 80,  qty: 25, retailPrice: 200, notes: 'Best seller', image: '', createdAt: today() },
      { id: genId(), name: 'Barbie Style Doll Set',    category: 'Doll',       wholesalePrice: 220, qty: 15, retailPrice: 500, notes: '', image: '', createdAt: today() },
      { id: genId(), name: 'Remote Control Car',       category: 'Car',        wholesalePrice: 450, qty: 10, retailPrice: 900, notes: 'Batteries included', image: '', createdAt: today() },
      { id: genId(), name: 'Soft Teddy Bear',          category: 'Toy',        wholesalePrice: 150, qty: 20, retailPrice: 350, notes: '', image: '', createdAt: today() },
      { id: genId(), name: 'Ludo Board Game',          category: 'Board Game', wholesalePrice: 120, qty: 8,  retailPrice: 280, notes: 'Family game', image: '', createdAt: today() },
      { id: genId(), name: 'Bubble Machine',           category: 'Toy',        wholesalePrice: 200, qty: 12, retailPrice: 450, notes: '', image: '', createdAt: today() },
      { id: genId(), name: 'Toy Kitchen Set',          category: 'Doll',       wholesalePrice: 350, qty: 2,  retailPrice: 750, notes: 'Low stock', image: '', createdAt: today() },
      { id: genId(), name: 'Spinning Top (Pack of 3)', category: 'Toy',        wholesalePrice: 60,  qty: 30, retailPrice: 150, notes: '', image: '', createdAt: today() },
    ];
    state.shopping = [
      { id: genId(), name: 'Toy Drum Set',       wholesalePrice: 300, qty: 5, shopNo: 'Shop 12, Block A', notes: 'Negotiate if qty > 10', purchased: false },
      { id: genId(), name: 'Football (Size 3)',   wholesalePrice: 180, qty: 8, shopNo: 'Shop 7',           notes: 'Check stitching',        purchased: false },
      { id: genId(), name: 'Building Blocks Set', wholesalePrice: 250, qty: 6, shopNo: 'Shop 42, Ground', notes: 'Al-Faisal Traders',       purchased: true  },
    ];
    state.expenses = [
      { id: genId(), category: 'Travel',   amount: 300, date: today(), description: 'Mandi Bahauddin to Lahore van fare', receipt: 'yes' },
      { id: genId(), category: 'Loading',  amount: 200, date: today(), description: 'Maal utha ke van mein rakhna',        receipt: 'no'  },
      { id: genId(), category: 'Lunch',    amount: 250, date: today(), description: 'Lunch at Shah Alam dhaba',            receipt: 'no'  },
      { id: genId(), category: 'Tea/Chai', amount: 80,  date: today(), description: '3 chai + biscuit',                    receipt: 'no'  },
      { id: genId(), category: 'Parking',  amount: 50,  date: today(), description: 'Van parking near market',             receipt: 'no'  },
    ];
    state.tasks = [
      { id: genId(), name: 'Shah Alam Market se khareeddari', deadlineDate: today(),         deadlineTime: '09:00', priority: 'High',   status: 'Pending',     description: 'Shopping list lekar jana, 8000 PKR saath rakhna' },
      { id: genId(), name: 'Price tags lagana',               deadlineDate: today(),         deadlineTime: '14:00', priority: 'High',   status: 'In Progress', description: 'Masking tape aur marker se prices likhna' },
      { id: genId(), name: 'Stall setup karna',               deadlineDate: today(),         deadlineTime: '17:00', priority: 'High',   status: 'Pending',     description: 'Mela mein jagah secure karke samaan lagana' },
      { id: genId(), name: 'Cash change ikattha karna',       deadlineDate: today(),         deadlineTime: '08:00', priority: 'Medium', status: 'Completed',   description: '500, 100, 50, 20 ki change rakhna' },
      { id: genId(), name: 'Stock count - subah aur sham',    deadlineDate: today(),         deadlineTime: '18:00', priority: 'Medium', status: 'Pending',     description: 'Kitna bika track karna' },
      { id: genId(), name: 'Kal ki remaining items plan karo',deadlineDate: getTomorrow(),   deadlineTime: '',      priority: 'Low',    status: 'Pending',     description: 'Jo nahi bika uska discount plan' },
    ];
    state.sales = [];

    ['products','shopping','expenses','tasks','sales'].forEach(k => save(k));
    renderDashboard(); updateNavBadges();
    toast('Demo data load ho gaya! Sab pages check karo.', 'success', 'Demo Ready');
    switchPage('dashboard');
  }, 'Load Demo Data');
}

function getTomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/* ─────────────────────────────────────────────────────────────
   17. RESET DATA (Bug Fix: confirm required)
───────────────────────────────────────────────────────────── */
function resetAllData() {
  confirmDialog('POORA DATA DELETE ho jayega — products, expenses, tasks, shopping, sales sab. Yeh undo nahi ho sakta!', () => {
    ['products','shopping','expenses','tasks','sales'].forEach(k => { state[k] = []; save(k); });
    state.cart = [];
    renderDashboard(); updateNavBadges();
    toast('Sab data reset ho gaya. Fresh start!', 'info', 'Reset Complete');
    switchPage('dashboard');
  }, '⚠️ Reset All Data');
}

/* ─────────────────────────────────────────────────────────────
   18. CONFIRM DIALOG
───────────────────────────────────────────────────────────── */
function initConfirmDialog() {
  qs('#confirm-ok-btn').addEventListener('click', () => {
    qs('#confirm-dialog').close();
    if (typeof state.confirmCallback === 'function') {
      state.confirmCallback();
      state.confirmCallback = null;
    }
  });
  qs('#confirm-cancel-btn').addEventListener('click', () => {
    qs('#confirm-dialog').close();
    state.confirmCallback = null;
  });
}

/* ─────────────────────────────────────────────────────────────
   19. PWA — Service Worker Registration
───────────────────────────────────────────────────────────── */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.warn('SW registration failed:', err));
  }
}

/* ─────────────────────────────────────────────────────────────
   20. GLOBAL EXPOSE (onclick in HTML attributes)
───────────────────────────────────────────────────────────── */
window.openEditProduct    = openEditProduct;
window.markSoldOut        = markSoldOut;
window.openRestockModal   = openRestockModal;
window.deleteProduct      = deleteProduct;
window.openEditShopping   = openEditShopping;
window.deleteShoppingItem = deleteShoppingItem;
window.togglePurchased    = togglePurchased;
window.openEditExpense    = openEditExpense;
window.deleteExpense      = deleteExpense;
window.openEditTask       = openEditTask;
window.deleteTask         = deleteTask;
window.toggleTaskComplete = toggleTaskComplete;

/* ─────────────────────────────────────────────────────────────
   21. APP INIT
───────────────────────────────────────────────────────────── */
function init() {
  load(); // Bug Fix: Load data FIRST before anything

  initSidebar();
  initDarkMode();
  initConfirmDialog();
  initCalculator();

  initQuickExpense();
  initProducts();
  initPOS();
  initShopping();
  initExpenses();
  initTasks();
  initReports();

  qs('#load-demo-btn').addEventListener('click', loadDemoData);
  qs('#reset-all-btn').addEventListener('click', resetAllData);

  /* Restore last page */
  const lastPage = localStorage.getItem(KEYS.page) || 'dashboard';
  switchPage(lastPage);

  /* Welcome toast if empty */
  if (!state.products.length && !state.tasks.length) {
    setTimeout(() => toast('Mela Manager mein khush aamdeed! Demo data load karo ya apna data add karo.', 'info', 'Shukriya!'), 600);
  }

  /* Register Service Worker for PWA */
  registerServiceWorker();

  console.log('%c🎪 Mela Stall Manager v2.0 Ready!', 'color:#0f7173;font-size:14px;font-weight:bold;');
}

document.addEventListener('DOMContentLoaded', init);