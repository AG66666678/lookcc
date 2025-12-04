// API Provider Types
export type ApiProvider =
  | 'openai'
  | 'anthropic'
  | 'azure'
  | 'google'
  | 'mistral'
  | 'cohere'
  | 'deepseek'
  | 'moonshot'
  | 'zhipu'
  | 'baidu'
  | 'alibaba'
  | 'openrouter'
  | 'oneapi'
  | 'newapi'
  | 'ccapi';

// Usage data structure
export interface UsageData {
  provider: ApiProvider;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  currency: string;
  requestCount: number;
  quota?: QuotaInfo;
  period: UsagePeriod;
  lastUpdated: Date;
  error?: string;
}

export interface QuotaInfo {
  total: number;
  used: number;
  remaining: number;
  unit: 'tokens' | 'credits' | 'dollars' | 'requests';
  resetDate?: Date;
}

export interface UsagePeriod {
  start: Date;
  end: Date;
  type: 'daily' | 'monthly' | 'billing_cycle' | 'all_time';
}

// API Response types for different providers
export interface OpenAIUsageResponse {
  object: string;
  data: Array<{
    aggregation_timestamp: number;
    n_requests: number;
    operation: string;
    snapshot_id: string;
    n_context_tokens_total: number;
    n_generated_tokens_total: number;
  }>;
  ft_data: any[];
  dalle_api_data: any[];
  whisper_api_data: any[];
  tts_api_data: any[];
}

export interface OpenAIBillingResponse {
  total_granted: number;
  total_used: number;
  total_available: number;
}

export interface AnthropicUsageResponse {
  // Anthropic doesn't have a public usage API yet
  // This is a placeholder for when they add one
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Provider configuration
export interface ProviderConfig {
  apiKey: string;
  organizationId?: string;
  endpoint?: string;
  subscriptionId?: string;
  secretKey?: string;
  enabled: boolean;
}

// Status bar display
export interface StatusBarData {
  text: string;
  tooltip: string;
  color?: string;
}

// Provider display info
export interface ProviderInfo {
  id: ApiProvider;
  name: string;
  icon: string;
  color: string;
  website: string;
}

export const PROVIDER_INFO: Record<ApiProvider, ProviderInfo> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    icon: '$(hubot)',
    color: '#10a37f',
    website: 'https://platform.openai.com/usage'
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    icon: '$(symbol-class)',
    color: '#d4a27f',
    website: 'https://console.anthropic.com/settings/usage'
  },
  azure: {
    id: 'azure',
    name: 'Azure OpenAI',
    icon: '$(azure)',
    color: '#0078d4',
    website: 'https://portal.azure.com'
  },
  google: {
    id: 'google',
    name: 'Google AI',
    icon: '$(google)',
    color: '#4285f4',
    website: 'https://aistudio.google.com'
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    icon: '$(flame)',
    color: '#ff7000',
    website: 'https://console.mistral.ai'
  },
  cohere: {
    id: 'cohere',
    name: 'Cohere',
    icon: '$(pulse)',
    color: '#39594d',
    website: 'https://dashboard.cohere.com'
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: '$(telescope)',
    color: '#4d6bfe',
    website: 'https://platform.deepseek.com'
  },
  moonshot: {
    id: 'moonshot',
    name: 'Moonshot',
    icon: '$(rocket)',
    color: '#5c6bc0',
    website: 'https://platform.moonshot.cn'
  },
  zhipu: {
    id: 'zhipu',
    name: 'Zhipu AI',
    icon: '$(zap)',
    color: '#1e88e5',
    website: 'https://open.bigmodel.cn'
  },
  baidu: {
    id: 'baidu',
    name: 'Baidu Wenxin',
    icon: '$(comment-discussion)',
    color: '#2932e1',
    website: 'https://console.bce.baidu.com'
  },
  alibaba: {
    id: 'alibaba',
    name: 'Alibaba Qianwen',
    icon: '$(cloud)',
    color: '#ff6a00',
    website: 'https://dashscope.console.aliyun.com'
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    icon: '$(globe)',
    color: '#6366f1',
    website: 'https://openrouter.ai/activity'
  },
  oneapi: {
    id: 'oneapi',
    name: 'OneAPI',
    icon: '$(server)',
    color: '#10b981',
    website: ''
  },
  newapi: {
    id: 'newapi',
    name: 'NewAPI',
    icon: '$(server-process)',
    color: '#8b5cf6',
    website: ''
  },
  ccapi: {
    id: 'ccapi',
    name: 'CC API',
    icon: '$(cloud)',
    color: '#f59e0b',
    website: ''
  }
};
