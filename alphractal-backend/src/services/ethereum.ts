import { createPublicClient, webSocket, formatGwei, type Block } from 'viem';
import { mainnet } from 'viem/chains';
import { config } from '../config/env.js';

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
    slow: number;
    standard: number;
    fast: number;
  };
}

type MetricsListener = (payload: GasTelemetryPayload) => void;
const activeListeners = new Set<MetricsListener>();

// Buffer circular mantido em memória no Node.js (sem dependência de banco de dados)
const MAX_BUFFER_SIZE = 30;
const blockHistoryBuffer: GasTelemetryPayload[] = [];

export function subscribeToGasTelemetry(listener: MetricsListener): () => void {
  activeListeners.add(listener);
  return () => {
    activeListeners.delete(listener);
  };
}

export function getHistoricalBlocks(): GasTelemetryPayload[] {
  return [...blockHistoryBuffer];
}

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

async function fetchEthPriceUsd(): Promise<number> {
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { price: string };
    return parseFloat(data.price);
  } catch (err) {
    console.error('[Price Oracle] Fallback ativo:', err);
    return 2500.0;
  }
}

function processBlockData(block: Block, ethPriceUsd: number): GasTelemetryPayload | null {
  if (!block.baseFeePerGas) return null;

  const baseFeeGwei = parseFloat(formatGwei(block.baseFeePerGas));
  const utilization = (Number(block.gasUsed) / Number(block.gasLimit)) * 100;
  const nextBaseFeeWei = calculateNextBaseFee(block.baseFeePerGas, block.gasUsed, block.gasLimit);
  const nextEstimatedBaseFeeGwei = parseFloat(formatGwei(nextBaseFeeWei));

  let congestionTrend: GasTelemetryPayload['congestionTrend'] = 'STABLE';
  if (utilization > 52) congestionTrend = 'RISING';
  else if (utilization < 48) congestionTrend = 'FALLING';

  const standardTransferGas = 21000;
  const gweiToEth = 1e-9;
  const slowGwei = nextEstimatedBaseFeeGwei;
  const standardGwei = nextEstimatedBaseFeeGwei + 1.5;
  const fastGwei = nextEstimatedBaseFeeGwei + 3.0;

  return {
    blockNumber: block.number?.toString() ?? '0',
    blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
    baseFeeGwei: parseFloat(baseFeeGwei.toFixed(4)),
    gasLimit: block.gasLimit.toString(),
    gasUsed: block.gasUsed.toString(),
    utilizationPercentage: parseFloat(utilization.toFixed(2)),
    nextEstimatedBaseFeeGwei: parseFloat(nextEstimatedBaseFeeGwei.toFixed(4)),
    congestionTrend,
    ethPriceUsd,
    estimatedCostUsd: {
      slow: parseFloat((slowGwei * gweiToEth * standardTransferGas * ethPriceUsd).toFixed(4)),
      standard: parseFloat((standardGwei * gweiToEth * standardTransferGas * ethPriceUsd).toFixed(4)),
      fast: parseFloat((fastGwei * gweiToEth * standardTransferGas * ethPriceUsd).toFixed(4)),
    },
  };
}

export const publicClient = createPublicClient({
  chain: mainnet,
  transport: webSocket(config.rpcWssUrl, {
    retryCount: 5,
    retryDelay: 2000,
  }),
});

// Carga a frio: busca os últimos blocos imediatamente na inicialização
async function hydrateInitialHistory(): Promise<void> {
  try {
    console.log('[Web3 Service] Ingestão a frio: Carregando histórico recente de blocos...');
    const latestBlockNumber = await publicClient.getBlockNumber();
    const ethPriceUsd = await fetchEthPriceUsd();
    const blockPromises = [];

    // Busca os últimos 15 blocos sequenciais
    for (let i = 14n; i >= 0n; i--) {
      blockPromises.push(publicClient.getBlock({ blockNumber: latestBlockNumber - i }));
    }

    const blocks = await Promise.all(blockPromises);
    for (const block of blocks) {
      const payload = processBlockData(block, ethPriceUsd);
      if (payload) {
        blockHistoryBuffer.push(payload);
      }
    }
    console.log(`[Web3 Service] Buffer histórico preenchido com ${blockHistoryBuffer.length} blocos.`);
  } catch (err) {
    console.error('[Web3 Service] Falha ao hidratar histórico inicial:', err);
  }
}

export async function startBlockWatcher(): Promise<void> {
  await hydrateInitialHistory();

  console.log('[Web3 Service] Watcher WSS ativo na Ethereum Mainnet...');
  publicClient.watchBlocks({
    emitOnBegin: false,
    includeTransactions: false,
    onBlock: async (block: Block) => {
      const ethPriceUsd = await fetchEthPriceUsd();
      const payload = processBlockData(block, ethPriceUsd);
      if (!payload) return;

      // Mantém o tamanho do buffer controlado
      blockHistoryBuffer.push(payload);
      if (blockHistoryBuffer.length > MAX_BUFFER_SIZE) {
        blockHistoryBuffer.shift();
      }

      console.log(`[Bloco #${payload.blockNumber}] Base: ${payload.baseFeeGwei} Gwei | Standard: $${payload.estimatedCostUsd.standard}`);

      for (const listener of activeListeners) {
        listener(payload);
      }
    },
    onError: (error) => console.error('[Web3 Error] Instabilidade WSS:', error),
  });
}