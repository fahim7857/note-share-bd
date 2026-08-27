// js/pages/notes.js
import { appStore, UNIVERSITIES_LIST } from '../store.js';
import { renderHeader, renderFooter, setupHeaderEvents } from '../components.js';
import { supabase } from '../supabase.js';

   const CLOUDINARY_CLOUD_NAME   = 'iz9knbtr';
   const CLOUDINARY_UPLOAD_PRESET = 'notely_notes';

// ── Session helper ────────────────────────────────────────────────────────────
function getSession() {
  try { return JSON.parse(localStorage.getItem('al_session')) || null; }
  catch { return null; }
}

// ── Ratings cache ─────────────────────────────────────────────────────────────
let currentRatingsMap = {};

// ── Page init ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('app-header').innerHTML = renderHeader('notes');
  document.getElementById('app-footer').innerHTML = renderFooter();
  setupHeaderEvents();

  const params      = new URLSearchParams(window.location.search);
  const searchParam = params.get('search');
  const actionParam = params.get('action');

  if (searchParam) {
    const el = document.getElementById('notes-search-input');
    if (el) el.value = searchParam;
  }

  const uploadModal = document.getElementById('upload-modal');
  if (actionParam === 'upload' && uploadModal) uploadModal.classList.remove('hidden');

  renderNotes();

  document.getElementById('notes-search-input')?.addEventListener('input', renderNotes);
  document.getElementById('notes-type-filter')?.addEventListener('change', renderNotes);
  document.getElementById('notes-category-filter')?.addEventListener('change', renderNotes);

  document.getElementById('open-upload-modal-btn')?.addEventListener('click', () => {
    uploadModal.classList.remove('hidden');
  });
  document.getElementById('close-upload-modal-btn')?.addEventListener('click', () => {
    uploadModal.classList.add('hidden');
    resetUploadForm();
  });

  document.getElementById('close-report-modal-btn')?.addEventListener('click', () => {
    document.getElementById('report-modal')?.classList.add('hidden');
  });

  // ── Report form submit — Supabase ─────────────────────────────────────────
  document.getElementById('report-note-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const session = getSession();
    if (!session) {
      appStore.showToast('Please sign in to report a note.', 'error');
      return;
    }
    const noteId = document.getElementById('report-note-id').value;
    const reason = document.getElementById('report-reason-select').value;
    const desc   = document.getElementById('report-desc-input').value.trim();

    const { error } = await supabase
      .from('reports')
      .insert({
        reporter_id: session.id,
        note_id:     Number(noteId),
        reason:      reason.substring(0, 255),
        description: desc || null,
        status:      'pending',
      });

    if (error) {
      appStore.showToast('Failed to submit report: ' + error.message, 'error');
      return;
    }
    appStore.showToast('Report submitted to moderators.', 'info');
    document.getElementById('report-modal')?.classList.add('hidden');
  });

  setupUploadForm();
});

// ── Institution type toggle ───────────────────────────────────────────────────
let selectedUploadType = '';

function selectUploadType(type) {
  selectedUploadType = type;
  document.getElementById('upload-institution-type').value = type;

  const btnUniv   = document.getElementById('upload-btn-university');
  const btnSchool = document.getElementById('upload-btn-school');
  const secUniv   = document.getElementById('upload-section-university');
  const secSchool = document.getElementById('upload-section-school');

  if (type === 'university') {
    btnUniv.classList.add('selected');    btnSchool.classList.remove('selected');
    secUniv.classList.add('active');      secSchool.classList.remove('active');
  } else {
    btnSchool.classList.add('selected');  btnUniv.classList.remove('selected');
    secSchool.classList.add('active');    secUniv.classList.remove('active');
  }
}

// ── University autocomplete ───────────────────────────────────────────────────
function setupUniversityAutocomplete() {
  const input    = document.getElementById('note-univ-input');
  const dropdown = document.getElementById('upload-univ-dropdown');
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
      item.className = 'autocomplete-item';
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

// ── PDF file input / drag-drop ────────────────────────────────────────────────
let selectedPdfFile = null;

function setupPdfInput() {
  const dropZone  = document.getElementById('pdf-drop-zone');
  const fileInput = document.getElementById('note-pdf-file');
  const fileLabel = document.getElementById('selected-file-name');

  dropZone?.addEventListener('click', () => fileInput.click());
  dropZone?.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-indigo-400'); });
  dropZone?.addEventListener('dragleave', () => { dropZone.classList.remove('border-indigo-400'); });
  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-indigo-400');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') handleFileSelect(file);
    else appStore.showToast('Only PDF files are allowed.', 'error');
  });
  fileInput?.addEventListener('change', () => { if (fileInput.files[0]) handleFileSelect(fileInput.files[0]); });

  function handleFileSelect(file) {
    if (file.size > 20 * 1024 * 1024) { appStore.showToast('File size exceeds 20 MB limit.', 'error'); return; }
    selectedPdfFile = file;
    if (fileLabel) {
      fileLabel.textContent = `✓ ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
      fileLabel.classList.remove('hidden');
    }
  }
}

// ── Upload form ───────────────────────────────────────────────────────────────
function setupUploadForm() {
  document.getElementById('upload-btn-university')?.addEventListener('click', () => selectUploadType('university'));
  document.getElementById('upload-btn-school')?.addEventListener('click',     () => selectUploadType('school_college'));

  setupUniversityAutocomplete();
  setupPdfInput();

  const form      = document.getElementById('upload-note-form');
  const submitBtn = document.getElementById('upload-submit-btn');
  const errEl     = document.getElementById('upload-form-error');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.classList.add('hidden');

    const session = getSession();
    if (!session) { showUploadError(errEl, 'You must be logged in to upload notes.'); return; }

    const title    = document.getElementById('note-title-input').value.trim();
    const instType = document.getElementById('upload-institution-type').value;

    if (!title)         { showUploadError(errEl, 'Document title is required.'); return; }
    if (!instType)      { showUploadError(errEl, 'Please select University or School/College.'); return; }
    if (!selectedPdfFile) { showUploadError(errEl, 'Please select a PDF file to upload.'); return; }

    let meta = { title, institution_type: instType };

    if (instType === 'university') {
      const univName = document.getElementById('note-univ-input').value.trim();
      const code     = document.getElementById('note-code-input').value.trim();
      const dept     = document.getElementById('note-dept-input').value.trim();
      const cat      = document.getElementById('note-cat-input').value;
      if (!univName) { showUploadError(errEl, 'University name is required.'); return; }
      if (!code)     { showUploadError(errEl, 'Course code is required.'); return; }
      if (!dept)     { showUploadError(errEl, 'Department is required.'); return; }
      meta = { ...meta, institution_name: univName, course: code, department: dept, category: cat };
    } else {
      const schoolName = document.getElementById('note-school-name-input').value.trim();
      const className  = document.getElementById('note-class-input').value;
      const subject    = document.getElementById('note-subject-input').value.trim();
      const chapter    = document.getElementById('note-chapter-input').value.trim();
      if (!schoolName) { showUploadError(errEl, 'School/College name is required.'); return; }
      if (!className)  { showUploadError(errEl, 'Class is required.'); return; }
      if (!subject)    { showUploadError(errEl, 'Subject is required.'); return; }
      meta = { ...meta, institution_name: schoolName, course: subject, class_name: className, subject, chapter: chapter || null, category: 'Lecture Notes', department: null };
    }

    const tagsStr    = document.getElementById('note-tags-input').value;
    meta.tags        = tagsStr.split(',').map((t) => t.trim()).filter(Boolean);
    meta.description = document.getElementById('note-desc-input').value.trim() || null;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading…';

    let fileUrl = '';
    try {
       fileUrl = await uploadToCloudinary(selectedPdfFile);
    } catch (err) {
      showUploadError(errEl, 'Upload failed: ' + (err.message || 'Unknown error'));
      submitBtn.disabled = false; submitBtn.textContent = 'Publish Academic Note';
      return;
    }

    submitBtn.textContent = 'Saving…';

    const { error: dbErr } = await supabase.from('notes').insert({
      title:            meta.title,
      course:           meta.course,
      file_url:         fileUrl,
      uploaded_by_id:   session.id,
      category:         meta.category       || 'Lecture Notes',
      tags:             meta.tags           || [],
      description:      meta.description    || null,
      department:       meta.department     || null,
      institution_type: meta.institution_type,
      institution_name: meta.institution_name,
      class_name:       meta.class_name     || null,
      subject:          meta.subject        || null,
      chapter:          meta.chapter        || null,
      is_approved:      false, // CHANGED: was true — now goes to admin's pending queue first
    });

    if (dbErr) {
      showUploadError(errEl, 'Database error: ' + dbErr.message);
      submitBtn.disabled = false; submitBtn.textContent = 'Publish Academic Note';
      return;
    }

    appStore.showToast('Note uploaded! It will be visible after admin approval.', 'success'); // CHANGED: message reflects pending approval
    document.getElementById('upload-modal').classList.add('hidden');
    resetUploadForm();
    renderNotes();
    submitBtn.disabled = false; submitBtn.textContent = 'Publish Academic Note';
  });
}

async function uploadToCloudinary(file) {
  const progressWrap = document.getElementById('upload-progress-wrap');
  const progressFill = document.getElementById('progress-bar-fill');
  const progressPct  = document.getElementById('progress-pct');
  progressWrap?.classList.add('show');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', 'notes');

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      if (progressFill) progressFill.style.width = pct + '%';
      if (progressPct)  progressPct.textContent   = pct + '%';
    };

    xhr.onload = () => {
      progressWrap?.classList.remove('show');
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        resolve(data.secure_url);
      } else {
        reject(new Error('Cloudinary upload failed (status ' + xhr.status + ')'));
      }
    };

    xhr.onerror = () => {
      progressWrap?.classList.remove('show');
      reject(new Error('Network error during upload.'));
    };

    xhr.send(formData);
  });
}

// ── Reset upload form ─────────────────────────────────────────────────────────
function resetUploadForm() {
  document.getElementById('upload-note-form')?.reset();
  selectedUploadType = ''; selectedPdfFile = null;
  document.getElementById('upload-institution-type').value = '';
  document.getElementById('selected-file-name')?.classList.add('hidden');
  document.getElementById('upload-progress-wrap')?.classList.remove('show');
  document.getElementById('upload-form-error')?.classList.add('hidden');
  document.getElementById('upload-btn-university')?.classList.remove('selected');
  document.getElementById('upload-btn-school')?.classList.remove('selected');
  document.getElementById('upload-section-university')?.classList.remove('active');
  document.getElementById('upload-section-school')?.classList.remove('active');
}

function showUploadError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }

// ── Rating helpers ────────────────────────────────────────────────────────────
function starIconsHTML(avg) {
  const rounded = Math.round((avg || 0) * 2) / 2;
  let html = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= Math.floor(rounded))     html += `<span class="material-symbols-outlined filled">star</span>`;
    else if (i - 0.5 === rounded)     html += `<span class="material-symbols-outlined filled">star_half</span>`;
    else                              html += `<span class="material-symbols-outlined">star</span>`;
  }
  return html;
}

function rateStarsHTML(noteId, userRating) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="material-symbols-outlined rate-star ${i <= (userRating || 0) ? 'active' : ''}" data-note-id="${noteId}" data-value="${i}">star</span>`;
  }
  return html;
}

function updateRatingCardUI(noteId) {
  const entry   = currentRatingsMap[noteId] || { sum: 0, count: 0, userRating: 0 };
  const avg     = entry.count ? entry.sum / entry.count : 0;
  const dispEl  = document.getElementById(`rating-stars-${noteId}`);
  const avgEl   = document.getElementById(`rating-avg-text-${noteId}`);
  const cntEl   = document.getElementById(`rating-count-${noteId}`);
  if (dispEl) dispEl.innerHTML = starIconsHTML(avg);
  if (avgEl)  avgEl.textContent = avg.toFixed(1);
  if (cntEl)  cntEl.textContent = `(${entry.count})`;
  document.querySelectorAll(`.rate-star[data-note-id="${noteId}"]`).forEach((s) => {
    s.classList.toggle('active', Number(s.getAttribute('data-value')) <= entry.userRating);
  });
}

async function submitRating(noteId, value) {
  const session = getSession();
  if (!session) { appStore.showToast('Please log in to rate this note.', 'error'); return; }

  const { error: rateErr } = await supabase
    .from('ratings')
    .upsert({ note_id: noteId, user_id: session.id, rating: value }, { onConflict: 'note_id,user_id' });

  if (rateErr) { appStore.showToast('Failed to submit rating: ' + rateErr.message, 'error'); return; }

  if (!currentRatingsMap[noteId]) currentRatingsMap[noteId] = { sum: 0, count: 0, userRating: 0 };
  const entry = currentRatingsMap[noteId];
  if (entry.userRating) { entry.sum = entry.sum - entry.userRating + value; }
  else { entry.sum += value; entry.count += 1; }
  entry.userRating = value;

  updateRatingCardUI(noteId);
  appStore.showToast('Rating submitted. Thank you!', 'success');
}

// ── Render notes grid ─────────────────────────────────────────────────────────
async function renderNotes() {
  const container = document.getElementById('notes-grid');
  if (!container) return;

  const query      = document.getElementById('notes-search-input')?.value.toLowerCase() || '';
  const typeFilter = document.getElementById('notes-type-filter')?.value || '';
  const catFilter  = document.getElementById('notes-category-filter')?.value || '';

  let query_ = supabase.from('notes').select('*').eq('is_active', true).eq('is_approved', true).order('created_at', { ascending: false });
  if (typeFilter) query_ = query_.eq('institution_type', typeFilter);
  if (catFilter)  query_ = query_.eq('category', catFilter);

  const { data: notes, error } = await query_;

  if (error) {
    container.innerHTML = `<div class="col-span-full text-center text-xs text-red-500 py-8">Failed to load notes: ${error.message}</div>`;
    return;
  }

  // Fetch uploader profiles
  const uploaderIds = [...new Set((notes || []).map((n) => n.uploaded_by_id).filter(Boolean))];
  let profilesMap = {};
  if (uploaderIds.length) {
    const { data: pd } = await supabase.from('profiles').select('user_id, full_name, institution_name, profile_picture_url').in('user_id', uploaderIds);
    (pd || []).forEach((p) => { profilesMap[p.user_id] = p; });
  }

  // Fetch ratings
  const noteIds = (notes || []).map((n) => n.id);
  const session = getSession();
  currentRatingsMap = {};

  if (noteIds.length) {
    const { data: rd } = await supabase.from('ratings').select('note_id, rating, user_id').in('note_id', noteIds);
    (rd || []).forEach((r) => {
      if (!currentRatingsMap[r.note_id]) currentRatingsMap[r.note_id] = { sum: 0, count: 0, userRating: 0 };
      currentRatingsMap[r.note_id].sum += r.rating;
      currentRatingsMap[r.note_id].count += 1;
      if (session && r.user_id === session.id) currentRatingsMap[r.note_id].userRating = r.rating;
    });
  }

    // Fetch which notes THIS user has saved (for the heart button state)
  let savedNoteIds = new Set();
  if (session && noteIds.length) {
    const { data: sd, error: savedErr } = await supabase
      .from('saved_notes')
      .select('note_id')
      .eq('user_id', session.id);
    if (savedErr) console.error('[Saved notes fetch error]', savedErr.message);
    savedNoteIds = new Set((sd || []).map((s) => String(s.note_id)));
  }

  // Client-side search filter
  const filtered = (notes || []).filter((note) => {
    if (!query) return true;
    return [note.title, note.course, note.subject, note.institution_name, note.class_name, ...(note.tags || [])].join(' ').toLowerCase().includes(query);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-16 bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800 p-8 space-y-4">
        <div class="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
          <span class="material-symbols-outlined text-3xl">search_off</span>
        </div>
        <div class="space-y-1">
          <h3 class="text-base font-bold text-gray-900 dark:text-white font-headline">No Notes Found</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto font-medium">Try adjusting your filters or upload a new study sheet.</p>
        </div>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map((note) => {
    const uploader     = profilesMap[note.uploaded_by_id];
    const uploaderName = uploader?.full_name || 'Unknown User';
    const isUniversity = note.institution_type === 'university';
    const badge        = isUniversity ? (note.course || '—') : (note.class_name || 'School');
    const sub1         = isUniversity ? (note.institution_name || '—') : `${note.institution_name || '—'} · ${note.subject || ''}`;
    const sub2         = isUniversity ? `Dept: ${note.department || 'General'}` : (note.chapter ? `Chapter: ${note.chapter}` : '');
    const ratingEntry  = currentRatingsMap[note.id] || { sum: 0, count: 0, userRating: 0 };
    const ratingAvg    = ratingEntry.count ? ratingEntry.sum / ratingEntry.count : 0;

    return `
      <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold">${badge}</span>
            <div class="relative">
              <button class="save-note-btn p-1.5 rounded-xl transition-colors flex items-center justify-center ${savedNoteIds.has(String(note.id)) ? 'text-rose-500' : 'text-gray-400 hover:text-rose-500'}" data-id="${note.id}" data-saved="${savedNoteIds.has(String(note.id))}">
                <span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' ${savedNoteIds.has(String(note.id)) ? 1 : 0}">favorite</span>
              </button>
              <button class="note-3dot-btn p-1.5 rounded-xl text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-center" data-id="${note.id}">
                <span class="material-symbols-outlined text-lg">more_vert</span>
              </button>
              <div id="note-menu-${note.id}" class="note-menu-dropdown hidden absolute right-0 top-9 z-30 w-48 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xl py-1.5 text-xs font-semibold">
                <a href="./pdf-viewer.html?noteId=${note.id}" class="flex items-center gap-2.5 px-3.5 py-2 text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600">
                  <span class="material-symbols-outlined text-base">visibility</span> View PDF
                </a>
                <button class="share-note-btn w-full flex items-center gap-2.5 px-3.5 py-2 text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600" data-id="${note.id}" data-title="${note.title}">
                  <span class="material-symbols-outlined text-base">share</span> Share Note
                </button>
                <button class="report-note-trigger-btn w-full flex items-center gap-2.5 px-3.5 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40" data-id="${note.id}" data-title="${note.title}">
                  <span class="material-symbols-outlined text-base">flag</span> Report Issue
                </button>
              </div>
            </div>
          </div>

          <h3 class="text-base font-bold text-gray-900 dark:text-white font-headline line-clamp-2">${note.title}</h3>

          <a href="./profile.html?userId=${note.uploaded_by_id}" class="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold w-fit">
            ${uploader?.profile_picture_url
              ? `<div class="w-14 h-14 rounded-full bg-cover bg-center flex-shrink-0 border border-gray-200 dark:border-gray-700" style="background-image:url('${uploader.profile_picture_url}')"></div>`
              : `<span class="material-symbols-outlined text-xs">account_circle</span>`}
            <span>${uploaderName}</span>
          </a>

          <div class="text-[11px] text-gray-500 dark:text-gray-400 space-y-0.5">
            <div class="font-medium text-gray-700 dark:text-gray-300 truncate">${sub1}</div>
            ${sub2 ? `<div>${sub2}</div>` : ''}
            <div class="flex items-center gap-1 text-gray-400">
              <span class="material-symbols-outlined text-xs">${isUniversity ? 'school' : 'menu_book'}</span>
              <span>${isUniversity ? 'University' : 'School / College'}</span>
            </div>
          </div>

          ${note.description ? `<p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">${note.description}</p>` : ''}

          <div class="flex flex-wrap gap-1">
            ${(note.tags || []).map((tag) => `<span class="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-[10px] text-gray-600 dark:text-gray-300">#${tag}</span>`).join('')}
          </div>

          <div class="flex items-center justify-between pt-1">
            <div class="flex items-center gap-1.5">
              <div class="star-rating-display" id="rating-stars-${note.id}">${starIconsHTML(ratingAvg)}</div>
              <span class="text-[11px] font-bold text-gray-600 dark:text-gray-300" id="rating-avg-text-${note.id}">${ratingAvg.toFixed(1)}</span>
              <span class="text-[10px] text-gray-400" id="rating-count-${note.id}">(${ratingEntry.count})</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="text-[10px] text-gray-400 mr-0.5">Rate:</span>
              <div class="star-rate-widget">${rateStarsHTML(note.id, ratingEntry.userRating)}</div>
            </div>
          </div>
        </div>

        <div class="border-t border-gray-100 dark:border-gray-800 pt-4 mt-4 flex items-center justify-between">
          <div class="flex items-center gap-2 text-[11px] text-gray-400">
            <span class="material-symbols-outlined text-sm">download</span>
            <span><span id="download-count-${note.id}">${note.download_count || 0}</span> downloads</span>
          </div>
          <button class="download-note-btn px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors flex items-center gap-1 shadow-sm" data-id="${note.id}" data-url="${note.file_url}">
            <span class="material-symbols-outlined text-sm">visibility</span>
            <span class="hidden sm:inline">View & Download</span>
            <span class="sm:hidden">View</span>
          </button>
        </div>
      </div>`;
  }).join('');

    // ── Save / unsave note (heart button) ─────────────────────────────────────
  document.querySelectorAll('.save-note-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const session = getSession();
      if (!session) {
        appStore.showToast('Please sign in to save notes.', 'error');
        return;
      }

      const noteId    = btn.dataset.id;
      const isSaved   = btn.dataset.saved === 'true';
      const icon      = btn.querySelector('.material-symbols-outlined');

      btn.disabled = true;

      if (isSaved) {
        // Currently saved → remove it
        const { error } = await supabase.from('saved_notes').delete().eq('user_id', session.id).eq('note_id', noteId);
        if (error) {
          appStore.showToast('Could not remove saved note: ' + error.message, 'error');
        } else {
          btn.dataset.saved = 'false';
          btn.classList.remove('text-rose-500');
          btn.classList.add('text-gray-400', 'hover:text-rose-500');
          icon.style.fontVariationSettings = "'FILL' 0";
          appStore.showToast('Removed from Read Later.', 'info');
        }
      } else {
        // Not saved → save it
        const { error } = await supabase.from('saved_notes').insert({ user_id: session.id, note_id: noteId });
        if (error) {
          appStore.showToast('Could not save note: ' + error.message, 'error');
        } else {
          btn.dataset.saved = 'true';
          btn.classList.remove('text-gray-400', 'hover:text-rose-500');
          btn.classList.add('text-rose-500');
          icon.style.fontVariationSettings = "'FILL' 1";
          appStore.showToast('Saved for later!', 'success');
        }
      }

      btn.disabled = false;
    });
  });
  
  // ── Event listeners ───────────────────────────────────────────────────────
  document.querySelectorAll('.note-3dot-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById(`note-menu-${btn.getAttribute('data-id')}`);
      document.querySelectorAll('.note-menu-dropdown').forEach((m) => { if (m !== menu) m.classList.add('hidden'); });
      menu?.classList.toggle('hidden');
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.note-menu-dropdown').forEach((m) => m.classList.add('hidden'));
  });

  document.querySelectorAll('.share-note-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const shareUrl = new URL(`./pdf-viewer.html?noteId=${btn.getAttribute('data-id')}`, window.location.href).href;
      navigator.clipboard.writeText(shareUrl)
        .then(() => appStore.showToast('Note link copied to clipboard!', 'success'))
        .catch(() => appStore.showToast('Link: ' + shareUrl, 'info'));
    });
  });

  document.querySelectorAll('.report-note-trigger-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const modal = document.getElementById('report-modal');
      if (modal) {
        document.getElementById('report-note-id').value    = btn.getAttribute('data-id');
        document.getElementById('report-note-title').value = btn.getAttribute('data-title');
        modal.classList.remove('hidden');
      }
    });
  });

  document.querySelectorAll('.rate-star').forEach((star) => {
    star.addEventListener('click', (e) => {
      e.stopPropagation();
      submitRating(Number(star.getAttribute('data-note-id')), Number(star.getAttribute('data-value')));
    });
    star.addEventListener('mouseenter', () => {
      const noteId = star.getAttribute('data-note-id');
      const value  = Number(star.getAttribute('data-value'));
      document.querySelectorAll(`.rate-star[data-note-id="${noteId}"]`).forEach((s) => {
        s.classList.toggle('hovered', Number(s.getAttribute('data-value')) <= value);
      });
    });
    star.addEventListener('mouseleave', () => {
      document.querySelectorAll(`.rate-star[data-note-id="${star.getAttribute('data-note-id')}"]`).forEach((s) => s.classList.remove('hovered'));
    });
  });

  // FIX: was window.open(note.file_url, ...) — that opened the raw Supabase
  // PDF URL directly, which is exactly what kicked the Capacitor app out to
  // the system browser. Now it navigates to pdf-viewer.html instead, so the
  // PDF renders inside the app; download-count increment moved into
  // pdf-viewer.js's handleDownloadClick (fires only on the actual Download
  // button there, not on every "view" click).
  document.querySelectorAll('.download-note-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      window.location.href = `./pdf-viewer.html?noteId=${id}`;
    });
  });
}