// js/pages/forgot-password.js
import { appStore } from '../store.js';
import { renderHeader, renderFooter, setupHeaderEvents } from '../components.js';
import { supabase } from '../supabase.js';

document.addEventListener('DOMContentLoaded', () => {
  // ── Header / Footer ──────────────────────────────────────────────────────
  document.getElementById('app-header').innerHTML = renderHeader('login');
  document.getElementById('app-footer').innerHTML = renderFooter();
  setupHeaderEvents();

  // ── Element refs ─────────────────────────────────────────────────────────
  const form       = document.getElementById('forgot-form');
  const emailInput = document.getElementById('forgot-email');
  const emailError = document.getElementById('email-error');
  const submitBtn  = document.getElementById('forgot-btn');
  const btnLabel   = document.getElementById('btn-label');

  // ── Sanitise — strip HTML from input values ───────────────────────────────
  function sanitise(str) {
    return str.replace(/[<>"'`]/g, '').trim();
  }

  function showFieldError(show) {
    if (show) {
      emailInput.classList.add('field-error');
      emailError.classList.add('show');
    } else {
      emailInput.classList.remove('field-error');
      emailError.classList.remove('show');
    }
  }

  emailInput.addEventListener('input', () => showFieldError(false));

  function setLoading(on) {
    submitBtn.disabled   = on;
    btnLabel.textContent = on ? 'Sending…' : 'Send Reset Link';
  }

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showFieldError(false);

    const email    = sanitise(emailInput.value.toLowerCase());
    const emailOk  = email.includes('@') && email.includes('.');

    if (!emailOk) {
      showFieldError(true);
      return;
    }

    setLoading(true);

    try {
      // Calls your "send-password-reset" Supabase Edge Function
      const { error } = await supabase.functions.invoke('send-password-reset', {
        body: { email },
      });

      if (error) {
        console.error('[Forgot Password Error]', error);
      }

      // ── Always show the SAME message whether the email exists or not.
      //     This stops attackers from using this form to find out which
      //     emails are registered (this matches how login.js never says
      //     "wrong password" vs "no such user").
      appStore.showToast("If that email is registered, we've sent a reset link.", 'success');
      form.reset();

    } catch (err) {
      console.error('[Forgot Password Error]', err);
      appStore.showToast('Something went wrong. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  });
});