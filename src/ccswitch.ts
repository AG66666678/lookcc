import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// CC Switch provider 接口
export interface CCSwitchProvider {
    id: string;
    name: string;
    appType: string;
    endpoint: string;
    apiKey: string;
    model: string;
    isCurrent: boolean;
    usageScript?: {
        enabled: boolean;
        code: string;
        apiKey?: string;
        baseUrl?: string;
        accessToken?: string;
    };
}

export interface CCSwitchSettings {
    currentProviderClaude?: string;
    currentProviderCodex?: string;
    currentProviderGemini?: string;
}

/**
 * 获取 CC Switch 配置目录路径
 */
export function getCCSwitchConfigPath(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.cc-switch');
}

/**
 * 获取 CC Switch 数据库路径
 */
export function getCCSwitchDbPath(): string {
    return path.join(getCCSwitchConfigPath(), 'cc-switch.db');
}

/**
 * 获取 CC Switch settings.json 路径
 */
export function getCCSwitchSettingsPath(): string {
    return path.join(getCCSwitchConfigPath(), 'settings.json');
}

/**
 * 检查 CC Switch 是否已安装
 */
export function isCCSwitchInstalled(): boolean {
    const dbPath = getCCSwitchDbPath();
    return fs.existsSync(dbPath);
}

/**
 * 读取 CC Switch settings.json
 */
export function readCCSwitchSettings(): CCSwitchSettings | null {
    const settingsPath = getCCSwitchSettingsPath();

    if (!fs.existsSync(settingsPath)) {
        return null;
    }

    try {
        const content = fs.readFileSync(settingsPath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error('Failed to read CC Switch settings:', error);
        return null;
    }
}

/**
 * 从 CC Switch 数据库读取所有 providers
 * 使用 sqlite3 命令行工具避免 native 模块问题
 */
export function readCCSwitchProviders(): CCSwitchProvider[] {
    const dbPath = getCCSwitchDbPath();
    // Windows 兼容：将反斜杠转换为正斜杠
    const dbPathNormalized = dbPath.replace(/\\/g, '/');

    if (!fs.existsSync(dbPath)) {
        console.log('CC Switch database not found:', dbPath);
        return [];
    }

    try {
        const { execSync } = require('child_process');
        const settings = readCCSwitchSettings();
        const currentProviderId = settings?.currentProviderClaude;
        console.log('Current provider ID from settings:', currentProviderId);

        // 使用 sqlite3 命令行读取数据
        const query = "SELECT id, app_type, name, settings_config, is_current, meta FROM providers WHERE app_type = 'claude' ORDER BY sort_index ASC";
        const cmd = `sqlite3 -json "${dbPathNormalized}" "${query}"`;
        console.log('Executing:', cmd);
        const result = execSync(cmd, {
            encoding: 'utf-8',
            timeout: 5000
        });

        const rows = JSON.parse(result || '[]');
        console.log('Loaded providers:', rows.length);

        return rows.map((row: any) => {
            const settingsConfig = JSON.parse(row.settings_config || '{}');
            const meta = JSON.parse(row.meta || '{}');
            const env = settingsConfig.env || {};

            return {
                id: row.id,
                name: row.name,
                appType: row.app_type,
                endpoint: env.ANTHROPIC_BASE_URL || '',
                apiKey: env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || '',
                model: settingsConfig.model || env.ANTHROPIC_MODEL || 'sonnet',
                // 只使用 settings.json 中的 currentProviderClaude 判断，忽略数据库中的 is_current
                isCurrent: row.id === currentProviderId,
                usageScript: meta.usage_script
            };
        });
    } catch (error) {
        console.error('Failed to read CC Switch database:', error);
        return [];
    }
}

/**
 * 获取当前选中的 provider
 */
export function getCurrentProvider(): CCSwitchProvider | null {
    const providers = readCCSwitchProviders();
    return providers.find(p => p.isCurrent) || providers[0] || null;
}

/**
 * 监听 CC Switch 配置变化
 */
export function watchCCSwitchConfig(callback: () => void): fs.FSWatcher | null {
    const settingsPath = getCCSwitchSettingsPath();

    if (!fs.existsSync(settingsPath)) {
        return null;
    }

    try {
        // 监听 settings.json 变化
        const watcher = fs.watch(getCCSwitchConfigPath(), (eventType, filename) => {
            if (filename === 'settings.json' || filename === 'cc-switch.db') {
                // 延迟执行，避免文件写入过程中读取
                setTimeout(callback, 500);
            }
        });

        return watcher;
    } catch (error) {
        console.error('Failed to watch CC Switch config:', error);
        return null;
    }
}

/**
 * 切换当前 Provider
 * 更新 CC Switch 的 settings.json 和 Claude 的 settings.json
 */
export function switchProvider(providerId: string): boolean {
    console.log('switchProvider called with ID:', providerId);

    try {
        // 1. 更新 CC Switch settings.json
        const ccSettingsPath = getCCSwitchSettingsPath();
        console.log('CC Switch settings path:', ccSettingsPath);
        const ccSettings: CCSwitchSettings = readCCSwitchSettings() || {};
        ccSettings.currentProviderClaude = providerId;
        fs.writeFileSync(ccSettingsPath, JSON.stringify(ccSettings, null, 2));
        console.log('Updated CC Switch settings.json');

        // 2. 获取 provider 详情
        const providers = readCCSwitchProviders();
        const provider = providers.find(p => p.id === providerId);
        if (!provider) {
            console.error('Provider not found:', providerId);
            return false;
        }
        console.log('Found provider:', provider.name);

        // 3. 更新 Claude 的 settings.json
        const claudeSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');
        console.log('Claude settings path:', claudeSettingsPath);
        let claudeSettings: any = {};

        if (fs.existsSync(claudeSettingsPath)) {
            try {
                claudeSettings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf-8'));
            } catch {
                claudeSettings = {};
            }
        }

        // 从数据库获取完整的 settings_config
        const dbPath = getCCSwitchDbPath();
        const dbPathNormalized = dbPath.replace(/\\/g, '/');
        const { execSync } = require('child_process');

        const query = `SELECT settings_config FROM providers WHERE id = '${providerId}'`;
        const cmd = `sqlite3 -json "${dbPathNormalized}" "${query}"`;
        console.log('Executing:', cmd);
        const result = execSync(cmd, {
            encoding: 'utf-8',
            timeout: 5000
        });

        const rows = JSON.parse(result || '[]');
        console.log('Query result rows:', rows.length);
        if (rows.length > 0) {
            const settingsConfig = JSON.parse(rows[0].settings_config || '{}');
            console.log('Settings config:', JSON.stringify(settingsConfig));
            // 合并 env 配置
            claudeSettings.env = settingsConfig.env || {};
            if (settingsConfig.model) {
                claudeSettings.model = settingsConfig.model;
            }
        }

        fs.writeFileSync(claudeSettingsPath, JSON.stringify(claudeSettings, null, 2));
        console.log('Updated Claude settings.json');

        console.log('Switched to provider:', provider.name);
        return true;
    } catch (error) {
        console.error('Failed to switch provider:', error);
        return false;
    }
}
