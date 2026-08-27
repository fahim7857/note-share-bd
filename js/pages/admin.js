// js/pages/admin.js
import { renderHeader, renderFooter, setupHeaderEvents } from '../components.js';
import { supabase } from '../supabase.js';

// ── Session helper ────────────────────────────────────────────────────────────
function getSession() {
  try { return JSON.parse(localStorage.getItem('al_session')) || null; }
  catch { return null; }
}

// ── Page init ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('app-header').innerHTML = renderHeader('admin');
  document.getElementById('app-footer').innerHTML = renderFooter();
  setupHeaderEvents();

  const session = getSession();

  // ── Access control ────────────────────────────────────────────────────────
  if (!session) {
    showAccessDenied();
    return;
  }

  // Check is_staff from users table
  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('id, email, is_staff')
    .eq('id', session.id)
    .maybeSingle();

  if (userErr || !userRow || !userRow.is_staff) {
    showAccessDenied();
    return;
  }

  // ── Show admin panel ──────────────────────────────────────────────────────
  document.getElementById('access-denied').classList.add('hidden');
  document.getElementById('admin-main').classList.remove('hidden');
  document.getElementById('admin-email-label').textContent = userRow.email;

  // Tab switching
  setupTabs();

  // Load all data
  await loadDashboard();
});

// ── Access denied ─────────────────────────────────────────────────────────────
function showAccessDenied() {
  document.getElementById('access-denied').classList.remove('hidden');
  document.getElementById('access-denied').classList.add('flex');
  document.getElementById('admin-main').classList.add('hidden');
}

// ── Tab setup ─────────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      // Update buttons
      document.querySelectorAll('.tab-btn').forEach((b) => {
        b.classList.remove('active');
        b.classList.add('text-gray-600', 'dark:text-gray-300');
      });
      btn.classList.add('active');
      btn.classList.remove('text-gray-600', 'dark:text-gray-300');

      // Update sections
      document.querySelectorAll('.tab-section').forEach((s) => s.classList.remove('active'));
      document.getElementById(`tab-${tab}`)?.classList.add('active');
    });
  });
}

// ── Load all dashboard data ───────────────────────────────────────────────────
async function loadDashboard() {
  // Fetch all in parallel
  const [
    { data: reports },
    { data: allNotes },
    { data: pendingNotes },
    { data: users },
    { data: profiles },
    { data: notesCount },
    { data: notesPerUser },
  ] = await Promise.all([
    supabase.from('reports').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
    supabase.from('notes').select('id, title, course, institution_name, institution_type, class_name, is_active, download_count, avg_rating, uploaded_by_id, created_at').order('created_at', { ascending: false }),
    supabase.from('notes').select('*').eq('is_approved', false).order('created_at', { ascending: false }),
    supabase.from('users').select('id, email, is_staff, is_active, date_joined').order('date_joined', { ascending: false }),
    supabase.from('profiles').select('user_id, full_name, institution_name, institution_type'),
    supabase.from('notes').select('id', { count: 'exact', head: true }),
    supabase.from('notes').select('uploaded_by_id, id'),
  ]);

  // Build lookup maps
  const profileMap    = {};
  (profiles || []).forEach((p) => { profileMap[p.user_id] = p; });

  const noteCountMap  = {};
  (notesPerUser || []).forEach((n) => { noteCountMap[n.uploaded_by_id] = (noteCountMap[n.uploaded_by_id] || 0) + 1; });

  // Build reporter name map for reports
  const reporterIds   = [...new Set((reports || []).map((r) => r.reporter_id).filter(Boolean))];
  let reporterMap     = {};
  if (reporterIds.length) {
    const { data: reporterProfiles } = await supabase
      .from('profiles').select('user_id, full_name').in('user_id', reporterIds);
    (reporterProfiles || []).forEach((p) => { reporterMap[p.user_id] = p.full_name; });
  }

  // Build note title map for reports
  const reportNoteIds = [...new Set((reports || []).map((r) => r.note_id).filter(Boolean))];
  let noteTitleMap    = {};
  if (reportNoteIds.length) {
    const { data: reportedNotes } = await supabase
      .from('notes').select('id, title').in('id', reportNoteIds);
    (reportedNotes || []).forEach((n) => { noteTitleMap[n.id] = n.title; });
  }

  // Stats
  document.getElementById('stat-reports').textContent = (reports || []).length;
  document.getElementById('stat-notes').textContent   = (allNotes || []).length;
  document.getElementById('stat-users').textContent   = (users || []).length;
  document.getElementById('reports-count-badge').textContent = (reports || []).length;
  document.getElementById('notes-pending-badge').textContent = (pendingNotes || []).length;

  // Render sections
  renderReports(reports || [], noteTitleMap, reporterMap);
  renderPendingNoteApprovals(pendingNotes || [], profileMap);
  renderNotes(allNotes || [], profileMap);
  renderUsers(users || [], profileMap, noteCountMap);
}

// ── Reports ───────────────────────────────────────────────────────────────────
function renderReports(reports, noteTitleMap, reporterMap) {
  const tbody = document.getElementById('reports-table-body');
  if (!tbody) return;

  if (!reports.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-gray-400 italic text-xs">No pending reports.</td></tr>`;
    return;
  }

  tbody.innerHTML = reports.map((r) => {
    const noteTitle    = noteTitleMap[r.note_id] || `Note #${r.note_id}`;
    const reporterName = reporterMap[r.reporter_id] || `User #${r.reporter_id}`;
    const date         = new Date(r.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });

    return `
      <tr>
        <td class="py-3 px-2 font-bold text-gray-900 dark:text-white max-w-[150px] truncate">${noteTitle}</td>
        <td class="py-3 px-2 text-rose-600 font-semibold text-[11px] max-w-[120px]">${r.reason}</td>
        <td class="py-3 px-2 text-gray-500 text-[11px]">${reporterName}</td>
        <td class="py-3 px-2 text-gray-400 text-[11px] whitespace-nowrap">${date}</td>
        <td class="py-3 px-2 text-right space-x-2 whitespace-nowrap">
          <button class="dismiss-report-btn text-xs font-bold text-gray-500 hover:text-gray-800 dark:hover:text-white"
            data-id="${r.id}">Dismiss</button>
          <button class="hide-note-btn text-xs font-bold text-rose-600 hover:underline"
            data-id="${r.id}" data-note-id="${r.note_id}">Hide Note</button>
        </td>
      </tr>`;
  }).join('');

  // Dismiss report
  tbody.querySelectorAll('.dismiss-report-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      await supabase.from('reports').update({ status: 'dismissed', reviewed_at: new Date().toISOString() }).eq('id', id);
      showToast('Report dismissed.', 'info');
      await loadDashboard();
    });
  });

  // Hide note (set is_active = false)
  tbody.querySelectorAll('.hide-note-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { id, noteId } = btn.dataset;
      await supabase.from('notes').update({ is_active: false }).eq('id', noteId);
      await supabase.from('reports').update({ status: 'resolved', reviewed_at: new Date().toISOString() }).eq('id', id);
      showToast('Note hidden and report resolved.', 'success');
      await loadDashboard();
    });
  });
}

// ── Pending Note Approvals ────────────────────────────────────────────────────
function renderPendingNoteApprovals(notes, profileMap) {
  const container = document.getElementById('admin-note-approvals-list');
  if (!container) return;

  if (!notes.length) {
    container.innerHTML = `<p class="text-xs text-gray-400 py-4 italic text-center">No notes waiting for approval.</p>`;
    return;
  }

  container.innerHTML = notes.map((n) => {
    const uploader = profileMap[n.uploaded_by_id];
    const name      = uploader?.full_name || `User #${n.uploaded_by_id}`;
    const inst      = uploader?.institution_name || '—';
    const badge     = n.institution_type === 'university' ? (n.course || '—') : (n.class_name || 'School');
    const date      = new Date(n.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });

    return `
      <div class="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 p-4 space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div class="space-y-1 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 text-[10px] font-bold uppercase">${badge}</span>
              <span class="text-[10px] text-gray-400">Uploaded: ${date}</span>
            </div>
            <h3 class="font-bold text-gray-900 dark:text-white text-sm">${n.title}</h3>
            <p class="text-xs text-gray-500">${n.institution_name || '—'}</p>
            <p class="text-[11px] text-indigo-500">Uploaded by: ${name} (${inst})</p>
          </div>
          <div class="flex gap-2 flex-shrink-0">
            <button class="approve-note-btn px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all"
              data-id="${n.id}">
              <span class="material-symbols-outlined text-sm align-middle">check</span> Approve
            </button>
            <button class="reject-note-btn px-4 py-2 bg-rose-50 dark:bg-rose-950/50 text-rose-600 text-xs font-bold rounded-xl hover:bg-rose-100 transition-all"
              data-id="${n.id}">
              <span class="material-symbols-outlined text-sm align-middle">close</span> Reject
            </button>
          </div>
        </div>
        ${n.description ? `<p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">${n.description}</p>` : ''}
      </div>`;
  }).join('');

  // Approve
  container.querySelectorAll('.approve-note-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await supabase.from('notes').update({ is_approved: true }).eq('id', btn.dataset.id);
      showToast('Note approved and published!', 'success');
      await loadDashboard();
    });
  });

  // Reject (delete)
  container.querySelectorAll('.reject-note-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Reject and permanently delete this note?')) return;
      await supabase.from('notes').delete().eq('id', btn.dataset.id);
      showToast('Note rejected and removed.', 'info');
      await loadDashboard();
    });
  });
}

// ── Notes management ──────────────────────────────────────────────────────────
function renderNotes(notes, profileMap) {
  const container = document.getElementById('admin-notes-list');
  if (!container) return;

  if (!notes.length) {
    container.innerHTML = `<p class="text-xs text-gray-400 py-4 italic text-center">No notes uploaded yet.</p>`;
    return;
  }

  container.innerHTML = notes.map((n) => {
    const uploader  = profileMap[n.uploaded_by_id];
    const upName    = uploader?.full_name || `User #${n.uploaded_by_id}`;
    const inst      = n.institution_name || '—';
    const badge     = n.institution_type === 'university' ? (n.course || '—') : (n.class_name || 'School');
    const isHidden  = !n.is_active;

    return `
      <div class="flex items-center justify-between p-3 rounded-xl ${isHidden ? 'bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30' : 'bg-gray-50 dark:bg-gray-800/50'} text-xs gap-3">
        <div class="space-y-0.5 truncate flex-1 min-w-0">
          <div class="font-bold text-gray-900 dark:text-white truncate">${n.title}</div>
          <div class="text-[10px] text-gray-400">${badge} · ${inst} · by ${upName}</div>
          <div class="text-[10px] text-gray-400">↓ ${n.download_count || 0} downloads · ★ ${parseFloat(n.avg_rating || 0).toFixed(1)}</div>
          ${isHidden ? `<span class="text-[10px] text-rose-500 font-bold">Hidden</span>` : ''}
        </div>
        <div class="flex gap-1.5 flex-shrink-0">
          ${isHidden
            ? `<button class="restore-note-btn px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 rounded-lg font-bold hover:bg-emerald-100 transition-colors text-[11px]" data-id="${n.id}">Restore</button>`
            : `<button class="hide-note-admin-btn px-2.5 py-1 bg-amber-50 dark:bg-amber-950/50 text-amber-600 rounded-lg font-bold hover:bg-amber-100 transition-colors text-[11px]" data-id="${n.id}">Hide</button>`
          }
          <button class="delete-note-admin-btn px-2.5 py-1 bg-rose-50 dark:bg-rose-950/50 text-rose-600 rounded-lg font-bold hover:bg-rose-100 transition-colors text-[11px]" data-id="${n.id}">Delete</button>
        </div>
      </div>`;
  }).join('');

  // Hide note
  container.querySelectorAll('.hide-note-admin-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await supabase.from('notes').update({ is_active: false }).eq('id', btn.dataset.id);
      showToast('Note hidden.', 'info');
      await loadDashboard();
    });
  });

  // Restore note
  container.querySelectorAll('.restore-note-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await supabase.from('notes').update({ is_active: true }).eq('id', btn.dataset.id);
      showToast('Note restored.', 'success');
      await loadDashboard();
    });
  });

  // Delete note permanently
  container.querySelectorAll('.delete-note-admin-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Permanently delete this note? This cannot be undone.')) return;
      await supabase.from('notes').delete().eq('id', btn.dataset.id);
      showToast('Note permanently deleted.', 'info');
      await loadDashboard();
    });
  });
}

// ── Users ─────────────────────────────────────────────────────────────────────
function renderUsers(users, profileMap, noteCountMap) {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-gray-400 italic text-xs">No registered users.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map((u) => {
    const profile   = profileMap[u.id];
    const inst      = profile?.institution_name || '—';
    const noteCount = noteCountMap[u.id] || 0;
    const joined    = new Date(u.date_joined).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });

    return `
      <tr>
        <td class="py-3 px-2 text-xs">
          <div class="font-bold text-gray-900 dark:text-white">${u.email}</div>
          <div class="text-[10px] text-gray-400">Joined: ${joined}</div>
        </td>
        <td class="py-3 px-2 text-[11px] text-gray-500 max-w-[140px] truncate">${inst}</td>
        <td class="py-3 px-2 text-center">
          <span class="px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold">${noteCount}</span>
        </td>
        <td class="py-3 px-2">
          <span class="px-2 py-0.5 rounded-full ${u.is_staff ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'} text-[10px] font-bold">
            ${u.is_staff ? 'Admin' : 'Student'}
          </span>
        </td>
        <td class="py-3 px-2 text-right space-x-2 whitespace-nowrap">
          <button class="toggle-staff-btn text-[11px] font-bold text-indigo-600 hover:underline"
            data-id="${u.id}" data-staff="${u.is_staff}">
            ${u.is_staff ? 'Demote' : 'Make Admin'}
          </button>
          <button class="toggle-active-btn text-[11px] font-bold ${u.is_active ? 'text-rose-500 hover:underline' : 'text-emerald-600 hover:underline'}"
            data-id="${u.id}" data-active="${u.is_active}">
            ${u.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>`;
  }).join('');

  // Toggle admin role
  tbody.querySelectorAll('.toggle-staff-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const isStaff = btn.dataset.staff === 'true';
      await supabase.from('users').update({ is_staff: !isStaff }).eq('id', btn.dataset.id);
      showToast(isStaff ? 'Admin role removed.' : 'Admin role granted.', 'info');
      await loadDashboard();
    });
  });

  // Toggle active status
  tbody.querySelectorAll('.toggle-active-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const isActive = btn.dataset.active === 'true';
      await supabase.from('users').update({ is_active: !isActive }).eq('id', btn.dataset.id);
      showToast(isActive ? 'User deactivated.' : 'User activated.', 'info');
      await loadDashboard();
    });
  });
}

// ── Toast helper ──────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  // Use appStore.showToast if available, otherwise simple alert fallback
  try {
    const { appStore } = window.__academiaStore || {};
    if (appStore?.showToast) { appStore.showToast(msg, type); return; }
  } catch {}

  // Inline minimal toast
  const t = document.createElement('div');
  t.className = `fixed bottom-6 right-6 z-[200] px-4 py-3 rounded-2xl text-xs font-bold text-white shadow-xl transition-all
    ${type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-rose-600' : 'bg-indigo-600'}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}