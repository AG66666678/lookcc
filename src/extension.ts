import * as vscode from 'vscode';
import * as fs from 'fs';
import { UniversalProvider, UsageResult } from './providers/universal';
import {
  isCCSwitchInstalled,
  readCCSwitchProviders,
  getCurrentProvider,
  watchCCSwitchConfig,
  switchProvider as ccSwitchProvider,
  CCSwitchProvider
} from './ccswitch';

let statusBarItem: vscode.StatusBarItem;
let refreshInterval: NodeJS.Timeout | undefined;
let lastUsage: UsageResult | null = null;
let ccSwitchWatcher: fs.FSWatcher | null = null;
let currentProviderName: string = '';

export function activate(context: vscode.ExtensionContext) {
  console.log('API Usage Tracker is now active');

  // 创建状态栏项 - 点击打开菜单
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
    vscode.commands.registerCommand('apiUsageTracker.configure', openSettings),
    vscode.commands.registerCommand('apiUsageTracker.switchProvider', switchProvider)
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

  // 监听 CC Switch 配置变化
  if (isCCSwitchInstalled()) {
    ccSwitchWatcher = watchCCSwitchConfig(() => {
      console.log('CC Switch config changed, refreshing...');
      refreshUsage();
    });
  }

  // 初始化
  setupAutoRefresh();
  refreshUsage();
}

export function deactivate() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  if (ccSwitchWatcher) {
    ccSwitchWatcher.close();
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

/**
 * 获取 API 配置，优先使用 CC Switch
 */
function getApiConfig(): { apiKey: string; endpoint: string; providerName: string } {
  // 优先检查 CC Switch
  if (isCCSwitchInstalled()) {
    const provider = getCurrentProvider();
    if (provider && provider.apiKey && provider.endpoint) {
      return {
        apiKey: provider.apiKey,
        endpoint: provider.endpoint,
        providerName: provider.name
      };
    }
  }

  // 回退到 VSCode 配置
  const config = getConfig();
  return {
    apiKey: config.get<string>('apiKey', ''),
    endpoint: config.get<string>('endpoint', ''),
    providerName: ''
  };
}

async function refreshUsage() {
  const { apiKey, endpoint, providerName } = getApiConfig();
  currentProviderName = providerName;

  if (!apiKey || !endpoint) {
    if (isCCSwitchInstalled()) {
      statusBarItem.text = '$(plug) 选择 Provider';
      statusBarItem.tooltip = '点击选择 CC Switch Provider';
    } else {
      statusBarItem.text = '$(key) Configure API';
      statusBarItem.tooltip = 'Click to configure API Key and Endpoint';
    }
    return;
  }

  const prefix = providerName ? `[${providerName}] ` : '';
  statusBarItem.text = `$(sync~spin) ${prefix}Loading...`;

  try {
    const provider = new UniversalProvider(apiKey, endpoint);
    const result = await provider.fetchUsage();
    lastUsage = result;
    updateStatusBar(result);
  } catch (error) {
    console.error('Failed to refresh usage:', error);
    statusBarItem.text = `$(error) ${prefix}Error`;
    statusBarItem.tooltip = 'Failed to fetch usage data';
  }
}

function updateStatusBar(usage: UsageResult) {
  const config = getConfig();
  const initialBalance = config.get<number>('initialBalance', 0);
  const prefix = currentProviderName ? `[${currentProviderName}] ` : '';

  if (usage.error) {
    statusBarItem.text = `$(warning) ${prefix}${usage.error}`;
    statusBarItem.tooltip = usage.error;
    return;
  }

  // 优先使用 API 返回的余额，否则使用手动配置的初始余额
  const hasApiBalance = usage.total > 0;
  const remaining = hasApiBalance ? usage.remaining : (initialBalance > 0 ? initialBalance - usage.totalUsed : 0);
  const total = hasApiBalance ? usage.total : initialBalance;

  // 状态栏显示剩余余额（如果有）或今日消耗
  if (hasApiBalance || initialBalance > 0) {
    statusBarItem.text = `$(credit-card) ${prefix}$${remaining.toFixed(2)}`;
  } else {
    statusBarItem.text = `$(credit-card) ${prefix}今日: $${usage.todayUsed.toFixed(2)}`;
  }

  // 使用 MarkdownString 创建富文本 tooltip
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.supportHtml = true;

  if (currentProviderName) {
    md.appendMarkdown(`### 🔌 ${currentProviderName}\n\n`);
  }
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
  md.appendMarkdown(`*点击查看详情或切换 Provider*`);

  statusBarItem.tooltip = md;
}

async function showDetails() {
  const config = getConfig();
  const initialBalance = config.get<number>('initialBalance', 0);
  const hasCCSwitch = isCCSwitchInstalled();
  console.log('CC Switch installed:', hasCCSwitch);

  let providers: CCSwitchProvider[] = [];
  if (hasCCSwitch) {
    try {
      providers = readCCSwitchProviders();
      console.log('Providers loaded:', providers.length, providers.map(p => p.name));
    } catch (err) {
      console.error('Failed to load providers:', err);
    }
  }

  // 使用 QuickPick 显示详情
  const items: vscode.QuickPickItem[] = [];

  // 如果有 CC Switch，显示 Provider 列表
  if (hasCCSwitch && providers.length > 0) {
    items.push(
      { label: 'CC Switch Providers', kind: vscode.QuickPickItemKind.Separator }
    );

    for (const p of providers) {
      items.push({
        label: `${p.isCurrent ? '$(check) ' : '$(circle-outline) '}${p.name}`,
        description: p.isCurrent ? '当前' : '',
        detail: p.endpoint
      });
    }

    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
  }

  // 显示用量信息
  if (lastUsage && !lastUsage.error) {
    const hasApiBalance = lastUsage.total > 0;
    const remaining = hasApiBalance ? lastUsage.remaining : (initialBalance > 0 ? initialBalance - lastUsage.totalUsed : 0);
    const total = hasApiBalance ? lastUsage.total : initialBalance;

    items.push(
      { label: '用量信息', kind: vscode.QuickPickItemKind.Separator }
    );

    if (hasApiBalance || initialBalance > 0) {
      const usagePercent = total > 0 ? ((lastUsage.totalUsed / total) * 100).toFixed(1) : '0';
      items.push({
        label: '$(credit-card) 剩余余额',
        description: `$${remaining.toFixed(2)}`,
        detail: `总额度 $${total.toFixed(2)}，已使用 ${usagePercent}%`
      });
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
      }
    );
  } else {
    items.push({
      label: '$(info) 无用量数据',
      description: '',
      detail: '请先配置 API 或选择 CC Switch Provider'
    });
  }

  // 操作按钮
  items.push(
    { label: '', kind: vscode.QuickPickItemKind.Separator }
  );

  // 如果有 CC Switch，添加切换 Provider 选项
  if (hasCCSwitch && providers.length > 0) {
    items.push({
      label: '$(arrow-swap) 切换 Provider',
      description: currentProviderName || '',
      detail: '切换 CC Switch API Provider'
    });
  }

  items.push(
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
    title: currentProviderName ? `API 用量 - ${currentProviderName}` : 'API 用量详情',
    placeHolder: '选择操作'
  });

  if (selected) {
    if (selected.label.includes('切换 Provider')) {
      await showProviderPicker(providers);
    } else if (selected.label.includes('刷新')) {
      refreshUsage();
    } else if (selected.label.includes('设置')) {
      openSettings();
    }
  }
}

async function showProviderPicker(providers: CCSwitchProvider[]) {
  const items = providers.map(p => ({
    label: `${p.isCurrent ? '$(check) ' : '$(circle-outline) '}${p.name}`,
    description: p.isCurrent ? '当前' : '',
    detail: p.endpoint,
    provider: p
  }));

  const selected = await vscode.window.showQuickPick(items, {
    title: '切换 CC Switch Provider',
    placeHolder: '选择要切换的 Provider'
  });

  if (selected && !selected.provider.isCurrent) {
    await switchToProvider(selected.provider);
  }
}

async function switchProvider() {
  if (!isCCSwitchInstalled()) {
    vscode.window.showWarningMessage('CC Switch 未安装，请先安装 CC Switch');
    return;
  }

  const providers = readCCSwitchProviders();
  if (providers.length === 0) {
    vscode.window.showWarningMessage('CC Switch 中没有配置 Provider');
    return;
  }

  const items = providers.map(p => ({
    label: `${p.isCurrent ? '$(check) ' : ''}${p.name}`,
    description: p.isCurrent ? '当前' : '',
    detail: p.endpoint,
    provider: p
  }));

  const selected = await vscode.window.showQuickPick(items, {
    title: '切换 CC Switch Provider',
    placeHolder: '选择要切换的 Provider'
  });

  if (selected && !selected.provider.isCurrent) {
    await switchToProvider(selected.provider);
  }
}

async function switchToProvider(provider: CCSwitchProvider) {
  // 直接切换 Provider
  const success = ccSwitchProvider(provider.id);

  if (success) {
    vscode.window.showInformationMessage(`已切换到 "${provider.name}"`);
    // 刷新余额显示
    await refreshUsage();
  } else {
    vscode.window.showErrorMessage(`切换到 "${provider.name}" 失败`);
  }
}

function openSettings() {
  vscode.commands.executeCommand(
    'workbench.action.openSettings',
    'apiUsageTracker'
  );
}
