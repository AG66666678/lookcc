import { BaseProvider } from './base';
import { UsageData, ProviderConfig } from '../types';

export class AnthropicProvider extends BaseProvider {
  constructor(config: ProviderConfig) {
    super('anthropic', config);
  }

  protected getDefaultHeaders(): Record<string, string> {
    return {
      'x-api-key': this.config.apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
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

      // Anthropic Admin API for usage
      const response = await this.client.get(
        'https://api.anthropic.com/v1/admin/usage',
        {
          headers: this.getDefaultHeaders(),
          params: {
            start_date: this.formatDate(startOfMonth),
            end_date: this.formatDate(now)
          }
        }
      );

      const data = response.data;

      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalRequests = 0;
      let totalCost = 0;

      if (data.usage) {
        for (const entry of data.usage) {
          totalInputTokens += entry.input_tokens || 0;
          totalOutputTokens += entry.output_tokens || 0;
          totalRequests += entry.request_count || 0;
          totalCost += entry.cost || 0;
        }
      }

      // If no cost from API, estimate based on Claude 3 Sonnet pricing
      if (totalCost === 0) {
        totalCost = this.estimateCost(totalInputTokens, totalOutputTokens);
      }

      return {
        provider: 'anthropic',
        totalTokens: totalInputTokens + totalOutputTokens,
        promptTokens: totalInputTokens,
        completionTokens: totalOutputTokens,
        totalCost,
        currency: 'USD',
        requestCount: totalRequests,
        period: {
          start: startOfMonth,
          end: now,
          type: 'monthly'
        },
        lastUpdated: now
      };
    } catch (error: any) {
      // Anthropic doesn't have a public usage API for all users
      // Return placeholder with note
      if (error.response?.status === 404 || error.response?.status === 403) {
        return this.createEmptyUsageData('Usage API not available - check console.anthropic.com');
      }
      const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to fetch usage';
      return this.createEmptyUsageData(errorMessage);
    }
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private estimateCost(inputTokens: number, outputTokens: number): number {
    // Claude 3 Sonnet pricing: $3/M input, $15/M output
    const inputCost = (inputTokens / 1000000) * 3;
    const outputCost = (outputTokens / 1000000) * 15;
    return inputCost + outputCost;
  }
}
