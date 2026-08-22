import { useState, useEffect, useRef } from 'react';
import type { GasTelemetryPayload, TelemetryState } from '../types/telemetry.js';

// Fallback dinâmico: se houver variável de ambiente Vite, usa a URL remota (Deploy)
const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:3001';
const MAX_HISTORY_POINTS = 50;

export function useGasTelemetry(): TelemetryState {
  const [state, setState] = useState<TelemetryState>({
    currentData: null,
    history: [],
    isConnected: false,
    error: null,
  });

  const reconnectTimeoutRef = useRef<number | null>(null);
  const backoffDelayRef = useRef<number>(1000); // Inicia com 1s

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let isMounted = true;

    // 1. Carrega o histórico antes de abrir a stream
    async function fetchInitialHistory() {
      try {
        const res = await fetch(`${BASE_URL}/api/v1/fees/history`);
        if (!res.ok) throw new Error('Falha na resposta HTTP');
        const json = (await res.json()) as { data: GasTelemetryPayload[] };
        
        if (isMounted && json.data && json.data.length > 0) {
          const initialHistory = json.data;
          const latest = initialHistory[initialHistory.length - 1];
          setState((prev) => ({
            ...prev,
            history: initialHistory,
            currentData: latest,
          }));
        }
      } catch (err) {
        console.warn('[Hydration] Histórico indisponível no startup, aguardando stream:', err);
      }
    }

    // 2. Conecta ao SSE com Backoff Exponencial
    function connectSSE() {
      if (!isMounted) return;

      console.log('[SSE] Conectando ao canal de telemetria...');
      eventSource = new EventSource(`${BASE_URL}/api/v1/fees/stream`);

      eventSource.addEventListener('ready', () => {
        if (!isMounted) return;
        backoffDelayRef.current = 1000; // Reset do delay ao conectar
        setState((prev) => ({ ...prev, isConnected: true, error: null }));
      });

      eventSource.addEventListener('gas_metric', (event: MessageEvent) => {
        if (!isMounted) return;
        try {
          const payload: GasTelemetryPayload = JSON.parse(event.data);
          setState((prev) => {
            // Evita duplicação do mesmo bloco no histórico
            const isDuplicate = prev.history.some((item) => item.blockNumber === payload.blockNumber);
            const nextHistory = isDuplicate ? prev.history : [...prev.history, payload].slice(-MAX_HISTORY_POINTS);

            return {
              ...prev,
              currentData: payload,
              history: nextHistory,
              isConnected: true,
              error: null,
            };
          });
        } catch (err) {
          console.error('[SSE Parse Error]:', err);
        }
      });

      eventSource.onerror = () => {
        if (!isMounted) return;
        eventSource?.close();
        
        const nextDelay = Math.min(backoffDelayRef.current * 1.5, 10000); // Teto de 10s
        backoffDelayRef.current = nextDelay;

        setState((prev) => ({
          ...prev,
          isConnected: false,
          error: `Conexão perdida. Tentando reconectar em ${(nextDelay / 1000).toFixed(1)}s...`,
        }));

        reconnectTimeoutRef.current = window.setTimeout(() => {
          connectSSE();
        }, nextDelay);
      };
    }

    fetchInitialHistory().then(() => {
      connectSSE();
    });

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (eventSource) eventSource.close();
    };
  }, []);

  return state;
}