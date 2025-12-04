import { BaseProvider } from './base';
import { UsageData, ProviderConfig } from '../types';

/**
 * CC API Provider
 * 支持 OpenAI 兼容格式的中转站计费接口
 *
 * 接口:
 * GET {baseUrl}/v1/dashboard/billing/subscription - 获取额度限制
 * GET {baseUrl}/v1/dashboard/billing/usage?start_date=xxx&end_date=xxx - 获取用量
 */
export class CCAPIProvider extends BaseProvider {
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    super('ccapi' as any, config);
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
      const startOfYear = new Date(now.getFullYear(), 0, 1);

      // 获取订阅信息（额度限制）
      let hardLimit = 0;
      try {
        const subResponse = await this.client.get(
          `${this.baseUrl}/v1/dashboard/billing/subscription`,
          { headers: this.getDefaultHeaders() }
        );
        hardLimit = subResponse.data?.hard_limit_usd || 0;
      } catch {
        // 忽略错误
      }

      // 获取用量
      const startDate = this.formatDate(startOfYear);
      const endDate = this.formatDate(now);

      const usageResponse = await this.client.get(
        `${this.baseUrl}/v1/dashboard/billing/usage`,
        {
          headers: this.getDefaultHeaders(),
          params: {
            start_date: startDate,
            end_date: endDate
          }
        }
      );

      // total_usage 返回的是美分或美元，需要根据实际情况调整
      // 这个中转站返回的是美元
      const totalUsage = usageResponse.data?.total_usage || 0;

      return {
        provider: 'ccapi' as any,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalCost: totalUsage,
        currency: 'USD',
        requestCount: 0,
        quota: hardLimit > 0 ? {
          total: hardLimit,
          used: totalUsage,
          remaining: hardLimit - totalUsage,
          unit: 'dollars'
        } : undefined,
        period: {
          start: startOfYear,
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

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
