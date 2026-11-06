// ========== Состояние ==========
const state = {
  myId: null,
  myName: null,
  room: null,
  users: {},
  pc: null,
  localStream: null,
  isVideoCall: false,
  isMuted: false,
  isCamOff: false,
  currentCallPeer: null,
  pendingOffer: null
};

const $ = (s) => document.querySelector(s);

function showLoginError(msg) {
  const errEl = $('#login-error');
  if (!errEl) return;
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
}

function hideLoginError() {
  const errEl = $('#login-error');
  if (!errEl) return;
  errEl.classList.add('hidden');
  errEl.textContent = '';
}

// ========== Инициализация после загрузки ==========
function init() {
  const joinBtn = $('#join-btn');
  if (!joinBtn) {
    console.error('Кнопка join-btn не найдена');
    return;
  }

  // Проверка Firebase
  if (typeof firebase === 'undefined') {
    showLoginError('Firebase не загрузился. Открой сайт через GitHub Pages или локальный сервер (не file://).');
    return;
  }
  if (typeof auth === 'undefined' || typeof db === 'undefined') {
    showLoginError('Ошибка firebase-config.js. Проверь файл.');
    return;
  }

  joinBtn.addEventListener('click', () => {
    hideLoginError();
    join();
  });
  $('#name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { hideLoginError(); join(); }
  });
  $('#room-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { hideLoginError(); join(); }
  });

  console.log('Мессенджер готов к входу');
}

async function join() {
  const name = ($('#name-input').value || '').trim() || 'Аноним';
  const room = (($('#room-input').value || '').trim() || 'general').toLowerCase().replace(/[^a-z0-9а-яё_-]/gi, '');
  const joinBtn = $('#join-btn');

  joinBtn.disabled = true;
  joinBtn.textContent = 'Входим...';

  try {
    const cred = await auth.signInAnonymously();
    state.myId = cred.user.uid;
    state.myName = name;
    state.room = room;

    // Присутствие
    const userRef = db.ref('rooms/' + room + '/users/' + state.myId);
    await userRef.set({
      name: name,
      id: state.myId,
      joinedAt: firebase.database.ServerValue.TIMESTAMP
    });
    userRef.onDisconnect().remove();

    // Пользователи
    const usersRef = db.ref('rooms/' + room + '/users');
    usersRef.on('value', function(snap) {
      state.users = snap.val() || {};
      renderUsers();
      const countEl = $('#online-count');
      if (countEl) countEl.textContent = Object.keys(state.users).length + ' онлайн';
    });

    // Сообщения
    const msgsRef = db.ref('rooms/' + room + '/messages').limitToLast(80);
    msgsRef.on('child_added', function(snap) {
      appendMessage(snap.val());
    });

    // Сигналинг звонков
    const signalRef = db.ref('rooms/' + room + '/signals/' + state.myId);
    signalRef.on('child_added', async function(snap) {
      const data = snap.val();
      if (!data) return;
      await handleSignal(data);
      snap.ref.remove();
    });

    // UI
    $('#my-name').textContent = name;
    $('#my-room').textContent = room;
    $('#room-title').textContent = room;
    $('#avatar').textContent = name[0].toUpperCase();
    $('#login-screen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#message-input').focus();

    sendSystem(name + ' присоединился');
  } catch (e) {
    console.error(e);
    let msg = e.message || String(e);
    const code = e.code || '';
    if (code === 'auth/operation-not-allowed' || msg.indexOf('operation-not-allowed') !== -1) {
      msg = 'Anonymous Auth выключен. Firebase → Authentication → Sign-in method → Anonymous → Enable';
    } else if (code === 'PERMISSION_DENIED' || msg.indexOf('PERMISSION_DENIED') !== -1) {
      msg = 'Нет прав. Realtime Database → Rules → поставь {".read":true,".write":true} и Publish';
    } else if (msg.indexOf('network') !== -1 || msg.indexOf('Failed') !== -1) {
      msg = 'Сеть / databaseURL. Проверь Realtime Database в консоли Firebase.';
    }
    showLoginError('Ошибка: ' + msg);
  } finally {
    joinBtn.disabled = false;
    joinBtn.textContent = 'Войти';
  }
}

// ========== Сообщения ==========
function sendMessage() {
  const text = ($('#message-input').value || '').trim();
  if (!text || !state.room) return;
  db.ref('rooms/' + state.room + '/messages').push({
    type: 'text',
    text: text,
    name: state.myName,
    userId: state.myId,
    time: firebase.database.ServerValue.TIMESTAMP
  });
  $('#message-input').value = '';
  $('#message-input').style.height = 'auto';
}

function sendSystem(text) {
  if (!state.room) return;
  db.ref('rooms/' + state.room + '/messages').push({
    type: 'system',
    text: text,
    time: firebase.database.ServerValue.TIMESTAMP
  });
}

function appendMessage(msg) {
  if (!msg) return;
  const el = document.createElement('div');

  if (msg.type === 'system') {
    el.className = 'system-msg';
    el.textContent = msg.text;
  } else {
    const isMine = msg.userId === state.myId;
    el.className = 'message' + (isMine ? ' mine' : '');
    const time = msg.time ? new Date(msg.time).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) : '';

    if (msg.type === 'file') {
      const size = formatSize(msg.file && msg.file.size ? msg.file.size : 0);
      const href = (msg.file && msg.file.dataUrl) ? msg.file.dataUrl : '#';
      const fname = (msg.file && msg.file.name) ? msg.file.name : 'файл';
      el.innerHTML =
        '<div class="text-xs text-slate-400 mb-1 ' + (isMine ? 'text-right' : '') + '">' + esc(msg.name) + ' · ' + time + '</div>' +
        '<div class="file-card ' + (isMine ? 'ml-auto' : '') + '">' +
        '<span class="text-2xl">📎</span>' +
        '<div class="min-w-0"><a href="' + href + '" download="' + esc(fname) + '">' + esc(fname) + '</a>' +
        '<div class="text-xs text-slate-400">' + size + '</div></div></div>';
    } else {
      el.innerHTML =
        '<div class="text-xs text-slate-400 mb-1 ' + (isMine ? 'text-right' : '') + '">' + esc(msg.name) + ' · ' + time + '</div>' +
        '<div class="px-4 py-2.5 rounded-2xl ' + (isMine ? 'bg-cyan-600 rounded-br-md' : 'bg-slate-700 rounded-bl-md') + ' whitespace-pre-wrap break-words">' +
        esc(msg.text) + '</div>';
    }
  }

  const box = $('#messages');
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

// ========== Файлы (base64, до 1 МБ) ==========
function setupFileInput() {
  const input = $('#file-input');
  if (!input) return;
  input.addEventListener('change', async function() {
    const file = input.files[0];
    if (!file || !state.room) return;

    const MAX = 1 * 1024 * 1024;
    if (file.size > MAX) {
      alert('Максимум 1 МБ без Storage.');
      input.value = '';
      return;
    }

    const progress = $('#upload-progress');
    progress.classList.remove('hidden');
    progress.textContent = 'Читаю ' + file.name + '...';

    try {
      const dataUrl = await readFileAsDataURL(file);
      db.ref('rooms/' + state.room + '/messages').push({
        type: 'file',
        name: state.myName,
        userId: state.myId,
        time: firebase.database.ServerValue.TIMESTAMP,
        file: { name: file.name, size: file.size, dataUrl: dataUrl }
      });
      progress.textContent = 'Отправлено ✓';
      setTimeout(function() { progress.classList.add('hidden'); }, 2000);
    } catch (e) {
      console.error(e);
      progress.textContent = 'Ошибка: ' + e.message;
    }
    input.value = '';
  });
}

function readFileAsDataURL(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function() { resolve(reader.result); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ========== Пользователи ==========
function renderUsers() {
  const list = $('#users-list');
  if (!list) return;
  list.innerHTML = '';
  Object.values(state.users).forEach(function(u) {
    const isMe = u.id === state.myId;
    const el = document.createElement('div');
    el.className = 'user-item flex items-center gap-2 px-3 py-2 rounded-lg' + (isMe ? ' me' : '');
    el.innerHTML =
      '<div class="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-sm font-bold shrink-0">' +
      (u.name ? u.name[0].toUpperCase() : '?') + '</div>' +
      '<div class="flex-1 min-w-0 text-sm font-medium truncate">' + esc(u.name) + (isMe ? ' (вы)' : '') + '</div>' +
      (!isMe ?
        '<div class="call-btns flex gap-1">' +
        '<button class="p-1.5 rounded-lg bg-slate-600 hover:bg-green-600 text-sm" data-voice="' + u.id + '" title="Голос">📞</button>' +
        '<button class="p-1.5 rounded-lg bg-slate-600 hover:bg-blue-600 text-sm" data-video="' + u.id + '" title="Видео">🎥</button>' +
        '</div>' : '');
    list.appendChild(el);
  });

  list.querySelectorAll('[data-voice]').forEach(function(btn) {
    btn.onclick = function() { startCall(btn.getAttribute('data-voice'), false); };
  });
  list.querySelectorAll('[data-video]').forEach(function(btn) {
    btn.onclick = function() { startCall(btn.getAttribute('data-video'), true); };
  });
}

// ========== WebRTC ==========
const iceConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

async function createPC() {
  const pc = new RTCPeerConnection(iceConfig);
  pc.onicecandidate = function(e) {
    if (e.candidate && state.currentCallPeer) {
      sendSignal(state.currentCallPeer, { type: 'ice', candidate: e.candidate });
    }
  };
  pc.ontrack = function(e) {
    $('#remote-video').srcObject = e.streams[0];
  };
  pc.onconnectionstatechange = function() {
    if (pc.connectionState === 'connected') {
      $('#call-status').textContent = 'Разговор';
    }
    if (['disconnected', 'failed', 'closed'].indexOf(pc.connectionState) !== -1) {
      endCall(false);
    }
  };
  return pc;
}

function sendSignal(toId, data) {
  db.ref('rooms/' + state.room + '/signals/' + toId).push({
    type: data.type,
    offer: data.offer,
    answer: data.answer,
    candidate: data.candidate,
    isVideo: data.isVideo,
    from: state.myId,
    fromName: state.myName
  });
}

async function startCall(peerId, isVideo) {
  if (state.pc) return;
  state.currentCallPeer = peerId;
  state.isVideoCall = isVideo;

  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
    $('#local-video').srcObject = state.localStream;

    state.pc = await createPC();
    state.localStream.getTracks().forEach(function(t) {
      state.pc.addTrack(t, state.localStream);
    });

    const offer = await state.pc.createOffer();
    await state.pc.setLocalDescription(offer);

    sendSignal(peerId, { type: 'offer', offer: offer, isVideo: isVideo });
    showCallUI(isVideo);
    $('#call-status').textContent = 'Звоним...';
    $('#remote-name').textContent = (state.users[peerId] && state.users[peerId].name) || 'Собеседник';
  } catch (e) {
    alert('Нет доступа к микрофону/камере. Разреши в настройках сайта.');
    cleanupCall();
  }
}

async function handleSignal(data) {
  if (data.type === 'offer') {
    state.currentCallPeer = data.from;
    state.isVideoCall = data.isVideo;
    state.pendingOffer = data.offer;
    $('#caller-name').textContent = data.fromName || 'Кто-то';
    $('#call-type').textContent = data.isVideo ? 'Видеозвонок' : 'Голосовой звонок';
    $('#incoming-call').classList.remove('hidden');
  }

  if (data.type === 'answer' && state.pc) {
    await state.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  if (data.type === 'ice' && state.pc && data.candidate) {
    try {
      await state.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) {}
  }

  if (data.type === 'end') {
    endCall(false);
  }
}

function setupCallButtons() {
  $('#accept-call').onclick = async function() {
    $('#incoming-call').classList.add('hidden');
    try {
      state.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: state.isVideoCall
      });
      $('#local-video').srcObject = state.localStream;

      state.pc = await createPC();
      state.localStream.getTracks().forEach(function(t) {
        state.pc.addTrack(t, state.localStream);
      });

      await state.pc.setRemoteDescription(new RTCSessionDescription(state.pendingOffer));
      const answer = await state.pc.createAnswer();
      await state.pc.setLocalDescription(answer);

      sendSignal(state.currentCallPeer, { type: 'answer', answer: answer });
      showCallUI(state.isVideoCall);
      $('#call-status').textContent = 'Разговор';
      $('#remote-name').textContent = $('#caller-name').textContent;
    } catch (e) {
      alert('Нет доступа к камере/микрофону');
      rejectCall();
    }
  };

  $('#reject-call').onclick = rejectCall;
  $('#end-call').onclick = function() { endCall(true); };

  $('#toggle-mic').onclick = function() {
    if (!state.localStream) return;
    state.isMuted = !state.isMuted;
    state.localStream.getAudioTracks().forEach(function(t) { t.enabled = !state.isMuted; });
    $('#toggle-mic').classList.toggle('bg-red-600', state.isMuted);
  };

  $('#toggle-cam').onclick = function() {
    if (!state.localStream) return;
    state.isCamOff = !state.isCamOff;
    state.localStream.getVideoTracks().forEach(function(t) { t.enabled = !state.isCamOff; });
    $('#toggle-cam').classList.toggle('bg-red-600', state.isCamOff);
  };
}

function rejectCall() {
  if (state.currentCallPeer) {
    sendSignal(state.currentCallPeer, { type: 'end' });
  }
  $('#incoming-call').classList.add('hidden');
  cleanupCall();
}

function showCallUI(isVideo) {
  $('#call-ui').classList.remove('hidden');
  if (isVideo) {
    $('#audio-only-ui').classList.add('hidden');
    $('#remote-video').classList.remove('hidden');
    $('#local-video').classList.remove('hidden');
  } else {
    $('#audio-only-ui').classList.remove('hidden');
    $('#remote-video').classList.add('hidden');
    $('#local-video').classList.add('hidden');
  }
}

function endCall(notify) {
  if (notify && state.currentCallPeer) {
    sendSignal(state.currentCallPeer, { type: 'end' });
  }
  cleanupCall();
  $('#call-ui').classList.add('hidden');
  $('#incoming-call').classList.add('hidden');
}

function cleanupCall() {
  if (state.localStream) {
    state.localStream.getTracks().forEach(function(t) { t.stop(); });
    state.localStream = null;
  }
  if (state.pc) {
    state.pc.close();
    state.pc = null;
  }
  $('#local-video').srcObject = null;
  $('#remote-video').srcObject = null;
  state.currentCallPeer = null;
  state.pendingOffer = null;
  state.isMuted = false;
  state.isCamOff = false;
}

// ========== Утилиты ==========
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function formatSize(b) {
  if (b < 1024) return b + ' Б';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' КБ';
  return (b / 1048576).toFixed(1) + ' МБ';
}

// ========== Запуск ==========
function setupChatUI() {
  $('#send-btn').addEventListener('click', sendMessage);
  $('#message-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  $('#message-input').addEventListener('input', function() {
    const el = $('#message-input');
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 112) + 'px';
  });
  setupFileInput();
  setupCallButtons();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    init();
    setupChatUI();
  });
} else {
  init();
  setupChatUI();
}
