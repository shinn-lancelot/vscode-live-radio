import * as vscode from 'vscode';
import { RadioProvider } from './radioProvider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new RadioProvider(context);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('radio.player', provider, {
    webviewOptions: { retainContextWhenHidden: true }
  }));
  context.subscriptions.push(vscode.commands.registerCommand('radio.togglePlayback', () => provider.togglePlayback()));
  context.subscriptions.push(vscode.commands.registerCommand('radio.nextChannel', () => provider.nextChannel()));
  context.subscriptions.push(vscode.commands.registerCommand('radio.previousChannel', () => provider.previousChannel()));
  context.subscriptions.push(vscode.commands.registerCommand('radio.toggleFavorite', () => provider.toggleFavorite()));
  context.subscriptions.push(vscode.commands.registerCommand('radio.togglePlaylist', () => provider.togglePlaylist()));
  context.subscriptions.push(vscode.commands.registerCommand('radio.volumeUp', () => provider.volumeUp()));
  context.subscriptions.push(vscode.commands.registerCommand('radio.volumeDown', () => provider.volumeDown()));
  context.subscriptions.push(vscode.commands.registerCommand('radio.toggleMute', () => provider.toggleMute()));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('radio.channels')) provider.reloadChannels();
  }));
}

export function deactivate(): void {}
