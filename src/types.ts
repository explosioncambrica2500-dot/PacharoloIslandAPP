export type CryptoSymbol = 'SOL' | 'BTC' | 'ETH' | 'ZEC' | 'HYPE';

export interface TokenPriceData {
  symbol: CryptoSymbol;
  name: string;
  mint: string;
  usdPrice: number;
  priceChange24h: number;
  liquidity: number;
  decimals: number;
  lastUpdated: string;
  blockId?: number;
  source: string;
  icon: string;
  previousPrice?: number;
}

export type AlertCondition = 'ABOVE' | 'BELOW';

export interface AlertRule {
  id: string;
  symbol: CryptoSymbol;
  condition: AlertCondition;
  targetPrice: number;
  createdAt: string;
  isActive: boolean;
  notes?: string;
  triggeredCount: number;
  lastTriggeredAt?: string;
}

export interface TriggeredAlertNotification {
  id: string;
  alertId: string;
  symbol: CryptoSymbol;
  condition: AlertCondition;
  targetPrice: number;
  actualPrice: number;
  timestamp: string;
  read: boolean;
}

export type TransactionType = 'BUY' | 'SELL' | 'ROTATION_SWAP' | 'INITIAL_BUY';

export interface DexTransaction {
  id: string;
  timestamp: string;
  symbol: CryptoSymbol;
  type: TransactionType;
  amount: number;
  priceUsd: number;
  totalUsd: number;
  txHash: string;
  dex: string;
  wallet: string;
  status: 'CONFIRMED' | 'PENDING';
  toSymbol?: CryptoSymbol;
  toAmount?: number;
  spreadPercent?: number;
}

export interface TokenRankingItem {
  symbol: CryptoSymbol;
  name: string;
  usdPrice: number;
  changePercent: number;
  rank: number;
  isHighest: boolean;
  isLowest: boolean;
}

export interface RotationStrategyState {
  initialBuyDone: boolean;
  initialBuyToken?: CryptoSymbol;
  initialBuyAmount?: number;
  initialBuyPriceUsd?: number;
  initialBuyTotalUsd?: number;
  currentHoldingToken: CryptoSymbol;
  currentHoldingAmount: number;
  autoBotEnabled: boolean;
  minSpreadThreshold: number;
  minNetGainThreshold: number; // Umbral mínimo de aumento neto tras costes (por defecto 0.5%)
  gasFeeUsd: number; // Coste de red Solana estimado en USD (ej. 0.015)
  dexFeePercent: number; // Comisión Jupiter / DEX router (0.10%)
  slippagePercent: number; // Slippage / Impacto de precio estimado (0.15%)
  lastSwapAt?: string;
  totalSwapsCount: number;
  strategyPnlUsd: number;
}

export interface ChartDataPoint {
  timestamp: number;
  timeLabel: string;
  price: number;
}

export type TimeFrame = '1M' | '5M' | '15M' | '1H' | '24H';

export interface WalletConfig {
  mode: 'PAPER' | 'REAL';
  address: string;
  providerName?: string;
  isConnected: boolean;
  paperBalanceUsd: number;
}
