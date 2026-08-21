import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config/env.js';
import { sseRoutes } from './routes/sse.js';
import { startBlockWatcher } from './services/ethereum.js';

// 1. Instancia o Fastify com o logger nativo ativado (sem dependências externas)
const app = Fastify({
  logger: true,
});

async function bootstrap() {
  try {
    // 2. Registra o CORS para permitir que o futuro frontend Vite consuma os dados
    await app.register(cors, {
      origin: '*',
      methods: ['GET'],
    });

    // 3. Registra a rota de Server-Sent Events (SSE)
    await app.register(sseRoutes);

    // 4. Endpoint de Health Check (Boa prática de engenharia para monitoramento)
    app.get('/health', async () => ({
      status: 'ok',
      service: 'alphractal-telemetry',
      uptime: process.uptime(),
    }));

    // 5. Inicializa o servidor na porta configurada (0.0.0.0 expõe para a rede local)
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`\n==================================================`);
    console.log(`🚀 [Alphractal Backend] Online em http://127.0.0.1:${config.port}`);
    console.log(`📡 [SSE Stream] Endpoint: http://127.0.0.1:${config.port}/api/v1/fees/stream`);
    console.log(`==================================================\n`);

    // 6. Inicia o observador de blocos WebSocket da viem APÓS o servidor subir
    startBlockWatcher();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap();