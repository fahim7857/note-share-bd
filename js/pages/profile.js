// js/pages/profile.js
import { appStore, UNIVERSITIES_LIST } from '../store.js';
import { renderHeader, renderFooter, setupHeaderEvents } from '../components.js';
import { supabase, AVATARS_BUCKET } from '../supabase.js';

// ── Session helper ────────────────────────────────────────────────────────────
function getSession() {
  try {
    return JSON.parse(localStorage.getItem('al_session')) || null;
  } catch {
    return null;
  }
}

// ── Profile picture upload state (used by the edit modal) ────────────────────
let selectedPictureFile = null;
let removePictureFlag   = false;

// ── Page init ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('app-header').innerHTML = renderHeader('profile');
  document.getElementById('app-footer').innerHTML = renderFooter();
  setupHeaderEvents();

  const session = getSession();

  if (!session) {
    renderNotLoggedIn();
    return;
  }

  // ── Which profile are we looking at? ──────────────────────────────────────
  // If the link has ?userId=..., that's the profile to show (someone else's).
  // Otherwise, fall back to the logged-in user's own id.
  const urlParams    = new URLSearchParams(window.location.search);
  const viewedUserId = urlParams.get('userId') || session.id;
  const isOwnProfile = viewedUserId === session.id;

  const profile = await fetchProfile(viewedUserId);

  if (!profile || !profile.is_profile_complete) {
    if (isOwnProfile) {
      renderIncompleteProfile(session.email);
      openModal(session, profile);
    } else {
      renderNotFound();
    }
  } else {
    renderFullProfile(session, profile, isOwnProfile, viewedUserId);
  }

  document.getElementById('close-edit-modal-btn')?.addEventListener('click', closeModal);

  document.getElementById('edit-profile-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget && profile?.is_profile_complete) closeModal();
  });
});

// ── Fetch profile ─────────────────────────────────────────────────────────────
async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) { console.error('[Profile fetch error]', error.message); return null; }
  return data;
}

// ── Fetch user's uploaded notes ───────────────────────────────────────────────
async function fetchMyUploads(userId) {
  const { data, error } = await supabase
    .from('notes')
    .select('id, title, course, institution_name, institution_type, class_name, subject, category, tags, download_count, avg_rating, rating_count, created_at, is_active')
    .eq('uploaded_by_id', userId)
    .order('created_at', { ascending: false });
  if (error) { console.error('[Uploads fetch error]', error.message); return []; }
  return data || [];
}


// ── Fetch user's saved notes ──────────────────────────────────────────────────
async function fetchSavedNotes(userId) {
  const { data: savedRows, error: savedErr } = await supabase
    .from('saved_notes')
    .select('note_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (savedErr) {
    console.error('[Saved notes fetch error]', savedErr.message);
    return [];
  }
  if (!savedRows?.length) return [];

  const noteIds = savedRows.map((r) => r.note_id);
  const { data: notesData, error: notesErr } = await supabase
    .from('notes')
    .select('id, title, course, institution_name, institution_type, class_name, subject, category, tags, download_count, avg_rating, rating_count, created_at, is_active')
    .in('id', noteIds);
  if (notesErr) {
    console.error('[Saved note details fetch error]', notesErr.message);
    return [];
  }

  const notesById = new Map((notesData || []).map((note) => [note.id, note]));
  return noteIds.map((noteId) => notesById.get(noteId)).filter(Boolean);
}

// ── Render: not logged in ─────────────────────────────────────────────────────
function renderNotLoggedIn() {
  document.getElementById('profile-content').innerHTML = `
    <div class="text-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800 p-8 space-y-5 max-w-lg mx-auto">
      <div class="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
        <span class="material-symbols-outlined text-3xl">lock</span>
      </div>
      <div class="space-y-2">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white font-headline">Please Sign In First</h2>
        <p class="text-xs text-gray-500 dark:text-gray-400 font-medium">You must be registered and signed in to access your student profile.</p>
      </div>
      <div class="flex items-center justify-center gap-3 pt-2">
        <a href="./login.html" class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md">Sign In Now</a>
        <a href="./register.html" class="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold rounded-xl text-xs">Create Account</a>
      </div>
    </div>`;
}

// ── Render: viewed profile not available ──────────────────────────────────────
function renderNotFound() {
  document.getElementById('profile-content').innerHTML = `
    <div class="text-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800 p-8 space-y-3 max-w-lg mx-auto">
      <span class="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600">person_off</span>
      <p class="text-xs text-gray-500 dark:text-gray-400 font-medium">This profile isn't available.</p>
      <a href="./notes.html" class="inline-block text-xs font-bold text-indigo-600 hover:underline">Back to Notes</a>
    </div>`;
}

// ── Render: profile incomplete ────────────────────────────────────────────────
function renderIncompleteProfile(email) {
  document.getElementById('profile-content').innerHTML = `
    <div class="complete-banner">
      <span class="material-symbols-outlined text-4xl opacity-80">account_circle</span>
      <div>
        <p class="text-sm font-bold">Welcome, ${email}!</p>
        <p class="text-xs opacity-80 mt-0.5">Complete your profile to unlock all features, including notes upload.</p>
      </div>
    </div>`;
}

// ── Avatar helpers ─────────────────────────────────────────────────────────────
function avatarHtml(profile, sizeClasses = 'w-20 h-20 text-3xl') {
  if (profile?.profile_picture_url) {
    return `<div class="${sizeClasses} rounded-3xl border-4 border-indigo-500/20 shadow-md bg-cover bg-center flex-shrink-0" style="background-image:url('${profile.profile_picture_url}')"></div>`;
  }
  const initial = (profile?.full_name || '?').charAt(0).toUpperCase();
  return `<div class="${sizeClasses} rounded-3xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-extrabold border-4 border-indigo-500/20 shadow-md flex-shrink-0">${initial}</div>`;
}

// ── Note card HTML ────────────────────────────────────────────────────────────
function noteCardHtml(note) {
  const isUniversity = note.institution_type === 'university';
  const badge        = isUniversity ? (note.course || '—') : (note.class_name || 'School');
  const sub          = isUniversity
    ? (note.institution_name || '—')
    : `${note.institution_name || '—'} · ${note.subject || ''}`;
  const avg          = parseFloat(note.avg_rating || 0).toFixed(1);
  const tags         = Array.isArray(note.tags) ? note.tags : [];
  const inactive     = !note.is_active;

  return `
    <div class="bg-white dark:bg-gray-900 rounded-2xl border ${inactive ? 'border-rose-200 dark:border-rose-900/50 opacity-60' : 'border-gray-100 dark:border-gray-800'} p-5 shadow-sm flex flex-col justify-between gap-3">
      <div class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <span class="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold truncate max-w-[120px]">${badge}</span>
          <div class="flex items-center gap-1 text-[11px] font-bold text-amber-500 flex-shrink-0">
            <span class="material-symbols-outlined text-sm" style="font-variation-settings:'FILL' 1">star</span>
            ${avg}
            <span class="text-gray-400 font-normal">(${note.rating_count || 0})</span>
          </div>
        </div>

        <h3 class="text-sm font-bold text-gray-900 dark:text-white font-headline line-clamp-2">${note.title}</h3>

        <p class="text-[11px] text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
          <span class="material-symbols-outlined text-xs">${isUniversity ? 'school' : 'menu_book'}</span>
          ${sub}
        </p>

        <div class="flex flex-wrap gap-1">
          ${tags.slice(0, 3).map((t) => `<span class="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-[10px] text-gray-600 dark:text-gray-300">#${t}</span>`).join('')}
        </div>

        ${inactive ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-rose-500"><span class="material-symbols-outlined text-xs">visibility_off</span> Hidden by moderator</span>` : ''}
      </div>

      <div class="border-t border-gray-100 dark:border-gray-800 pt-3 flex items-center justify-between text-[11px]">
        <div class="flex items-center gap-1 text-gray-400">
          <span class="material-symbols-outlined text-sm">download</span>
          <span>${note.download_count || 0} downloads</span>
        </div>
        <a href="./pdf-viewer.html?noteId=${note.id}"
          class="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-bold hover:bg-indigo-100 transition-colors flex items-center gap-1 text-xs">
          <span class="material-symbols-outlined text-sm">visibility</span> View
        </a>
      </div>
    </div>`;
}

// ── Render: full profile ──────────────────────────────────────────────────────
async function renderFullProfile(session, profile, isOwnProfile = true, viewedUserId = session.id) {
  const container = document.getElementById('profile-content');

  const isUniversity     = profile.institution_type === 'university';
  const institutionLabel = profile.institution_name || '—';
  const subLabel         = isUniversity
    ? ''
    : `${profile.class_name || ''} · ${profile.group_name || ''}`;

  // Fetch uploads for whichever profile we're viewing (not always the logged-in user)
  const myUploads = await fetchMyUploads(viewedUserId);
  const mySavedNotes = isOwnProfile ? await fetchSavedNotes(viewedUserId) : [];

  container.innerHTML = `
    <!-- Profile Card -->
    <div class="bg-white dark:bg-gray-900 rounded-3xl p-6 sm:p-8 border border-gray-100 dark:border-gray-800 shadow-sm space-y-6">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div class="flex items-center gap-5">
          ${avatarHtml(profile, 'w-20 h-20 text-3xl')}
          <div class="space-y-1">
            <h1 class="text-2xl font-extrabold text-gray-900 dark:text-white font-headline">${profile.full_name}</h1>
            ${isOwnProfile ? `<p class="text-xs font-semibold text-gray-500 dark:text-gray-400">${session.email}</p>` : ''}
            <div class="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-bold pt-0.5">
              <span class="material-symbols-outlined text-base">${isUniversity ? 'school' : 'menu_book'}</span>
              <span>${institutionLabel}</span>
            </div>
            ${subLabel.trim() !== '·' ? `<p class="text-[11px] text-gray-400">${subLabel}</p>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          ${isOwnProfile ? `
          <button id="open-edit-profile-btn"
            class="px-5 py-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 font-bold rounded-2xl text-xs flex items-center gap-2 transition-all">
            <span class="material-symbols-outlined text-base">edit</span> Edit Profile
          </button>
          <button id="open-delete-account-btn"
            class="px-5 py-2.5 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/50 font-bold rounded-2xl text-xs flex items-center gap-2 transition-all border border-rose-200 dark:border-rose-900/50">
            <span class="material-symbols-outlined text-base">delete_forever</span> Delete Account
          </button>
          ` : ''}
        </div>
      </div>

      <!-- Info Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-100 dark:border-gray-800 text-xs">
        ${isUniversity ? `
        ` : `
          <div class="bg-gray-50 dark:bg-gray-800/40 p-3.5 rounded-2xl">
            <span class="text-gray-400 text-[11px] block">Class</span>
            <span class="font-bold text-gray-800 dark:text-gray-200 mt-0.5 block">${profile.class_name || 'N/A'}</span>
          </div>
          <div class="bg-gray-50 dark:bg-gray-800/40 p-3.5 rounded-2xl">
            <span class="text-gray-400 text-[11px] block">Group</span>
            <span class="font-bold text-gray-800 dark:text-gray-200 mt-0.5 block">${profile.group_name || 'N/A'}</span>
          </div>
        `}
        <div class="bg-gray-50 dark:bg-gray-800/40 p-3.5 rounded-2xl">
          <span class="text-gray-400 text-[11px] block">Type</span>
          <span class="font-bold text-gray-800 dark:text-gray-200 mt-0.5 block">${isUniversity ? 'University' : 'School / College'}</span>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800/40 p-3.5 rounded-2xl">
          <span class="text-gray-400 text-[11px] block">Total Uploads</span>
          <span class="font-bold text-gray-800 dark:text-gray-200 mt-0.5 block">${myUploads.length}</span>
        </div>
      </div>

      ${profile.bio ? `<p class="text-xs text-gray-600 dark:text-gray-300 italic pt-2">"${profile.bio}"</p>` : ''}
    </div>

    <!-- Tabs -->
    <div class="space-y-6">
      <div class="flex border-b border-gray-200 dark:border-gray-800 gap-6 text-sm font-bold">
        <button id="tab-uploads-btn" class="pb-3 border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
          <span class="material-symbols-outlined text-lg">upload_file</span>
          <span>My Uploads (${myUploads.length})</span>
        </button>
        <button id="tab-saved-btn" class="pb-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex items-center gap-2">
          <span class="material-symbols-outlined text-lg">bookmark</span>
          <span>Saved Notes</span>
        </button>
      </div>

      <!-- My Uploads (default active) -->
      <div id="uploaded-notes-section">
        ${myUploads.length === 0
          ? `<div class="py-12 text-center bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800 p-8 space-y-3">
               <span class="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600">upload_file</span>
               <p class="text-xs text-gray-500 dark:text-gray-400 font-medium">You haven't uploaded any notes yet.</p>
               <a href="./notes.html?action=upload" class="inline-block px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-md">Upload Your First Note</a>
             </div>`
          : `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">${myUploads.map(noteCardHtml).join('')}</div>`
        }
      </div>

      <!-- Saved Notes (hidden by default) -->
      <div id="saved-notes-section" class="hidden">
        ${mySavedNotes.length === 0
          ? `<div class="py-12 text-center bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800 p-8 space-y-2">
               <span class="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600">bookmark</span>
               <p class="text-xs text-gray-500 dark:text-gray-400 font-medium">No saved notes yet. Bookmark notes while browsing!</p>
               <a href="./notes.html" class="inline-block text-xs font-bold text-indigo-600 hover:underline">Explore Academic Notes</a>
             </div>`
          : `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">${mySavedNotes.map(noteCardHtml).join('')}</div>`
        }
      </div>
  `;

  // Edit button
  document.getElementById('open-edit-profile-btn')?.addEventListener('click', () => {
    document.getElementById('modal-title').textContent = 'Edit Profile';
    openModal(session, profile);
  });

  // Delete account button
  document.getElementById('open-delete-account-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('delete-account-modal');
    const input = document.getElementById('delete-confirm-input');
    const errEl = document.getElementById('delete-confirm-error');
    if (input) input.value = '';
    if (errEl) errEl.classList.add('hidden');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => input?.focus(), 100);
  });

  setupDeleteAccountModal(session);

  // Tab switching
  const uploadsTab  = document.getElementById('tab-uploads-btn');
  const savedTab    = document.getElementById('tab-saved-btn');
  const uploadsSec  = document.getElementById('uploaded-notes-section');
  const savedSec    = document.getElementById('saved-notes-section');
  const activeClass   = 'pb-3 border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 flex items-center gap-2 font-bold';
  const inactiveClass = 'pb-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex items-center gap-2 font-medium';

  uploadsTab?.addEventListener('click', () => {
    uploadsTab.className = activeClass;
    savedTab.className   = inactiveClass;
    uploadsSec.classList.remove('hidden');
    savedSec.classList.add('hidden');
  });

  savedTab?.addEventListener('click', () => {
    savedTab.className   = activeClass;
    uploadsTab.className = inactiveClass;
    savedSec.classList.remove('hidden');
    uploadsSec.classList.add('hidden');
  });
}

// ── Modal open / close ────────────────────────────────────────────────────────
function openModal(session, existingProfile = null) {
  const modal = document.getElementById('edit-profile-modal');
  modal.classList.remove('hidden');

  // Reset picture state every time the modal opens
  selectedPictureFile = null;
  removePictureFlag   = false;
  const pictureInput = document.getElementById('profile-picture-input');
  if (pictureInput) pictureInput.value = '';
  setPicturePreview(existingProfile?.full_name || session.email, existingProfile?.profile_picture_url || null);

  if (existingProfile) {
    document.getElementById('profile-name-input').value        = existingProfile.full_name || '';
    document.getElementById('profile-bio-input').value         = existingProfile.bio || '';
    document.getElementById('profile-school-name-input').value = existingProfile.institution_name || '';
    document.getElementById('profile-class-input').value       = existingProfile.class_name || '';
    document.getElementById('profile-group-input').value       = existingProfile.group_name || '';

    if (existingProfile.institution_type) {
      selectInstitutionType(existingProfile.institution_type);
      if (existingProfile.institution_type === 'university') {
        document.getElementById('profile-univ-input').value = existingProfile.institution_name || '';
      }
    }
  }

  setupModalEvents(session, existingProfile);
}

function closeModal() {
  document.getElementById('edit-profile-modal').classList.add('hidden');
}

// ── Institution type toggle ───────────────────────────────────────────────────
function selectInstitutionType(type) {
  document.getElementById('institution-type-val').value = type;

  const btnUniv   = document.getElementById('btn-university');
  const btnSchool = document.getElementById('btn-school');
  const secUniv   = document.getElementById('section-university');
  const secSchool = document.getElementById('section-school');

  if (type === 'university') {
    btnUniv.classList.add('selected');    btnSchool.classList.remove('selected');
    secUniv.classList.add('active');      secSchool.classList.remove('active');
  } else {
    btnSchool.classList.add('selected');  btnUniv.classList.remove('selected');
    secSchool.classList.add('active');    secUniv.classList.remove('active');
  }
}

// ── University autocomplete ───────────────────────────────────────────────────
function setupAutocomplete() {
  const input    = document.getElementById('profile-univ-input');
  const dropdown = document.getElementById('univ-dropdown');
  if (!input || !dropdown) return;

  let activeIdx = -1;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    dropdown.innerHTML = '';
    activeIdx = -1;
    if (!q) { dropdown.classList.remove('open'); return; }

    const matches = UNIVERSITIES_LIST.filter((u) => u.toLowerCase().includes(q)).slice(0, 10);
    if (!matches.length) { dropdown.classList.remove('open'); return; }

    matches.forEach((u) => {
      const item = document.createElement('div');
      item.className   = 'autocomplete-item';
      item.textContent = u;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = u;
        dropdown.classList.remove('open');
      });
      dropdown.appendChild(item);
    });
    dropdown.classList.add('open');
  });

  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.autocomplete-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown')  { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); input.value = items[activeIdx].textContent; dropdown.classList.remove('open'); return; }
    else if (e.key === 'Escape') { dropdown.classList.remove('open'); return; }
    items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
    if (activeIdx >= 0) input.value = items[activeIdx].textContent;
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) dropdown.classList.remove('open');
  });
}

// ── Profile picture: validation, preview & upload ─────────────────────────────
function validateImageFile(file) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) return 'Please choose a JPG, PNG, or WEBP image.';
  const maxSizeMB = 3;
  if (file.size > maxSizeMB * 1024 * 1024) return `Image must be smaller than ${maxSizeMB}MB.`;
  return null;
}

async function uploadProfilePicture(userId, file) {
  const fileExt  = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const filePath = `${userId}-${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(filePath, file, { cacheControl: '3600', upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

function setPicturePreview(fallbackName, imageUrl) {
  const preview   = document.getElementById('profile-picture-preview');
  const removeBtn = document.getElementById('remove-picture-btn');
  if (!preview) return;

  if (imageUrl) {
    preview.style.backgroundImage = `url('${imageUrl}')`;
    preview.textContent = '';
    removeBtn?.classList.remove('hidden');
  } else {
    preview.style.backgroundImage = 'none';
    preview.textContent = (fallbackName || '?').charAt(0).toUpperCase();
    removeBtn?.classList.add('hidden');
  }
}

function setupPictureControls(existingProfile) {
  const changeBtn = document.getElementById('change-picture-btn');
  const removeBtn = document.getElementById('remove-picture-btn');
  const input     = document.getElementById('profile-picture-input');
  const errEl     = document.getElementById('profile-picture-error');

  changeBtn?.addEventListener('click', () => input?.click());

  input?.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;

    errEl?.classList.add('hidden');
    const validationMsg = validateImageFile(file);
    if (validationMsg) {
      if (errEl) { errEl.textContent = validationMsg; errEl.classList.remove('hidden'); }
      input.value = '';
      return;
    }

    selectedPictureFile = file;
    removePictureFlag   = false;

    const reader = new FileReader();
    reader.onload = () => setPicturePreview(null, reader.result);
    reader.readAsDataURL(file);
  });

  removeBtn?.addEventListener('click', () => {
    selectedPictureFile = null;
    removePictureFlag   = true;
    const nameInput = document.getElementById('profile-name-input');
    setPicturePreview(nameInput?.value || existingProfile?.full_name, null);
  });
}

// ── Modal form events ─────────────────────────────────────────────────────────
function setupModalEvents(session, existingProfile) {
  document.getElementById('btn-university')?.addEventListener('click', () => selectInstitutionType('university'));
  document.getElementById('btn-school')?.addEventListener('click',     () => selectInstitutionType('school_college'));
  setupAutocomplete();

  const form  = document.getElementById('edit-profile-form');
  const errEl = document.getElementById('profile-form-error');

  // Remove old listeners by cloning
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);

  document.getElementById('btn-university')?.addEventListener('click', () => selectInstitutionType('university'));
  document.getElementById('btn-school')?.addEventListener('click',     () => selectInstitutionType('school_college'));
  setupAutocomplete();
  setupPictureControls(existingProfile);

  document.getElementById('edit-profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl2 = document.getElementById('profile-form-error');
    errEl2.classList.add('hidden');

    const instType = document.getElementById('institution-type-val').value;
    const name     = document.getElementById('profile-name-input').value.trim();
    const bio      = document.getElementById('profile-bio-input').value.trim();

    if (!name)     { showError(errEl2, 'Full name is required.'); return; }
    if (!instType) { showError(errEl2, 'Please select University or School/College.'); return; }

    let payload = {
      user_id:             session.id,
      full_name:           name,
      bio:                 bio || null,
      institution_type:    instType,
      is_profile_complete: true,
    };

    if (instType === 'university') {
      const univName = document.getElementById('profile-univ-input').value.trim();

      if (!univName) { showError(errEl2, 'Please enter your university name.'); return; }

      payload = { ...payload, institution_name: univName, university_id: null, department: null, batch: null, reg_no: null, class_name: null, group_name: null };

    } else {
      const schoolName = document.getElementById('profile-school-name-input').value.trim();
      const className  = document.getElementById('profile-class-input').value;
      const groupName  = document.getElementById('profile-group-input').value;

      if (!schoolName) { showError(errEl2, 'Please enter your school/college name.'); return; }
      if (!className)  { showError(errEl2, 'Please select your class.'); return; }
      if (!groupName)  { showError(errEl2, 'Please select your group.'); return; }

      payload = { ...payload, institution_name: schoolName, university_id: null, department: null, batch: null, reg_no: null, class_name: className, group_name: groupName };
    }

    const saveBtn = document.getElementById('profile-save-btn');
    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';

    try {
      // Handle the optional profile picture
      if (selectedPictureFile) {
        saveBtn.textContent = 'Uploading photo…';
        payload.profile_picture_url = await uploadProfilePicture(session.id, selectedPictureFile);
      } else if (removePictureFlag) {
        payload.profile_picture_url = null;
      }
      saveBtn.textContent = 'Saving…';

      let dbError;
      if (existingProfile) {
        const { error } = await supabase.from('profiles').update(payload).eq('user_id', session.id);
        dbError = error;
      } else {
        const { error } = await supabase.from('profiles').insert(payload);
        dbError = error;
      }
      if (dbError) throw new Error(dbError.message);

      selectedPictureFile = null;
      removePictureFlag   = false;

      appStore.showToast('Profile saved successfully!', 'success');
      closeModal();

      const updated = await fetchProfile(session.id);
      await renderFullProfile(session, updated);

      document.getElementById('app-header').innerHTML = renderHeader('profile');
      setupHeaderEvents();

    } catch (err) {
      console.error('[Profile save error]', err);
      showError(document.getElementById('profile-form-error'), err.message || 'Something went wrong.');
    } finally {
      const btn = document.getElementById('profile-save-btn');
      if (btn) { btn.disabled = false; btn.textContent = 'Save Profile'; }
    }
  });
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ── Delete Account Modal ──────────────────────────────────────────────────────
function setupDeleteAccountModal(session) {
  const modal     = document.getElementById('delete-account-modal');
  const input     = document.getElementById('delete-confirm-input');
  const errEl     = document.getElementById('delete-confirm-error');
  const cancelBtn = document.getElementById('delete-cancel-btn');
  const confirmBtn = document.getElementById('delete-confirm-btn');

  if (!modal) return;

  // Close on cancel
  cancelBtn?.addEventListener('click', () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (input) input.value = '';
    if (errEl) errEl.classList.add('hidden');
  });

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      if (input) input.value = '';
      if (errEl) errEl.classList.add('hidden');
    }
  });

  // Confirm delete
  confirmBtn?.addEventListener('click', async () => {
    if (!input || input.value.trim() !== 'DELETE') {
      errEl?.classList.remove('hidden');
      input?.focus();
      return;
    }

    confirmBtn.disabled    = true;
    confirmBtn.textContent = 'Deleting…';

    try {
      // 1. Delete profile row
      await supabase.from('profiles').delete().eq('user_id', session.id);

      // 2. Delete user row — notes FK is ON DELETE CASCADE in your schema,
      //    so uploaded notes are removed automatically
      const { error: userErr } = await supabase
        .from('users')
        .delete()
        .eq('id', session.id);

      if (userErr) throw new Error(userErr.message);

      // 3. Clear local session
      localStorage.removeItem('al_session');

      // 4. Redirect to home
      window.location.href = './index.html';

    } catch (err) {
      console.error('[Delete account error]', err);
      errEl.textContent = 'Something went wrong: ' + (err.message || 'Please try again.');
      errEl.classList.remove('hidden');
      confirmBtn.disabled    = false;
      confirmBtn.innerHTML   = '<span class="material-symbols-outlined text-sm">delete_forever</span> Delete Forever';
    }
  });
}