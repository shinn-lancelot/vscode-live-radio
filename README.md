# vscode-live-radio

在 VS Code 中工作时收听中国电台直播。扩展运行在 Webview 中，即使你在资源管理器、搜索、源代码管理和其他 VS Code 视图之间切换，播放也会持续进行。

## 功能

- 活动栏中的电台播放器。
- 可通过播放器和状态栏操作播放控制。
- 内置中国电台频道，为获得更好的兼容性，优先使用 MP3 流。
- 支持全部频道和收藏频道播放列表。
- 收藏内容保存在 VS Code 全局存储中。
- 上一个/下一个频道导航会遵循当前播放列表。
- 支持音量、静音、播放/停止、播放列表切换和频道定位控制。
- 通过 `radio.channels` 添加用户自定义频道。

## 播放说明

扩展会直接在 VS Code 的 Webview 中播放直播流。推荐使用直接的 MP3 直播流，因为它通常具有最好的兼容性。扩展仍保留对 HLS/M3U8 的支持，但能否播放取决于直播流的 CORS 策略、HTTPS 可用性、格式，以及 VS Code 内置的 Electron/Chromium 版本。

由于直播流不是录音文件，点击播放/停止时会从当前直播位置开始。停止后再次播放不会从之前的音频位置继续。

## 安装和使用

1. 安装已打包的扩展；开发时可以从 Extension Development Host 中运行。
2. 从活动栏打开 **Radio** 视图。
3. 选择一个频道并点击播放。
4. 在其他 VS Code 视图中工作时，可以使用状态栏控件继续收听。

## 键盘快捷键

| 操作 | 快捷键 |
| --- | --- |
| 播放 / 停止 | `Ctrl+Shift+Space` |
| 上一个频道 | `Ctrl+Shift+,` |
| 下一个频道 | `Ctrl+Shift+.` |
| 添加 / 移除收藏 | `Ctrl+Shift+F` |
| 切换全部 / 收藏 | `Ctrl+Shift+;` |
| 增大音量 | `Ctrl+Shift+Up` |
| 减小音量 | `Ctrl+Shift+Down` |
| 静音 / 取消静音 | `Ctrl+Shift+M` |

可以在 **File > Preferences > Keyboard Shortcuts** 中搜索 `Radio:` 来修改快捷键。

## 添加自定义频道

打开设置，搜索 **Radio: Channels**，然后添加一个频道对象数组：

```json
[
  {
    "name": "My Radio",
    "url": "https://example.com/live.mp3",
    "description": "Optional description"
  },
  {
    "name": "Another MP3 Station",
    "url": "https://example.com/another-live.mp3",
    "description": "MP3 live stream"
  }
]
```

`name` 和 `url` 为必填项，`description` 为可选项。为尽可能确保能够播放，请使用直接的 HTTPS MP3 流 URL。自定义频道会追加到内置频道列表中，不会替换内置频道。扩展不会验证或代理直播流，因此该 URL 必须能够被 Webview 直接播放。

## 数据和隐私

扩展不需要账号，也不会收集遥测数据。播放频道时，VS Code 会直接连接到配置的直播流主机。收藏内容和播放偏好会通过 VS Code 保存在本地。

内置频道 URL 是第三方公开的直播流地址。直播流的可用性、内容以及再分发或播放权限由相应的服务提供商负责。扩展不会下载、缓存、转码或重新托管音频。

## 开发

```bash
pnpm install
pnpm run compile
```

在 VS Code 中打开项目根目录，按 `F5` 启动 Extension Development Host。运行前请在“运行和调试”面板中选择 `Run Extension`；该配置会先执行 `pnpm run compile`，再启动扩展开发主机。

本地内置频道列表可放在 [`src/data/channels.json`](src/data/channels.json)。该文件是可选的，并且不会提交到 Git：如果文件存在，编译时会复制到 `dist/data/channels.json`；如果文件不存在，扩展仍可以启动，但不会显示内置频道。你仍然可以通过 `radio.channels` 添加自定义频道。

## 限制

- 某些电台可能会停止服务、要求特定客户端，或阻止来自 Webview 的请求。
- HLS/M3U8 流可能因 CORS 或 MediaSource 兼容性问题而无法播放。
- 由于浏览器自动播放限制，从状态栏首次启动播放时，可能需要先打开 Radio 视图并点击一次播放。
