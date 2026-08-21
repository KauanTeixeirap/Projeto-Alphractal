import { createPublicClient, webSocket, formatGwei, type Block } from 'viem';
import { mainnet } from 'viem/chains';
import { config } from '../config/env.js';

// Define a estrutura exata dos dados que vamos enviar ao frontend
export interface GasTelemetryPayload {
  blockNumber: string;
  blockTimestamp: string;
  baseFeeGwei: number;
  gasLimit: string;
  gasUsed: string;
  utilizationPercentage: number;
  nextEstimatedBaseFeeGwei: number;
  congestionTrend: 'RISING' | 'STABLE' | 'FALLING';
}

type MetricsListener = (payload: GasTelemetryPayload) => void;
const activeListeners = new Set<MetricsListener>();

/**
 * Inscreve um cliente (ex: uma aba do navegador) para receber atualizações.
 * Retorna uma função de limpeza para remover o ouvinte ao desconectar.
 */
export function subscribeToGasTelemetry(listener: MetricsListener): () => void {
  activeListeners.add(listener);
  return () => {
    activeListeners.delete(listener);
  };
}

/**
 * Lógica core da EIP-1559: Calcula deterministicamente a taxa base do próximo bloco.
 */
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

// Cria o cliente apontando para a URL da Alchemy via WebSocket
export const publicClient = createPublicClient({
  chain: mainnet,
  transport: webSocket(config.rpcWssUrl, {
    retryCount: 5,
    retryDelay: 2000,
  }),
});

/**
 * Função principal que assina os eventos da blockchain em tempo real.
 */
export function startBlockWatcher(): void {
  console.log('[Web3 Service] Estabelecendo circuito WSS com a Ethereum...');

  publicClient.watchBlocks({
    emitOnBegin: true,
    includeTransactions: false,
    onBlock: (block: Block) => {
      if (!block.baseFeePerGas) return;

      const baseFeeGwei = parseFloat(formatGwei(block.baseFeePerGas));
      const utilization = (Number(block.gasUsed) / Number(block.gasLimit)) * 100;
      
      const nextBaseFeeWei = calculateNextBaseFee(block.baseFeePerGas, block.gasUsed, block.gasLimit);
      const nextEstimatedBaseFeeGwei = parseFloat(formatGwei(nextBaseFeeWei));

      let congestionTrend: GasTelemetryPayload['congestionTrend'] = 'STABLE';
      if (utilization > 52) congestionTrend = 'RISING';
      else if (utilization < 48) congestionTrend = 'FALLING';

      const payload: GasTelemetryPayload = {
        blockNumber: block.number?.toString() ?? '0',
        blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
        baseFeeGwei: parseFloat(baseFeeGwei.toFixed(4)),
        gasLimit: block.gasLimit.toString(),
        gasUsed: block.gasUsed.toString(),
        utilizationPercentage: parseFloat(utilization.toFixed(2)),
        nextEstimatedBaseFeeGwei: parseFloat(nextEstimatedBaseFeeGwei.toFixed(4)),
        congestionTrend,
      };

      console.log(`[Bloco #${payload.blockNumber}] Base Fee: ${payload.baseFeeGwei} Gwei | Ocupação: ${payload.utilizationPercentage}%`);

      // Distribui o bloco processado para todas as conexões SSE ativas
      for (const listener of activeListeners) {
        listener(payload);
      }
    },
    onError: (error) => console.error('[Web3 Error] Queda no circuito WSS:', error),
  });
}