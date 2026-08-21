import { createPublicClient, webSocket, formatGwei, type Block } from 'viem';
import { mainnet } from 'viem/chains';
import { config } from '../config/env.js';

// 1. Contrato de dados enriquecido com cotação e custos operacionais
export interface GasTelemetryPayload {
  blockNumber: string;
  blockTimestamp: string;
  baseFeeGwei: number;
  gasLimit: string;
  gasUsed: string;
  utilizationPercentage: number;
  nextEstimatedBaseFeeGwei: number;
  congestionTrend: 'RISING' | 'STABLE' | 'FALLING';
  ethPriceUsd: number;
  estimatedCostUsd: {
    slow: number;     // Base Fee puro (sem prioridade na mempool)
    standard: number; // Base Fee + gorjeta padrão (~1.5 Gwei)
    fast: number;     // Base Fee + gorjeta prioritária (~3.0 Gwei)
  };
}

type MetricsListener = (payload: GasTelemetryPayload) => void;
const activeListeners = new Set<MetricsListener>();

export function subscribeToGasTelemetry(listener: MetricsListener): () => void {
  activeListeners.add(listener);
  return () => {
    activeListeners.delete(listener);
  };
}

// 2. Cálculo determinístico da EIP-1559 em BigInt (zero perda de precisão)
function calculateNextBaseFee(baseFeePerGas: bigint, gasUsed: bigint, gasLimit: bigint): bigint {
  const targetGas = gasLimit / 2n;

  if (gasUsed === targetGas) return baseFeePerGas;

  if (gasUsed > targetGas) {
    const gasDelta = gasUsed - targetGas;
    const feeDelta = (baseFeePerGas * gasDelta) / targetGas / 8n;
    return baseFeePerGas + (feeDelta > 0n ? feeDelta : 1n);
  } else {
    const gasDelta = targetGas - gasUsed;
    const feeDelta = (baseFeePerGas * gasDelta) / targetGas / 8n;
    return baseFeePerGas - feeDelta;
  }
}

// 3. Oráculo REST de baixa latência para paridade ETH/USDT
async function fetchEthPriceUsd(): Promise<number> {
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { price: string };
    return parseFloat(data.price);
  } catch (err) {
    console.error('[Price Oracle] Falha na cotação spot, aplicando fallback:', err);
    return 3000.0; // Fallback defensivo caso haja instabilidade de rede externa
  }
}

export const publicClient = createPublicClient({
  chain: mainnet,
  transport: webSocket(config.rpcWssUrl, {
    retryCount: 5,
    retryDelay: 2000,
  }),
});

export function startBlockWatcher(): void {
  console.log('[Web3 Service] Watcher ativo com ingestão WSS e Oráculo de Preço...');

  publicClient.watchBlocks({
    emitOnBegin: true,
    includeTransactions: false,
    onBlock: async (block: Block) => {
      if (!block.baseFeePerGas) return;

      const baseFeeGwei = parseFloat(formatGwei(block.baseFeePerGas));
      const utilization = (Number(block.gasUsed) / Number(block.gasLimit)) * 100;
      
      const nextBaseFeeWei = calculateNextBaseFee(block.baseFeePerGas, block.gasUsed, block.gasLimit);
      const nextEstimatedBaseFeeGwei = parseFloat(formatGwei(nextBaseFeeWei));

      let congestionTrend: GasTelemetryPayload['congestionTrend'] = 'STABLE';
      if (utilization > 52) congestionTrend = 'RISING';
      else if (utilization < 48) congestionTrend = 'FALLING';

      // Consulta de preço spot e cálculo de custo operacional (Transferência Base = 21.000 Gas)
      const ethPriceUsd = await fetchEthPriceUsd();
      const standardTransferGas = 21000;
      const gweiToEth = 1e-9;

      // Modelagem de Priority Fees (gorjetas estimadas da mempool)
      const slowGwei = nextEstimatedBaseFeeGwei;
      const standardGwei = nextEstimatedBaseFeeGwei + 1.5;
      const fastGwei = nextEstimatedBaseFeeGwei + 3.0;

      const estimatedCostUsd = {
        slow: parseFloat((slowGwei * gweiToEth * standardTransferGas * ethPriceUsd).toFixed(4)),
        standard: parseFloat((standardGwei * gweiToEth * standardTransferGas * ethPriceUsd).toFixed(4)),
        fast: parseFloat((fastGwei * gweiToEth * standardTransferGas * ethPriceUsd).toFixed(4)),
      };

      const payload: GasTelemetryPayload = {
        blockNumber: block.number?.toString() ?? '0',
        blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
        baseFeeGwei: parseFloat(baseFeeGwei.toFixed(4)),
        gasLimit: block.gasLimit.toString(),
        gasUsed: block.gasUsed.toString(),
        utilizationPercentage: parseFloat(utilization.toFixed(2)),
        nextEstimatedBaseFeeGwei: parseFloat(nextEstimatedBaseFeeGwei.toFixed(4)),
        congestionTrend,
        ethPriceUsd,
        estimatedCostUsd,
      };

      console.log(
        `[Bloco #${payload.blockNumber}] ETH: $${payload.ethPriceUsd} | Base: ${payload.baseFeeGwei} Gwei | Standard: $${payload.estimatedCostUsd.standard}`
      );

      for (const listener of activeListeners) {
        listener(payload);
      }
    },
    onError: (error) => console.error('[Web3 Error] Falha no circuito WSS:', error),
  });
}