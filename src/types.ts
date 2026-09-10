export type CryptoSymbol = 'SOL' | 'BTC' | 'ETH' | 'JUP' | 'USDC' | 'ZEC';

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
  isRealOnChain?: boolean;
  isUserSwap?: boolean;
  userWallet?: string;
  feeTxHash?: string;
}

export interface TokenHolding {
  symbol: CryptoSymbol;
  balance: number;
  rawAmount: string;
  decimals: number;
  usdValue: number;
  mint: string;
}

export type WalletHoldingsMap = Record<CryptoSymbol, TokenHolding>;

export interface TokenRankingItem {
  symbol: CryptoSymbol;
  name: string;
  usdPrice: number;
  changePercent24h: number;
  changeSinceExecution: number;
  baselinePrice: number;
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
  executionLaunchedAt?: string | null;
  baselinePrices?: Partial<Record<CryptoSymbol, number>>;
  minSpreadThreshold: number;
  minNetGainThreshold: number; // Umbral mínimo de aumento neto tras costes (por defecto 0.5%)
  scanFrequencyMs?: number; // Frecuencia de escaneo en ms (100ms, 250ms, 500ms, 1000ms)
  gasFeeUsd: number; // Coste de red Solana estimado en USD (ej. 0.015)
  dexFeePercent: number; // Comisión de protocolo Jupiter DEX (0.00% por defecto, sin fee de protocolo)
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

export interface BotSubWalletConfig {
  publicKey: string;
  secretKeyBase58: string;
  isLiveOnChain: boolean;
  solBalance: number;
  tokenBalances: Partial<Record<CryptoSymbol, number>>;
  lastUpdated: string;
}

export interface PlatformFeeConfig {
  feeCollectorAddress: string;
  platformFeeBps: number; // e.g. 10 bps = 0.10% (tarifa transferida a tu wallet)
  totalFeesCollectedUsd: number;
  totalSwapsMonetized: number;
}

export interface WalletConfig {
  mode: 'PAPER' | 'REAL';
  address: string;
  providerName?: string;
  isConnected: boolean;
  paperBalanceUsd: number;
  subWallet?: BotSubWalletConfig;
}
