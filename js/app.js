/*******************************************************
 * RaveOne Interview Scheduler - Frontend (IST)
 *******************************************************/
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwO6BLEnMsMw-YOJxL3KyAnFaN1jFVE5lQvgfghbcCjvgkSVD4wlJ3SPz85UHGgWu9FKQ/exec';
const ADMIN_KEY = 'raveone_admin_token';

const state = {
  role: null, token: null, admin: false,
  client: null, candidate: null,
  clients: [], candidates: [], availability: [], bookings: [],
  config: { slot_duration: 60 }
};

/* ================= BOOT ================= */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('year').textContent = new Date().getFullYear();
  route();
  window.addEventListener('hashchange', route);
});

function route() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const params = new URLSearchParams(hash);
  const role = params.get('role');
  const token = params.get('token');

  if (hash.includes('admin')) return showAdminLogin();
  if (token && role === 'client') return showClient(token);
  if (token && role === 'candidate') return showCandidate(token);
  showAdminLogin();
}

/* ================= UI HELPERS ================= */
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }
function hideAll() { $$('.view').forEach(v => v.classList.add('hidden')); }
function show(id) { hideAll(); $('#' + id).classList.remove('hidden'); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* Toast */
function toast(message, kind = 'info', ms = 3200) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = message;
  $('#toast-stack').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, ms - 300);
  setTimeout(() => el.remove(), ms);
}

/* Modal helpers */
function openModal(id) { $('#' + id).classList.remove('hidden'); }
function closeModal(id) { $('#' + id).classList.add('hidden'); }
document.addEventListener('click', (e) => {
  if (e.target.matches('[data-close]')) {
    const modal = e.target.closest('.modal');
    if (modal) modal.classList.add('hidden');
  }
  if (e.target.matches('.modal')) e.target.classList.add('hidden');
});

/* Status tag */
function statusTag(status) {
  const map = {
    'available': 'ok', 'booked': 'info', 'confirmed': 'ok', 'cancelled': 'err',
    'Scheduled': 'info', 'New': 'warn', 'Interviewed': 'ok', 'Hired': 'ok',
    'Rejected': 'err', 'completed': 'ok', 'no-show': 'err'
  };
  const cls = map[status] || 'muted';
  return `<span class="tag ${cls}">${esc(status || '-')}</span>`;
}

/* Date helpers (display only — everything is IST) */
function todayIST() {
  // Use local time on the browser, but label as IST. Server enforces IST.
  const d = new Date();
  const off = d.getTimezoneOffset();
  // We display the calendar date the user sees; server treats it as IST.
  return d.toISOString().slice(0, 10);
}
function prettyDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function shortDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short' });
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ================= API ================= */
async function api(action, data = {}) {
  const body = new URLSearchParams({ action, ...data });
  if (state.admin) body.set('admin_token', localStorage.getItem(ADMIN_KEY));
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) throw new Error('Network error');
  return res.json();
}

/* ================= ADMIN ================= */
function showAdminLogin() {
  show('view-admin-login');
  $('#admin-login-error').textContent = '';
  $('#admin-login-form').onsubmit = async (e) => {
    e.preventDefault();
    const password = $('#admin-password').value;
    const r = await api('adminLogin', { password });
    if (r.success) {
      localStorage.setItem(ADMIN_KEY, password);
      state.admin = true;
      window.location.hash = '#/admin';
      showAdmin();
    } else {
      $('#admin-login-error').textContent = r.message;
    }
  };
}

async function showAdmin() {
  const saved = localStorage.getItem(ADMIN_KEY);
  if (!saved) return showAdminLogin();
  state.admin = true;
  state.role = 'admin';
  show('view-admin');
  bindAdminTabs();
  bindAdminActions();
  bindModals();
  await refreshAdminTotals();
  await loadClients();
}

function bindAdminTabs() {
  $$('#view-admin .tab').forEach(btn => {
    btn.onclick = () => {
      $$('#view-admin .tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('#view-admin .tab-panel').forEach(p => p.classList.add('hidden'));
      $('#tab-' + btn.dataset.tab).classList.remove('hidden');
      const t = btn.dataset.tab;
      if (t === 'candidates') loadCandidates();
      if (t === 'availability') loadAdminAvailability();
      if (t === 'bookings') loadBookings();
    };
  });
}

function bindAdminActions() {
  $('#open-add-client').onclick = () => openModal('modal-client');
  $('#open-add-cand').onclick = () => openModal('modal-cand');
  $('#open-bulk-cand').onclick = () => openModal('modal-bulk');
  $('#open-avail').onclick = () => {
    if (!state.clients.length) return toast('Add a client first', 'err');
    openModal('modal-avail');
  };

  $('#client-search').oninput = () => renderClients();
  $('#cand-search').oninput = () => renderCandidates();
  $('#cand-client-filter').onchange = () => loadCandidates();

  $('#refresh-bookings').onclick = () => loadBookings();
  $('#clear-date').onclick = () => { $('#bookings-date-filter').value = ''; loadBookings(); };
  $('#bookings-date-filter').onchange = () => loadBookings();
  $('#send-reminders').onclick = async () => {
    const r = await api('sendRemindersNow');
    toast(r.success ? 'Reminders dispatched.' : r.message, r.success ? 'ok' : 'err');
  };
  $('#export-csv').onclick = async () => {
    const r = await api('exportBookingsCsv');
    if (!r.success) return toast(r.message, 'err');
    const blob = new Blob([r.csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'raveone-bookings-' + todayIST() + '.csv'; a.click();
    URL.revokeObjectURL(url);
    toast('CSV downloaded', 'ok');
  };
}

async function refreshAdminTotals() {
  const r = await api('getAdminDashboard');
  if (!r.success) return;
  const t = r.totals;
  $('#today-label').textContent = 'Today: ' + prettyDate(r.today) + ' (IST)';
  $('#admin-totals').innerHTML = `
    <div class="card"><div class="num">${t.clients}</div><div class="label">Clients</div></div>
    <div class="card"><div class="num">${t.candidates}</div><div class="label">Candidates</div></div>
    <div class="card"><div class="num">${t.bookings}</div><div class="label">Total Bookings</div></div>
    <div class="card"><div class="num">${t.today}</div><div class="label">Today</div></div>
  `;
}

async function loadClients() {
  const r = await api('listClients');
  if (!r.success) return;
  state.clients = r.clients;
  renderClients();
  // populate selects
  const opts = r.clients.map(c => `<option value="${c.client_id}">${esc(c.company_name)}</option>`).join('');
  ['#cand-client-filter', '#modal-cand-client', '#modal-bulk-client', '#modal-avail-client', '#avail-client-select']
    .forEach(sel => { const el = $(sel); if (el) el.innerHTML = opts; });
}

function renderClients() {
  const q = ($('#client-search').value || '').toLowerCase();
  const list = state.clients.filter(c =>
    !q || c.company_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  if (!list.length) {
    $('#clients-list').innerHTML = '<div class="empty">No clients yet. Click "Add Client" to begin.</div>';
    return;
  }
  $('#clients-list').innerHTML = list.map(c => {
    const link = location.origin + location.pathname + '#role=client&token=' + c.token;
    return `<div class="item">
      <div class="main">
        <div class="title">${esc(c.company_name)}</div>
        <div class="meta">${esc(c.contact_name || '—')} · ${esc(c.email)} · Cap: ${esc(c.daily_cap)}/day · ${esc(c.candidate_count)} candidates</div>
      </div>
      <div class="actions">
        <button class="btn-ghost" data-copy="${esc(link)}">🔗 Copy Client Link</button>
      </div>
    </div>`;
  }).join('');
  $$('[data-copy]').forEach(b => b.onclick = () => copyLink(b.dataset.copy));
}

async function loadCandidates() {
  const clientId = $('#cand-client-filter').value;
  const r = await api('listCandidates', clientId ? { client_id: clientId } : {});
  if (!r.success) return;
  state.candidates = r.candidates;
  renderCandidates();
}

function renderCandidates() {
  const q = ($('#cand-search').value || '').toLowerCase();
  const clients = state.clients;
  const list = state.candidates.filter(k =>
    !q || k.name.toLowerCase().includes(q) || k.email.toLowerCase().includes(q));
  if (!list.length) {
    $('#candidates-list').innerHTML = '<div class="empty">No candidates yet. Add one or bulk import.</div>';
    return;
  }
  $('#candidates-list').innerHTML = list.map(k => {
    const cli = clients.find(c => c.client_id === k.client_id) || {};
    const link = location.origin + location.pathname + '#role=candidate&token=' + k.token;
    const when = k.booking_date ? `<span class="tag info">📅 ${esc(k.booking_date)} ${esc(k.booking_start)}–${esc(k.booking_end)} IST</span>` : '';
    return `<div class="item">
      <div class="main">
        <div class="title">${esc(k.name)} ${when}</div>
        <div class="meta">${esc(k.email)} · ${esc(cli.company_name || '')} · ${esc(k.role || '—')}</div>
      </div>
      <div class="actions">
        ${statusTag(k.status)}
        <button class="btn-ghost" data-copy="${esc(link)}">🔗 Copy Link</button>
      </div>
    </div>`;
  }).join('');
  $$('[data-copy]').forEach(b => b.onclick = () => copyLink(b.dataset.copy));
}

async function loadAdminAvailability() {
  const clientId = $('#avail-client-select').value;
  if (!clientId) {
    $('#availability-list').innerHTML = '<div class="empty">Pick a client to see their availability.</div>';
    return;
  }
  const r = await api('getClientAvailability', { client_id: clientId });
  if (!r.success) return;
  renderAvailability(r.availability, '#availability-list', true);
}

function renderAvailability(list, target, adminMode) {
  const el = $(target);
  if (!list.length) {
    el.innerHTML = '<div class="empty">No slots added yet. Click "Add Slots" to create some.</div>';
    return;
  }
  // Group by date
  const byDate = {};
  list.forEach(a => {
    const d = a.date;
    byDate[d] = byDate[d] || [];
    byDate[d].push(a);
  });
  const dates = Object.keys(byDate).sort();
  el.innerHTML = dates.map(d => {
    const slots = byDate[d];
    return `<div class="item" style="flex-direction:column;align-items:stretch;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div><strong>${prettyDate(d)}</strong> <span class="muted small">· ${slots.length} slots · IST</span></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${slots.map(s => {
          const bookable = s.status === 'available';
          const cls = bookable ? 'tag ok' : 'tag info';
          const btn = (adminMode && bookable)
            ? `<button class="btn-danger" style="padding:2px 8px;font-size:11px;margin-left:4px;" data-del="${s.avail_id}">×</button>` : '';
          return `<span class="${cls}" style="padding:5px 10px;">${esc(s.start_time)}–${esc(s.end_time)}${btn}</span>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
  $$('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this slot?')) return;
    const r = await api('removeAvailability', { avail_id: b.dataset.del });
    if (r.success) { toast('Slot removed', 'ok'); loadAdminAvailability(); }
    else toast(r.message, 'err');
  });
}

async function loadBookings() {
  const date = $('#bookings-date-filter').value;
  const r = await api('listBookings', date ? { date } : {});
  if (!r.success) return;
  state.bookings = r.bookings;
  if (!r.bookings.length) {
    $('#bookings-list').innerHTML = '<div class="empty">No bookings' + (date ? ' on this date' : '') + '.</div>';
    return;
  }
  const clients = state.clients;
  const cands = state.candidates.length ? state.candidates : (await api('listCandidates')).candidates || [];
  $('#bookings-list').innerHTML = r.bookings.map(b => {
    const c = clients.find(x => x.client_id === b.client_id) || {};
    const k = cands.find(x => x.candidate_id === b.candidate_id) || {};
    return `<div class="item">
      <div class="main">
        <div class="title">${esc(k.name || '—')} · ${esc(c.company_name || '')}</div>
        <div class="meta">📅 ${prettyDate(b.date)} · 🕐 ${esc(b.start_time)}–${esc(b.end_time)} IST · ${esc(k.email || '')}</div>
      </div>
      <div class="actions">
        ${statusTag(b.status)}
        ${b.status !== 'cancelled' ? `<button class="btn-danger" data-cancel="${b.booking_id}">Cancel</button>` : ''}
      </div>
    </div>`;
  }).join('');
  $$('[data-cancel]').forEach(b => b.onclick = async () => {
    if (!confirm('Cancel this interview?')) return;
    const r = await api('cancelBooking', { booking_id: b.dataset.cancel });
    if (r.success) { toast('Booking cancelled', 'ok'); loadBookings(); refreshAdminTotals(); }
    else toast(r.message, 'err');
  });
}

/* ================= MODALS ================= */
function bindModals() {
  // Add client
  $('#modal-client-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const r = await api('addClient', Object.fromEntries(fd));
    if (r.success) {
      toast('Client added', 'ok');
      e.target.reset();
      closeModal('modal-client');
      await loadClients();
      refreshAdminTotals();
      // auto-copy link
      const link = location.origin + location.pathname + '#role=client&token=' + r.client.token;
      copyLink(link, 'Client link copied to clipboard');
    } else toast(r.message, 'err');
  };

  // Add candidate
  $('#modal-cand-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const r = await api('addCandidate', Object.fromEntries(fd));
    if (r.success) {
      toast('Candidate added', 'ok');
      e.target.reset();
      closeModal('modal-cand');
      loadCandidates();
      refreshAdminTotals();
      const link = location.origin + location.pathname + '#role=candidate&token=' + r.candidate.token;
      copyLink(link, 'Candidate link copied');
    } else toast(r.message, 'err');
  };

  // Bulk add
  $('#modal-bulk-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    const r = await api('bulkAddCandidates', data);
    const box = $('#bulk-result');
    box.classList.remove('hidden');
    if (!r.success) {
      box.className = 'bulk-result err';
      box.textContent = r.message;
      return;
    }
    let html = `✅ Added ${r.added} candidate(s).`;
    if (r.skipped.length) html += `<br>⏭ Skipped (duplicate): ${r.skipped.length}`;
    if (r.errors.length) html += `<br>⚠ Errors:<ul>${r.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`;
    box.className = 'bulk-result ok';
    box.innerHTML = html;
    toast('Imported ' + r.added + ' candidate(s)', 'ok');
    loadCandidates();
    refreshAdminTotals();
  };

  // Availability modal
  bindAvailabilityModal('#modal-avail-form', '#avail-from', '#avail-to', '#avail-start', '#avail-end', '#avail-preview', async (data) => {
    let r;
    if (data.to_date && data.to_date !== data.from_date) {
      // multi-day
      const dates = [];
      let d = data.from_date;
      const end = data.to_date;
      let guard = 0;
      while (d <= end && guard++ < 90) { dates.push(d); d = addDays(d, 1); }
      r = await api('addAvailabilityMulti', {
        client_id: data.client_id,
        dates: JSON.stringify(dates),
        start_time: data.start_time,
        end_time: data.end_time,
        skip_weekends: data.skip_weekends ? 'true' : 'false'
      });
    } else {
      r = await api('addAvailability', {
        client_id: data.client_id,
        date: data.from_date,
        start_time: data.start_time,
        end_time: data.end_time
      });
    }
    return r;
  }, () => { loadAdminAvailability(); });

  // Client forms
  $('#client-open-cand').onclick = () => {
    // Repurpose the modal — set the client into a hidden field by disabling select
    $('#modal-cand-client').innerHTML = `<option value="${state.client.client_id}">${esc(state.client.company_name)}</option>`;
    openModal('modal-cand');
  };
  $('#client-open-bulk').onclick = () => {
    $('#modal-bulk-client').innerHTML = `<option value="${state.client.client_id}">${esc(state.client.company_name)}</option>`;
    openModal('modal-bulk');
  };
  $('#client-open-avail').onclick = () => {
    $('#modal-avail-client').innerHTML = `<option value="${state.client.client_id}">${esc(state.client.company_name)}</option>`;
    openModal('modal-avail');
  };
}

/* Availability modal: wires chips, preview, submit */
function bindAvailabilityModal(formSel, fromSel, toSel, startSel, endSel, previewSel, onSubmit, afterSuccess) {
  const form = $(formSel);

  function refreshPreview() {
    const from = $(fromSel).value;
    const to = $(toSel).value || from;
    const st = $(startSel).value;
    const en = $(endSel).value;
    const preview = $(previewSel);
    if (!from || !st || !en) { preview.innerHTML = '<span class="muted small">Pick a date and time range.</span>'; return; }
    const slots = computeSlots(st, en, state.config.slot_duration || 60);
    const dates = [];
    let d = from, guard = 0;
    while (d <= to && guard++ < 90) { dates.push(d); d = addDays(d, 1); }
    const skip = $('#skip-weekends').checked;
    const active = dates.filter(x => {
      if (!skip) return true;
      const day = new Date(x + 'T00:00:00').getDay();
      return day !== 0 && day !== 6;
    });
    preview.innerHTML = `
      <div class="row-line"><span class="lbl">Dates</span><span class="val">${active.length} day(s)${dates.length !== active.length ? ' (weekends skipped)' : ''}</span></div>
      <div class="row-line"><span class="lbl">Slot duration</span><span class="val">${state.config.slot_duration || 60} min</span></div>
      <div class="row-line"><span class="lbl">Slots per day</span><span class="val">${slots.length}</span></div>
      <div class="row-line"><span class="lbl">Total slots</span><span class="val">${active.length * slots.length}</span></div>
      <div class="slots-inline">${slots.map(s => `<span class="slot-pill">${s.start}–${s.end}</span>`).join('')}</div>
    `;
  }

  // Quick dates
  $$('#quick-dates .chip').forEach(c => c.onclick = () => {
    const today = todayIST();
    const map = {
      today: today,
      tomorrow: addDays(today, 1),
      next_mon: nextWeekday(1),
      next_week: addDays(today, 7)
    };
    const v = map[c.dataset.quick];
    $(fromSel).value = v;
    $(toSel).value = '';
    $$('#quick-dates .chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    refreshPreview();
  });

  // Quick times
  $$('#quick-times .chip').forEach(c => c.onclick = () => {
    $(startSel).value = c.dataset.start;
    $(endSel).value = c.dataset.end;
    $$('#quick-times .chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    refreshPreview();
  });

  [fromSel, toSel, startSel, endSel].forEach(s => $(s).oninput = refreshPreview);
  $('#skip-weekends').onchange = refreshPreview;
  refreshPreview();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form));
    fd.skip_weekends = $('#skip-weekends').checked;
    const r = await onSubmit(fd);
    if (r.success) {
      const n = r.created ? r.created.length : (r.created || 0);
      toast(`Added ${n} slot(s)`, 'ok');
      form.reset();
      $$('#quick-dates .chip, #quick-times .chip').forEach(c => c.classList.remove('active'));
      // re-set defaults
      $(startSel).value = '10:00'; $(endSel).value = '18:00';
      refreshPreview();
      closeModal(form.closest('.modal').id);
      afterSuccess && afterSuccess();
    } else toast(r.message || 'Failed', 'err');
  };
}

function computeSlots(startStr, endStr, duration) {
  const s = toMin(startStr), e = toMin(endStr);
  const out = [];
  let c = s;
  while (c + duration <= e) { out.push({ start: toTime(c), end: toTime(c + duration) }); c += duration; }
  return out;
}
function toMin(t) { const [h,m] = t.split(':').map(Number); return h*60 + (m||0); }
function toTime(m) { return String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0'); }
function nextWeekday(target) {
  // target: 1=Mon..7=Sun
  let d = new Date();
  let guard = 0;
  while (guard++ < 14) {
    d.setDate(d.getDate() + 1);
    if ((d.getDay() === 0 ? 7 : d.getDay()) === target) break;
  }
  return d.toISOString().slice(0, 10);
}

/* ================= CLIENT ================= */
async function showClient(token) {
  state.role = 'client';
  state.token = token;
  show('view-client');
  const r = await api('getClientInfo', { token });
  if (!r.success) { $('#client-title').textContent = 'Invalid client link.'; return; }
  state.client = r.client;
  $('#client-title').textContent = r.client.company_name + ' · Portal';

  // Load config for slot duration
  try {
    const ping = await api('ping');
    // no config endpoint exists; use default
  } catch (e) {}

  bindClientTabs();
  bindModals();
  bindClientActions();
  await loadClientAvailability();
  await loadClientCandidates();
  await loadClientBookings();
}

function bindClientTabs() {
  $$('#view-client .ctab').forEach(btn => {
    btn.onclick = () => {
      $$('#view-client .ctab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('#view-client .tab-panel').forEach(p => p.classList.add('hidden'));
      $('#ctab-' + btn.dataset.ctab).classList.remove('hidden');
    };
  });
}

function bindClientActions() {
  // Client-side availability submit uses same modal but with token, not admin
  const orig = $('#modal-avail-form').onsubmit;
  $('#modal-avail-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    fd.skip_weekends = $('#skip-weekends').checked;
    fd.token = state.token;
    let r;
    if (fd.to_date && fd.to_date !== fd.from_date) {
      const dates = [];
      let d = fd.from_date, guard = 0;
      while (d <= fd.to_date && guard++ < 90) { dates.push(d); d = addDays(d, 1); }
      r = await api('addAvailabilityMulti', {
        token: state.token,
        dates: JSON.stringify(dates),
        start_time: fd.start_time,
        end_time: fd.end_time,
        skip_weekends: fd.skip_weekends ? 'true' : 'false'
      });
    } else {
      r = await api('addAvailability', {
        token: state.token,
        date: fd.from_date,
        start_time: fd.start_time,
        end_time: fd.end_time
      });
    }
    if (r.success) {
      const n = r.created ? (Array.isArray(r.created) ? r.created.length : r.created) : 0;
      toast(`Added ${n} slot(s)`, 'ok');
      e.target.reset();
      $('#avail-start').value = '10:00'; $('#avail-end').value = '18:00';
      closeModal('modal-avail');
      loadClientAvailability();
    } else toast(r.message, 'err');
  };

  // Also rewrite candidate form when in client mode
  $('#modal-cand-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    fd.token = state.token;
    const r = await api('addCandidate', fd);
    if (r.success) {
      toast('Candidate added', 'ok');
      e.target.reset();
      closeModal('modal-cand');
      loadClientCandidates();
    } else toast(r.message, 'err');
  };

  $('#modal-bulk-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    fd.token = state.token;
    const r = await api('bulkAddCandidates', fd);
    const box = $('#bulk-result');
    box.classList.remove('hidden');
    if (!r.success) { box.className = 'bulk-result err'; box.textContent = r.message; return; }
    box.className = 'bulk-result ok';
    box.innerHTML = `✅ Added ${r.added}${r.skipped.length ? ` · Skipped ${r.skipped.length}` : ''}`;
    toast('Imported ' + r.added + ' candidate(s)', 'ok');
    loadClientCandidates();
  };
}

async function loadClientAvailability() {
  const r = await api('getClientAvailability', { token: state.token });
  if (!r.success) return;
  renderAvailability(r.availability, '#client-avail-list', true);
}

async function loadClientCandidates() {
  const r = await api('listCandidates', { token: state.token });
  if (!r.success) return;
  state.candidates = r.candidates;
  if (!r.candidates.length) {
    $('#client-cand-list').innerHTML = '<div class="empty">No candidates yet.</div>';
    return;
  }
  $('#client-cand-list').innerHTML = r.candidates.map(k => {
    const link = location.origin + location.pathname + '#role=candidate&token=' + k.token;
    const when = k.booking_date ? `<span class="tag info">📅 ${esc(k.booking_date)} ${esc(k.booking_start)}–${esc(k.booking_end)} IST</span>` : '';
    return `<div class="item">
      <div class="main">
        <div class="title">${esc(k.name)} ${when}</div>
        <div class="meta">${esc(k.email)} · ${esc(k.role || '—')}</div>
      </div>
      <div class="actions">
        ${statusTag(k.status)}
        <button class="btn-ghost" data-copy="${esc(link)}">🔗 Copy Link</button>
      </div>
    </div>`;
  }).join('');
  $$('[data-copy]').forEach(b => b.onclick = () => copyLink(b.dataset.copy));
}

async function loadClientBookings() {
  const r = await api('listBookings', { token: state.token });
  if (!r.success) return;
  if (!r.bookings.length) {
    $('#client-bookings-list').innerHTML = '<div class="empty">No bookings yet.</div>';
    return;
  }
  $('#client-bookings-list').innerHTML = r.bookings.map(b => {
    const k = state.candidates.find(x => x.candidate_id === b.candidate_id) || {};
    return `<div class="item">
      <div class="main">
        <div class="title">${esc(k.name || '—')}</div>
        <div class="meta">📅 ${prettyDate(b.date)} · 🕐 ${esc(b.start_time)}–${esc(b.end_time)} IST</div>
      </div>
      <div class="actions">${statusTag(b.status)}</div>
    </div>`;
  }).join('');
}

/* ================= CANDIDATE ================= */
async function showCandidate(token) {
  state.role = 'candidate';
  state.token = token;
  show('view-candidate');
  const info = await api('getCandidateInfo', { token });
  if (!info.success) {
    $('#candidate-info').textContent = 'Invalid or expired link.';
    return;
  }
  state.candidate = info.candidate;
  $('#candidate-info').textContent =
    `Hi ${info.candidate.name}, pick a slot below to schedule your interview with ${info.client.company_name}.`;

  const r = await api('getOpenSlots', { token });
  if (!r.success) return;
  const container = $('#candidate-slots');
  if (!r.slots.length) {
    container.innerHTML = '<div class="empty">No slots available yet. Please check back later.</div>';
    return;
  }
  container.innerHTML = r.slots.map(s => `
    <div class="slot ${s.bookable ? '' : 'disabled'}" data-avail="${s.avail_id}" data-bookable="${s.bookable}">
      <div class="day">${shortDay(s.date)}</div>
      <div class="date">${prettyDate(s.date).replace(/^[A-Za-z]+,\s*/, '')}</div>
      <div class="time">${esc(s.start_time)} – ${esc(s.end_time)}</div>
      ${s.bookable ? '<div class="muted small" style="margin-top:4px;">Click to book</div>' : `<div class="tag warn" style="margin-top:6px;">${esc(s.reason)}</div>`}
    </div>
  `).join('');
  container.querySelectorAll('.slot').forEach(el => {
    if (el.dataset.bookable !== 'true') return;
    el.onclick = async () => {
      if (!confirm('Confirm this interview slot?')) return;
      const res = await api('bookSlot', { token, avail_id: el.dataset.avail });
      const m = $('#candidate-message');
      if (res.success) {
        m.className = 'message ok';
        m.textContent = `✅ Interview confirmed for ${prettyDate(res.booking.date)} at ${res.booking.start_time} IST. Check your email for the invite.`;
        m.classList.remove('hidden');
        container.innerHTML = '';
        toast('Interview booked!', 'ok');
      } else {
        m.className = 'message err';
        m.textContent = res.message;
        m.classList.remove('hidden');
      }
    };
  });
}

/* ================= COPY ================= */
async function copyLink(link, message) {
  try {
    await navigator.clipboard.writeText(link);
    toast(message || 'Link copied', 'ok');
  } catch (e) {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = link; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    toast(message || 'Link copied', 'ok');
  }
}
