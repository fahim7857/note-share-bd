// js/pages/register.js
import { appStore } from '../store.js';
import { renderHeader, renderFooter, setupHeaderEvents } from '../components.js';
import { supabase } from '../supabase.js';
import bcrypt from 'bcryptjs';

document.addEventListener('DOMContentLoaded', () => {
  // ── Header / Footer ──────────────────────────────────────────────────────
  document.getElementById('app-header').innerHTML = renderHeader('register');
  document.getElementById('app-footer').innerHTML = renderFooter();
  setupHeaderEvents();

  // ── Element refs ─────────────────────────────────────────────────────────
  const emailInput   = document.getElementById('reg-email');
  const pwInput      = document.getElementById('reg-password');
  const confirmInput = document.getElementById('reg-confirm');
  const termsBox     = document.getElementById('reg-terms');
  const submitBtn    = document.getElementById('submit-btn');
  const matchHint    = document.getElementById('match-hint');
  const strengthLbl  = document.getElementById('strength-label');
  const sbBars       = [
    document.getElementById('sb1'),
    document.getElementById('sb2'),
    document.getElementById('sb3'),
    document.getElementById('sb4'),
  ];

  // ── Password visibility toggles ──────────────────────────────────────────
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

  // ── Password strength ────────────────────────────────────────────────────
  function getStrength(pw) {
    let score = 0;
    if (pw.length >= 8)           score++;
    if (/[A-Z]/.test(pw))        score++;
    if (/[0-9]/.test(pw))        score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score; // 0 – 4
  }

  const STRENGTH_META = [
    { label: '',       cls: ''       },
    { label: 'Weak',   cls: 'weak'   },
    { label: 'Fair',   cls: 'fair'   },
    { label: 'Good',   cls: 'good'   },
    { label: 'Strong', cls: 'strong' },
  ];

  pwInput.addEventListener('input', () => {
    const score = getStrength(pwInput.value);
    sbBars.forEach((bar, i) => {
      bar.className = i < score ? STRENGTH_META[score].cls : '';
    });
    strengthLbl.textContent = pwInput.value ? STRENGTH_META[score].label : '';
    checkMatch();
    updateSubmit();
  });

  // ── Password match hint ──────────────────────────────────────────────────
  function checkMatch() {
    if (!confirmInput.value) {
      matchHint.className = 'match-hint';
      return;
    }
    if (pwInput.value === confirmInput.value) {
      matchHint.className   = 'match-hint show ok';
      matchHint.textContent = '✓ Passwords match';
    } else {
      matchHint.className   = 'match-hint show no';
      matchHint.textContent = '✗ Passwords do not match';
    }
  }

  confirmInput.addEventListener('input', () => {
    checkMatch();
    updateSubmit();
  });

  // ── Form validation ──────────────────────────────────────────────────────
  function isFormValid() {
    const emailOk = emailInput.value.includes('@') && emailInput.value.includes('.');
    const pwOk    = pwInput.value.length >= 8;
    const matchOk = pwInput.value === confirmInput.value && confirmInput.value !== '';
    const termsOk = termsBox.checked;
    return emailOk && pwOk && matchOk && termsOk;
  }

  function updateSubmit() {
    submitBtn.disabled = !isFormValid();
  }

  emailInput.addEventListener('input', updateSubmit);
  termsBox.addEventListener('change', updateSubmit);

  // ── Submit — Supabase insert ─────────────────────────────────────────────
  const form = document.getElementById('register-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isFormValid()) return;

    const email    = emailInput.value.trim().toLowerCase();
    const password = pwInput.value;

    // ── 1. Button loading state
    submitBtn.disabled     = true;
    submitBtn.textContent  = 'Registering…';

    try {
      // ── 0. Clear any stale session from a previous user on this browser
      //       (safety — ensures no leftover session lingers around)
      localStorage.removeItem('al_session');

      // ── 2. Check duplicate email
      const { data: existing, error: checkErr } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (checkErr) throw new Error(checkErr.message);

      if (existing) {
        appStore.showToast('This email is already registered. Please sign in.', 'error');
        return;
      }

      // ── 3. Hash password (cost factor 10)
      const hashedPassword = await bcrypt.hash(password, 10);

      // ── 4. Insert into users table
      // id, is_active, is_email_verified, is_staff, date_joined — all have DB defaults
      const { error: insertErr } = await supabase
        .from('users')
        .insert({
          email,
          password: hashedPassword,
        });

      if (insertErr) throw new Error(insertErr.message);

      // ── 5. Success — NO auto-login / NO session created here.
      //       User must sign in manually; profile.js will handle showing
      //       the "complete your profile" flow on their first login.
      appStore.showToast('Account registered successfully! Please sign in to continue.', 'success');
      setTimeout(() => {
        window.location.href = './login.html';
      }, 800);

    } catch (err) {
      console.error('[Register Error]', err);
      appStore.showToast(err.message || 'Something went wrong. Please try again.', 'error');
    } finally {
      // ── Restore button
      submitBtn.textContent = 'Complete Registration';
      updateSubmit();
    }
  });
});