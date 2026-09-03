// js/pages/pdf-viewer.js
import { appStore } from '../store.js';
import { renderHeader, renderFooter, setupHeaderEvents } from '../components.js';
import { supabase } from '../supabase.js';

// ── pdf.js — canvas-based rendering ──────────────────────────────────────────
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
} else {
  console.error('pdfjsLib did not load from CDN — PDF preview will show the fallback error state.');
}

// ── Session helper ────────────────────────────────────────────────────────────
function getSession() {
  try { return JSON.parse(localStorage.getItem('al_session')) || null; }
  catch { return null; }
}

// ── Check if user has active Premium membership ───────────────────────────────
async function checkUserPremiumStatus(session) {
  if (!session?.id) return false;
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('is_premium, premium_expires_at, is_staff')
      .eq('id', session.id)
      .maybeSingle();

    if (error || !user) return false;

    // Staff members bypass restrictions
    if (user.is_staff) return true;

    if (!user.is_premium) return false;

    // Check expiration timestamp if present
    if (user.premium_expires_at) {
      const expiresAt = new Date(user.premium_expires_at).getTime();
      if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
        return false; // Expired
      }
    }
    return true;
  } catch (err) {
    console.error('Failed to verify premium status:', err);
    return false;
  }
}

// ── Star label map ────────────────────────────────────────────────────────────
const STAR_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

// ── Native-app detection + platform-safe helpers ────────────────────────────
const isNativeApp = () =>
  !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

function getDownloadUrl(fileUrl) {
  if (typeof fileUrl !== 'string' || !fileUrl.trim()) {
    throw new Error('This note does not have a valid PDF link.');
  }

  let url;
  try {
    url = new URL(fileUrl, window.location.href);
  } catch {
    throw new Error('This note does not have a valid PDF link.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('This note does not have a valid PDF link.');
  }

  // Cloudinary: fl_attachment forces download instead of opening inline
  if (url.hostname === 'res.cloudinary.com' && /\/(raw|image|video)\/upload\//.test(url.pathname) && !url.pathname.includes('/fl_attachment/')) {
    url.pathname = url.pathname.replace(/\/(raw|image|video)\/upload\//, '/$1/upload/fl_attachment/');
  }

  return url.href;
}

async function openExternal(url) {
  const downloadUrl = getDownloadUrl(url);
  if (isNativeApp()) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: downloadUrl });
      return;
    } catch (err) { /* fall through to web behaviour */ }
  }
  window.location.assign(downloadUrl);
}

// ── Global Viewer State ───────────────────────────────────────────────────────
let pdfDoc = null;
let currentPageNum = 1;
let isUserPremium = false;
let maxAllowedPage = 1;

// ── Page init ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('app-header').innerHTML = renderHeader('notes');
  document.getElementById('app-footer').innerHTML = renderFooter();
  setupHeaderEvents();

  const params  = new URLSearchParams(window.location.search);
  const noteId  = params.get('noteId');
  const session = getSession();

  if (!noteId) {
    showNotFound();
    return;
  }

  // Check live premium status
  isUserPremium = await checkUserPremiumStatus(session);

  // ── Fetch note from Supabase ──────────────────────────────────────────────
  const { data: note, error } = await supabase
    .from('notes')
    .select('*')
    .eq('id', noteId)
    .eq('is_active', true)
    .maybeSingle();

  hideSkeleton();

  if (error || !note) {
    showNotFound();
    return;
  }

  // ── Fetch fresh avg_rating directly from ratings table ───────────────────
  const { data: ratingStats } = await supabase
    .from('ratings')
    .select('rating')
    .eq('note_id', noteId);

  if (ratingStats && ratingStats.length > 0) {
    const sum = ratingStats.reduce((acc, r) => acc + Number(r.rating), 0);
    note.avg_rating   = (sum / ratingStats.length).toFixed(2);
    note.rating_count = ratingStats.length;
  }

  // ── Fetch uploader profile ────────────────────────────────────────────────
  let uploaderName = 'Unknown Student';
  if (note.uploaded_by_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, institution_name')
      .eq('user_id', note.uploaded_by_id)
      .maybeSingle();
    if (profile) uploaderName = profile.full_name;
  }

  // ── Check if current user already rated this note ─────────────────────────
  let existingRating = null;
  if (session) {
    const { data: ratingRow } = await supabase
      .from('ratings')
      .select('id, rating')
      .eq('user_id', session.id)
      .eq('note_id', noteId)
      .maybeSingle();
    existingRating = ratingRow;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  renderPage(note, uploaderName, existingRating, session);

  // ── Setup Premium Modal Events ────────────────────────────────────────────
  setupPremiumModal(session);

  // ── Report modal ──────────────────────────────────────────────────────────
  document.getElementById('close-report-modal-btn')?.addEventListener('click', () => {
    document.getElementById('report-modal').classList.add('hidden');
  });

  document.getElementById('report-note-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!session) {
      appStore.showToast('Please sign in to report a note.', 'error');
      return;
    }
    const reason = document.getElementById('report-reason-select').value;
    const desc   = document.getElementById('report-desc-input').value.trim();

    const { error: repErr } = await supabase
      .from('reports')
      .insert({
        reporter_id: session.id,
        note_id:     Number(noteId),
        reason,
        description: desc || null,
      });

    if (repErr) {
      appStore.showToast('Failed to submit report: ' + repErr.message, 'error');
      return;
    }
    appStore.showToast('Report submitted to moderators.', 'info');
    document.getElementById('report-modal').classList.add('hidden');
  });

  // ── Rating modal ──────────────────────────────────────────────────────────
  setupRatingModal(note, existingRating, session);
});

// ── Hide skeleton, show content ───────────────────────────────────────────────
function hideSkeleton() {
  document.getElementById('pdf-skeleton')?.classList.add('hidden');
  document.getElementById('pdf-viewer-content')?.classList.remove('hidden');
}

// ── Not found state ───────────────────────────────────────────────────────────
function showNotFound() {
  hideSkeleton();
  document.getElementById('pdf-viewer-content').innerHTML = `
    <div class="text-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800 p-8 space-y-4 max-w-lg mx-auto">
      <div class="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center mx-auto">
        <span class="material-symbols-outlined text-3xl">picture_as_pdf</span>
      </div>
      <h2 class="text-xl font-bold text-gray-900 dark:text-white font-headline">PDF Document Not Found</h2>
      <p class="text-xs text-gray-500 dark:text-gray-400">The requested note could not be found in the repository.</p>
      <a href="./notes.html" class="inline-block px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-md">
        Browse Academic Notes
      </a>
    </div>`;
}

// ── Main render ───────────────────────────────────────────────────────────────
function renderPage(note, uploaderName, existingRating, session) {
  const isUniversity = note.institution_type === 'university';
  const badgeText    = isUniversity ? (note.course || '—') : (note.class_name || 'School');
  const subText      = isUniversity
    ? `${note.institution_name || '—'} · ${note.department || ''}`
    : `${note.institution_name || '—'} · ${note.subject || ''}`;
  const avgRating    = parseFloat(note.avg_rating || 0).toFixed(1);
  const tags         = Array.isArray(note.tags) ? note.tags : [];

  // ── Header actions ────────────────────────────────────────────────────────
  document.getElementById('pdf-header-actions').innerHTML = `
    <!-- Desktop -->
    <div class="hidden sm:flex items-center gap-2">
      <button id="rate-note-btn"
        class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-xs font-bold text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors shadow-sm">
        <span class="material-symbols-outlined text-base" style="font-variation-settings:'FILL' 1">star</span>
        <span>${existingRating ? 'Your Rating: ' + existingRating.rating + '★' : 'Rate This Note'}</span>
      </button>
      <button id="report-trigger-btn"
        class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors shadow-sm">
        <span class="material-symbols-outlined text-base">flag</span>
        <span>Report</span>
      </button>
      <button id="download-btn-desktop"
        class="inline-flex items-center gap-2 px-5 py-2 rounded-xl ${isUserPremium ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'} text-xs font-bold shadow-md transition-all">
        <span class="material-symbols-outlined text-base">${isUserPremium ? 'download' : 'lock'}</span>
        <span>${isUserPremium ? 'Download PDF' : 'Download (Premium)'}</span>
      </button>
    </div>

    <!-- Mobile 3-dot -->
    <div class="relative sm:hidden">
      <button id="pdf-3dot-btn"
        class="p-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 transition-colors">
        <span class="material-symbols-outlined text-xl">more_vert</span>
      </button>
      <div id="pdf-3dot-dropdown"
        class="hidden absolute right-0 top-10 z-30 w-52 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xl py-2 text-xs font-semibold">
        <button id="download-btn-mobile"
          class="w-full flex items-center gap-2.5 px-4 py-2.5 ${isUserPremium ? 'text-gray-800 dark:text-gray-200' : 'text-amber-600 dark:text-amber-400'} hover:bg-indigo-50 dark:hover:bg-indigo-950/50">
          <span class="material-symbols-outlined text-base">${isUserPremium ? 'download' : 'lock'}</span>
          ${isUserPremium ? 'Download PDF' : 'Download (Premium)'}
        </button>
        <button id="rate-note-btn-mobile"
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/50">
          <span class="material-symbols-outlined text-base" style="font-variation-settings:'FILL' 1">star</span>
          ${existingRating ? 'Change Rating' : 'Rate This Note'}
        </button>
        <button id="share-btn-mobile"
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-gray-800 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600">
          <span class="material-symbols-outlined text-base">share</span> Share Note
        </button>
        <button id="report-trigger-btn-mobile"
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40">
          <span class="material-symbols-outlined text-base">flag</span> Report Issue
        </button>
      </div>
    </div>
  `;

  // ── Main content ──────────────────────────────────────────────────────────
  document.getElementById('pdf-viewer-content').innerHTML = `

    <!-- Note Meta Card -->
    <div class="bg-white dark:bg-gray-900 rounded-3xl p-5 sm:p-8 border border-gray-100 dark:border-gray-800 shadow-sm space-y-5">
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div class="space-y-2 flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-3 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-xs font-bold">${badgeText}</span>
            ${note.category ? `<span class="text-xs text-gray-400 font-medium">${note.category}</span>` : ''}
            <span class="flex items-center gap-0.5 text-xs font-bold text-amber-500">
              <span class="material-symbols-outlined text-sm" style="font-variation-settings:'FILL' 1">star</span>
              <span id="live-avg-rating">${avgRating}</span>
              <span class="text-gray-400 font-normal">(${note.rating_count || 0})</span>
            </span>
          </div>
          <h1 class="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-white font-headline break-words">${note.title}</h1>
          <p class="text-xs text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1">
            <span class="material-symbols-outlined text-xs">${isUniversity ? 'school' : 'menu_book'}</span>
            ${subText}
          </p>
        </div>

        <!-- Uploader info -->
        <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl shrink-0 self-start">
          <div class="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 font-extrabold text-lg">
            ${uploaderName.charAt(0).toUpperCase()}
          </div>
          <div class="text-xs">
            <span class="text-gray-400 block text-[10px]">Uploaded by</span>
            <span class="font-bold text-gray-900 dark:text-white block">${uploaderName}</span>
            <span class="text-[10px] text-gray-400">${new Date(note.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</span>
          </div>
        </div>
      </div>

      <!-- Stats grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-gray-100 dark:border-gray-800 text-xs">
        <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-xl">
          <span class="text-gray-400 text-[10px] block">Downloads</span>
          <span class="font-bold text-gray-800 dark:text-gray-200 mt-0.5 block" id="live-download-count">${note.download_count || 0}</span>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-xl">
          <span class="text-gray-400 text-[10px] block">Avg Rating</span>
          <span class="font-bold text-amber-500 mt-0.5 block">${avgRating} / 5.0</span>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-xl">
          <span class="text-gray-400 text-[10px] block">Type</span>
          <span class="font-bold text-gray-800 dark:text-gray-200 mt-0.5 block">${isUniversity ? 'University' : 'School/College'}</span>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-xl">
          <span class="text-gray-400 text-[10px] block">Tags</span>
          <div class="flex flex-wrap gap-1 mt-0.5">
            ${tags.slice(0, 3).map((t) => `<span class="text-[10px] text-gray-500 dark:text-gray-400">#${t}</span>`).join(' ')}
          </div>
        </div>
      </div>

      ${note.description ? `<p class="text-xs text-gray-600 dark:text-gray-300 leading-relaxed pt-3 border-t border-gray-100 dark:border-gray-800">${note.description}</p>` : ''}
    </div>

    <!-- PDF Viewer -->
    <div class="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">

      <!-- Toolbar -->
      <div class="bg-gray-100 dark:bg-gray-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-700 text-xs">
        <div class="flex items-center gap-2 min-w-0">
          <span class="material-symbols-outlined text-indigo-600 text-lg flex-shrink-0">picture_as_pdf</span>
          <span class="font-bold text-gray-800 dark:text-gray-200 truncate max-w-[160px] sm:max-w-xs">${note.title}.pdf</span>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button id="download-and-show-ad"
            class="px-3.5 py-1.5 rounded-lg ${isUserPremium ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'} font-bold transition-all shadow-sm flex items-center gap-1.5 text-xs">
            <span class="material-symbols-outlined text-sm">${isUserPremium ? 'download' : 'lock'}</span>
            <span>${isUserPremium ? 'Download' : 'Download (Premium)'}</span>
          </button>
        </div>
      </div>

      <!-- Canvas-rendered PDF (pdf.js) -->
      <div class="pdf-frame-wrap">
        <div id="pdf-loading-state" class="flex flex-col items-center justify-center gap-2 text-white/70 text-xs py-16 w-full">
          <span class="material-symbols-outlined text-2xl animate-spin">progress_activity</span>
          <span>PDF load hocche…</span>
        </div>
        <div id="pdf-render-area" class="hidden w-full flex flex-col items-center"></div>

        <!-- 40% Limit Reached Banner for Free Users -->
        <div id="pdf-preview-lock-banner" class="hidden m-4 p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-indigo-500/10 border border-amber-500/30 text-center space-y-2.5">
          <div class="flex items-center justify-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold text-xs uppercase tracking-wider">
            <span class="material-symbols-outlined text-base">lock</span>
            <span>40% Free Preview Limit Reached</span>
          </div>
          <p class="text-xs text-gray-600 dark:text-gray-300 max-w-sm mx-auto">
            You've viewed all free preview pages. Upgrade to Premium to read the complete note and download the PDF.
          </p>
          <button id="preview-unlock-btn" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-md transition-all">
            <span class="material-symbols-outlined text-sm">workspace_premium</span>
            <span>Unlock Full Document</span>
          </button>
        </div>
      </div>

      <!-- Pager -->
      <div class="bg-gray-100 dark:bg-gray-800 px-4 py-2.5 flex items-center justify-between gap-3 border-t border-b border-gray-200 dark:border-gray-700 text-xs flex-wrap">
        <div id="pdf-preview-badge-container"></div>
        <div class="flex items-center gap-3 mx-auto">
          <button id="pdf-prev-page" disabled
            class="p-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 disabled:opacity-40 transition-colors">
            <span class="material-symbols-outlined text-base">chevron_left</span>
          </button>
          <span class="font-bold text-gray-700 dark:text-gray-200">Page <span id="pdf-current-page">1</span> / <span id="pdf-total-pages">—</span></span>
          <button id="pdf-next-page" disabled
            class="p-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 disabled:opacity-40 transition-colors">
            <span class="material-symbols-outlined text-base">chevron_right</span>
          </button>
        </div>
      </div>

      <!-- Fallback link -->
      <div class="px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 text-center space-y-2">
        <p class="text-[11px] text-gray-400">If the viewer doesn't load, download the PDF directly:</p>
        <div class="flex justify-center gap-3 flex-wrap">
          <button id="fallback-download-pdf-link"
            class="px-4 py-2 ${isUserPremium ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-500 hover:bg-amber-600'} text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-all">
            <span class="material-symbols-outlined text-sm">${isUserPremium ? 'download' : 'lock'}</span>
            <span>${isUserPremium ? 'Download' : 'Download (Premium)'}</span>
          </button>
        </div>
      </div>
    </div>
  `;

  // ── Attach header button events ───────────────────────────────────────────
  const triggerReport = () => {
    document.getElementById('report-note-id').value    = note.id;
    document.getElementById('report-note-title').value = note.title;
    document.getElementById('report-modal').classList.remove('hidden');
  };

  document.getElementById('report-trigger-btn')?.addEventListener('click', triggerReport);
  document.getElementById('report-trigger-btn-mobile')?.addEventListener('click', triggerReport);

  const triggerRating = () => {
    if (!session) { appStore.showToast('Please sign in to rate this note.', 'error'); return; }
    openRatingModal(existingRating);
  };
  document.getElementById('rate-note-btn')?.addEventListener('click', triggerRating);
  document.getElementById('rate-note-btn-mobile')?.addEventListener('click', triggerRating);

  // Share
  document.getElementById('share-btn-mobile')?.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => appStore.showToast('Link copied to clipboard!', 'success'))
      .catch(() => appStore.showToast(window.location.href, 'info'));
  });

  // 3-dot dropdown
  const dotBtn  = document.getElementById('pdf-3dot-btn');
  const dotDrop = document.getElementById('pdf-3dot-dropdown');
  dotBtn?.addEventListener('click', (e) => { e.stopPropagation(); dotDrop.classList.toggle('hidden'); });
  document.addEventListener('click', () => dotDrop?.classList.add('hidden'));

  // ── Download triggers ─────────────────────────────────────────────────────
  document.getElementById('download-and-show-ad')?.addEventListener('click', () => handleDownloadClick(note));
  document.getElementById('download-btn-desktop')?.addEventListener('click', () => handleDownloadClick(note));
  document.getElementById('download-btn-mobile')?.addEventListener('click', () => handleDownloadClick(note));
  document.getElementById('fallback-download-pdf-link')?.addEventListener('click', () => handleDownloadClick(note));

  // Inline unlock button
  document.getElementById('preview-unlock-btn')?.addEventListener('click', openPremiumModal);

  // ── Load the PDF into the canvas viewer ───────────────────────────────────
  loadPdfViewer(note.file_url);
}

// ══════════════════════════════════════════════════════════════════════════
// Premium Modal Handling
// ══════════════════════════════════════════════════════════════════════════

function openPremiumModal() {
  const modal = document.getElementById('premium-modal');
  if (!modal) return;

  const session = getSession();
  const actionBtn  = document.getElementById('premium-action-btn');
  const actionText = document.getElementById('premium-action-text');

  if (!session) {
    actionBtn.href = './login.html';
    if (actionText) actionText.textContent = 'Sign In to Unlock';
  } else {
    actionBtn.href = './profile.html';
    if (actionText) actionText.textContent = 'Upgrade to Premium';
  }

  modal.classList.remove('hidden');
}

function setupPremiumModal(session) {
  document.getElementById('premium-close-btn')?.addEventListener('click', () => {
    document.getElementById('premium-modal')?.classList.add('hidden');
  });
}

// ══════════════════════════════════════════════════════════════════════════
// Download Flow (Only for Premium Users)
// ══════════════════════════════════════════════════════════════════════════

async function handleDownloadClick(note) {
  // Block non-premium users from downloading
  if (!isUserPremium) {
    openPremiumModal();
    return;
  }

  // Update download count on database
  const { error: rpcErr } = await supabase.rpc('increment_note_downloads', { note_id: Number(note.id) });
  if (!rpcErr) {
    const el = document.getElementById('live-download-count');
    if (el) el.textContent = (parseInt(el.textContent, 10) || 0) + 1;
  }

  // Trigger file download immediately
  try {
    await openExternal(note.file_url);
  } catch (err) {
    appStore.showToast(err.message || 'Unable to download this PDF.', 'error');
  }
}

// ── PDF.js canvas viewer ────────────────────────────────────────────────────
async function loadPdfViewer(fileUrl) {
  const loadingEl       = document.getElementById('pdf-loading-state');
  const renderArea      = document.getElementById('pdf-render-area');
  const prevBtn         = document.getElementById('pdf-prev-page');
  const nextBtn         = document.getElementById('pdf-next-page');
  const totalPagesLabel = document.getElementById('pdf-total-pages');
  if (!loadingEl || !renderArea) return;

  if (typeof pdfjsLib === 'undefined') {
    loadingEl.innerHTML = `
      <span class="material-symbols-outlined text-2xl text-rose-400">error</span>
      <span class="text-white/70">Viewer load korte problem hocche — niche-r "Download" button use koro.</span>
    `;
    return;
  }

  try {
    const loadingTask = pdfjsLib.getDocument(fileUrl);
    pdfDoc = await loadingTask.promise;

    const totalPages = pdfDoc.numPages;
    // Calculate 40% page limit for free users
    maxAllowedPage = isUserPremium ? totalPages : Math.max(1, Math.ceil(totalPages * 0.4));

    totalPagesLabel.textContent = totalPages;
    loadingEl.classList.add('hidden');
    renderArea.classList.remove('hidden');

    // Show preview badge if non-premium and multi-page
    const badgeContainer = document.getElementById('pdf-preview-badge-container');
    if (badgeContainer && !isUserPremium && totalPages > 1) {
      badgeContainer.innerHTML = `
        <span class="px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 font-bold text-[10px] flex items-center gap-1">
          <span class="material-symbols-outlined text-xs">lock</span> 40% Preview (${maxAllowedPage} of ${totalPages} pages)
        </span>
      `;
    }

    await renderPdfPage(1);

    prevBtn.disabled = true;
    nextBtn.disabled = maxAllowedPage <= 1;

    prevBtn.addEventListener('click', () => {
      if (currentPageNum > 1) renderPdfPage(currentPageNum - 1);
    });
    nextBtn.addEventListener('click', () => {
      if (currentPageNum < maxAllowedPage) {
        renderPdfPage(currentPageNum + 1);
      } else if (!isUserPremium) {
        openPremiumModal();
      }
    });
  } catch (err) {
    loadingEl.innerHTML = `
      <span class="material-symbols-outlined text-2xl text-rose-400">error</span>
      <span class="text-white/70">Viewer load korte problem hocche — niche-r "Download" button use koro.</span>
    `;
  }
}

async function renderPdfPage(num) {
  if (!pdfDoc) return;
  // Guard against exceeding preview limit
  if (!isUserPremium && num > maxAllowedPage) {
    openPremiumModal();
    return;
  }

  const page        = await pdfDoc.getPage(num);
  const renderArea  = document.getElementById('pdf-render-area');
  const wrapWidth   = renderArea.clientWidth || 700;

  const unscaledViewport = page.getViewport({ scale: 1 });
  const scale    = wrapWidth / unscaledViewport.width;
  const viewport = page.getViewport({ scale });

  let canvas = document.getElementById('pdf-page-canvas');
  if (!canvas) {
    canvas    = document.createElement('canvas');
    canvas.id = 'pdf-page-canvas';
    renderArea.innerHTML = '';
    renderArea.appendChild(canvas);
  }
  const ctx    = canvas.getContext('2d');
  canvas.width  = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport }).promise;

  currentPageNum = num;
  document.getElementById('pdf-current-page').textContent = num;
  document.getElementById('pdf-prev-page').disabled = num <= 1;
  document.getElementById('pdf-next-page').disabled = num >= maxAllowedPage;

  // Toggle 40% limit banner when user reaches the preview ceiling
  const lockBanner = document.getElementById('pdf-preview-lock-banner');
  if (lockBanner) {
    if (!isUserPremium && num >= maxAllowedPage && maxAllowedPage < pdfDoc.numPages) {
      lockBanner.classList.remove('hidden');
    } else {
      lockBanner.classList.add('hidden');
    }
  }
}

// ── Rating modal logic ────────────────────────────────────────────────────────
function openRatingModal(existingRating) {
  const modal     = document.getElementById('rating-modal');
  const stars     = document.querySelectorAll('#modal-star-rating .star-btn');
  const label     = document.getElementById('rating-label');
  const submitBtn = document.getElementById('rating-submit-btn');
  let selectedVal = existingRating?.rating || 0;

  stars.forEach((star, i) => {
    star.classList.toggle('filled', i < selectedVal);
  });
  label.textContent = selectedVal ? STAR_LABELS[selectedVal] : '';
  submitBtn.disabled = selectedVal === 0;

  stars.forEach((star) => {
    const val = parseInt(star.dataset.value);

    star.addEventListener('mouseenter', () => {
      stars.forEach((s, i) => s.classList.toggle('active', i < val));
      label.textContent = STAR_LABELS[val];
    });
    star.addEventListener('mouseleave', () => {
      stars.forEach((s, i) => {
        s.classList.remove('active');
        s.classList.toggle('filled', i < selectedVal);
      });
      label.textContent = selectedVal ? STAR_LABELS[selectedVal] : '';
    });
    star.addEventListener('click', () => {
      selectedVal = val;
      submitBtn.disabled = false;
      stars.forEach((s, i) => s.classList.toggle('filled', i < val));
      label.textContent = STAR_LABELS[val];
    });
  });

  modal.classList.remove('hidden');
  document.getElementById('rating-cancel-btn').onclick = () => modal.classList.add('hidden');

  submitBtn.onclick = null;
  submitBtn.addEventListener('click', async () => {
    if (!selectedVal) return;
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Submitting…';

    const session = getSession();
    const noteId  = new URLSearchParams(window.location.search).get('noteId');

    let dbErr;
    if (existingRating) {
      const { error } = await supabase
        .from('ratings')
        .update({ rating: selectedVal })
        .eq('id', existingRating.id);
      dbErr = error;
    } else {
      const { error } = await supabase
        .from('ratings')
        .insert({ user_id: session.id, note_id: Number(noteId), rating: selectedVal });
      dbErr = error;
    }

    if (dbErr) {
      document.getElementById('rating-error').textContent = dbErr.message;
      document.getElementById('rating-error').classList.remove('hidden');
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Submit Rating';
      return;
    }

    await supabase.rpc('update_note_rating', { p_note_id: Number(noteId) });

    const { data: updated } = await supabase
      .from('notes')
      .select('avg_rating, rating_count')
      .eq('id', noteId)
      .maybeSingle();

    if (updated) {
      const avgEl = document.getElementById('live-avg-rating');
      if (avgEl) avgEl.textContent = parseFloat(updated.avg_rating).toFixed(1);
    }

    modal.classList.add('hidden');
    appStore.showToast('Thank you for rating this note!', 'success');

    document.getElementById('rate-note-btn').querySelector('span:last-child').textContent
      = `Your Rating: ${selectedVal}★`;
  }, { once: true });
}

// ── Rating modal setup ────────────────────────────────────────────────────────
function setupRatingModal(note, existingRating, session) {
  // Wired in renderPage
}