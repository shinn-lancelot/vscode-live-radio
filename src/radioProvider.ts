import * as vscode from 'vscode';
import { loadBundledChannels } from './channels';
import { Channel } from './types';
import { styles } from './webview/styles';

export class RadioProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private channels: Channel[] = [];
  private selected = 0;
  private playing = false;
  private hasUserStartedPlayback = false;
  private favoriteUrls = new Set<string>();
  private playlist: 'all' | 'favorites' = 'all';
  private lastPlayedPlaylist: 'all' | 'favorites' = 'all';
  private lastSelected: Record<'all' | 'favorites', number> = { all: 0, favorites: 0 };
  private pendingMessages: unknown[] = [];
  private status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1001);
  private previousStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1002);
  private nextStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);

  constructor(private readonly context: vscode.ExtensionContext) {
    this.favoriteUrls = new Set(context.globalState.get<string[]>('radio.favoriteChannels', []));
    this.playlist = context.globalState.get<'all' | 'favorites'>('radio.lastPlaylist', 'all') === 'favorites' ? 'favorites' : 'all';
    this.lastPlayedPlaylist = this.playlist;
    const savedPositions = context.globalState.get<Partial<Record<'all' | 'favorites', number>>>('radio.lastChannels', {});
    this.lastSelected = { all: Number.isInteger(savedPositions.all) ? Math.max(savedPositions.all!, 0) : 0, favorites: Number.isInteger(savedPositions.favorites) ? Math.max(savedPositions.favorites!, 0) : 0 };
    this.reloadChannels();
    this.status.command = 'radio.togglePlayback';
    this.status.tooltip = 'Radio: Play / Stop (Ctrl+Shift+Space) · Switch playlist (Ctrl+Shift+;)';
    this.previousStatus.text = '$(chevron-left)';
    this.previousStatus.command = 'radio.previousChannel';
    this.previousStatus.tooltip = 'Radio: Previous Channel (Ctrl+Shift+,)';
    this.nextStatus.text = '$(chevron-right)';
    this.nextStatus.command = 'radio.nextChannel';
    this.nextStatus.tooltip = 'Radio: Next Channel (Ctrl+Shift+.)';
    this.updateStatus();
    context.subscriptions.push(this.status, this.previousStatus, this.nextStatus);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage(message => this.handleMessage(message));
    view.onDidDispose(() => {
      this.view = undefined;
      this.playlist = this.lastPlayedPlaylist;
      this.selected = this.lastSelected[this.playlist] ?? this.selected;
      this.updateStatus();
    });
    this.playlist = this.lastPlayedPlaylist;
    this.selected = Math.min(Math.max(this.lastSelected[this.playlist] ?? this.selected, 0), Math.max(this.channels.length - 1, 0));
    view.webview.html = this.html(view.webview);
    for (const message of this.pendingMessages.splice(0)) view.webview.postMessage(message);
  }

  togglePlayback(): void {
    if (!this.view || !this.hasUserStartedPlayback) {
      this.revealPlayer();
      void vscode.window.showInformationMessage('请在 Radio 播放器内点击播放。');
      return;
    }
    this.postToPlayer({ type: 'toggle' });
  }

  nextChannel(): void {
    if (!this.channels.length) return;
    this.postToPlayer({ type: 'navigate', direction: 1 });
  }

  previousChannel(): void {
    if (!this.channels.length) return;
    this.postToPlayer({ type: 'navigate', direction: -1 });
  }

  toggleFavorite(): void {
    this.postToPlayer({ type: 'toggleFavorite' });
  }

  togglePlaylist(): void {
    this.postToPlayer({ type: 'togglePlaylist' });
  }

  volumeUp(): void { this.postToPlayer({ type: 'volume', delta: 0.1 }); }
  volumeDown(): void { this.postToPlayer({ type: 'volume', delta: -0.1 }); }
  toggleMute(): void { this.postToPlayer({ type: 'mute' }); }

  private revealPlayer(): void {
    void vscode.commands.executeCommand('radio.player.focus').then(undefined, () =>
      vscode.commands.executeCommand('workbench.view.extension.radio')
    );
  }

  private postToPlayer(message: unknown): void {
    if (this.view) {
      this.view.webview.postMessage(message);
      return;
    }
    this.pendingMessages.push(message);
    this.revealPlayer();
  }

  private handleMessage(message: { type: string; index?: number; playing?: boolean; error?: string; favorite?: boolean; favoriteOnly?: boolean }): void {
    if (message.type === 'select' && typeof message.index === 'number') {
      this.selected = message.index;
      this.playing = Boolean(message.playing);
      if (message.playing) {
        this.lastSelected[this.playlist] = this.selected;
        this.lastPlayedPlaylist = this.playlist;
        void this.context.globalState.update('radio.lastChannels', this.lastSelected);
        void this.context.globalState.update('radio.lastPlaylist', this.playlist);
        if (vscode.workspace.getConfiguration('radio').get('rememberLastChannel', true)) {
          void this.context.globalState.update('radio.lastChannel', this.selected);
        }
      }
      this.updateStatus();
    } else if (message.type === 'playlist') {
      this.playlist = message.favoriteOnly ? 'favorites' : 'all';
      this.updateStatus();
    } else if (message.type === 'favorite' && typeof message.index === 'number' && this.channels[message.index]) {
      const channel = this.channels[message.index];
      if (message.favorite) this.favoriteUrls.add(channel.url); else this.favoriteUrls.delete(channel.url);
      void this.context.globalState.update('radio.favoriteChannels', [...this.favoriteUrls]);
      void vscode.window.showInformationMessage(message.favorite ? `Radio: 已收藏「${channel.name}」` : `Radio: 已取消收藏「${channel.name}」`);
    } else if (message.type === 'state') {
      this.playing = Boolean(message.playing);
      if (this.playing) this.hasUserStartedPlayback = true;
      this.updateStatus();
    } else if (message.type === 'error') {
      vscode.window.showWarningMessage(`Radio: ${message.error || 'Unable to play this stream.'}`);
      this.playing = false;
      this.updateStatus();
    } else if (message.type === 'openSettings') {
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:local.vscode-live-radio radio.channels');
    }
  }

  public reloadChannels(): void {
    const custom = vscode.workspace.getConfiguration('radio').get<Channel[]>('channels', []);
    this.channels = [...loadBundledChannels(), ...custom.filter(channel => channel?.name && channel?.url)];
    const legacyLast = this.context.globalState.get<number>('radio.lastChannel', 0);
    const last = this.lastSelected[this.playlist] ?? legacyLast;
    this.selected = Math.min(Math.max(last, 0), Math.max(this.channels.length - 1, 0));
    if (this.view) this.view.webview.html = this.html(this.view.webview);
  }

  private updateStatus(): void {
    const channel = this.channels[this.selected];
    const liveIndicator = this.playing ? '$(circle-filled)' : '$(circle-outline)';
    this.status.text = channel ? `${liveIndicator} [${this.playlist === 'favorites' ? 'Fav' : 'All'}] ${channel.name}` : '$(circle-outline) Radio';
    this.status.show();
    this.previousStatus.show();
    this.nextStatus.show();
  }

  private html(webview: vscode.Webview): string {
    const nonce = Math.random().toString(36).slice(2);
    const channels = JSON.stringify(this.channels).replace(/</g, '\\u003c');
    const favorites = JSON.stringify([...this.favoriteUrls]).replace(/</g, '\\u003c');
    const csp = `default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; worker-src blob:; media-src https: http: blob: data:; connect-src https: http: ws: wss:;`;
    const hlsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', 'hls.js', 'dist', 'hls.min.js'));
    const iconSet = {
      radio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9.5h14v10H5z"/><path d="M8 9.5 12 4l4 5.5M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 16.5h8M3 6.5a12 12 0 0 1 0-3M21 6.5a12 12 0 0 0 0-3"/></svg>',
      play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>',
      stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10H7z"/></svg>',
      previous: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7M18 5l-7 7 7 7"/></svg>',
      next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7M6 5l7 7-7 7"/></svg>',
      locate: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
      favoriteEmpty: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.9c0 5.5-8.8 10.4-8.8 10.4S3.2 14.4 3.2 8.9A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.8 2.5Z"/></svg>',
      favoriteFilled: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.9c0 5.5-8.8 10.4-8.8 10.4S3.2 14.4 3.2 8.9A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.8 2.5Z"/></svg>'
    };
    return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><main>
      <header><span class="logo">${iconSet.radio}</span><div><h1>Radio</h1><p>Live audio, right beside your code.</p></div></header>
      <section class="now"><div class="live-dot"></div><span id="nowLabel">Ready</span><strong id="nowName">Select a station</strong><small id="nowDescription">Internet radio</small></section>
      <div class="controls"><button id="prev" aria-label="Previous station" title="Previous station">${iconSet.previous}</button><button id="play" class="play" aria-label="Play / Stop" title="Play / Stop">${iconSet.play}</button><button id="next" aria-label="Next station" title="Next station">${iconSet.next}</button></div>
      <label class="volume">Volume <input id="volume" type="range" min="0" max="1" step="0.01" value="0.8"><span id="volumeValue">80%</span></label>
      <div class="station-heading"><h2>Stations</h2><div class="filters"><button id="locate" class="locate" aria-label="Locate current channel" title="Locate current channel">${iconSet.locate}</button><button id="allFilter" class="filter active">All</button><button id="favoriteFilter" class="filter">Favorites <span id="favoriteCount">0</span></button></div></div><div id="channels"></div><button id="settings" class="settings">⚙ Manage stations in Settings</button>
      <p id="hint" class="hint">Direct MP3 streams offer the best compatibility. HLS/M3U8 support depends on the station and codec.</p><audio id="audio" preload="auto"></audio>
    </main><script nonce="${nonce}" src="${hlsUri}"></script><script nonce="${nonce}">
      const vscode = acquireVsCodeApi(); const channels = ${channels}; const favoriteUrls = new Set(${favorites}); const icons = ${JSON.stringify(iconSet)}; let index = ${this.selected}; let hls; let hlsReady = false; let pendingPlay = false; let muted = false; let favoriteOnly = ${this.playlist === 'favorites'}; const scrollPositions = { all: 0, favorites: 0 };
      const audio = document.getElementById('audio'), list = document.getElementById('channels'), play = document.getElementById('play'), locate = document.getElementById('locate');
      const state = { playing: false };
      function render(preserve=true){const playlistKey=favoriteOnly?'favorites':'all';if(preserve)scrollPositions[playlistKey]=list.scrollTop;const restoreScroll=scrollPositions[playlistKey]||0; vscode.postMessage({type:'playlist',favoriteOnly}); const c=channels[index]; document.getElementById('nowName').textContent=c?.name||'Select a station'; document.getElementById('nowDescription').textContent=c?.description||'Internet radio'; document.getElementById('nowLabel').textContent=state.playing?'ON AIR':'READY'; const visible=channels.map((x,i)=>({x,i})).filter(item=>!favoriteOnly||favoriteUrls.has(item.x.url)); list.innerHTML=visible.length?visible.map(({x,i})=>'<div class="channel-row '+(i===index?'selected':'')+'"><button class="channel" data-index="'+i+'"><span class="channel-icon">'+(i===index&&state.playing?'●':'○')+'</span><span class="channel-text"><b>'+escapeHtml(x.name)+'</b><small>'+escapeHtml(x.description||'Live station')+'</small></span></button><button class="favorite '+(favoriteUrls.has(x.url)?'active':'')+'" data-index="'+i+'" aria-label="'+(favoriteUrls.has(x.url)?'Remove from favorites':'Add to favorites')+'" title="'+(favoriteUrls.has(x.url)?'Remove from favorites':'Add to favorites')+'">'+(favoriteUrls.has(x.url)?icons.favoriteFilled:icons.favoriteEmpty)+'</button></div>').join(''):'<p class="empty">No stations yet.</p>'; list.scrollTop=restoreScroll; locate.disabled=!list.querySelector('.channel-row.selected'); document.getElementById('favoriteCount').textContent=String([...favoriteUrls].filter(url=>channels.some(x=>x.url===url)).length); document.getElementById('allFilter').classList.toggle('active',!favoriteOnly); document.getElementById('favoriteFilter').classList.toggle('active',favoriteOnly); play.innerHTML=state.playing?icons.stop:icons.play; vscode.postMessage({type:'state',playing:state.playing}); }
      function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
      function toggleFavorite(i){if(!channels[i])return;const next=!favoriteUrls.has(channels[i].url);if(next)favoriteUrls.add(channels[i].url);else favoriteUrls.delete(channels[i].url);vscode.postMessage({type:'favorite',index:i,favorite:next});render();}
      function navigate(direction){const candidates=channels.map((x,i)=>({x,i})).filter(item=>!favoriteOnly||favoriteUrls.has(item.x.url));if(!candidates.length)return;const position=candidates.findIndex(item=>item.i===index);const next=candidates[(position<0?(direction>0?0:candidates.length-1):position+direction+candidates.length)%candidates.length];choose(next.i,true);}
      function locateCurrent(){const selected=list.querySelector('.channel-row.selected');if(selected)selected.scrollIntoView({block:'center',behavior:'smooth'});}
      function switchPlaylist(next){scrollPositions[favoriteOnly?'favorites':'all']=list.scrollTop;favoriteOnly=next;render(false);}
      function choose(i,auto){ if(!channels[i])return; index=i; state.playing=false; pendingPlay=auto; hlsReady=false; if(hls){hls.destroy();hls=undefined;} audio.pause(); audio.removeAttribute('src'); audio.load(); const url=channels[i].url; if(/\\.m3u8(?:$|[?#])/i.test(url) && window.Hls && Hls.isSupported()){hls=new Hls({enableWorker:false});hls.on(Hls.Events.MANIFEST_PARSED,()=>{hlsReady=true;if(pendingPlay)start();});hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal){const response=data.response||{};const detail=[data.type||'unknown',data.details||'unknown',response.code?('HTTP '+response.code):'',data.url||url].filter(Boolean).join(' · ');console.error('Radio HLS error:',data);pendingPlay=false;state.playing=false;render();vscode.postMessage({type:'error',error:'HLS failed: '+detail});}});hls.loadSource(url);hls.attachMedia(audio);}else{audio.src=url;audio.load();hlsReady=true;if(auto)start();} render(); vscode.postMessage({type:'select',index,playing:auto}); }
      function playWhenReady(){if(!pendingPlay)return; if(audio.readyState<3){document.getElementById('nowLabel').textContent='BUFFERING';return;} pendingPlay=false; audio.play().then(()=>{state.playing=true;render();}).catch(e=>{state.playing=false;render();console.error('Radio play() failed:',e.name,e.message,e);vscode.postMessage({type:'error',error:'Playback rejected: '+(e.name||'UnknownError')+' — '+(e.message||'the browser rejected the stream')});});}
      function start(){ if(!channels[index])return; pendingPlay=true; if(/\\.m3u8(?:$|[?#])/i.test(channels[index].url) && !hlsReady){document.getElementById('nowLabel').textContent='LOADING';return;} playWhenReady(); }
      function stopPlayback(){pendingPlay=false;state.playing=false;if(hls){hls.destroy();hls=undefined;}audio.pause();audio.removeAttribute('src');audio.load();hlsReady=false;render();}
      function toggle(){if(state.playing){stopPlayback();}else if(!audio.src&&!hls){choose(index,true);}else{start();}} audio.onplay=()=>{state.playing=true;render()}; audio.onpause=()=>{state.playing=false;render()}; audio.onerror=()=>{state.playing=false;render();vscode.postMessage({type:'error',error:'The stream ended or is unavailable.'})};
      function updateVolume(){document.getElementById('volume').value=audio.volume;document.getElementById('volumeValue').textContent=muted?'Muted':Math.round(audio.volume*100)+'%';}
      document.getElementById('play').onclick=toggle; document.getElementById('locate').onclick=locateCurrent; document.getElementById('prev').onclick=()=>navigate(-1); document.getElementById('next').onclick=()=>navigate(1); document.getElementById('volume').oninput=e=>{audio.volume=Number(e.target.value);muted=false;audio.muted=false;updateVolume()}; document.getElementById('allFilter').onclick=()=>switchPlaylist(false); document.getElementById('favoriteFilter').onclick=()=>switchPlaylist(true); list.onclick=e=>{const fav=e.target.closest('.favorite');if(fav){toggleFavorite(Number(fav.dataset.index));return}const b=e.target.closest('.channel');if(b)choose(Number(b.dataset.index),true)}; document.getElementById('settings').onclick=()=>vscode.postMessage({type:'openSettings'}); window.addEventListener('message',e=>{if(e.data.type==='toggle')toggle();if(e.data.type==='navigate')navigate(e.data.direction);if(e.data.type==='toggleFavorite')toggleFavorite(index);if(e.data.type==='togglePlaylist')switchPlaylist(!favoriteOnly);if(e.data.type==='select')choose(e.data.index,e.data.autoplay);if(e.data.type==='volume'){audio.volume=Math.max(0,Math.min(1,audio.volume+e.data.delta));muted=false;audio.muted=false;updateVolume()};if(e.data.type==='mute'){muted=!muted;audio.muted=muted;updateVolume()}}); audio.addEventListener('canplay',playWhenReady); audio.addEventListener('loadeddata',playWhenReady); audio.volume=.8; updateVolume(); render(); if(channels[index])choose(index,false);
    </script></body></html>`;
  }
}

