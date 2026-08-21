import { useState, useEffect } from 'react';
import type { GasTelemetryPayload, TelemetryState } from '../types/telemetry.js';

const STREAM_URL = 'http://127.0.0.1:3001/api/v1/fees/stream';
const MAX_HISTORY_POINTS = 50;

export function useGasTelemetry(): TelemetryState {
  const [state, setState] = useState<TelemetryState>({
    currentData: null,
    history: [],
    isConnected: false,
    error: null,
  });

  useEffect(() => {
    const eventSource = new EventSource(STREAM_URL);

    eventSource.addEventListener('ready', () => {
      setState((prev) => ({ ...prev, isConnected: true, error: null }));
    });

    eventSource.addEventListener('gas_metric', (event: MessageEvent) => {
      try {
        const payload: GasTelemetryPayload = JSON.parse(event.data);
        setState((prev) => {
          const updatedHistory = [...prev.history, payload].slice(-MAX_HISTORY_POINTS);
          return {
            ...prev,
            currentData: payload,
            history: updatedHistory,
            isConnected: true,
            error: null,
          };
        });
      } catch (err) {
        console.error('[SSE Hook Error] Falha ao parsear payload:', err);
      }
    });

    eventSource.onerror = () => {
      setState((prev) => ({ 
        ...prev, 
        isConnected: false, 
        error: 'Conexão interrompida com o backend.' 
      }));
    };

    // Cleanup obrigatório para evitar vazamento de memória e conexões TCP órfãs
    return () => {
      eventSource.close();
    };
  }, []);

  return state;
}