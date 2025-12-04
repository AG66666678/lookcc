# API Usage Tracker

VSCode 扩展，用于在状态栏显示中转站 API 的用量和余额。

## 功能

- 状态栏实时显示 API 余额
- 悬停查看详细信息（今日/本月/总消耗）
- 点击显示详情菜单
- 支持 NewAPI、OneAPI 等中转站

## 安装

1. 下载 `.vsix` 文件
2. VSCode 中按 `Ctrl+Shift+P`
3. 输入 `Install from VSIX`
4. 选择下载的 `.vsix` 文件

## 配置

打开 VSCode 设置（`Ctrl+,`），搜索 `apiUsageTracker`：

| 设置项 | 说明 | 示例 |
|--------|------|------|
| `apiUsageTracker.apiKey` | API Key | `sk-xxxx` |
| `apiUsageTracker.endpoint` | API 地址 | `https://api.example.com` |
| `apiUsageTracker.refreshInterval` | 刷新间隔（秒） | `300` |
| `apiUsageTracker.initialBalance` | 手动设置初始余额（可选） | `100` |

## 支持的 API

- NewAPI 格式（`/v1/dashboard/billing/subscription`）
- OneAPI 格式（`/api/user/self`）
- OpenRouter

## 使用

配置完成后，状态栏右下角会显示余额信息：

- 鼠标悬停查看详细用量
- 点击打开详情菜单
- 命令面板输入 `API Usage` 可手动刷新

## 本地开发

```bash
npm install
npm run compile
# 按 F5 启动调试
```

## License

MIT
