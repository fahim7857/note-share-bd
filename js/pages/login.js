// js/pages/login.js
import { appStore } from '../store.js';
import { renderHeader, renderFooter, setupHeaderEvents } from '../components.js';
import { supabase } from '../supabase.js';
import bcrypt from 'bcryptjs';

document.addEventListener('DOMContentLoaded', () => {
  // ── Header / Footer ──────────────────────────────────────────────────────
  document.getElementById('app-header').innerHTML = renderHeader('login');
  document.getElementById('app-footer').innerHTML = renderFooter();
  setupHeaderEvents();

  // ── Element refs ─────────────────────────────────────────────────────────
  const form       = document.getElementById('login-form');
  const emailInput = document.getElementById('login-email');
  const pwInput    = document.getElementById('login-password');
  const loginBtn   = document.getElementById('login-btn');
  const btnLabel   = document.getElementById('btn-label');
  const emailError = document.getElementById('email-error');
  const pwError    = document.getElementById('pw-error');

  // ── Password visibility toggle ────────────────────────────────────────────
  document.querySelectorAll('.toggle-pw').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      const icon   = btn.querySelector('.material-symbols-outlined');
      if (target.type === 'password') {
        target.type      = 'text';
        icon.textContent = 'visibility_off';
      } else {
        target.type      = 'password';
        icon.textContent = 'visibility';
      }
    });
  });

  // ── Rate limiter — max 5 attempts per 15 minutes ─────────────────────────
  const RATE_KEY     = 'login_attempts';
  const RATE_WINDOW  = 15 * 60 * 1000; // 15 min in ms
  const MAX_ATTEMPTS = 5;

  function getRateData() {
    try {
      return JSON.parse(sessionStorage.getItem(RATE_KEY)) || { count: 0, firstAt: null };
    } catch {
      return { count: 0, firstAt: null };
    }
  }

  function isRateLimited() {
    const data = getRateData();
    if (!data.firstAt) return false;
    const elapsed = Date.now() - data.firstAt;
    if (elapsed > RATE_WINDOW) {
      sessionStorage.removeItem(RATE_KEY); // window expired, reset
      return false;
    }
    return data.count >= MAX_ATTEMPTS;
  }

  function recordAttempt() {
    const data = getRateData();
    if (!data.firstAt || Date.now() - data.firstAt > RATE_WINDOW) {
      sessionStorage.setItem(RATE_KEY, JSON.stringify({ count: 1, firstAt: Date.now() }));
    } else {
      sessionStorage.setItem(RATE_KEY, JSON.stringify({ count: data.count + 1, firstAt: data.firstAt }));
    }
  }

  function minutesLeft() {
    const data = getRateData();
    if (!data.firstAt) return 0;
    const remaining = RATE_WINDOW - (Date.now() - data.firstAt);
    return Math.ceil(remaining / 60000);
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  function setLoading(on) {
    loginBtn.disabled  = on;
    btnLabel.textContent = on ? 'Signing in…' : 'Sign In to Account';
  }

  function showFieldError(field, msgEl, show) {
    if (show) {
      field.classList.add('field-error');
      msgEl.classList.add('show');
    } else {
      field.classList.remove('field-error');
      msgEl.classList.remove('show');
    }
  }

  function clearErrors() {
    showFieldError(emailInput, emailError, false);
    showFieldError(pwInput, pwError, false);
  }

  function shakeForm() {
    form.classList.remove('shake');
    void form.offsetWidth; // reflow to restart animation
    form.classList.add('shake');
  }

  // ── Sanitise — strip HTML from input values ───────────────────────────────
  function sanitise(str) {
    return str.replace(/[<>"'`]/g, '').trim();
  }

  // ── Clear field errors on new input ──────────────────────────────────────
  emailInput.addEventListener('input', () => showFieldError(emailInput, emailError, false));
  pwInput.addEventListener('input',    () => showFieldError(pwInput, pwError, false));

  // ── Form submit ──────────────────────────────────────────────────────────
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    // ── Rate limit check
    if (isRateLimited()) {
      appStore.showToast(`Too many attempts. Please wait ${minutesLeft()} minute(s).`, 'error');
      shakeForm();
      return;
    }

    const email    = sanitise(emailInput.value.toLowerCase());
    const password = pwInput.value; // raw — will be compared with bcrypt

    // ── Basic client-side validation
    const emailOk = email.includes('@') && email.includes('.');
    if (!emailOk) {
      showFieldError(emailInput, emailError, true);
      return;
    }
    if (password.length < 1) {
      showFieldError(pwInput, pwError, true);
      return;
    }

    setLoading(true);

    try {
      // ── 1. Fetch user row by email (only the fields we need)
      const { data: user, error: fetchErr } = await supabase
        .from('users')
        .select('id, email, password, is_active')
        .eq('email', email)
        .maybeSingle();

      if (fetchErr) throw new Error(fetchErr.message);

      // ── 2. Generic "invalid credentials" — never reveal which field is wrong
      //       (prevents user enumeration attacks)
      if (!user) {
        recordAttempt();
        showFieldError(pwInput, pwError, true);
        pwError.textContent = 'Incorrect email or password.';
        shakeForm();
        return;
      }

      // ── 3. Account active check
      if (!user.is_active) {
        appStore.showToast('Your account has been deactivated. Contact support.', 'error');
        shakeForm();
        return;
      }

      // ── 4. bcrypt compare (timing-safe — never use == for passwords)
      const passwordMatch = await bcrypt.compare(password, user.password);

      if (!passwordMatch) {
        recordAttempt();
        showFieldError(pwInput, pwError, true);
        pwError.textContent = 'Incorrect email or password.';
        shakeForm();
        return;
      }

      // ── 5. Success — reset rate limiter, persist session, redirect
      sessionStorage.removeItem(RATE_KEY);

      // Store minimal session info (never store password or sensitive data)
      const sessionData = {
        id:    user.id,
        email: user.email,
        loggedInAt: Date.now(),
      };
      localStorage.setItem('al_session', JSON.stringify(sessionData));

      // Notify appStore if it has a loginUser method
      if (typeof appStore.loginUser === 'function') {
        appStore.loginUser(user.email);
      }

      appStore.showToast('Successfully signed in!', 'success');
      setTimeout(() => {
        window.location.href = './profile.html';
      }, 500);

    } catch (err) {
      console.error('[Login Error]', err);
      appStore.showToast('Something went wrong. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  });
});