import { BaseProvider } from './base';
import { UsageData, ProviderConfig } from '../types';

/**
 * OneAPI / New API Provider
 * 这两个项目使用相同的 API 格式
 *
 * 用量查询接口:
 * GET {baseUrl}/api/user/self
 *
 * 返回用户信息包含 quota（剩余额度）和 used_quota（已用额度）
 * 额度单位通常是 1 = $0.000001 (即除以 1000000 得到美元)
 */
export class OneAPIProvider extends BaseProvider {
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    super('oneapi' as any, config);
    // endpoint 是 OneAPI/NewAPI 的地址，例如 https://api.example.com
    this.baseUrl = (config.endpoint || '').replace(/\/$/, '');
  }

  protected getDefaultHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  isConfigured(): boolean {
    return !!this.config.apiKey && this.config.apiKey.length > 0 && !!this.baseUrl;
  }

  async fetchUsage(): Promise<UsageData> {
    if (!this.isConfigured()) {
      return this.createEmptyUsageData('API key or endpoint not configured');
    }

    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // OneAPI/NewAPI: 获取用户信息
      const response = await this.client.get(
        `${this.baseUrl}/api/user/self`,
        { headers: this.getDefaultHeaders() }
      );

      const data = response.data?.data;

      if (!data) {
        return this.createEmptyUsageData('Invalid response from OneAPI');
      }

      // OneAPI 返回格式:
      // { success: true, data: { id, username, quota, used_quota, ... } }
      // quota 和 used_quota 单位是 1 = $0.000001
      const quota = (data.quota || 0) / 1000000;
      const usedQuota = (data.used_quota || 0) / 1000000;
      const totalQuota = quota + usedQuota;

      return {
        provider: 'oneapi' as any,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalCost: usedQuota,
        currency: 'USD',
        requestCount: data.request_count || 0,
        quota: {
          total: totalQuota,
          used: usedQuota,
          remaining: quota,
          unit: 'dollars'
        },
        period: {
          start: startOfMonth,
          end: now,
          type: 'all_time'
        },
        lastUpdated: now
      };
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch usage';
      return this.createEmptyUsageData(errorMessage);
    }
  }
}

/**
 * New API Provider - 与 OneAPI 格式相同
 */
export class NewAPIProvider extends OneAPIProvider {
  constructor(config: ProviderConfig) {
    super(config);
    (this as any).providerId = 'newapi';
  }
}
