import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { subscribeToGasTelemetry, type GasTelemetryPayload } from '../services/ethereum.js';

export const sseRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/api/v1/fees/stream', (request, reply) => {
    // Cabeçalhos obrigatórios para o protocolo SSE não fechar a conexão
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    reply.raw.write('event: ready\ndata: {"status":"streaming_active"}\n\n');

    // Inscreve a requisição atual no nosso "painel" de distribuição de blocos
    const unsubscribe = subscribeToGasTelemetry((payload: GasTelemetryPayload) => {
      reply.raw.write(`event: gas_metric\ndata: ${JSON.stringify(payload)}\n\n`);
    });

    // Desconecta e limpa a memória assim que o cliente fecha a conexão
    request.raw.on('close', () => {
      unsubscribe();
      reply.raw.end();
    });
  });
};