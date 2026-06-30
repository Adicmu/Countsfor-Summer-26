/**
 * CountsFor — Heritage Single landing (vanilla JS, no browser storage)
 */
(function () {
  'use strict';

  const APP_URL = 'app.html';

  function getBackendUrl() {
    const meta = document.querySelector('meta[name="cf-backend-url"]');
    const fromMeta = (meta && meta.getAttribute('content') || '').trim();
    if (fromMeta) return fromMeta.replace(/\/$/, '');
    const host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '') {
      return 'http://localhost:5000';
    }
    return 'https://countsfor-backend.onrender.com';
  }

  const BACKEND_URL = getBackendUrl();

  function getGoogleClientId() {
    const meta = document.querySelector('meta[name="cf-google-client-id"]');
    return (meta && meta.getAttribute('content') || '').trim();
  }

  async function apiFetch(path, opts) {
    const url = BACKEND_URL + path;
    const init = {
      method: (opts && opts.method) || 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    };
    if (opts && opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    try {
      const res = await fetch(url, init);
      let data = null;
      if (res.status !== 204) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }
      return {
        ok: res.ok,
        status: res.status,
        data,
        message: (data && data.message) || null,
      };
    } catch (e) {
      return { ok: false, status: 0, data: null, message: e.message };
    }
  }

  function apiGetMe() {
    return apiFetch('/api/me');
  }
  function apiLogin(body) {
    return apiFetch('/api/auth/login', { method: 'POST', body });
  }
  function apiRegister(body) {
    return apiFetch('/api/auth/register', { method: 'POST', body });
  }
  function apiForgotPassword(email) {
    return apiFetch('/api/auth/forgot-password', { method: 'POST', body: { email } });
  }
  function apiResetPassword(body) {
    return apiFetch('/api/auth/reset-password', { method: 'POST', body });
  }
  function apiGoogle(credential) {
    return apiFetch('/api/auth/google', { method: 'POST', body: { credential } });
  }
  function apiSetPassword(password) {
    return apiFetch('/api/auth/set-password', { method: 'POST', body: { password } });
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const state = {
    view: 'signin',
    resetEmail: '',
    resetToken: '',
    recovered: false,       // true after Google verified the user in the recovery flow
    backendUnreachable: false,
  };

  function isAndrewEmail(raw) {
    const e = (raw || '').trim().toLowerCase();
    return /^[^\s@]+@andrew\.cmu\.edu$/.test(e);
  }

  function setFieldMsg(inputId, msgId, text, kind) {
    const input = document.getElementById(inputId);
    const msg = document.getElementById(msgId);
    if (msg) {
      msg.textContent = text || '';
      msg.className = 'landing-field-msg' + (kind ? ' is-' + kind : '');
    }
    if (input) {
      input.classList.toggle('is-invalid', kind === 'error');
      input.classList.toggle('is-valid', kind === 'ok');
      input.setAttribute('aria-invalid', kind === 'error' ? 'true' : 'false');
    }
  }

  function clearFieldMsg(inputId, msgId) {
    setFieldMsg(inputId, msgId, '', '');
  }

  function validateAndrewField(inputId, msgId) {
    const el = document.getElementById(inputId);
    if (!el) return true;
    const val = (el.value || '').trim();
    if (!val) {
      clearFieldMsg(inputId, msgId);
      return false;
    }
    if (!isAndrewEmail(val)) {
      setFieldMsg(inputId, msgId, 'Use your @andrew.cmu.edu email address.', 'error');
      return false;
    }
    clearFieldMsg(inputId, msgId);
    return true;
  }

  function validatePasswordMatch(passId, confirmId, msgId) {
    const pass = document.getElementById(passId)?.value || '';
    const confirm = document.getElementById(confirmId)?.value || '';
    if (!confirm) {
      clearFieldMsg(confirmId, msgId);
      return false;
    }
    if (pass !== confirm) {
      setFieldMsg(confirmId, msgId, 'Passwords do not match.', 'error');
      return false;
    }
    setFieldMsg(confirmId, msgId, 'Passwords match.', 'ok');
    return true;
  }

  function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? 'Hide' : 'Show';
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  }

  function setFormError(text) {
    const box = document.getElementById('cfAuthFormError');
    if (!box) return;
    if (text) {
      box.textContent = text;
      box.hidden = false;
    } else {
      box.textContent = '';
      box.hidden = true;
    }
  }

  function setLoading(loading, idleLabel) {
    const btn = document.getElementById('cfAuthSubmit');
    if (!btn) return;
    btn.classList.toggle('is-loading', loading);
    if (loading) {
      btn.disabled = true;
      btn.innerHTML =
        '<span class="landing-submit-spinner" aria-hidden="true"></span><span>' +
        idleLabel.replace(' →', '…') +
        '</span>';
    } else {
      btn.textContent = idleLabel;
      updateSubmitState(state.view);
    }
  }

  function updateSubmitState(view) {
    const btn = document.getElementById('cfAuthSubmit');
    if (!btn) return;
    let ready = false;

    if (view === 'signin') {
      const email = (document.getElementById('cfLoginEmail')?.value || '').trim();
      const pass = document.getElementById('cfLoginPass')?.value || '';
      const emailOk = isAndrewEmail(email);
      ready = emailOk && pass.length > 0;
      if (email && !emailOk) validateAndrewField('cfLoginEmail', 'cfLoginEmailMsg');
    } else if (view === 'register') {
      const email = (document.getElementById('cfRegEmail')?.value || '').trim();
      const pass = document.getElementById('cfRegPass')?.value || '';
      const confirm = document.getElementById('cfRegPass2')?.value || '';
      const emailOk = isAndrewEmail(email);
      const passOk = pass.length >= 8;
      const matchOk = passOk && confirm.length > 0 && pass === confirm;
      ready = emailOk && passOk && matchOk;
      if (email && !emailOk) validateAndrewField('cfRegEmail', 'cfRegEmailMsg');
      if (confirm) validatePasswordMatch('cfRegPass', 'cfRegPass2', 'cfRegPass2Msg');
    } else if (view === 'forgot') {
      const email = (document.getElementById('cfForgotEmail')?.value || '').trim();
      ready = isAndrewEmail(email);
    } else if (view === 'reset') {
      const pass = document.getElementById('cfResetPass')?.value || '';
      const confirm = document.getElementById('cfResetPass2')?.value || '';
      ready = pass.length >= 8 && pass === confirm;
    }

    btn.disabled = !ready || btn.classList.contains('is-loading');
  }

  function validatePasswordLength(inputId, msgId) {
    const el = document.getElementById(inputId);
    if (!el) return true;
    const val = el.value || '';
    if (!val) {
      clearFieldMsg(inputId, msgId);
      return false;
    }
    if (val.length < 8) {
      setFieldMsg(inputId, msgId, 'Password must be at least 8 characters.', 'error');
      return false;
    }
    clearFieldMsg(inputId, msgId);
    return true;
  }

  function bindForm(view) {
    const onInput = function () {
      updateSubmitState(view);
    };
    const ids = {
      signin: ['cfLoginEmail', 'cfLoginPass'],
      register: ['cfRegName', 'cfRegEmail', 'cfRegPass', 'cfRegPass2'],
      forgot: ['cfForgotEmail'],
      reset: ['cfResetPass', 'cfResetPass2'],
    }[view] || [];

    ids.forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () {
        if (id === 'cfLoginEmail' || id === 'cfRegEmail' || id === 'cfForgotEmail') {
          const val = (el.value || '').trim();
          if (isAndrewEmail(val)) clearFieldMsg(id, id + 'Msg');
        }
        if (id === 'cfRegPass' || id === 'cfResetPass') {
          const val = el.value || '';
          if (val.length >= 8) clearFieldMsg(id, id + 'Msg');
        }
        onInput();
      });
      el.addEventListener('blur', function () {
        if (id === 'cfLoginEmail' || id === 'cfRegEmail' || id === 'cfForgotEmail') {
          validateAndrewField(id, id + 'Msg');
        }
        if (id === 'cfRegPass' || id === 'cfResetPass') {
          validatePasswordLength(id, id + 'Msg');
        }
        if (id === 'cfRegPass2' || id === 'cfResetPass2') {
          const passId = view === 'reset' ? 'cfResetPass' : 'cfRegPass';
          validatePasswordMatch(passId, id, id + 'Msg');
        }
        updateSubmitState(view);
      });
    });

    if (view === 'register' || view === 'reset') {
      const passId = view === 'reset' ? 'cfResetPass' : 'cfRegPass';
      const confirmId = view === 'reset' ? 'cfResetPass2' : 'cfRegPass2';
      const passEl = document.getElementById(passId);
      if (passEl) {
        passEl.addEventListener('input', function () {
          const confirm = document.getElementById(confirmId);
          if (confirm && confirm.value) {
            validatePasswordMatch(passId, confirmId, confirmId + 'Msg');
          }
          updateSubmitState(view);
        });
      }
    }

    document.querySelectorAll('.landing-pass-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        togglePassword(btn.getAttribute('data-target'), btn);
      });
    });

    updateSubmitState(view);
  }

  function passwordField(id, label, opts) {
    opts = opts || {};
    const hint = opts.hint
      ? '<p class="landing-field-msg is-hint" id="' + id + 'Hint">' + esc(opts.hint) + '</p>'
      : '';
    return (
      '<div class="landing-field-group">' +
      '<label class="landing-label" for="' + id + '">' + label + '</label>' +
      '<div class="landing-field">' +
      '<input class="landing-input" id="' + id + '" type="password" autocomplete="' +
      (opts.autocomplete || 'new-password') +
      '" minlength="' +
      (opts.minlength || 8) +
      '" required aria-describedby="' +
      id +
      'Msg' +
      (opts.hint ? ' ' + id + 'Hint' : '') +
      '" aria-invalid="false" />' +
      '<button type="button" class="landing-pass-toggle" data-target="' +
      id +
      '" aria-label="Show password">Show</button>' +
      '</div>' +
      hint +
      '<p class="landing-field-msg" id="' +
      id +
      'Msg" role="alert"></p>' +
      '</div>'
    );
  }

  function emailField(id, label) {
    return (
      '<div class="landing-field-group">' +
      '<label class="landing-label" for="' + id + '">' + label + '</label>' +
      '<input class="landing-input" id="' +
      id +
      '" type="email" autocomplete="email" placeholder="you@andrew.cmu.edu" required aria-describedby="' +
      id +
      'Msg" aria-invalid="false" />' +
      '<p class="landing-field-msg" id="' +
      id +
      'Msg" role="alert"></p>' +
      '</div>'
    );
  }

  function tabsHtml(active) {
    if (active === 'forgot' || active === 'reset') return '';
    function tab(id, label) {
      return (
        '<button type="button" class="landing-tab' +
        (active === id ? ' is-active' : '') +
        '" data-view="' +
        id +
        '" role="tab" id="tab-' +
        id +
        '" aria-selected="' +
        (active === id ? 'true' : 'false') +
        '" aria-controls="authPanel" tabindex="' +
        (active === id ? '0' : '-1') +
        '">' +
        label +
        '</button>'
      );
    }
    return (
      '<div class="landing-tabs" role="tablist" aria-label="Authentication">' +
      tab('signin', 'Sign in') +
      tab('register', 'Create account') +
      '</div>'
    );
  }

  function panelWrap(content, view) {
    const labelledBy = 'panel-title-' + view;
    const role =
      view === 'signin' || view === 'register' ? 'tabpanel' : 'region';
    return (
      '<div id="authPanel" role="' +
      role +
      '" aria-labelledby="' +
      labelledBy +
      '">' +
      content +
      '</div>'
    );
  }

  function footerHtml() {
    return '<div class="landing-card__footer">Carnegie Mellon University · Qatar</div>';
  }

  function backendWarnHtml() {
    if (!state.backendUnreachable) return '';
    return '<div class="landing-alert" role="alert">Could not reach the server — wait ~30s and refresh.</div>';
  }

  function formErrorHtml() {
    return '<div class="landing-form-error" id="cfAuthFormError" hidden role="alert"></div>';
  }

  function renderPanel(opts) {
    opts = opts || {};
    const v = state.view;
    let inner = '';

    if (v === 'register') {
      inner = panelWrap(
        '<div class="landing-card__top">' +
        tabsHtml('register') +
        '<div class="landing-panel-head">' +
        '<h2 class="landing-panel-title" id="panel-title-register">Create your account</h2>' +
        '<p class="landing-panel-lead">Use your <strong>@andrew.cmu.edu</strong> email. Faculty in our directory are recognized automatically; everyone else starts as a student.</p>' +
        '</div>' +
        backendWarnHtml() +
        '</div>' +
        '<div class="landing-card__body">' +
        '<form class="landing-form landing-form--scrollable" id="cfAuthForm" novalidate>' +
        formErrorHtml() +
        '<div class="landing-form-fields">' +
        '<div class="landing-field-group">' +
        '<label class="landing-label" for="cfRegName">Full name</label>' +
        '<input class="landing-input" id="cfRegName" type="text" autocomplete="name" placeholder="Your name" />' +
        '</div>' +
        emailField('cfRegEmail', 'Andrew email') +
        passwordField('cfRegPass', 'Password', { autocomplete: 'new-password', hint: 'At least 8 characters' }) +
        passwordField('cfRegPass2', 'Confirm password', { autocomplete: 'new-password' }) +
        '</div>' +
        '<div class="landing-form-actions">' +
        '<button type="submit" class="landing-submit" id="cfAuthSubmit" disabled>Create account →</button>' +
        '</div>' +
        '</form>' +
        '</div>',
        'register'
      );
    } else if (v === 'forgot') {
      inner = panelWrap(
        '<div class="landing-card__top">' +
        '<div class="landing-panel-head">' +
        '<button type="button" class="landing-back" data-view="signin">← Back to sign in</button>' +
        '<h2 class="landing-panel-title" id="panel-title-forgot">Forgot password</h2>' +
        '<p class="landing-panel-lead">No problem — sign in with your <strong>@andrew.cmu.edu</strong> Google account to verify it\'s you, then set a new password.</p>' +
        '</div>' +
        backendWarnHtml() +
        '</div>' +
        '<div class="landing-card__body">' +
        formErrorHtml() +
        '<div id="cfGoogleRecover" class="landing-google-mount"></div>' +
        '<p class="landing-recover-note">We use your CMU Google sign-in to confirm you own the account — no reset email needed.</p>' +
        '</div>',
        'forgot'
      );
    } else if (v === 'reset') {
      const resetLead = state.recovered
        ? 'You\'re verified. Choose a new password for <strong>' + esc(state.resetEmail || 'your account') + '</strong>.'
        : 'Choose a new password for <strong>' + esc(state.resetEmail || 'your account') + '</strong>.';
      inner = panelWrap(
        '<div class="landing-card__top">' +
        '<div class="landing-panel-head">' +
        '<h2 class="landing-panel-title" id="panel-title-reset">Set a new password</h2>' +
        '<p class="landing-panel-lead">' + resetLead + '</p>' +
        '</div>' +
        '</div>' +
        '<div class="landing-card__body">' +
        '<form class="landing-form" id="cfAuthForm" novalidate>' +
        formErrorHtml() +
        passwordField('cfResetPass', 'New password', { autocomplete: 'new-password', hint: 'At least 8 characters' }) +
        passwordField('cfResetPass2', 'Confirm password', { autocomplete: 'new-password' }) +
        '<div class="landing-form-actions">' +
        '<button type="submit" class="landing-submit" id="cfAuthSubmit" disabled>Update password →</button>' +
        '</div>' +
        '</form>' +
        '</div>',
        'reset'
      );
    } else {
      inner = panelWrap(
        '<div class="landing-card__top">' +
        tabsHtml('signin') +
        '<div class="landing-panel-head landing-panel-head--signin">' +
        '<h2 class="landing-panel-title" id="panel-title-signin">Welcome back</h2>' +
        '</div>' +
        backendWarnHtml() +
        '</div>' +
        '<div class="landing-card__body">' +
        '<form class="landing-form" id="cfAuthForm" novalidate>' +
        formErrorHtml() +
        emailField('cfLoginEmail', 'Andrew email') +
        passwordField('cfLoginPass', 'Password', { autocomplete: 'current-password' }) +
        '<div class="landing-forgot-row">' +
        '<button type="button" class="landing-link-btn" data-view="forgot">Forgot password?</button>' +
        '</div>' +
        '<div class="landing-form-actions">' +
        '<button type="submit" class="landing-submit" id="cfAuthSubmit" disabled>Sign in →</button>' +
        '</div>' +
        '</form>' +
        '</div>',
        'signin'
      );
    }

    inner += footerHtml();

    const card = document.getElementById('landingCard');
    card.innerHTML = inner;

    card.querySelectorAll('[data-view]').forEach(function (el) {
      el.addEventListener('click', function () {
        switchView(el.getAttribute('data-view'));
      });
    });

    const form = document.getElementById('cfAuthForm');
    if (form) {
      form.addEventListener('submit', onFormSubmit);
    }

    bindForm(v);

    if (v === 'forgot') mountGoogleRecover();

    if (opts.focus !== false) {
      const focusIds = {
        signin: 'cfLoginEmail',
        register: 'cfRegEmail',
        forgot: 'cfForgotEmail',
        reset: 'cfResetPass',
      };
      const focusEl = document.getElementById(focusIds[v]);
      if (focusEl) focusEl.focus();
    }
  }

  function switchView(view) {
    state.view = view;
    setFormError('');
    renderPanel({ focus: false });
  }

  function showToast(message) {
    let toast = document.getElementById('landingToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'landingToast';
      toast.className = 'landing-toast';
      toast.setAttribute('role', 'status');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(function () {
      toast.hidden = true;
    }, 4500);
  }

  function goToApp() {
    location.href = APP_URL;
  }

  async function onLogin(event) {
    event.preventDefault();
    setFormError('');
    const email = (document.getElementById('cfLoginEmail')?.value || '').trim();
    const password = document.getElementById('cfLoginPass')?.value || '';
    if (!validateAndrewField('cfLoginEmail', 'cfLoginEmailMsg')) return;
    if (!password) {
      setFieldMsg('cfLoginPass', 'cfLoginPassMsg', 'Enter your password.', 'error');
      return;
    }
    setLoading(true, 'Sign in →');
    const r = await apiLogin({ email, password });
    setLoading(false, 'Sign in →');
    if (!r.ok) {
      const msg = (r.data && r.data.message) || 'Email or password is incorrect.';
      if (r.status === 401) {
        setFieldMsg('cfLoginPass', 'cfLoginPassMsg', msg, 'error');
      } else {
        setFormError(msg);
      }
      updateSubmitState('signin');
      return;
    }
    goToApp();
  }

  async function onRegister(event) {
    event.preventDefault();
    setFormError('');
    const name = (document.getElementById('cfRegName')?.value || '').trim();
    const email = (document.getElementById('cfRegEmail')?.value || '').trim();
    const password = document.getElementById('cfRegPass')?.value || '';
    const confirm = document.getElementById('cfRegPass2')?.value || '';
    if (!validateAndrewField('cfRegEmail', 'cfRegEmailMsg')) return;
    if (password.length < 8) {
      setFieldMsg('cfRegPass', 'cfRegPassMsg', 'Password must be at least 8 characters.', 'error');
      return;
    }
    if (!validatePasswordMatch('cfRegPass', 'cfRegPass2', 'cfRegPass2Msg')) return;
    setLoading(true, 'Create account →');
    const r = await apiRegister({
      email,
      password,
      confirm_password: confirm,
      name: name || undefined,
    });
    setLoading(false, 'Create account →');
    if (!r.ok) {
      const msg = (r.data && r.data.message) || 'Registration failed.';
      if (r.data && r.data.error === 'email_taken') {
        setFieldMsg('cfRegEmail', 'cfRegEmailMsg', msg, 'error');
      } else {
        setFormError(msg);
      }
      updateSubmitState('register');
      return;
    }
    goToApp();
  }

  function mountGoogleRecover() {
    const slot = document.getElementById('cfGoogleRecover');
    if (!slot) return;
    const clientId = getGoogleClientId();
    if (!clientId) {
      setFormError('Google sign-in isn\'t configured, so password recovery is unavailable. Contact an admin.');
      return;
    }
    let tries = 0;
    const mount = function () {
      if (!(window.google && window.google.accounts && window.google.accounts.id)) {
        if (tries++ > 40) {  // ~6s
          setFormError('Couldn\'t load Google sign-in. Check your connection and refresh.');
          return;
        }
        return setTimeout(mount, 150);
      }
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: onGoogleRecover,
        ux_mode: 'popup',
        auto_select: false,
      });
      slot.innerHTML = '';
      window.google.accounts.id.renderButton(slot, {
        theme: 'filled_blue',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: 300,
      });
    };
    mount();
  }

  async function onGoogleRecover(response) {
    if (!response || !response.credential) {
      setFormError('Google sign-in was cancelled.');
      return;
    }
    setFormError('');
    const r = await apiGoogle(response.credential);
    if (!r.ok) {
      setFormError((r.data && r.data.message) || 'Google sign-in failed. Use your @andrew.cmu.edu account.');
      return;
    }
    // Verified — move to the set-a-new-password step (now authenticated).
    state.recovered = true;
    state.resetEmail = (r.data && r.data.email) || '';
    switchView('reset');
  }

  async function onForgotPassword(event) {
    event.preventDefault();
    setFormError('');
    const email = (document.getElementById('cfForgotEmail')?.value || '').trim();
    if (!validateAndrewField('cfForgotEmail', 'cfForgotEmailMsg')) return;
    setLoading(true, 'Send reset link →');
    const r = await apiForgotPassword(email);
    setLoading(false, 'Send reset link →');
    if (!r.ok) {
      setFormError((r.data && r.data.message) || 'Request failed.');
      updateSubmitState('forgot');
      return;
    }
    const box = document.getElementById('cfResetLinkBox');
    if (box && r.data && r.data.reset_token) {
      const url =
        location.origin +
        location.pathname +
        '?reset=' +
        encodeURIComponent(r.data.reset_token) +
        '&email=' +
        encodeURIComponent(r.data.email);
      box.hidden = false;
      box.innerHTML =
        '<p class="landing-reset-msg">' +
        esc(r.data.message || 'Use this link to reset your password:') +
        '</p>' +
        '<a class="landing-reset-link" href="' +
        esc(url) +
        '">Reset my password →</a>';
      state.resetToken = r.data.reset_token;
      state.resetEmail = r.data.email;
    } else if (box) {
      box.hidden = false;
      box.innerHTML =
        '<p class="landing-reset-msg">' +
        esc(r.data.message || 'If that email is registered, check for a reset link.') +
        '</p>';
    }
  }

  async function onResetPassword(event) {
    event.preventDefault();
    setFormError('');
    const password = document.getElementById('cfResetPass')?.value || '';
    const confirm = document.getElementById('cfResetPass2')?.value || '';
    if (password.length < 8) {
      setFieldMsg('cfResetPass', 'cfResetPassMsg', 'Password must be at least 8 characters.', 'error');
      return;
    }
    if (!validatePasswordMatch('cfResetPass', 'cfResetPass2', 'cfResetPass2Msg')) return;
    setLoading(true, 'Update password →');
    // Recovery via Google: the user is already authenticated, so set the
    // password directly. Legacy email-link path still uses the token.
    const r = state.recovered
      ? await apiSetPassword(password)
      : await apiResetPassword({ email: state.resetEmail, token: state.resetToken, password });
    setLoading(false, 'Update password →');
    if (!r.ok) {
      setFormError((r.data && r.data.message) || 'Reset failed.');
      updateSubmitState('reset');
      return;
    }
    if (state.recovered) {
      // Already signed in via Google — go straight into the app.
      showToast('Password set. Taking you in…');
      goToApp();
      return;
    }
    showToast('Password updated — sign in with your new password.');
    state.view = 'signin';
    state.resetToken = '';
    state.resetEmail = '';
    if (typeof history !== 'undefined') {
      history.replaceState({}, '', location.pathname);
    }
    renderPanel({ focus: false });
  }

  function onFormSubmit(event) {
    if (state.view === 'register') return onRegister(event);
    if (state.view === 'forgot') return onForgotPassword(event);
    if (state.view === 'reset') return onResetPassword(event);
    return onLogin(event);
  }

  async function init() {
    const params = new URLSearchParams(location.search);
    const resetTok = params.get('reset') || '';
    const resetEmail = params.get('email') || '';
    if (resetTok && resetEmail) {
      state.resetToken = resetTok;
      state.resetEmail = resetEmail;
      state.view = 'reset';
    }

    const me = await apiGetMe();
    if (me.ok) {
      goToApp();
      return;
    }
    if (me.status === 0) {
      state.backendUnreachable = true;
    }

    renderPanel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
