import { BaseProvider } from './base';
import { UsageData, ProviderConfig } from '../types';

export class OpenRouterProvider extends BaseProvider {
  constructor(config: ProviderConfig) {
    super('openrouter' as any, config);
  }

  protected getDefaultHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  isConfigured(): boolean {
    return !!this.config.apiKey && this.config.apiKey.length > 0;
  }

  async fetchUsage(): Promise<UsageData> {
    if (!this.isConfigured()) {
      return this.createEmptyUsageData('API key not configured');
    }

    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // OpenRouter API: 获取账户信息和用量
      // GET https://openrouter.ai/api/v1/auth/key
      const response = await this.client.get(
        'https://openrouter.ai/api/v1/auth/key',
        { headers: this.getDefaultHeaders() }
      );

      const data = response.data?.data;

      if (!data) {
        return this.createEmptyUsageData('Invalid response from OpenRouter');
      }

      // OpenRouter 返回格式:
      // { data: { label, usage, limit, is_free_tier, rate_limit } }
      // usage 是已使用的美元金额
      const usage = data.usage || 0;
      const limit = data.limit || 0;

      return {
        provider: 'openrouter' as any,
        totalTokens: 0, // OpenRouter 不直接返回 token 数
        promptTokens: 0,
        completionTokens: 0,
        totalCost: usage,
        currency: 'USD',
        requestCount: 0,
        quota: limit > 0 ? {
          total: limit,
          used: usage,
          remaining: limit - usage,
          unit: 'dollars'
        } : undefined,
        period: {
          start: startOfMonth,
          end: now,
          type: 'monthly'
        },
        lastUpdated: now
      };
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to fetch usage';
      return this.createEmptyUsageData(errorMessage);
    }
  }
}
