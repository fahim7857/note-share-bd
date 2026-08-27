import { appStore } from './store.js';

export function renderHeader(activePage = 'home') {
  const user = appStore.getCurrentUser();

  return `
    <header class="bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 sticky top-0 z-40 transition-colors">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          
          <!-- Logo & Brand -->
          <a href="./index.html" class="flex items-center gap-2.5 group">
            <div class="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <span class="material-symbols-outlined text-2xl">school</span>
            </div>
            <div>
              <span class="text-lg font-extrabold text-gray-900 dark:text-white font-headline tracking-tight block">AcademiaLink</span>
              <span class="text-[10px] text-gray-400 font-semibold tracking-wider block -mt-1 uppercase">University Hub</span>
            </div>
          </a>

          <!-- Desktop Navigation -->
          <nav class="hidden md:flex items-center gap-1 bg-gray-50/80 dark:bg-gray-800/50 p-1.5 rounded-2xl border border-gray-100 dark:border-gray-800">
            <a href="./index.html" class="px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activePage === 'home'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400'
            }">
              Home
            </a>

            <a href="./notes.html" class="px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activePage === 'notes'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400'
            }">
              Academic Notes
            </a>

            ${
              user && user.isStaff
                ? `
              <a href="./admin.html" class="px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activePage === 'admin'
                  ? 'bg-white dark:bg-gray-900 text-rose-600 dark:text-rose-400 shadow-sm'
                  : 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
              }">
                Admin Portal
              </a>
            `
                : ''
            }
          </nav>

          <!-- Desktop Actions & Options -->
          <div class="hidden sm:flex items-center gap-2.5">
            
            <!-- Dark Mode Toggle -->
            <button id="theme-toggle-btn" class="p-2.5 rounded-xl text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Toggle Theme">
              <span class="material-symbols-outlined text-lg hidden dark:block">light_mode</span>
              <span class="material-symbols-outlined text-lg block dark:hidden">dark_mode</span>
            </button>

            <!-- Upload Note Quick Button -->
            <a href="./notes.html?action=upload" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all">
              <span class="material-symbols-outlined text-base">upload_file</span>
              <span>Upload Notes</span>
            </a>

            <!-- User Auth Dropdown / Avatar -->
            ${
              user
                ? `
              <div class="relative group">
                <a href="./profile.html" class="flex items-center gap-2 p-1.5 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <img src="${user.avatar}" alt="${user.name}" class="w-8 h-8 rounded-xl object-cover border border-indigo-500/30" />
                  <span class="text-xs font-bold text-gray-800 dark:text-gray-200 truncate max-w-[100px]">${user.name}</span>
                </a>
              </div>

              <button id="header-logout-btn" class="p-2 rounded-xl text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors" title="Sign Out">
                <span class="material-symbols-outlined text-lg">logout</span>
              </button>
            `
                : `
              <a href="./login.html" class="px-4 py-2 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                Sign In
              </a>
              <a href="./register.html" class="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition-all">
                Register
              </a>
            `
            }
          </div>

          <!-- Mobile Hamburger Menu Trigger Button -->
          <div class="flex items-center gap-2 sm:hidden">
            <button id="theme-toggle-btn-mobile-quick" class="p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
              <span class="material-symbols-outlined text-xl hidden dark:block">light_mode</span>
              <span class="material-symbols-outlined text-xl block dark:hidden">dark_mode</span>
            </button>

            <button id="mobile-3dot-menu-btn" class="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center" title="Menu">
              <span class="material-symbols-outlined text-2xl">menu</span>
            </button>
          </div>

        </div>
      </div>
    </header>

    <!-- Dark Overlay Behind Side Panel -->
    <div id="mobile-menu-overlay" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 opacity-0 pointer-events-none transition-opacity duration-300 sm:hidden"></div>

    <!-- Mobile Slide-In Side Menu -->
    <div id="mobile-3dot-menu" class="fixed top-0 right-0 h-full w-[80%] max-w-xs bg-white dark:bg-gray-900 z-50 shadow-2xl px-5 py-5 space-y-4 overflow-y-auto sm:hidden transform translate-x-full transition-transform duration-300 ease-in-out">

      <!-- Close Button + Panel Header -->
      <div class="flex items-center justify-between pb-2">
        <span class="text-sm font-extrabold text-gray-900 dark:text-white">Menu</span>
        <button id="mobile-menu-close-btn" class="p-2 rounded-xl text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
          <span class="material-symbols-outlined text-xl">close</span>
        </button>
      </div>

      <div class="text-[11px] font-bold uppercase tracking-wider text-gray-400">Navigation Options</div>
      <div class="grid grid-cols-2 gap-2">
        <a href="./index.html" class="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${activePage === 'home' ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}">
          <span class="material-symbols-outlined text-base">home</span>
          <span>Home</span>
        </a>
        <a href="./notes.html" class="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${activePage === 'notes' ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}">
          <span class="material-symbols-outlined text-base">description</span>
          <span>Notes</span>
        </a>
        ${
          user && user.isStaff
            ? `<a href="./admin.html" class="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                <span class="material-symbols-outlined text-base">admin_panel_settings</span>
                <span>Admin</span>
              </a>`
            : ''
        }
      </div>

      <div class="text-[11px] font-bold uppercase tracking-wider text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-800">Quick Actions</div>
      <div class="space-y-2">
        <!-- Mobile Theme Switch Option -->
        <button id="mobile-theme-option-btn" class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-xs font-bold text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <span class="flex items-center gap-2">
            <span class="material-symbols-outlined text-base hidden dark:block">light_mode</span>
            <span class="material-symbols-outlined text-base block dark:hidden">dark_mode</span>
            <span>Theme Switcher</span>
          </span>
          <span id="theme-status-text" class="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
            ${document.documentElement.classList.contains('dark') ? 'Dark' : 'Light'}
          </span>
        </button>

        <!-- Upload Note Button Option -->
        <a href="./notes.html?action=upload" class="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all">
          <span class="material-symbols-outlined text-base">upload_file</span>
          <span>Upload Course Note</span>
        </a>
      </div>

      <div class="text-[11px] font-bold uppercase tracking-wider text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-800">Account Options</div>
      ${
        user
          ? `
        <div class="space-y-2">
          <a href="./profile.html" class="flex items-center gap-3 p-2 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-bold">
            <img src="${user.avatar}" alt="${user.name}" class="w-8 h-8 rounded-lg object-cover" />
            <div class="truncate">
              <div class="truncate">${user.name}</div>
              <div class="text-[10px] text-gray-400 font-normal truncate">${user.email}</div>
            </div>
          </a>
          <button id="mobile-logout-btn" class="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 font-bold text-xs hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors">
            <span class="material-symbols-outlined text-base">logout</span>
            <span>Sign Out Account</span>
          </button>
        </div>
      `
          : `
        <div class="grid grid-cols-2 gap-2">
          <a href="./login.html" class="py-2.5 text-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs font-bold">
            Sign In
          </a>
          <a href="./register.html" class="py-2.5 text-center rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-md">
            Register
          </a>
        </div>
      `
      }
    </div>
  `;
}

export function renderFooter() {
  return `
    <footer class="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 py-10 mt-auto">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div class="flex flex-col md:flex-row items-center justify-between gap-6">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg">
              <span class="material-symbols-outlined text-xl">school</span>
            </div>
            <div>
              <span class="text-base font-extrabold text-gray-900 dark:text-white font-headline">AcademiaLink</span>
              <p class="text-xs text-gray-500 dark:text-gray-400">The premier student resource and academic collaboration network across Bangladesh.</p>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-center gap-6 text-xs text-gray-600 dark:text-gray-400 font-medium">
            <a href="./index.html" class="hover:text-indigo-600">Home</a>
            <a href="./notes.html" class="hover:text-indigo-600">Note Repository</a>
            <a href="./profile.html" class="hover:text-indigo-600">Student Profile</a>
            <a href="./terms.html" class="hover:text-indigo-600">Terms of Service</a>
            <a href="./privacy-policy.html" class="hover:text-indigo-600">Privacy Policy</a>
          </div>
        </div>

        <div class="pt-6 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between text-[11px] text-gray-400 gap-2">
          <p>© ${new Date().getFullYear()} AcademiaLink Bangladesh. Free open platform for university students.</p>
          <div class="flex items-center gap-4">
            <span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Network Active
            </span>
          </div>
        </div>
      </div>
    </footer>
  `;
}

export function setupHeaderEvents() {
  // Toggle function for theme
  const handleThemeToggle = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    // Update theme status badge if present
    const statusTxt = document.getElementById('theme-status-text');
    if (statusTxt) {
      statusTxt.innerText = isDark ? 'Dark' : 'Light';
    }
  };

  // Dark Mode Toggles
  document.getElementById('theme-toggle-btn')?.addEventListener('click', handleThemeToggle);
  document.getElementById('theme-toggle-btn-mobile-quick')?.addEventListener('click', handleThemeToggle);
  document.getElementById('mobile-theme-option-btn')?.addEventListener('click', handleThemeToggle);

  // Mobile Slide-In Side Menu Toggle
  const menuBtn = document.getElementById('mobile-3dot-menu-btn');
  const sideMenu = document.getElementById('mobile-3dot-menu');
  const overlay = document.getElementById('mobile-menu-overlay');
  const closeBtn = document.getElementById('mobile-menu-close-btn');

  const openMenu = () => {
    sideMenu.classList.remove('translate-x-full');
    overlay.classList.remove('opacity-0', 'pointer-events-none');
    document.body.style.overflow = 'hidden'; // lock background scroll
  };

  const closeMenu = () => {
    sideMenu.classList.add('translate-x-full');
    overlay.classList.add('opacity-0', 'pointer-events-none');
    document.body.style.overflow = ''; // restore scroll
  };

  if (menuBtn && sideMenu && overlay) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openMenu();
    });

    // Close when clicking the overlay (outside the panel)
    overlay.addEventListener('click', closeMenu);

    // Close when clicking the X button inside the panel
    closeBtn?.addEventListener('click', closeMenu);

    // Close when pressing Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
  }

    // Auto-close the side menu when any link or button inside it is tapped
  if (sideMenu) {
    sideMenu.querySelectorAll('a, button').forEach((el) => {
      if (el.id !== 'mobile-menu-close-btn') { // close btn already handled above
        el.addEventListener('click', () => {
          closeMenu();
        });
      }
    });
  }

  // Check and apply stored theme on startup
  const storedTheme = localStorage.getItem('theme');
  if (storedTheme === 'dark' || (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  // Logout triggers
  const performLogout = () => {
    appStore.logoutUser();
    appStore.showToast('Signed out successfully.', 'info');
    setTimeout(() => {
      window.location.href = './index.html';
    }, 400);
  };

  document.getElementById('header-logout-btn')?.addEventListener('click', performLogout);
  document.getElementById('mobile-logout-btn')?.addEventListener('click', performLogout);
}
