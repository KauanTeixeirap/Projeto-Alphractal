import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config/env.js';
import { sseRoutes } from './routes/sse.js';
import { startBlockWatcher } from './services/ethereum.js';

const app = Fastify({
  logger: true,
});

async function bootstrap() {
  try {
    // 1. Registro do CORS para integração com o frontend Vite
    await app.register(cors, {
      origin: '*',
      methods: ['GET'],
    });

    // 2. Registro da rota de streaming SSE
    await app.register(sseRoutes);

    // 3. Health Check e Rota Raiz
    app.get('/', async () => ({
      status: 'ok',
      service: 'alphractal-telemetry',
      version: '1.0.0',
    }));

    app.get('/health', async () => ({
      status: 'ok',
      service: 'alphractal-telemetry',
      uptime: process.uptime(),
    }));

    // 4. Inicialização do servidor Fastify
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`\n==================================================`);
    console.log(`🚀 [Alphractal Backend] Online em http://127.0.0.1:${config.port}`);
    console.log(`📡 [SSE Stream] Endpoint: http://127.0.0.1:${config.port}/api/v1/fees/stream`);
    console.log(`==================================================\n`);

    // 5. Início do watcher WebSocket (viem)
    startBlockWatcher();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap();