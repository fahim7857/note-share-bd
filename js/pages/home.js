// js/pages/home.js
import { renderHeader, renderFooter, setupHeaderEvents } from '../components.js';
import { supabase } from '../supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('app-header').innerHTML = renderHeader('home');
  document.getElementById('app-footer').innerHTML = renderFooter();
  setupHeaderEvents();

  // Hero search
  const searchForm = document.getElementById('hero-search-form');
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = document.getElementById('hero-search-input').value.trim();
      window.location.href = `./notes.html?search=${encodeURIComponent(query)}`;
    });
  }

  // Render sections
  await renderRecentNotes();
});

// ── Recent Notes — Supabase থেকে ─────────────────────────────────────────────
async function renderRecentNotes() {
  const container = document.getElementById('recent-notes-container');
  if (!container) return;

  // Loading skeleton
  container.innerHTML = `
    <div class="col-span-full flex justify-center py-10">
      <div class="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
        <span class="material-symbols-outlined text-base animate-spin">progress_activity</span>
        Loading recent notes…
      </div>
    </div>`;

  const { data: notes, error } = await supabase
    .from('notes')
    .select('id, title, course, institution_name, institution_type, department, class_name, subject, tags, created_at, download_count, avg_rating')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(6);

  if (error) {
    container.innerHTML = `
      <div class="col-span-full text-center text-xs text-red-500 py-8">
        Failed to load notes: ${error.message}
      </div>`;
    return;
  }

  if (!notes || notes.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800 p-8 space-y-3">
        <div class="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
          <span class="material-symbols-outlined text-2xl">description</span>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 font-medium">No notes uploaded yet. Be the first student to contribute!</p>
        <a href="./notes.html?action=upload" class="inline-block px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-md">
          Upload First Note
        </a>
      </div>`;
    return;
  }

  container.innerHTML = notes.map((note) => {
    const isUniversity = note.institution_type === 'university';
    const badge        = isUniversity ? (note.course || '—') : (note.class_name || 'School');
    const instName     = note.institution_name || '—';
    const subInfo      = isUniversity
      ? `Dept: ${note.department || 'General'}`
      : `Subject: ${note.subject || '—'}`;
    const tags         = Array.isArray(note.tags) ? note.tags : [];
    const rating       = parseFloat(note.avg_rating || 0).toFixed(1);

    return `
      <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold">
              ${badge}
            </span>
            <div class="flex items-center gap-1 text-[11px] text-amber-500 font-bold">
              <span class="material-symbols-outlined text-sm" style="font-variation-settings:'FILL' 1">star</span>
              ${rating}
            </div>
          </div>

          <h3 class="text-base font-bold text-gray-900 dark:text-white font-headline group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2">
            ${note.title}
          </h3>

          <div class="text-[11px] text-gray-500 dark:text-gray-400 space-y-0.5">
            <div class="font-medium text-gray-700 dark:text-gray-300 truncate flex items-center gap-1">
              <span class="material-symbols-outlined text-xs">${isUniversity ? 'school' : 'menu_book'}</span>
              ${instName}
            </div>
            <div>${subInfo}</div>
          </div>

          <div class="flex flex-wrap gap-1">
            ${tags.slice(0, 3).map((tag) => `
              <span class="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-[10px] text-gray-600 dark:text-gray-300">#${tag}</span>
            `).join('')}
          </div>
        </div>

        <div class="border-t border-gray-100 dark:border-gray-800 pt-4 mt-4 flex items-center justify-between">
          <div class="flex items-center gap-1 text-[11px] text-gray-400">
            <span class="material-symbols-outlined text-sm">download</span>
            <span>${note.download_count || 0}</span>
          </div>
          <a href="./pdf-viewer.html?noteId=${note.id}"
            class="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors flex items-center gap-1">
            <span class="material-symbols-outlined text-sm">visibility</span>
            <span>View PDF</span>
          </a>
        </div>
      </div>`;
  }).join('');
}
