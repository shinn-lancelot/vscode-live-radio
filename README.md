# vscode-radio-stations

Listen to radio streams while you work in VS Code. The extension runs in a Webview, so playback can continue while you move between the Explorer, Search, Source Control, and other VS Code views.

## Features

- Radio player in the Activity Bar.
- Playback controls in the player and status bar.
- Support for MP3 streams and HLS/M3U8 streams when supported natively by the Webview.
- All-stations and favorites playlists.
- Favorites and playback preferences stored locally by VS Code.
- Previous and next station navigation that follows the active playlist.
- Volume, mute, play/stop, playlist switching, and station-location controls.
- Custom stations through the `radio.channels` setting.

## Playback

The extension plays streams directly in a VS Code Webview. Direct MP3 streams usually offer the best compatibility. HLS/M3U8 playback uses the Webview's native media support and depends on the stream's CORS policy, HTTPS availability, format, and the Electron/Chromium version bundled with VS Code.

Because these are live streams rather than recordings, playback starts at the current live position. Stopping and playing again does not resume a previous audio position.

## Installation and usage

1. Install the packaged extension, or run it from an Extension Development Host while developing.
2. Open the **Radio** view from the Activity Bar.
3. Select a station and click Play.
4. Use the status bar controls while working in other VS Code views.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Play / Stop | `Ctrl+Shift+Space` |
| Previous station | `Ctrl+Shift+,` |
| Next station | `Ctrl+Shift+.` |
| Add / Remove favorite | `Ctrl+Shift+F` |
| Switch All / Favorites | `Ctrl+Shift+;` |
| Increase volume | `Ctrl+Shift+Up` |
| Decrease volume | `Ctrl+Shift+Down` |
| Mute / Unmute | `Ctrl+Shift+M` |

Search for `Radio:` in **File > Preferences > Keyboard Shortcuts** to change these bindings.

## Add custom stations

Open Settings, search for **Radio: Channels**, and add an array of station objects:

```json
[
  {
    "name": "My Radio",
    "url": "https://example.com/live.mp3",
    "description": "Optional description"
  },
  {
    "name": "Another Station",
    "url": "https://example.com/another-live.mp3",
    "description": "Live stream"
  }
]
```

`name` and `url` are required; `description` is optional. HTTPS MP3 stream URLs are recommended for compatibility. Custom stations are appended to any bundled station list. The extension does not validate or proxy streams, so the URL must be playable directly by the Webview.

## Data and privacy

The extension does not require an account and does not collect telemetry. VS Code connects directly to the configured stream host during playback. Favorites and playback preferences are stored locally by VS Code.

Stream URLs are provided by their respective third-party services. Availability, content, and playback rights are the responsibility of those services. The extension does not download, cache, transcode, or re-host audio.

## Development

```bash
pnpm install
pnpm run compile
```

Open the project root in VS Code and press `F5`. Select `Run Extension` in the Run and Debug view; the configuration compiles the project before launching the Extension Development Host.

An optional local station list may be added under the source data directory. If present, it is copied into the compiled extension during compilation. If it is absent, the extension still starts and custom stations can be supplied through `radio.channels`.

### Package for Marketplace upload

Install dependencies, then create a VSIX from the project root:

```bash
pnpm install
pnpm run package
```

Upload the generated `.vsix` file from the Visual Studio Marketplace publisher management page. No GitHub Actions workflow is used.

## Limitations

- Some stations may stop service, require a specific client, or block requests from a Webview.
- HLS/M3U8 streams may fail because of CORS or native media compatibility issues.
- Browser autoplay restrictions may require opening the Radio view and clicking Play once before starting playback from the status bar.
