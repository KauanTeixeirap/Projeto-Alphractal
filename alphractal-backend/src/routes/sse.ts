import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { 
  subscribeToGasTelemetry, 
  getHistoricalBlocks, 
  type GasTelemetryPayload 
} from '../services/ethereum.js';

export const sseRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Endpoint REST para carga a frio do gráfico
  fastify.get('/api/v1/fees/history', async () => {
    return {
      status: 'ok',
      data: getHistoricalBlocks(),
    };
  });

  // Endpoint SSE contínuo
  fastify.get('/api/v1/fees/stream', (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    reply.raw.write('event: ready\ndata: {"status":"streaming_active"}\n\n');

    const unsubscribe = subscribeToGasTelemetry((payload: GasTelemetryPayload) => {
      reply.raw.write(`event: gas_metric\ndata: ${JSON.stringify(payload)}\n\n`);
    });

    const heartbeatInterval = setInterval(() => {
      reply.raw.write(': heartbeat\n\n');
    }, 20000);

    request.raw.on('close', () => {
      clearInterval(heartbeatInterval);
      unsubscribe();
      reply.raw.end();
    });
  });
};