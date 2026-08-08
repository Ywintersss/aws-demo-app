import { loadConfig } from './config/env.js';
import { buildApplication } from './composition.js';

const main = async (): Promise<void> => {
  const config = loadConfig();
  const { server, db } = await buildApplication(config);

  await server.listen({ port: config.port, host: '0.0.0.0' });
  server.log.info(`aethelgard-demo api listening on :${config.port}`);

  const shutdown = async (signal: string): Promise<void> => {
    server.log.info(`received ${signal}, shutting down`);
    await server.close();
    await db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
};

main().catch((error: unknown) => {
  console.error('fatal startup error', error);
  process.exit(1);
});
