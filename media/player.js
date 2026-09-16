// Radio webview player. Loaded by src/radioProvider.ts with a CSP nonce.
// Runtime data (channels, favorites, icons, selection state) is injected into
// window.__RADIO_INIT__ by the host page before this script runs.
(function () {
  'use strict';

  const init = window.__RADIO_INIT__ || {};

  const vscode = acquireVsCodeApi();
  const channels = Array.isArray(init.channels) ? init.channels : [];
  const favoriteUrls = new Set(init.favoriteUrls || []);
  const icons = init.icons || {};
  let index = typeof init.index === 'number' ? init.index : 0;
  let favoriteOnly = Boolean(init.favoriteOnly);

  let hls;
  let hlsReady = false;
  let pendingPlay = false;
  let muted = false;

  const scrollPositions = { all: 0, favorites: 0 };
  const audio = document.getElementById('audio');
  const list = document.getElementById('channels');
  const play = document.getElementById('play');
  const locate = document.getElementById('locate');
  const state = { playing: false };

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[c]));
  }

  function render(preserve = true) {
    const playlistKey = favoriteOnly ? 'favorites' : 'all';
    if (preserve) scrollPositions[playlistKey] = list.scrollTop;
    const restoreScroll = scrollPositions[playlistKey] || 0;

    vscode.postMessage({ type: 'playlist', favoriteOnly });

    const current = channels[index];
    document.getElementById('nowName').textContent = current ? current.name : 'Select a station';
    document.getElementById('nowDescription').textContent = current && current.description ? current.description : 'Internet radio';
    document.getElementById('nowLabel').textContent = state.playing ? 'ON AIR' : 'READY';

    const visible = channels
      .map((channel, i) => ({ channel, i }))
      .filter(item => !favoriteOnly || favoriteUrls.has(item.channel.url));

    list.innerHTML = visible.length
      ? visible.map(({ channel, i }) =>
          '<div class="channel-row ' + (i === index ? 'selected' : '') + '">' +
            '<button class="channel" data-index="' + i + '">' +
              '<span class="channel-icon">' + (i === index && state.playing ? '●' : '○') + '</span>' +
              '<span class="channel-text"><b>' + escapeHtml(channel.name) + '</b><small>' + escapeHtml(channel.description || 'Live station') + '</small></span>' +
            '</button>' +
            '<button class="favorite ' + (favoriteUrls.has(channel.url) ? 'active' : '') + '" data-index="' + i + '"' +
              ' aria-label="' + (favoriteUrls.has(channel.url) ? 'Remove from favorites' : 'Add to favorites') + '"' +
              ' title="' + (favoriteUrls.has(channel.url) ? 'Remove from favorites' : 'Add to favorites') + '">' +
              (favoriteUrls.has(channel.url) ? icons.favoriteFilled : icons.favoriteEmpty) +
            '</button>' +
          '</div>'
        ).join('')
      : '<p class="empty">No stations yet.</p>';

    list.scrollTop = restoreScroll;
    locate.disabled = !list.querySelector('.channel-row.selected');
    document.getElementById('favoriteCount').textContent = String(
      [...favoriteUrls].filter(url => channels.some(channel => channel.url === url)).length
    );
    document.getElementById('allFilter').classList.toggle('active', !favoriteOnly);
    document.getElementById('favoriteFilter').classList.toggle('active', favoriteOnly);
    play.innerHTML = state.playing ? icons.stop : icons.play;
    vscode.postMessage({ type: 'state', playing: state.playing });
  }

  function toggleFavorite(i) {
    if (!channels[i]) return;
    const next = !favoriteUrls.has(channels[i].url);
    if (next) favoriteUrls.add(channels[i].url);
    else favoriteUrls.delete(channels[i].url);
    vscode.postMessage({ type: 'favorite', index: i, favorite: next });
    render();
  }

  function navigate(direction) {
    const candidates = channels
      .map((channel, i) => ({ channel, i }))
      .filter(item => !favoriteOnly || favoriteUrls.has(item.channel.url));
    if (!candidates.length) return;
    const position = candidates.findIndex(item => item.i === index);
    const next = candidates[
      (position < 0 ? (direction > 0 ? 0 : candidates.length - 1) : position + direction + candidates.length) % candidates.length
    ];
    choose(next.i, true);
  }

  function locateCurrent() {
    const selected = list.querySelector('.channel-row.selected');
    if (selected) selected.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function switchPlaylist(next) {
    scrollPositions[favoriteOnly ? 'favorites' : 'all'] = list.scrollTop;
    favoriteOnly = next;
    render(false);
  }

  function choose(i, auto) {
    if (!channels[i]) return;
    index = i;
    state.playing = false;
    pendingPlay = auto;
    hlsReady = false;
    if (hls) { hls.destroy(); hls = undefined; }
    audio.pause();
    audio.removeAttribute('src');
    audio.load();

    const url = channels[i].url;
    if (/\.m3u8(?:$|[?#])/i.test(url) && window.Hls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: false });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        hlsReady = true;
        if (pendingPlay) start();
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          const response = data.response || {};
          const detail = [data.type || 'unknown', data.details || 'unknown', response.code ? ('HTTP ' + response.code) : '', data.url || url]
            .filter(Boolean).join(' · ');
          console.error('Radio HLS error:', data);
          pendingPlay = false;
          state.playing = false;
          render();
          vscode.postMessage({ type: 'error', error: 'HLS failed: ' + detail });
        }
      });
      hls.loadSource(url);
      hls.attachMedia(audio);
    } else {
      audio.src = url;
      audio.load();
      hlsReady = true;
      if (auto) start();
    }
    render();
    vscode.postMessage({ type: 'select', index, playing: auto });
  }

  function playWhenReady() {
    if (!pendingPlay) return;
    if (audio.readyState < 3) {
      document.getElementById('nowLabel').textContent = 'BUFFERING';
      return;
    }
    pendingPlay = false;
    audio.play().then(() => {
      state.playing = true;
      render();
    }).catch(e => {
      state.playing = false;
      render();
      console.error('Radio play() failed:', e.name, e.message, e);
      vscode.postMessage({ type: 'error', error: 'Playback rejected: ' + (e.name || 'UnknownError') + ' — ' + (e.message || 'the browser rejected the stream') });
    });
  }

  function start() {
    if (!channels[index]) return;
    pendingPlay = true;
    if (/\.m3u8(?:$|[?#])/i.test(channels[index].url) && !hlsReady) {
      document.getElementById('nowLabel').textContent = 'LOADING';
      return;
    }
    playWhenReady();
  }

  function stopPlayback() {
    pendingPlay = false;
    state.playing = false;
    if (hls) { hls.destroy(); hls = undefined; }
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    hlsReady = false;
    render();
  }

  function toggle() {
    if (state.playing) stopPlayback();
    else if (!audio.src && !hls) choose(index, true);
    else start();
  }

  audio.onplay = () => { state.playing = true; render(); };
  audio.onpause = () => { state.playing = false; render(); };
  audio.onerror = () => {
    state.playing = false;
    render();
    vscode.postMessage({ type: 'error', error: 'The stream ended or is unavailable.' });
  };

  function updateVolume() {
    document.getElementById('volume').value = audio.volume;
    document.getElementById('volumeValue').textContent = muted ? 'Muted' : Math.round(audio.volume * 100) + '%';
  }

  document.getElementById('play').onclick = toggle;
  document.getElementById('locate').onclick = locateCurrent;
  document.getElementById('prev').onclick = () => navigate(-1);
  document.getElementById('next').onclick = () => navigate(1);
  document.getElementById('volume').oninput = e => {
    audio.volume = Number(e.target.value);
    muted = false;
    audio.muted = false;
    updateVolume();
  };
  document.getElementById('allFilter').onclick = () => switchPlaylist(false);
  document.getElementById('favoriteFilter').onclick = () => switchPlaylist(true);
  list.onclick = e => {
    const fav = e.target.closest('.favorite');
    if (fav) { toggleFavorite(Number(fav.dataset.index)); return; }
    const station = e.target.closest('.channel');
    if (station) choose(Number(station.dataset.index), true);
  };
  document.getElementById('settings').onclick = () => vscode.postMessage({ type: 'openSettings' });

  window.addEventListener('message', e => {
    if (e.data.type === 'toggle') toggle();
    if (e.data.type === 'navigate') navigate(e.data.direction);
    if (e.data.type === 'toggleFavorite') toggleFavorite(index);
    if (e.data.type === 'togglePlaylist') switchPlaylist(!favoriteOnly);
    if (e.data.type === 'select') choose(e.data.index, e.data.autoplay);
    if (e.data.type === 'volume') {
      audio.volume = Math.max(0, Math.min(1, audio.volume + e.data.delta));
      muted = false;
      audio.muted = false;
      updateVolume();
    }
    if (e.data.type === 'mute') {
      muted = !muted;
      audio.muted = muted;
      updateVolume();
    }
  });

  audio.addEventListener('canplay', playWhenReady);
  audio.addEventListener('loadeddata', playWhenReady);
  audio.volume = 0.8;
  updateVolume();
  render();
  if (channels[index]) choose(index, false);
})();