import axios, { AxiosInstance } from 'axios';

export interface UsageResult {
  todayUsed: number;    // 今日消耗 (美元)
  monthUsed: number;    // 本月消耗 (美元)
  totalUsed: number;    // 总消耗 (美元)
  total: number;        // 总额度 (美元)
  remaining: number;    // 剩余额度 (美元)
  type: string;         // 检测到的 API 类型
  error?: string;
}

/**
 * 通用 API Provider
 * 自动检测 API 类型并获取用量
 */
export class UniversalProvider {
  private client: AxiosInstance;
  private apiKey: string;
  private endpoint: string;

  constructor(apiKey: string, endpoint: string) {
    this.apiKey = apiKey;
    this.endpoint = endpoint.replace(/\/$/, '');
    this.client = axios.create({
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async fetchUsage(): Promise<UsageResult> {
    if (!this.apiKey || !this.endpoint) {
      return {
        todayUsed: 0,
        monthUsed: 0,
        totalUsed: 0,
        total: 0,
        remaining: 0,
        type: 'unknown',
        error: 'API Key or Endpoint not configured'
      };
    }

    // 尝试不同的 API 格式
    const detectors = [
      () => this.tryNewAPIBilling(),  // NewAPI 格式
      () => this.tryOneAPI(),          // OneAPI 格式
      () => this.tryOpenRouter(),      // OpenRouter 格式
    ];

    for (const detector of detectors) {
      try {
        const result = await detector();
        if (result && !result.error) {
          return result;
        }
      } catch {
        // 继续尝试下一个
      }
    }

    return {
      todayUsed: 0,
      monthUsed: 0,
      totalUsed: 0,
      total: 0,
      remaining: 0,
      type: 'unknown',
      error: 'Unable to detect API type'
    };
  }

  /**
   * NewAPI 格式
   */
  private async tryNewAPIBilling(): Promise<UsageResult | null> {
    try {
      // 获取订阅信息
      const subResponse = await this.client.get(
        `${this.endpoint}/v1/dashboard/billing/subscription`
      );

      if (!subResponse.data || subResponse.data.error) {
        return null;
      }

      const hardLimitUsd = subResponse.data.hard_limit_usd || 0;

      const now = new Date();

      // 今日日期
      const todayStart = this.formatDate(now);
      const todayEnd = this.formatDate(now);

      // 本月开始
      const monthStart = this.formatDate(new Date(now.getFullYear(), now.getMonth(), 1));

      // 全部时间（从年初开始）
      const yearStart = this.formatDate(new Date(now.getFullYear(), 0, 1));

      // 并行获取三个时间段的用量
      const [todayResponse, monthResponse, totalResponse] = await Promise.all([
        this.client.get(`${this.endpoint}/v1/dashboard/billing/usage`, {
          params: { start_date: todayStart, end_date: todayEnd }
        }),
        this.client.get(`${this.endpoint}/v1/dashboard/billing/usage`, {
          params: { start_date: monthStart, end_date: todayEnd }
        }),
        this.client.get(`${this.endpoint}/v1/dashboard/billing/usage`, {
          params: { start_date: yearStart, end_date: todayEnd }
        })
      ]);

      // total_usage 是美分，除以 100 转换为美元
      const todayUsed = (todayResponse.data?.total_usage || 0) / 100;
      const monthUsed = (monthResponse.data?.total_usage || 0) / 100;
      const totalUsed = (totalResponse.data?.total_usage || 0) / 100;

      const isUnlimited = hardLimitUsd >= 1000000;

      return {
        todayUsed,
        monthUsed,
        totalUsed,
        total: isUnlimited ? 0 : hardLimitUsd,
        remaining: isUnlimited ? 0 : (hardLimitUsd - totalUsed),
        type: 'NewAPI'
      };
    } catch {
      return null;
    }
  }

  /**
   * OneAPI 格式
   */
  private async tryOneAPI(): Promise<UsageResult | null> {
    try {
      const response = await this.client.get(
        `${this.endpoint}/api/user/self`
      );

      const data = response.data?.data;
      if (!data) {
        return null;
      }

      const quota = (data.quota || 0) / 500000;
      const usedQuota = (data.used_quota || 0) / 500000;

      return {
        todayUsed: 0,  // OneAPI 不提供每日数据
        monthUsed: 0,
        totalUsed: usedQuota,
        total: quota + usedQuota,
        remaining: quota,
        type: 'OneAPI'
      };
    } catch {
      return null;
    }
  }

  /**
   * OpenRouter 格式
   */
  private async tryOpenRouter(): Promise<UsageResult | null> {
    if (!this.endpoint.includes('openrouter.ai')) {
      return null;
    }

    try {
      const response = await this.client.get(
        'https://openrouter.ai/api/v1/auth/key'
      );

      const data = response.data?.data;
      if (!data) {
        return null;
      }

      const usage = data.usage || 0;
      const limit = data.limit || 0;

      return {
        todayUsed: 0,
        monthUsed: 0,
        totalUsed: usage,
        total: limit,
        remaining: limit > 0 ? limit - usage : 0,
        type: 'OpenRouter'
      };
    } catch {
      return null;
    }
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
