// js/lib/storage.js
//
// Thin abstraction over localStorage. Every other module should read/write
// persisted data through this file instead of calling `localStorage`
// directly.
//
// WEB (now): implemented with localStorage — synchronous, works everywhere.
//
// CAPACITOR (later): swap the three function bodies below to use
// `@capacitor/preferences` (npm i @capacitor/preferences), e.g.:
//
//   import { Preferences } from '@capacitor/preferences';
//   export async function getItem(key) {
//     const { value } = await Preferences.get({ key });
//     return value;
//   }
//   export async function setItem(key, value) { await Preferences.set({ key, value }); }
//   export async function removeItem(key) { await Preferences.remove({ key }); }
//
// Preferences is async, so call sites already `await` these functions —
// no other file needs to change.
//
// NOTE: the dark/light theme flag is intentionally read directly via
// localStorage in an inline <head> script on every page (before any module
// loads), to avoid a flash of the wrong theme. That one spot stays as raw
// localStorage on purpose, since Preferences is async and can't run
// synchronously pre-paint anyway — see the comment in pdf-viewer.html.

export async function getItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export async function removeItem(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

// Convenience helper for the JSON-shaped values this app stores
// (e.g. the `al_session` object).
export async function getJSON(key) {
  const raw = await getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}