// js/pages/pdf-viewer.js
import { appStore } from '../store.js';
import { renderHeader, renderFooter, setupHeaderEvents } from '../components.js';
import { supabase } from '../supabase.js';

// ── pdf.js — canvas-based rendering. This is the fix for the app-download
// bug: Android WebView has no native PDF renderer, so an iframe pointed at
// a PDF (or at Google's viewer) can fall back to a direct download instead
// of showing a preview. Rendering to <canvas> via JS sidesteps that
// completely — works identically on the website and inside the app.
//
// pdf.js itself is loaded globally from the CDN <script> tag in
// pdf-viewer.html — that tag MUST appear before this module script for
// `pdfjsLib` to exist here. We only point its worker at the matching
// classic (non-module) CDN build. Guarded with typeof so a network hiccup
// loading the CDN script doesn't crash this whole module (which would
// silently break every other feature on the page — rating, report,
// download, etc. all live in this same file).
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

// ── Star label map ────────────────────────────────────────────────────────────
const STAR_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

// ══════════════════════════════════════════════════════════════════════════
// AdMob (Google) interstitial config
// ══════════════════════════════════════════════════════════════════════════
// TODO: paste your real AdMob Interstitial ad unit ID below before you ship
// this. Get it from: AdMob console → Apps → your app → Ad units →
// Interstitial. It looks like 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY'.
// Leaving this blank just means the app always falls back to the fixed
// wait below instead of trying to load a real ad.
const ADMOB_INTERSTITIAL_AD_UNIT_ID = ''; // <-- PASTE YOUR AD UNIT ID HERE

// Requires `npm install @capacitor-community/admob` + AdMob App ID set up
// in capacitor.config + native Android/iOS AdMob setup. Import is wrapped
// in try/catch everywhere below so a missing/misconfigured plugin never
// breaks the download flow — it just silently falls through to the fixed
// wait instead of a real ad.

// If no real ad could be loaded/shown (plain website — AdMob is native-app
// only — a failed ad load, or no ad unit ID pasted in yet), wait this many
// seconds with the placeholder shown, then continue straight to the
// download automatically. No manual "skip" button by design.
const AD_FALLBACK_WAIT_SECONDS = 5;

// Safety net: if AdMob's own load/show/dismiss events never fire for any
// reason, don't hang the UI forever — fall through to the fixed wait above.
const ADMOB_EVENT_TIMEOUT_MS = 8000;

let admobInitialized = false;

// ── Native-app detection + platform-safe helpers ────────────────────────────
// Runs unchanged on the website (isNativeApp() is false there, so it just
// does the normal browser behaviour). Inside the Capacitor app it switches
// to native plugins automatically — no future edits needed here.
const isNativeApp = () =>
  !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

// Opens a URL — new browser tab on web, in-app browser inside the app.
// This is also what actually *triggers the download*: the PDF's
// Content-Disposition/mime headers make the browser/OS download it
// straight away instead of navigating to it. (This is the exact mechanism
// the old "Open" button used — it's simply more reliable than fetching the
// file into memory and writing it via the Filesystem plugin.)
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

  // Cloudinary otherwise serves raw PDFs inline. fl_attachment makes the
  // browser download the file instead of trying to render its URL as a page.
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
  // This runs after the ad wait, so window.open may be blocked as a popup.
  window.location.assign(downloadUrl);
}

// ── PDF render state ─────────────────────────────────────────────────────────
let pdfDoc = null;
let currentPageNum = 1;

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
        class="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition-all">
        <span class="material-symbols-outlined text-base">download</span>
        <span>Download PDF</span>
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
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-gray-800 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600">
          <span class="material-symbols-outlined text-base">download</span> Download PDF
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

    <!-- Bottom banner ad slot — ALWAYS visible (not gated behind download).
         Reserved space for a small banner ad tag; paste your ad network
         code where marked below. -->
    <div id="ad-slot-bottom" class="bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800 min-h-[90px] flex flex-col items-center justify-center gap-1 py-4 px-4 text-center">
      <span class="material-symbols-outlined text-2xl text-gray-300 dark:text-gray-700">campaign</span>
      <span class="text-[10px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-wide">Advertisement</span>
      <!-- YOUR BANNER AD CODE HERE -->
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
            class="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all shadow-sm flex items-center gap-1 text-xs">
            <span class="material-symbols-outlined text-sm">download</span>
            <span>Download</span>
          </button>
        </div>
      </div>

      <!-- Canvas-rendered PDF (pdf.js) -->
      <div class="pdf-frame-wrap">
        <div id="pdf-loading-state" class="flex flex-col items-center justify-center gap-2 text-white/70 text-xs py-16 w-full">
          <span class="material-symbols-outlined text-2xl animate-spin">progress_activity</span>
          <span>PDF load hocche…</span>
        </div>
        <div id="pdf-render-area" class="hidden w-full flex justify-center"></div>
      </div>

      <!-- Pager -->
      <div class="bg-gray-100 dark:bg-gray-800 px-4 py-2.5 flex items-center justify-center gap-3 border-t border-b border-gray-200 dark:border-gray-700 text-xs">
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

      <!-- Fallback link -->
      <div class="px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 text-center space-y-2">
        <p class="text-[11px] text-gray-400">If the viewer doesn't load, download the PDF directly:</p>
        <div class="flex justify-center gap-3 flex-wrap">
          <button id="fallback-download-pdf-link"
            class="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 inline-flex items-center gap-1.5">
            <span class="material-symbols-outlined text-sm">download</span> Download
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

  // ── Download triggers — all routed through the same ad → redirect flow ───
  document.getElementById('download-and-show-ad')?.addEventListener('click', () => handleDownloadClick(note));
  document.getElementById('download-btn-desktop')?.addEventListener('click', () => handleDownloadClick(note));
  document.getElementById('download-btn-mobile')?.addEventListener('click', () => handleDownloadClick(note));
  document.getElementById('fallback-download-pdf-link')?.addEventListener('click', () => handleDownloadClick(note));

  // ── Load the PDF into the canvas viewer ───────────────────────────────────
  loadPdfViewer(note.file_url);
}

// ══════════════════════════════════════════════════════════════════════════
// Download flow: play an interstitial ad, then redirect straight to the
// file so the browser/OS handles the actual download.
// ══════════════════════════════════════════════════════════════════════════

function showAdWaitModal() {
  document.getElementById('ad-modal')?.classList.remove('hidden');
}
function hideAdWaitModal() {
  document.getElementById('ad-modal')?.classList.add('hidden');
}
function fixedWait(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function ensureAdMobInitialized(AdMob) {
  if (admobInitialized) return;
  try {
    await AdMob.initialize();
    admobInitialized = true;
  } catch (err) {
    // Ignore — prepareInterstitial below will fail too, and we fall back
    // to the fixed wait.
  }
}

// Tries to load + show a real AdMob interstitial. Resolves TRUE only if a
// real ad was actually shown and then dismissed by the user. Resolves
// FALSE for every other case (plain website, no ad unit ID pasted in yet,
// load failure, plugin missing, or the safety timeout) — the caller then
// falls back to the fixed wait instead.
async function playAdMobInterstitial() {
  if (!isNativeApp()) return false;
  if (!ADMOB_INTERSTITIAL_AD_UNIT_ID) return false;

  try {
    const { AdMob } = await import('@capacitor-community/admob');
    await ensureAdMobInitialized(AdMob);

    return await new Promise((resolve) => {
      let settled = false;
      let loadedListener, failedListener, dismissedListener;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        loadedListener?.remove();
        failedListener?.remove();
        dismissedListener?.remove();
        clearTimeout(safety);
        resolve(result);
      };

      const safety = setTimeout(() => finish(false), ADMOB_EVENT_TIMEOUT_MS);

      loadedListener = AdMob.addListener('onInterstitialAdLoaded', async () => {
        try { await AdMob.showInterstitial(); }
        catch (err) { finish(false); }
      });
      failedListener = AdMob.addListener('onInterstitialAdFailedToLoad', () => finish(false));
      dismissedListener = AdMob.addListener('onInterstitialAdDismissed', () => finish(true));

      AdMob.prepareInterstitial({
        adId: ADMOB_INTERSTITIAL_AD_UNIT_ID,
        isTesting: false,
      }).catch(() => finish(false));
    });
  } catch (err) {
    // Plugin not installed, or import failed for any other reason.
    return false;
  }
}

async function handleDownloadClick(note) {
  showAdWaitModal();

  const realAdShown = await playAdMobInterstitial();
  if (!realAdShown) {
    await fixedWait(AD_FALLBACK_WAIT_SECONDS);
  }

  hideAdWaitModal();

  const { error: rpcErr } = await supabase.rpc('increment_note_downloads', { note_id: Number(note.id) });
  if (!rpcErr) {
    const el = document.getElementById('live-download-count');
    if (el) el.textContent = (parseInt(el.textContent, 10) || 0) + 1;
  }

  // Redirect straight to the file — this is what actually triggers the
  // download (the file's headers make the browser/OS download it instead
  // of navigating to it), same as the old "Open" button did.
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

    totalPagesLabel.textContent = pdfDoc.numPages;
    loadingEl.classList.add('hidden');
    renderArea.classList.remove('hidden');

    await renderPdfPage(1);

    prevBtn.disabled = true;
    nextBtn.disabled = pdfDoc.numPages <= 1;

    prevBtn.addEventListener('click', () => {
      if (currentPageNum > 1) renderPdfPage(currentPageNum - 1);
    });
    nextBtn.addEventListener('click', () => {
      if (currentPageNum < pdfDoc.numPages) renderPdfPage(currentPageNum + 1);
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
  document.getElementById('pdf-next-page').disabled = num >= pdfDoc.numPages;
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
  // Already wired in renderPage — nothing extra needed here
}