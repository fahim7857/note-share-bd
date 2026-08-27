// js/lib/native.js
//
// Every "this behaves differently on web vs. inside the wrapped app" concern
// lives in this ONE file. Pages call these functions and never touch
// window.open / navigator.share / ad tags directly. When you wrap the site
// with Capacitor, you only edit the bodies below — no page/component needs
// to change.

const isCapacitor = () =>
  typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

// ── 1. Download a file ──────────────────────────────────────────────────
// WEB: open the file URL in a new tab; the browser's own PDF/download
//      handling takes over from there.
// CAPACITOR (later): swap the body to fetch the file into the app sandbox
//      with @capacitor/filesystem and open/share it, e.g.:
//        import { Filesystem, Directory } from '@capacitor/filesystem';
//        const res = await fetch(url); const blob = await res.blob();
//        const base64 = await blobToBase64(blob);
//        await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Documents });
export async function downloadFile(url, filename = 'document.pdf') {
  if (isCapacitor()) {
    // Placeholder branch — replace with Filesystem code when you add
    // @capacitor/filesystem. Falling back to openExternal keeps the app
    // working (opens in the system PDF handler) even before that's wired up.
    return openExternal(url);
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

// ── 2. Share a link ──────────────────────────────────────────────────────
// WEB (has navigator.share, e.g. mobile Chrome/Safari): native share sheet.
// WEB (no navigator.share, e.g. desktop Chrome/Firefox): clipboard fallback.
// CAPACITOR: navigator.share is supported inside Capacitor's WebView on
//      both iOS and Android as-is, so this needs NO change later. If you
//      want the nicer native share UI instead, swap the body to use
//      @capacitor/share's `Share.share({ url, title })`.
export async function shareContent({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'; // user closed the share sheet
      // fall through to clipboard on any other failure
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

// ── 3. Open a URL outside the app's own viewer ────────────────────────────
// WEB: a plain new tab is fine.
// CAPACITOR: window.open often does nothing useful inside a native WebView.
//      Swap the body to use @capacitor/browser's `Browser.open({ url })`,
//      which opens a proper in-app/system browser sheet.
export function openExternal(url) {
  if (isCapacitor()) {
    // Placeholder — replace with `Browser.open({ url })` once
    // @capacitor/browser is installed.
    window.open(url, '_system');
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

// ── 4. Ads ──────────────────────────────────────────────────────────────
// WEB: put your ad network's script/tag call inside the `web` branch.
// CAPACITOR: put your AdMob (or similar) call inside the `native` branch,
//      e.g. `@capacitor-community/admob`'s `AdMob.showBanner(...)` /
//      `AdMob.showInterstitial()`. The call site (pdf-viewer.js) never
//      needs to know which one ran.
//
// `kind` distinguishes the two ad slots already in the markup:
//   'inline'      -> #ad-slot-bottom (small banner-style slot)
//   'interstitial'-> #fullscreen-ad-modal (full-screen, shown on download)
export async function loadAd(kind, containerEl) {
  if (isCapacitor()) {
    if (kind === 'interstitial') {
      // Placeholder: await AdMob.showInterstitial();
      return;
    }
    // Placeholder: await AdMob.showBanner({ ... }); AdMob renders natively
    // on top of the WebView, so `containerEl` is usually just a spacer here.
    return;
  }

  // Web branch — drop your ad network's tag/script here. Left empty on
  // purpose (matches the current production-ready placeholder behaviour):
  //   containerEl.innerHTML = '<ins class="adsbygoogle" ...></ins>';
  //   (window.adsbygoogle = window.adsbygoogle || []).push({});
  void containerEl;
}