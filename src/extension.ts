import * as vscode from 'vscode';
import { UniversalProvider, UsageResult } from './providers/universal';

let statusBarItem: vscode.StatusBarItem;
let refreshInterval: NodeJS.Timeout | undefined;
let lastUsage: UsageResult | null = null;

export function activate(context: vscode.ExtensionContext) {
  console.log('API Usage Tracker is now active');

  // 创建状态栏项
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'apiUsageTracker.showDetails';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand('apiUsageTracker.refresh', refreshUsage),
    vscode.commands.registerCommand('apiUsageTracker.showDetails', showDetails),
    vscode.commands.registerCommand('apiUsageTracker.configure', openSettings)
  );

  // 监听配置变化
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('apiUsageTracker')) {
        setupAutoRefresh();
        refreshUsage();
      }
    })
  );

  // 初始化
  setupAutoRefresh();
  refreshUsage();
}

export function deactivate() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
}

function getConfig() {
  return vscode.workspace.getConfiguration('apiUsageTracker');
}

function setupAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  const config = getConfig();
  const interval = config.get<number>('refreshInterval', 300);

  if (interval > 0) {
    refreshInterval = setInterval(refreshUsage, interval * 1000);
  }
}

async function refreshUsage() {
  const config = getConfig();
  const apiKey = config.get<string>('apiKey', '');
  const endpoint = config.get<string>('endpoint', '');

  if (!apiKey || !endpoint) {
    statusBarItem.text = '$(key) Configure API';
    statusBarItem.tooltip = 'Click to configure API Key and Endpoint';
    return;
  }

  statusBarItem.text = '$(sync~spin) Loading...';

  try {
    const provider = new UniversalProvider(apiKey, endpoint);
    const result = await provider.fetchUsage();
    lastUsage = result;
    updateStatusBar(result);
  } catch (error) {
    console.error('Failed to refresh usage:', error);
    statusBarItem.text = '$(error) Error';
    statusBarItem.tooltip = 'Failed to fetch usage data';
  }
}

function updateStatusBar(usage: UsageResult) {
  const config = getConfig();
  const initialBalance = config.get<number>('initialBalance', 0);

  if (usage.error) {
    statusBarItem.text = `$(warning) ${usage.error}`;
    statusBarItem.tooltip = usage.error;
    return;
  }

  // 优先使用 API 返回的余额，否则使用手动配置的初始余额
  const hasApiBalance = usage.total > 0;
  const remaining = hasApiBalance ? usage.remaining : (initialBalance > 0 ? initialBalance - usage.totalUsed : 0);
  const total = hasApiBalance ? usage.total : initialBalance;

  // 状态栏显示剩余余额（如果有）或今日消耗
  if (hasApiBalance || initialBalance > 0) {
    statusBarItem.text = `$(credit-card) 余额: $${remaining.toFixed(2)}`;
  } else {
    statusBarItem.text = `$(credit-card) 今日: $${usage.todayUsed.toFixed(2)}`;
  }

  // 使用 MarkdownString 创建富文本 tooltip
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.supportHtml = true;

  md.appendMarkdown(`### 📊 API 用量统计\n\n`);

  // 剩余余额（如果有 API 余额或设置了初始余额）
  if (hasApiBalance || initialBalance > 0) {
    const usagePercent = total > 0 ? ((usage.totalUsed / total) * 100).toFixed(1) : '0';
    md.appendMarkdown(`💰 **剩余余额**: $${remaining.toFixed(2)}\n\n`);
    md.appendMarkdown(`📊 **已使用**: ${usagePercent}% (总额度 $${total.toFixed(2)})\n\n`);
    md.appendMarkdown(`---\n\n`);
  }

  // 每日费用
  md.appendMarkdown(`🔵 **每日费用**: $${usage.todayUsed.toFixed(4)}\n\n`);

  // 本月费用
  md.appendMarkdown(`🟣 **本月费用**: $${usage.monthUsed.toFixed(4)}\n\n`);

  // 总费用
  md.appendMarkdown(`🟢 **总费用**: $${usage.totalUsed.toFixed(4)}\n\n`);

  md.appendMarkdown(`---\n\n`);
  md.appendMarkdown(`*点击查看详情*`);

  statusBarItem.tooltip = md;
}

async function showDetails() {
  const config = getConfig();
  const initialBalance = config.get<number>('initialBalance', 0);

  if (!lastUsage || lastUsage.error) {
    const action = await vscode.window.showInformationMessage(
      'No API usage data available. Would you like to configure?',
      'Configure',
      'Cancel'
    );
    if (action === 'Configure') {
      openSettings();
    }
    return;
  }

  // 优先使用 API 返回的余额
  const hasApiBalance = lastUsage.total > 0;
  const remaining = hasApiBalance ? lastUsage.remaining : (initialBalance > 0 ? initialBalance - lastUsage.totalUsed : 0);
  const total = hasApiBalance ? lastUsage.total : initialBalance;

  // 使用 QuickPick 显示详情
  const items: vscode.QuickPickItem[] = [];

  // 如果有余额信息，显示余额
  if (hasApiBalance || initialBalance > 0) {
    const usagePercent = total > 0 ? ((lastUsage.totalUsed / total) * 100).toFixed(1) : '0';
    items.push(
      {
        label: '$(credit-card) 剩余余额',
        description: `$${remaining.toFixed(2)}`,
        detail: `总额度 $${total.toFixed(2)}，已使用 ${usagePercent}%`
      },
      { label: '', kind: vscode.QuickPickItemKind.Separator }
    );
  }

  items.push(
    {
      label: '$(calendar) 每日费用',
      description: `$${lastUsage.todayUsed.toFixed(4)}`,
      detail: '今日 API 调用费用'
    },
    {
      label: '$(calendar) 本月费用',
      description: `$${lastUsage.monthUsed.toFixed(4)}`,
      detail: '本月累计 API 调用费用'
    },
    {
      label: '$(graph) 总费用',
      description: `$${lastUsage.totalUsed.toFixed(4)}`,
      detail: '历史累计 API 调用费用'
    },
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    {
      label: '$(refresh) 刷新数据',
      description: '',
      detail: '重新获取最新用量数据'
    },
    {
      label: '$(gear) 打开设置',
      description: '',
      detail: '配置 API Key 和 Endpoint'
    }
  );

  const selected = await vscode.window.showQuickPick(items, {
    title: `API 用量详情 (${lastUsage.type})`,
    placeHolder: '选择操作'
  });

  if (selected) {
    if (selected.label.includes('刷新')) {
      refreshUsage();
    } else if (selected.label.includes('设置')) {
      openSettings();
    }
  }
}

function openSettings() {
  vscode.commands.executeCommand(
    'workbench.action.openSettings',
    'apiUsageTracker'
  );
}
