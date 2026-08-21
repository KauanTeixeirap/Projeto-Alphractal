import dotenv from 'dotenv';

dotenv.config();

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (!value) {
    throw new Error(`[Config Error] Variável de ambiente obrigatória '${key}' não foi definida.`);
  }
  return value;
}

export const config = {
  port: Number(getEnvVar('PORT', '3001')),
  rpcWssUrl: getEnvVar('RPC_WSS_URL'),
} as const;