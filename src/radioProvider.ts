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
  private previousStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000002);
  private status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000001);
  private nextStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000000);

  constructor(private readonly context: vscode.ExtensionContext) {
    this.favoriteUrls = new Set(context.globalState.get<string[]>('radio.favoriteChannels', []));
    this.playlist = context.globalState.get<'all' | 'favorites'>('radio.lastPlaylist', 'all') === 'favorites' ? 'favorites' : 'all';
    this.lastPlayedPlaylist = this.playlist;
    const savedPositions = context.globalState.get<Partial<Record<'all' | 'favorites', number>>>('radio.lastChannels', {});
    this.lastSelected = { all: Number.isInteger(savedPositions.all) ? Math.max(savedPositions.all!, 0) : 0, favorites: Number.isInteger(savedPositions.favorites) ? Math.max(savedPositions.favorites!, 0) : 0 };
    this.reloadChannels();
    this.status.command = 'radio.togglePlayback';
    this.status.tooltip = 'Radio: Play / Stop (Ctrl+Shift+Space) · Switch playlist (Ctrl+Shift+;)';
    this.previousStatus.text = '$(arrow-left)';
    this.previousStatus.command = 'radio.previousChannel';
    this.previousStatus.tooltip = 'Radio: Previous Channel (Ctrl+Shift+,)';
    this.nextStatus.text = '$(arrow-right)';
    this.nextStatus.command = 'radio.nextChannel';
    this.nextStatus.tooltip = 'Radio: Next Channel (Ctrl+Shift+.)';
    this.updateStatus();
    context.subscriptions.push(this.previousStatus, this.status, this.nextStatus);
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
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:local.vscode-radio-stations radio.channels');
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
    const csp = `default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; worker-src blob:; media-src https: http: blob: data:; connect-src https: http: ws: wss:;`;
    const playerUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'player.js'));
    const iconSet = {
      radio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5h16v9H4z"/><path d="M7 10.5 12 4l5 6.5"/><path d="M7 14h.01M10 14h.01M13 14h.01M7 17h5"/><circle cx="17" cy="16.5" r="1.5"/><path d="M2.5 7.5a13 13 0 0 1 0-3M21.5 7.5a13 13 0 0 0 0-3"/></svg>',
      play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>',
      stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10H7z"/></svg>',
      previous: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M18 5l-7 7 7 7z"/></svg>',
      next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14M6 5l7 7-7 7z"/></svg>',
      locate: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
      favoriteEmpty: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.9c0 5.5-8.8 10.4-8.8 10.4S3.2 14.4 3.2 8.9A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.8 2.5Z"/></svg>',
      favoriteFilled: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.9c0 5.5-8.8 10.4-8.8 10.4S3.2 14.4 3.2 8.9A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.8 2.5Z"/></svg>'
    };
    const initJson = JSON.stringify({
      channels: this.channels,
      favoriteUrls: [...this.favoriteUrls],
      icons: iconSet,
      index: this.selected,
      favoriteOnly: this.playlist === 'favorites'
    }).replace(/</g, '\\u003c');
    return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><main>
      <header><span class="logo">${iconSet.radio}</span><div><h1>Radio</h1><p>Live audio, right beside your code.</p></div></header>
      <section class="now"><div class="live-dot"></div><span id="nowLabel">Ready</span><strong id="nowName">Select a station</strong><small id="nowDescription">Internet radio</small></section>
      <div class="controls"><button id="prev" aria-label="Previous station" title="Previous station">${iconSet.previous}</button><button id="play" class="play" aria-label="Play / Stop" title="Play / Stop">${iconSet.play}</button><button id="next" aria-label="Next station" title="Next station">${iconSet.next}</button></div>
      <label class="volume">Volume <input id="volume" type="range" min="0" max="1" step="0.01" value="0.8"><span id="volumeValue">80%</span></label>
      <div class="station-heading"><h2>Stations</h2><div class="filters"><button id="locate" class="locate" aria-label="Locate current channel" title="Locate current channel">${iconSet.locate}</button><button id="allFilter" class="filter active">All</button><button id="favoriteFilter" class="filter">Favorites <span id="favoriteCount">0</span></button></div></div><div id="channels"></div><button id="settings" class="settings">⚙ Manage stations in Settings</button>
      <p id="hint" class="hint">Direct MP3 streams offer the best compatibility. HLS/M3U8 support depends on the station and codec.</p><audio id="audio" preload="auto"></audio>
    </main><script nonce="${nonce}">window.__RADIO_INIT__ = ${initJson};</script><script nonce="${nonce}" src="${playerUri}"></script></body></html>`;
  }
}
