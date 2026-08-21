import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { subscribeToGasTelemetry, type GasTelemetryPayload } from '../services/ethereum.js';

export const sseRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/api/v1/fees/stream', (request, reply) => {
    // Cabeçalhos essenciais para streaming unidirecional Server-Sent Events (SSE)
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Handshake inicial
    reply.raw.write('event: ready\ndata: {"status":"streaming_active"}\n\n');

    // Assina o ouvinte de blocos processados pela viem
    const unsubscribe = subscribeToGasTelemetry((payload: GasTelemetryPayload) => {
      reply.raw.write(`event: gas_metric\ndata: ${JSON.stringify(payload)}\n\n`);
    });

    // Encerra a assinatura e previne vazamento de memória quando o cliente fecha a conexão
    request.raw.on('close', () => {
      unsubscribe();
      reply.raw.end();
    });
  });
};