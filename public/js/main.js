(function () {
  'use strict';

  // --- small helpers ---
  const q = (sel, ctx = document) => ctx.querySelector(sel);
  const qa = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // global socket used across chat and video
  let globalSocket = null;

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

  // --- WebRTC video call wiring ---
  function wireVideoCall(socket) {
    const startBtn = q('#startCallBtn');
    const endBtn = q('#endCallBtn');
    const localVideo = q('#localVideo');
    const remoteVideo = q('#remoteVideo');
    if (!startBtn || !endBtn || !localVideo || !remoteVideo) return;

    let pc = null;
    let localStream = null;
    let pendingOffer = null;
    let iceCandidateQueue = []; // queue ICE candidates until remote description is set
    let remoteVideoPlayed = false; // flag to ensure we only call play() once

    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    function cleanup() {
      if (pc) {
        try { pc.close(); } catch (_){}
        pc = null;
      }
      if (localStream) {
        localStream.getTracks().forEach(t=>t.stop());
        localStream = null;
      }
      iceCandidateQueue = []; // clear any queued candidates
      remoteVideoPlayed = false; // reset flag
      localVideo.srcObject = null;
      remoteVideo.srcObject = null;
      startBtn.classList.remove('d-none');
      endBtn.classList.add('d-none');
    }

    async function startCall() {
      if (!window.DM_CHAT || !window.DM_CHAT.me || !window.DM_CHAT.withId) {
        showToast('Chat context missing', 'error');
        return;
      }
      try {
        console.log('Starting call...');
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        // Ensure local video plays
        if (localVideo.play && typeof localVideo.play === 'function') {
          localVideo.play().catch(err => console.error('Local video play error:', err));
        }
        pc = new RTCPeerConnection(config);
        console.log('PeerConnection created with config:', config);
        
        // add local tracks
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        
        // monitor connection state
        pc.onconnectionstatechange = () => {
          console.log('Connection state:', pc.connectionState);
          if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            showToast('Call connection lost', 'error');
            cleanup();
          }
        };
        
        // when remote track arrives
        pc.ontrack = (ev) => {
          console.log('Remote track received:', ev.track.kind, 'stream:', ev.streams[0]?.id);
          if (ev.streams && ev.streams.length > 0) {
            remoteVideo.srcObject = ev.streams[0];
            console.log('Set remoteVideo.srcObject to stream with tracks:', ev.streams[0].getTracks().map(t => t.kind).join(', '));
            // Ensure video plays only once (handles autoplay policy)
            if (!remoteVideoPlayed && remoteVideo.play && typeof remoteVideo.play === 'function') {
              remoteVideoPlayed = true;
              remoteVideo.play().catch(err => console.error('Remote video play error:', err));
            }
          }
        };
        
        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            const room = [window.DM_CHAT.me, window.DM_CHAT.withId].sort().join('-');
            socket.emit('webrtc-ice', { room, candidate: ev.candidate, from: window.DM_CHAT.me, to: window.DM_CHAT.withId });
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
  // use pc.localDescription to ensure the browser's canonical SDP is sent
  const localDesc = pc.localDescription;
  const room = [window.DM_CHAT.me, window.DM_CHAT.withId].sort().join('-');
  console.log('Sending offer in room:', room, 'localDesc.type:', localDesc && localDesc.type, 'sdp length:', localDesc && localDesc.sdp && localDesc.sdp.length);
  socket.emit('webrtc-offer', { room, offer: localDesc, from: window.DM_CHAT.me, fromName: (window.CURRENT_USER_NAME||''), to: window.DM_CHAT.withId });

        startBtn.classList.add('d-none');
        endBtn.classList.remove('d-none');
        // show mute/camera controls
        const muteBtn = q('#muteBtn');
        const cameraBtn = q('#cameraBtn');
        if (muteBtn) muteBtn.classList.remove('d-none');
        if (cameraBtn) cameraBtn.classList.remove('d-none');
      } catch (err) {
        console.error('Start call error', err);
        showToast('Unable to start call: ' + (err.message || err), 'error');
        cleanup();
      }
    }

    async function handleOffer(payload) {
      // only handle offers intended for me
      if (!window.DM_CHAT || payload.to !== window.DM_CHAT.me) return;
      console.log('Offer received from:', payload.from);
      // if already in call, reject
      if (pc) {
        const room = [payload.from, payload.to].sort().join('-');
        socket.emit('webrtc-end', { room });
        return;
      }
      // store pending offer and show incoming-call modal (if available)
      pendingOffer = payload;
      const incomingEl = q('#incomingCallModal');
      const incomingFrom = q('#incomingCallFrom');
  if (incomingFrom) incomingFrom.textContent = (payload.fromName && payload.fromName.length) ? `${payload.fromName} is calling...` : `User ${payload.from} is calling...`;
      // use Bootstrap modal if available
      if (incomingEl && window.bootstrap && window.bootstrap.Modal) {
        try {
          const modal = new bootstrap.Modal(incomingEl);
          incomingEl.addEventListener('hidden.bs.modal', () => { /* no-op */ });
          modal.show();
        } catch (err) { console.error('Modal show error', err); }
      } else {
        // fallback to confirm
        const accept = confirm('Incoming video call — accept?');
        if (!accept) {
          const room = [payload.from, payload.to].sort().join('-');
          socket.emit('webrtc-end', { room });
          pendingOffer = null;
          return;
        }
        // if accepted via fallback, proceed to accept
        await acceptPendingOffer();
      }
    }

    async function acceptPendingOffer() {
      if (!pendingOffer) return;
      const payload = pendingOffer;
      pendingOffer = null;
      try {
        console.log('Accepting pending offer payload:', payload);
        if (!payload.offer || !payload.offer.sdp) {
          throw new Error('Offer SDP missing');
        }
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        // Ensure local video plays
        if (localVideo.play && typeof localVideo.play === 'function') {
          localVideo.play().catch(err => console.error('Local video play error:', err));
        }
        pc = new RTCPeerConnection(config);
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        pc.onconnectionstatechange = () => {
          console.log('Connection state:', pc.connectionState);
          if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            showToast('Call connection lost', 'error');
            cleanup();
          }
        };

        pc.ontrack = (ev) => {
          console.log('Remote track received:', ev.track.kind, 'stream:', ev.streams[0]?.id);
          if (ev.streams && ev.streams.length > 0) {
            remoteVideo.srcObject = ev.streams[0];
            console.log('Set remoteVideo.srcObject to stream with tracks:', ev.streams[0].getTracks().map(t => t.kind).join(', '));
            // Ensure video plays only once (handles autoplay policy)
            if (!remoteVideoPlayed && remoteVideo.play && typeof remoteVideo.play === 'function') {
              remoteVideoPlayed = true;
              remoteVideo.play().catch(err => console.error('Remote video play error:', err));
            }
          }
        };

        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            const room = [window.DM_CHAT.me, window.DM_CHAT.withId].sort().join('-');
            socket.emit('webrtc-ice', { room, candidate: ev.candidate, from: window.DM_CHAT.me, to: window.DM_CHAT.withId });
          }
        };

        try {
          console.log('Setting remote description, offer.type:', payload.offer.type, 'sdp length:', payload.offer.sdp && payload.offer.sdp.length);
          const remoteDesc = { type: payload.offer.type, sdp: payload.offer.sdp };
          await pc.setRemoteDescription(remoteDesc);
          
          // flush queued ICE candidates now that remote description is set
          console.log('Remote description set, flushing', iceCandidateQueue.length, 'queued ICE candidates');
          while (iceCandidateQueue.length > 0) {
            const queuedCandidate = iceCandidateQueue.shift();
            try {
              await pc.addIceCandidate(queuedCandidate);
            } catch (err) {
              console.error('Error adding queued ICE candidate', err);
            }
          }
        } catch (sdErr) {
          console.error('setRemoteDescription failed', sdErr, payload.offer);
          throw sdErr;
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
  // send the canonical localDescription (answer) produced by the browser
  const localAns = pc.localDescription;
  const room = [window.DM_CHAT.me, window.DM_CHAT.withId].sort().join('-');
  console.log('Sending answer in room:', room, 'answer.type:', localAns && localAns.type, 'sdp length:', localAns && localAns.sdp && localAns.sdp.length);
  socket.emit('webrtc-answer', { room, answer: localAns, from: window.DM_CHAT.me, fromName: (window.CURRENT_USER_NAME||''), to: payload.from });

        startBtn.classList.add('d-none');
        endBtn.classList.remove('d-none');
        const muteBtn = q('#muteBtn');
        const cameraBtn = q('#cameraBtn');
        if (muteBtn) muteBtn.classList.remove('d-none');
        if (cameraBtn) cameraBtn.classList.remove('d-none');
      } catch (err) {
        console.error('Accept offer error', err);
        showToast('Failed to accept call: ' + (err.message || err), 'error');
        cleanup();
      }
    }

    async function handleAnswer(payload) {
      if (!pc) return;
      if (!window.DM_CHAT || payload.to !== window.DM_CHAT.me) return;
      try {
        console.log('Handling answer, answer.type:', payload.answer && payload.answer.type, 'sdp length:', payload.answer && payload.answer.sdp && payload.answer.sdp.length);
        const remoteAns = { type: payload.answer.type, sdp: payload.answer.sdp };
        await pc.setRemoteDescription(remoteAns);
      } catch (err) { console.error('Handle answer error', err); }
    }

    async function handleIce(payload) {
      if (!pc) {
        // pc not yet created, queue the candidate
        if (payload.candidate) {
          console.log('Queueing ICE candidate (pc not ready)');
          iceCandidateQueue.push(payload.candidate);
        }
        return;
      }
      try {
        if (payload.candidate) {
          // check if remote description is set; if not, queue the candidate
          if (!pc.remoteDescription) {
            console.log('Queueing ICE candidate (remote description not set yet)');
            iceCandidateQueue.push(payload.candidate);
          } else {
            await pc.addIceCandidate(payload.candidate);
          }
        }
      } catch (err) { console.error('Add ICE error', err); }
    }

    // socket listeners
    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-ice', handleIce);

    // wire incoming call modal buttons and mute/camera controls
    const acceptBtn = q('#acceptCallBtn');
    const declineBtn = q('#declineCallBtn');
    const muteBtn = q('#muteBtn');
    const cameraBtn = q('#cameraBtn');

    if (acceptBtn) on(acceptBtn, 'click', async (e) => {
      // hide modal if bootstrap used
      const incomingEl = q('#incomingCallModal');
      if (incomingEl && window.bootstrap && window.bootstrap.Modal) {
        try { bootstrap.Modal.getInstance(incomingEl)?.hide(); } catch (_) {}
      }
      await acceptPendingOffer();
    });
    if (declineBtn) on(declineBtn, 'click', (e) => {
      if (!pendingOffer) return;
      const room = [pendingOffer.from, pendingOffer.to].sort().join('-');
      try { socket.emit('webrtc-end', { room }); } catch (_) {}
      pendingOffer = null;
    });

    function toggleMute() {
      if (!localStream) return;
      const audioTracks = localStream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) return;
      const enabled = audioTracks[0].enabled;
      audioTracks.forEach(t => t.enabled = !enabled);
      if (muteBtn) muteBtn.textContent = enabled ? 'Unmute' : 'Mute';
    }
    function toggleCamera() {
      if (!localStream) return;
      const videoTracks = localStream.getVideoTracks();
      if (!videoTracks || videoTracks.length === 0) return;
      const enabled = videoTracks[0].enabled;
      videoTracks.forEach(t => t.enabled = !enabled);
      if (cameraBtn) cameraBtn.textContent = enabled ? 'Camera On' : 'Camera Off';
    }
    if (muteBtn) on(muteBtn, 'click', toggleMute);
    if (cameraBtn) on(cameraBtn, 'click', toggleCamera);

    startBtn.addEventListener('click', startCall);
    endBtn.addEventListener('click', () => { socket.emit('webrtc-end', { room: [window.DM_CHAT.me, window.DM_CHAT.withId].sort().join('-') }); cleanup(); });
    socket.on('webrtc-end', (payload) => { if (window.DM_CHAT && payload.room === [window.DM_CHAT.me, window.DM_CHAT.withId].sort().join('-')) cleanup(); });
    // Auto-start call when chat is opened with ?autocall=1 (makes it easy to initiate calls)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('autocall') === '1') {
        const tryStart = () => {
          if (socket && socket.connected) {
            // ensure we're in the room
            const room = [window.DM_CHAT.me, window.DM_CHAT.withId].sort().join('-');
            try { socket.emit('joinRoom', { room }); } catch (_) {}
            // small delay to let listeners settle
            setTimeout(() => {
              if (startBtn && !startBtn.classList.contains('d-none')) startCall();
            }, 300);
          } else {
            setTimeout(tryStart, 300);
          }
        };
        tryStart();
      }
    } catch (e) { /* ignore if URL API not available */ }
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
        if (!globalSocket) globalSocket = io();
        socket = globalSocket;
        socket.on('connect', () => {
          console.log('socket connected');
          // register this socket with the server so it can receive personal events
          if (window.CURRENT_USER) socket.emit('register', window.CURRENT_USER);
        });
        // if chat context is present, join the room
        if (window.DM_CHAT && window.DM_CHAT.me && window.DM_CHAT.withId) {
          const room = [window.DM_CHAT.me, window.DM_CHAT.withId].sort().join('-');
          try { socket.emit('joinRoom', { room }); } catch (e) { /* ignore */ }
        }
  socket.on('newMessage', (msg) => {
          // server emits: { _id, from, to, content, createdAt }
          const isMe = window.DM_CHAT && msg.from === window.DM_CHAT.me;
          const author = isMe ? 'You' : (msg.fromName || 'Them');
          const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : '';
          appendMessage({ author, text: msg.content, time, incoming: !isMe });
        });
          // unread count updates
          socket.on('unread', data => {
            try {
              const link = document.querySelector('a[href="/messages"]');
              if (link) {
                let badge = link.querySelector('.badge');
                if (!badge) {
                  badge = document.createElement('span');
                  badge.className = 'badge bg-danger rounded-pill ms-1';
                  badge.style.position = 'relative';
                  badge.style.top = '-2px';
                  link.appendChild(badge);
                }
                badge.textContent = data.count || '';
              }
            } catch (e) { /* ignore */ }
          });
      } catch (e) {
        console.warn('Socket.IO init failed', e);
      }
    }

    // wire video call handlers if available
    if (globalSocket) {
      wireVideoCall(globalSocket);
    }

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const text = input.value && input.value.trim();
      if (!text) return;
      if (socket && socket.connected) {
        // prefer socket and include room/from/to when available
        if (window.DM_CHAT && window.DM_CHAT.me && window.DM_CHAT.withId) {
          const room = [window.DM_CHAT.me, window.DM_CHAT.withId].sort().join('-');
          socket.emit('chatMessage', { from: window.DM_CHAT.me, to: window.DM_CHAT.withId, content: text, room });
        } else {
          socket.emit('chatMessage', { content: text });
        }
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

    // setup video call wiring if chat elements exist
    // wireVideoCall will be invoked from wireChat when socket is ready

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