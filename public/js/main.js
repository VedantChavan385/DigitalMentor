
// client side helpers
// placeholder for global scripts
// console.log('DigitalMentor UI loaded');


// public/js/main.js
// Lightweight client-side helpers for DigitalMentor

(function () {
  'use strict';

  // --- small helpers ---
  const q = (sel, ctx = document) => ctx.querySelector(sel);
  const qa = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  async function fetchJSON(url, options = {}) {
    const cfg = Object.assign({ headers: { 'Accept': 'application/json' } }, options);
    if (cfg.body && !(cfg.body instanceof FormData)) {
      cfg.headers['Content-Type'] = 'application/json';
      cfg.body = JSON.stringify(cfg.body);
    }
    const res = await fetch(url, cfg);
    if (!res.ok) {
      // try to parse error message
      let errText = res.statusText;
      try {
        const json = await res.json();
        errText = json.message || JSON.stringify(json);
      } catch (_) {}
      const err = new Error(errText);
      err.status = res.status;
      throw err;
    }
    // try JSON, fallback to text
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
  }

  function showToast(message, type = 'info', timeout = 3500) {
    const id = 'dm-toast-container';
    let container = document.getElementById(id);
    if (!container) {
      container = document.createElement('div');
      container.id = id;
      container.style.position = 'fixed';
      container.style.zIndex = 9999;
      container.style.right = '20px';
      container.style.top = '20px';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '8px';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.textContent = message;
    el.style.background = type === 'error' ? '#c84b4b' : '#333';
    el.style.color = 'white';
    el.style.padding = '8px 12px';
    el.style.borderRadius = '6px';
    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    container.appendChild(el);
    setTimeout(() => el.remove(), timeout);
  }

  function scrollToBottom(container) {
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }

  function disableBtn(btn) {
    if (!btn) return;
    btn.dataset.prev = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Please wait...';
  }
  function enableBtn(btn) {
    if (!btn) return;
    btn.disabled = false;
    if (btn.dataset.prev) {
      btn.innerHTML = btn.dataset.prev;
      delete btn.dataset.prev;
    }
  }

  // --- profile picture preview ---
  function wireProfilePreview() {
    const fileInput = q('#profilePic') || q('input[type="file"].profile-pic');
    const preview = q('#profilePreview') || q('img.profile-preview');
    if (!fileInput || !preview) return;
    on(fileInput, 'change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) {
        preview.src = preview.dataset.default || '';
        return;
      }
      if (!f.type.startsWith('image/')) {
        showToast('Please choose an image file', 'error');
        fileInput.value = '';
        return;
      }
      const url = URL.createObjectURL(f);
      preview.src = url;
      preview.onload = () => URL.revokeObjectURL(url);
    });
  }

  // --- chat sending (works via form POST or Socket.IO if present) ---
  function wireChat() {
    const form = q('#messageForm') || q('form#chatForm');
    const input = q('#messageInput') || q('input[name="message"], textarea[name="message"]');
    const messagesContainer = q('#messages') || q('.messages');
    if (!form || !input || !messagesContainer) return;

    // append message to UI
    function appendMessage({ author = 'You', text = '', time = '' , incoming = false }) {
      const wrap = document.createElement('div');
      wrap.className = 'dm-message' + (incoming ? ' incoming' : ' outgoing');
      const meta = document.createElement('div');
      meta.className = 'dm-message-meta';
      meta.textContent = `${author}${time ? ' • ' + time : ''}`;
      const body = document.createElement('div');
      body.className = 'dm-message-body';
      body.textContent = text;
      wrap.appendChild(meta);
      wrap.appendChild(body);
      messagesContainer.appendChild(wrap);
      scrollToBottom(messagesContainer);
    }

    // If Socket.IO is available, use it for real-time; otherwise fallback to normal POST
    let socket = null;
    if (window.io) {
      try {
        socket = io();
        socket.on('connect', () => console.log('socket connected'));
        socket.on('newMessage', (msg) => {
          // expected msg: { author, text, time }
          appendMessage(Object.assign({}, msg, { incoming: true }));
        });
      } catch (e) {
        console.warn('Socket.IO init failed', e);
      }
    }

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const text = input.value && input.value.trim();
      if (!text) return;
      if (socket && socket.connected) {
        socket.emit('sendMessage', { text });
        appendMessage({ author: 'You', text, time: new Date().toLocaleTimeString(), incoming: false });
        input.value = '';
        return;
      }
      // fallback: POST to form.action
      const action = form.action || '/messages';
      const submitBtn = q('button[type="submit"]', form);
      disableBtn(submitBtn);
      try {
        const payload = { text };
        await fetchJSON(action, { method: 'POST', body: payload });
        appendMessage({ author: 'You', text, time: new Date().toLocaleTimeString() });
        input.value = '';
      } catch (err) {
        showToast(err.message || 'Failed to send message', 'error');
      } finally {
        enableBtn(submitBtn);
      }
    });
  }

  // --- session request accept/decline via AJAX ---
  function wireSessionActions() {
    qa('.session-action').forEach(btn => {
      on(btn, 'click', async (e) => {
        const id = btn.dataset.id;
        const action = btn.dataset.action; // accept / decline
        if (!id || !action) return;
        disableBtn(btn);
        try {
          // match server route: POST /sessions/requests/:id/:action
          const resp = await fetchJSON(`/sessions/requests/${id}/${action}`, { method: 'POST' });
          showToast(resp.message || 'Done');
          // Optionally remove the request from DOM or update status
          const row = btn.closest('.session-row');
          if (row) row.remove();
        } catch (err) {
          showToast(err.message || 'Action failed', 'error');
          enableBtn(btn);
        }
      });
    });
  }

  // --- session request form submit via AJAX (improves UX and surfaces errors) ---
  function wireSessionRequestForms() {
    qa('form.session-request-form, form[action^="/sessions/request/"]').forEach(form => {
      on(form, 'submit', async (e) => {
        e.preventDefault();
        // enforce HTML5 constraint validation when submitting via JS
        if (typeof form.reportValidity === 'function' && !form.reportValidity()) {
          return;
        }
        const btn = q('button[type="submit"]', form) || q('button', form);
        disableBtn(btn);
        try {
          const fd = new FormData(form);
          // convert FormData to body for fetchJSON (it handles FormData)
          const url = form.action;
          // use native fetch so we can send FormData without JSON
          const res = await fetch(url, { method: 'POST', body: fd });
          if (!res.ok) {
            let msg = res.statusText || 'Request failed';
            try { const j = await res.json(); msg = j.message || msg; } catch (_) {}
            throw new Error(msg);
          }
          showToast('Session requested');
          // redirect to dashboard where server normally sends user
          setTimeout(() => { window.location.href = '/dashboard'; }, 600);
        } catch (err) {
          showToast(err.message || 'Failed to request session', 'error');
          enableBtn(btn);
        }
      });
    });
  }

  // --- mark message read / delete in inbox ---
  function wireInboxActions() {
    qa('.message-mark-read, .message-delete').forEach(btn => {
      on(btn, 'click', async (e) => {
        const id = btn.dataset.id;
        const type = btn.dataset.type; // read | delete
        if (!id || !type) return;
        disableBtn(btn);
        try {
          const url = `/messages/${id}/${type}`;
          const resp = await fetchJSON(url, { method: 'POST' });
          showToast(resp.message || 'Done');
          if (type === 'delete') {
            const row = btn.closest('.message-row');
            if (row) row.remove();
          }
        } catch (err) {
          showToast(err.message || 'Action failed', 'error');
          enableBtn(btn);
        }
      });
    });
  }

  // --- small form validators (example: register / addResource) ---
  function wireSimpleValidation() {
    qa('form[data-validate]').forEach(form => {
      on(form, 'submit', (e) => {
        const required = qa('[data-required]', form);
        for (const field of required) {
          if (!field.value || !field.value.trim()) {
            e.preventDefault();
            field.focus();
            showToast(field.dataset.msg || 'Please fill required fields', 'error');
            return;
          }
        }
      });
    });
  }

  // --- init all wires when DOM ready ---
  function init() {
    console.log('DigitalMentor UI loaded');
    wireProfilePreview();
    wireChat();
    wireSessionActions();
  wireSessionRequestForms();
    wireInboxActions();
    wireSimpleValidation();

    // any page-specific on-load behaviors:
    const messagesContainer = q('#messages');
    if (messagesContainer) scrollToBottom(messagesContainer);
  }

  // run on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();