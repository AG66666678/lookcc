import axios, { AxiosInstance } from 'axios';
import { ApiProvider, UsageData, ProviderConfig } from '../types';

export abstract class BaseProvider {
  protected client: AxiosInstance;
  protected config: ProviderConfig;
  public readonly providerId: ApiProvider;

  constructor(providerId: ApiProvider, config: ProviderConfig) {
    this.providerId = providerId;
    this.config = config;
    this.client = axios.create({
      timeout: 30000,
      headers: this.getDefaultHeaders()
    });
  }

  protected abstract getDefaultHeaders(): Record<string, string>;

  abstract fetchUsage(): Promise<UsageData>;

  abstract isConfigured(): boolean;

  protected createEmptyUsageData(error?: string): UsageData {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return {
      provider: this.providerId,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
      currency: 'USD',
      requestCount: 0,
      period: {
        start: startOfMonth,
        end: now,
        type: 'monthly'
      },
      lastUpdated: now,
      error
    };
  }

  protected formatCost(cost: number): string {
    return `$${cost.toFixed(4)}`;
  }

  protected formatTokens(tokens: number): string {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(2)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  }
}
