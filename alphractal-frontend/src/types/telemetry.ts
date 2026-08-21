// Contrato de dados alinhado com o payload transmitido pelo Backend via SSE
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

export interface TelemetryState {
  currentData: GasTelemetryPayload | null;
  history: GasTelemetryPayload[];
  isConnected: boolean;
  error: string | null;
}