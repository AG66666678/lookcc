import { BaseProvider } from './base';
import { UsageData, ProviderConfig } from '../types';

export class OpenAIProvider extends BaseProvider {
  constructor(config: ProviderConfig) {
    super('openai', config);
  }

  protected getDefaultHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json'
    };

    if (this.config.organizationId) {
      headers['OpenAI-Organization'] = this.config.organizationId;
    }

    return headers;
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

      // Format dates for OpenAI API
      const startDate = this.formatDate(startOfMonth);
      const endDate = this.formatDate(now);

      // Fetch usage data
      const usageResponse = await this.client.get(
        `https://api.openai.com/v1/usage?start_date=${startDate}&end_date=${endDate}`,
        { headers: this.getDefaultHeaders() }
      );

      // Fetch billing/subscription info
      let quota;
      try {
        const billingResponse = await this.client.get(
          'https://api.openai.com/dashboard/billing/credit_grants',
          { headers: this.getDefaultHeaders() }
        );

        if (billingResponse.data) {
          quota = {
            total: billingResponse.data.total_granted || 0,
            used: billingResponse.data.total_used || 0,
            remaining: billingResponse.data.total_available || 0,
            unit: 'dollars' as const
          };
        }
      } catch {
        // Billing endpoint might not be available for all accounts
      }

      // Calculate totals from usage data
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;
      let totalRequests = 0;

      if (usageResponse.data?.data) {
        for (const entry of usageResponse.data.data) {
          totalPromptTokens += entry.n_context_tokens_total || 0;
          totalCompletionTokens += entry.n_generated_tokens_total || 0;
          totalRequests += entry.n_requests || 0;
        }
      }

      // Estimate cost (rough approximation based on GPT-4 pricing)
      const estimatedCost = this.estimateCost(totalPromptTokens, totalCompletionTokens);

      return {
        provider: 'openai',
        totalTokens: totalPromptTokens + totalCompletionTokens,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalCost: estimatedCost,
        currency: 'USD',
        requestCount: totalRequests,
        quota,
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

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private estimateCost(promptTokens: number, completionTokens: number): number {
    // Using GPT-4 Turbo pricing as a rough estimate
    // Input: $0.01/1K tokens, Output: $0.03/1K tokens
    const inputCost = (promptTokens / 1000) * 0.01;
    const outputCost = (completionTokens / 1000) * 0.03;
    return inputCost + outputCost;
  }
}
