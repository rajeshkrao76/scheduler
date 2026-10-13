/*******************************************************
 * RaveOne Interview Scheduler - Frontend
 *******************************************************/
const GAS_URL = 'PASTE_YOUR_WEB_APP_EXEC_URL_HERE';
const ADMIN_KEY = 'raveone_admin_token';

const state = {
  role: null,         // 'admin' | 'client' | 'candidate'
  token: null,        // client or candidate token
  admin: false,
  client: null,
  candidate: null,
  clients: [],
  candidates: [],
  config: {},
};

/* ---------- Boot ---------- */
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

  if (window.location.hash.includes('/admin')) return showAdminLogin();
  if (token && role === 'client') return showClient(token);
  if (token && role === 'candidate') return showCandidate(token);

  // fallback → admin login (since this is internal tool)
  showAdminLogin();
}

/* ---------- View helpers ---------- */
function hideAll() {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
}
function show(id) {
  hideAll();
  document.getElementById(id).classList.remove('hidden');
}
function msg(el, text, kind = 'ok') {
  el.textContent = text;
  el.className = 'message ' + kind;
  el.classList.remove('hidden');
}
function hide(el) { el.classList.add('hidden'); }

/* ---------- API ---------- */
async function api(action, data = {}) {
  const body = new URLSearchParams({ action, ...data });
  if (state.admin) body.set('admin_token', localStorage.getItem(ADMIN_KEY));
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  return res.json();
}

/* ================= ADMIN ================= */
function showAdminLogin() {
  show('view-admin-login');
  document.getElementById('admin-login-error').textContent = '';
  document.getElementById('admin-login-form').onsubmit = async (e) => {
    e.preventDefault();
    const password = document.getElementById('admin-password').value;
    const r = await api('adminLogin', { password });
    if (r.success) {
      localStorage.setItem(ADMIN_KEY, password);
      state.admin = true;
      window.location.hash = '#/admin';
      showAdmin();
    } else {
      document.getElementById('admin-login-error').textContent = r.message;
    }
  };
}

async function showAdmin() {
  const saved = localStorage.getItem(ADMIN_KEY);
  if (!saved) return showAdminLogin();
  state.admin = true;
  state.role = 'admin';
  show('view-admin');
  await refreshAdminTotals();
  await loadClients();
  await loadConfig();
  bindAdminTabs();
  bindAdminForms();
}

function bindAdminTabs() {
  document.querySelectorAll('#view-admin .tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#view-admin .tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('#view-admin .tab-panel').forEach(p => p.classList.add('hidden'));
      document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
      if (btn.dataset.tab === 'bookings') loadBookings();
      if (btn.dataset.tab === 'candidates') loadCandidates();
      if (btn.dataset.tab === 'availability') loadAdminAvailability();
    };
  });
}

function bindAdminForms() {
  // Add client
  document.getElementById('add-client-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const r = await api('addClient', Object.fromEntries(fd));
    if (r.success) { e.target.reset(); await loadClients(); }
    else alert(r.message);
  };

  // Add candidate
  document.getElementById('add-candidate-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const r = await api('addCandidate', Object.fromEntries(fd));
    if (r.success) { e.target.reset(); await loadCandidates(); }
    else alert(r.message);
  };

  // Add availability
  document.getElementById('add-availability-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const r = await api('addAvailability', Object.fromEntries(fd));
    if (r.success) { e.target.reset(); await loadAdminAvailability(); }
    else alert(r.message);
  };

  document.getElementById('export-csv').onclick = async () => {
    const r = await api('exportBookingsCsv');
    if (!r.success) return alert(r.message);
    const blob = new Blob([r.csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'bookings.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  document.getElementById('refresh-bookings').onclick = loadBookings;
  document.getElementById('send-reminders').onclick = async () => {
    const r = await api('sendRemindersNow');
    alert(r.success ? 'Reminders dispatched.' : r.message);
  };

  document.getElementById('config-form').onsubmit = async (e) => {
    e.preventDefault();
    alert('Config saving is done by editing the Config sheet directly.');
  };
}

async function refreshAdminTotals() {
  const r = await api('getAdminDashboard');
  if (!r.success) return;
  const t = r.totals;
  document.getElementById('admin-totals').innerHTML = `
    <div class="card"><div class="num">${t.clients}</div><div class="label">Clients</div></div>
    <div class="card"><div class="num">${t.candidates}</div><div class="label">Candidates</div></div>
    <div class="card"><div class="num">${t.bookings}</div><div class="label">Bookings</div></div>
    <div class="card"><div class="num">${t.today}</div><div class="label">Today</div></div>
  `;
}

async function loadClients() {
  const r = await api('listClients');
  if (!r.success) return;
  state.clients = r.clients;
  const html = `
    <tr><th>Company</th><th>Contact</th><th>Email</th><th>Cap</th><th>Client link</th><th>Candidate links</th></tr>
    ${r.clients.map(c => {
      const link = location.origin + location.pathname + '#role=client&token=' + c.token;
      return `<tr>
        <td>${esc(c.company_name)}</td>
        <td>${esc(c.contact_name)}</td>
        <td>${esc(c.email)}</td>
        <td>${esc(c.daily_cap)}</td>
        <td class="copy-link">${link}</td>
        <td><button class="ghost" data-copylink="${link}">Copy link</button></td>
      </tr>`;
    }).join('')}
  `;
  document.getElementById('clients-table').innerHTML = html;
  document.querySelectorAll('[data-copylink]').forEach(b => {
    b.onclick = () => { navigator.clipboard.writeText(b.dataset.copylink); b.textContent = 'Copied!'; };
  });
  // Populate selects
  const selectHtml = r.clients.map(c => `<option value="${c.client_id}">${esc(c.company_name)}</option>`).join('');
  document.getElementById('cand-client-select').innerHTML = selectHtml;
  document.getElementById('avail-client-select').innerHTML = selectHtml;
}

async function loadCandidates() {
  const r = await api('listCandidates');
  if (!r.success) return;
  const clients = state.clients;
  document.getElementById('candidates-table').innerHTML = `
    <tr><th>Name</th><th>Email</th><th>Company</th><th>Role</th><th>Status</th><th>Candidate link</th></tr>
    ${r.candidates.map(k => {
      const cli = clients.find(c => c.client_id === k.client_id) || {};
      const link = location.origin + location.pathname + '#role=candidate&token=' + k.token;
      return `<tr>
        <td>${esc(k.name)}</td>
        <td>${esc(k.email)}</td>
        <td>${esc(cli.company_name)}</td>
        <td>${esc(k.role)}</td>
        <td>${statusTag(k.status)}</td>
        <td><button class="ghost" data-copylink="${link}">Copy link</button> <span class="copy-link">${link}</span></td>
      </tr>`;
    }).join('')}
  `;
  document.querySelectorAll('[data-copylink]').forEach(b => {
    b.onclick = () => { navigator.clipboard.writeText(b.dataset.copylink); b.textContent = 'Copied!'; };
  });
}

async function loadAdminAvailability() {
  const r = await api('getClientAvailability', { client_id: '' });
  if (!r.success) { document.getElementById('availability-table').innerHTML = '<tr><td>Select a client to view slots.</td></tr>'; return; }
  // Load all clients' availability in loop
  let rows = '';
  for (const c of state.clients) {
    const rr = await api('getClientAvailability', { client_id: c.client_id });
    if (rr.success) rr.availability.forEach(a => {
      rows += `<tr>
        <td>${esc(c.company_name)}</td>
        <td>${esc(a.date)}</td>
        <td>${esc(a.start_time)}</td>
        <td>${esc(a.end_time)}</td>
        <td>${statusTag(a.status)}</td>
        <td>${a.status === 'available' ? `<button class="danger" data-del="${a.avail_id}">Delete</button>` : ''}</td>
      </tr>`;
    });
  }
  document.getElementById('availability-table').innerHTML = `
    <tr><th>Company</th><th>Date</th><th>Start</th><th>End</th><th>Status</th><th></th></tr>${rows}
  `;
  document.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Delete this slot?')) return;
      await api('removeAvailability', { avail_id: b.dataset.del });
      loadAdminAvailability();
    };
  });
}

async function loadBookings() {
  const r = await api('listBookings');
  if (!r.success) return alert(r.message);
  const clients = state.clients;
  const cands = (await api('listCandidates')).candidates || [];
  document.getElementById('bookings-table').innerHTML = `
    <tr><th>Date</th><th>Time</th><th>Company</th><th>Candidate</th><th>Email</th><th>Status</th><th></th></tr>
    ${r.bookings.map(b => {
      const c = clients.find(x => x.client_id === b.client_id) || {};
      const k = cands.find(x => x.candidate_id === b.candidate_id) || {};
      return `<tr>
        <td>${esc(b.date)}</td>
        <td>${esc(b.start_time)} - ${esc(b.end_time)}</td>
        <td>${esc(c.company_name)}</td>
        <td>${esc(k.name)}</td>
        <td>${esc(k.email)}</td>
        <td>${statusTag(b.status)}</td>
        <td>${b.status !== 'cancelled' ? `<button class="danger" data-cancel="${b.booking_id}">Cancel</button>` : ''}</td>
      </tr>`;
    }).join('')}
  `;
  document.querySelectorAll('[data-cancel]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Cancel this booking?')) return;
      await api('cancelBooking', { booking_id: b.dataset.cancel });
      loadBookings();
    };
  });
}

async function loadConfig() {
  // Read config from backend by calling a pseudo-endpoint? For simplicity we hardcode defaults in UI
  document.getElementById('cfg-cap').value = 4;
  document.getElementById('cfg-slot').value = 60;
  document.getElementById('cfg-company').value = 'RaveOne';
  document.getElementById('cfg-url').value = 'https://www.raveone.in';
}

/* ================= CLIENT ================= */
async function showClient(token) {
  state.role = 'client';
  state.token = token;
  show('view-client');
  const r = await api('getClientInfo', { token });
  if (!r.success) { document.getElementById('client-title').textContent = 'Invalid client link.'; return; }
  state.client = r.client;
  document.getElementById('client-title').textContent = r.client.company_name + ' · Portal';
  bindClientTabs();
  bindClientForms();
  await loadClientAvailability();
  await loadClientCandidates();
  await loadClientBookings();
}

function bindClientTabs() {
  document.querySelectorAll('#view-client .ctab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#view-client .ctab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('#view-client .tab-panel').forEach(p => p.classList.add('hidden'));
      document.getElementById('ctab-' + btn.dataset.ctab).classList.remove('hidden');
    };
  });
}

function bindClientForms() {
  document.getElementById('client-avail-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    fd.append('token', state.token);
    const r = await api('addAvailability', Object.fromEntries(fd));
    if (r.success) { e.target.reset(); loadClientAvailability(); }
    else alert(r.message);
  };
  document.getElementById('client-cand-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    fd.append('token', state.token);
    const r = await api('addCandidate', Object.fromEntries(fd));
    if (r.success) { e.target.reset(); loadClientCandidates(); }
    else alert(r.message);
  };
}

async function loadClientAvailability() {
  const r = await api('getClientAvailability', { token: state.token });
  if (!r.success) return;
  document.getElementById('client-avail-table').innerHTML = `
    <tr><th>Date</th><th>Start</th><th>End</th><th>Status</th><th></th></tr>
    ${r.availability.map(a => `<tr>
      <td>${esc(a.date)}</td>
      <td>${esc(a.start_time)}</td>
      <td>${esc(a.end_time)}</td>
      <td>${statusTag(a.status)}</td>
      <td>${a.status === 'available' ? `<button class="danger" data-delc="${a.avail_id}">Delete</button>` : ''}</td>
    </tr>`).join('')}
  `;
  document.querySelectorAll('[data-delc]').forEach(b => {
    b.onclick = async () => {
      await api('removeAvailability', { avail_id: b.dataset.delc, token: state.token });
      loadClientAvailability();
    };
  });
}

async function loadClientCandidates() {
  const r = await api('listCandidates', { token: state.token });
  if (!r.success) return;
  state.candidates = r.candidates;
  document.getElementById('client-cand-table').innerHTML = `
    <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Candidate link</th></tr>
    ${r.candidates.map(k => {
      const link = location.origin + location.pathname + '#role=candidate&token=' + k.token;
      return `<tr>
        <td>${esc(k.name)}</td>
        <td>${esc(k.email)}</td>
        <td>${esc(k.role)}</td>
        <td>${statusTag(k.status)}</td>
        <td><button class="ghost" data-copylink="${link}">Copy link</button></td>
      </tr>`;
    }).join('')}
  `;
  document.querySelectorAll('[data-copylink]').forEach(b => {
    b.onclick = () => { navigator.clipboard.writeText(b.dataset.copylink); b.textContent = 'Copied!'; };
  });
}

async function loadClientBookings() {
  const r = await api('listBookings', { token: state.token });
  if (!r.success) return;
  document.getElementById('client-bookings-table').innerHTML = `
    <tr><th>Date</th><th>Time</th><th>Candidate</th><th>Status</th></tr>
    ${r.bookings.map(b => {
      const k = state.candidates.find(x => x.candidate_id === b.candidate_id) || {};
      return `<tr>
        <td>${esc(b.date)}</td>
        <td>${esc(b.start_time)} - ${esc(b.end_time)}</td>
        <td>${esc(k.name)}</td>
        <td>${statusTag(b.status)}</td>
      </tr>`;
    }).join('')}
  `;
}

/* ================= CANDIDATE ================= */
async function showCandidate(token) {
  state.role = 'candidate';
  state.token = token;
  show('view-candidate');
  const info = await api('getCandidateInfo', { token });
  if (!info.success) {
    document.getElementById('candidate-info').textContent = 'Invalid or expired link.';
    return;
  }
  state.candidate = info.candidate;
  document.getElementById('candidate-info').textContent =
    `Hi ${info.candidate.name}, pick a slot to schedule your interview with ${info.client.company_name}.`;

  const r = await api('getOpenSlots', { token });
  if (!r.success) return;
  const container = document.getElementById('candidate-slots');
  if (!r.slots.length) {
    container.innerHTML = '<p class="muted">No slots available yet. Please check back later.</p>';
    return;
  }
  container.innerHTML = r.slots.map(s => `
    <div class="slot ${s.bookable ? '' : 'disabled'}" data-avail="${s.avail_id}" data-bookable="${s.bookable}">
      <div class="date">${esc(s.date)}</div>
      <div class="time">${esc(s.start_time)} - ${esc(s.end_time)}</div>
      ${s.bookable ? '' : `<div class="tag warn">${esc(s.reason)}</div>`}
    </div>
  `).join('');
  container.querySelectorAll('.slot').forEach(el => {
    if (el.dataset.bookable !== 'true') return;
    el.onclick = async () => {
      if (!confirm('Confirm this interview slot?')) return;
      const res = await api('bookSlot', { token, avail_id: el.dataset.avail });
      const m = document.getElementById('candidate-message');
      if (res.success) {
        msg(m, 'Interview confirmed for ' + res.booking.date + ' at ' + res.booking.start_time + '. Check your email.', 'ok');
        container.innerHTML = '';
      } else {
        msg(m, res.message, 'err');
      }
    };
  });
}

/* ---------- Utility ---------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function statusTag(status) {
  const map = {
    'available': 'ok', 'booked': 'info', 'confirmed': 'ok', 'cancelled': 'err',
    'Scheduled': 'info', 'New': 'warn', 'Interviewed': 'ok', 'Hired': 'ok', 'Rejected': 'err'
  };
  const cls = map[status] || 'info';
  return `<span class="tag ${cls}">${esc(status || '-')}</span>`;
}
