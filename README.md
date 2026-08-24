# 🔷 Projeto Alphractal — Telemetria e Monitoramento de Gas Ethereum em Tempo Real

<p align="center">
  <img src="https://raw.githubusercontent.com/InteliBlockchain-IBC/assets/main/banner_blockas.png" alt="Banner Inteli Blockchain" width="750" onerror="this.style.display='none'">
</p>

<p align="center">
  <strong>Módulo de Inteligência e Previsão de Taxas de Transação para a Plataforma Alphractal</strong><br>
  Desenvolvido pelo clube <strong>Inteli Blockchain</strong> em parceria com a <strong>Alphractal (Nortech Labs)</strong>.
</p>

<p align="center">
  <a href="https://projeto-alphractal.onrender.com" target="_blank">
    <img src="https://img.shields.io/badge/Deploy%20Backend-Render%20Live-brightgreen?style=for-the-badge&logo=render" alt="Deploy Render">
  </a>
  <img src="https://img.shields.io/badge/Status-MVP%20Funcional-blue?style=for-the-badge" alt="Status MVP">
  <img src="https://img.shields.io/badge/Network-Ethereum%20Mainnet-627EEA?style=for-the-badge&logo=ethereum" alt="Ethereum Mainnet">
  <img src="https://img.shields.io/badge/Protocol-EIP--1559-indigo?style=for-the-badge" alt="EIP-1559">
</p>

---

## 📌 Sumário
- [1. Visão Geral e Contexto](#1-visão-geral-e-contexto)
  - [O Problema](#o-problema)
  - [A Solução](#a-solução)
- [2. Arquitetura da Solução](#2-arquitetura-da-solução)
- [3. Backend (`alphractal-backend`)](#3-backend-alphractal-backend)
  - [Tecnologias](#tecnologias-backend)
  - [Mecanismo de Telemetria e Regras de Negócio](#mecanismo-de-telemetria-e-regras-de-negócio)
  - [Endpoints e Streaming SSE](#endpoints-e-streaming-sse)
- [4. Frontend (`alphractal-frontend`)](#4-frontend-alphractal-frontend)
  - [Tecnologias](#tecnologias-frontend)
  - [Componentes e Indicadores Visuais](#componentes-e-indicadores-visuais)
- [5. Contrato de Dados (Payload SSE)](#5-contrato-de-dados-payload-sse)
- [6. Como Executar Localmente](#6-como-executar-localmente)
  - [Pré-requisitos](#pré-requisitos)
  - [Configuração e Execução do Backend](#configuração-e-execução-do-backend)
  - [Configuração e Execução do Frontend](#configuração-e-execução-do-frontend)
- [7. Ambientes e Deploys](#7-ambientes-e-deploys)
- [8. Roadmap e Próximos Passos](#8-roadmap-e-próximos-passos)

---

## 1. Visão Geral e Contexto

A **[Alphractal](https://alphractal.com)** é uma plataforma institucional de inteligência de mercado focada no ecossistema Web3 e finanças descentralizadas, desenvolvida pela **Nortech Labs**.

### ⚠️ O Problema
Na plataforma atual, a aba de taxas (*"Fees"*) apresenta métricas estáticas e médias históricas agregadas da rede Ethereum. Para investidores e fundos institucionais que executam ordens de alto volume (arbitragem, rebalanceamento de tesouraria, provisão de liquidez e swaps em DEXs), essa abordagem gera um **ponto cego operacional**:
- Médias passadas não refletem a volatilidade instantânea da *mempool*.
- Falta de previsão determinística de custo do próximo bloco expõe operações a *slippage*, falhas de transação (*out of gas*) e taxas abusivas.

### 💡 A Solução
Este projeto implementa um **módulo de telemetria e previsão preditiva em tempo real** para a sub-aba *"Fees"*. Ele transforma o fluxo bruto de blocos validados da **Ethereum Mainnet** em indicadores financeiros acionáveis, atualizados bloco a bloco (~12 segundos), com custo em dólares (USD) e previsão determinística via **EIP-1559**.

---

## 2. Arquitetura da Solução

```mermaid
flowchart LR
    subgraph EthereumNetwork ["🌐 Ethereum Mainnet"]
        RPC[Node RPC WSS<br/>Alchemy / Infura / QuickNode]
    end

    subgraph PriceOracles ["💹 Oráculos de Preço Spot"]
        Coinbase[Coinbase API]
        CoinGecko[CoinGecko API]
        Binance[Binance API]
    end

    subgraph Backend ["⚡ Alphractal Backend (Fastify + Viem)"]
        Watcher[WSS Block Watcher]
        Hydrator[Cold Ingestion Buffer<br/>15 blocos recentes]
        EIP1559[EIP-1559 Fee Engine<br/>Next Base Fee + Trend]
        OracleCache[Price Oracle Cache<br/>TTL: 30s]
        SSEBroadcaster[SSE Broadcaster]
    end

    subgraph Frontend ["🖥️ Alphractal Frontend (React 19 + Vite)"]
        Hook[useGasTelemetry Hook<br/>SSE + Exponential Backoff]
        Cards[KPIs de Gas & Mempool]
        Tiers[Tiers USD: Slow / Std / Fast]
        Chart[Live AreaChart Volatilidade]
    end

    RPC -->|WSS watchBlocks| Watcher
    Watcher --> Hydrator
    Watcher --> EIP1559
    PriceOracles --> OracleCache
    EIP1559 & OracleCache --> SSEBroadcaster
    SSEBroadcaster -->|GET /api/v1/fees/stream (SSE)| Hook
    SSEBroadcaster -->|GET /api/v1/fees/history (REST)| Hook
    Hook --> Cards & Tiers & Chart
```

---

## 3. Backend (`alphractal-backend`)

### 🛠️ Tecnologias Backend
- **Node.js 20+** com ESM (ECMAScript Modules) e **TypeScript**
- **Fastify v5**: Servidor HTTP de alta performance com `@fastify/cors`
- **Viem v2**: Cliente Web3 ultrarrápido para conexões WebSocket com a Ethereum Mainnet
- **TSX**: Executor e watcher TypeScript em ambiente de desenvolvimento

### 🧠 Mecanismo de Telemetria e Regras de Negócio
1. **Ingestão Contínua (WebSocket Watcher)**:
   - Mantém uma conexão persistente via WebSocket (`viem.watchBlocks`) na Ethereum Mainnet.
   - Dispara a análise a cada novo bloco minerado/validado.
2. **Carga a Frio (*Cold Ingestion*)**:
   - Na inicialização do servidor, busca sequencialmente os últimos **15 blocos** para que o cliente receba histórico imediato sem aguardar minutos por novos blocos.
   - Mantém um *buffer* circular em memória de até **30 blocos** (dispensando latência e complexidade de banco de dados para a telemetria em tempo real).
3. **Cálculo Determinístico EIP-1559**:
   - Baseado no alvo de equilíbrio de **50% de ocupação de gás** (`gasLimit / 2`):
     - Se `gasUsed > targetGas`: A Base Fee do próximo bloco sobe proporcionalmente à carga (`Δfee = baseFee * Δgas / targetGas / 8`).
     - Se `gasUsed < targetGas`: A Base Fee do próximo bloco cai.
4. **Classificação de Tendência (*Congestion Trend*)**:
   - `RISING`: Ocupação do bloco > 52% (mempool aquecida, pressão altista).
   - `FALLING`: Ocupação do bloco < 48% (alívio na mempool, pressão baixista).
   - `STABLE`: Ocupação entre 48% e 52% (faixa de equilíbrio ideal).
5. **Oráculo de Preço Spot com Resiliência em Camadas**:
   - Consulta o preço ETH/USD em tempo real com tolerância a falhas e cache in-memory de 30 segundos:
     1. **Coinbase Spot API** (sem restrições geográficas de data centers)
     2. **CoinGecko Simple API** (fallback primário)
     3. **Binance Ticker API** (fallback secundário)
     4. Preço em memória persistido (último valor válido caso todas as APIs falhem)
6. **Precificação em Dólar (USD) por Tiers de Urgência**:
   - Calcula o custo em USD de uma transferência padrão (21.000 gas):
     - **Slow**: $`NextBaseFee \times 21000 \times ETH_{USD}`$ (sem gorjeta / prioridade)
     - **Standard (Recomendado)**: $(NextBaseFee + 1.5\text{ Gwei}) \times 21000 \times ETH_{USD}$
     - **Fast (Urgência)**: $(NextBaseFee + 3.0\text{ Gwei}) \times 21000 \times ETH_{USD}$

### 📡 Endpoints do Backend

| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `GET` | `/` | Health check da aplicação com nome do serviço e versão. |
| `GET` | `/health` | Status operacional e tempo de atividade (*uptime*). |
| `GET` | `/api/v1/fees/history` | Retorna o snapshot dos últimos blocos em memória para hidratação a frio do gráfico. |
| `GET` | `/api/v1/fees/stream` | **Stream SSE (Server-Sent Events)** em tempo real com eventos `ready`, `gas_metric` e `heartbeat` periódico (20s). |

---

## 4. Frontend (`alphractal-frontend`)

### 🛠️ Tecnologias Frontend
- **React 19** + **TypeScript** + **Vite 6**
- **Tailwind CSS v4**: Estilização com design system institucional *dark mode*
- **Recharts**: Gráfico de área reativo e fluido
- **Lucide React**: Ícones de alta legibilidade para indicadores financeiros

### 🎨 Componentes e Indicadores Visuais
- **Hook `useGasTelemetry`**:
  - Faz a carga inicial via `/api/v1/fees/history`.
  - Subscreve ao SSE `/api/v1/fees/stream`.
  - Possui **Reconexão Resiliente com Backoff Exponencial** (1s a 10s) e tratamento de perda de sinal.
  - Deduplicação de blocos em memória.
- **Header Institucional**:
  - Indicador de status de conexão SSE com *pulse* dinâmico.
  - Cotação spot ETH/USD atualizada pelo oráculo.
- **Cards de Métricas Principais (EIP-1559)**:
  1. **Base Fee Atual**: Valor instantâneo em Gwei do bloco mais recente.
  2. **Próxima Base Fee Estimada**: Previsão matemática exata para o bloco subsequente.
  3. **Ocupação do Bloco**: Percentual de consumo de gás com barra de progresso adaptativa (verde se $\le 50\%$, âmbar se $> 50\%$).
  4. **Tendência da Mempool**: Direcionamento da pressão de taxas (`RISING`, `FALLING`, `STABLE`).
- **Tiers de Custo de Execução (USD)**:
  - Comparativo visual entre as modalidades **Slow**, **Standard (Recomendado)** e **Fast**.
- **Gráfico de Volatilidade ao Vivo**:
  - `AreaChart` com gradiente indigo traçando o comportamento da Base Fee ao longo do tempo.

---

## 5. Contrato de Dados (Payload SSE)

Cada evento `gas_metric` emitido no canal SSE possui a seguinte estrutura JSON tipada:

```typescript
interface GasTelemetryPayload {
  blockNumber: string;              // Ex: "20584912"
  blockTimestamp: string;           // ISO 8601 (Ex: "2026-08-24T12:00:00.000Z")
  baseFeeGwei: number;              // Ex: 12.4512
  gasLimit: string;                 // Ex: "30000000"
  gasUsed: string;                  // Ex: "15420100"
  utilizationPercentage: number;    // Ex: 51.40 (%)
  nextEstimatedBaseFeeGwei: number; // Ex: 12.5201
  congestionTrend: "RISING" | "STABLE" | "FALLING";
  ethPriceUsd: number;              // Ex: 2654.30
  estimatedCostUsd: {
    slow: number;                   // Ex: 0.6942
    standard: number;               // Ex: 0.7779
    fast: number;                   // Ex: 0.8616
  };
}
```

---

## 6. Como Executar Localmente

### 📋 Pré-requisitos
- **Node.js** v20.x ou superior
- **npm** ou **pnpm**
- Chave de API de um provedor Ethereum RPC com suporte a WebSocket (Ex: [Alchemy](https://alchemy.com), [Infura](https://infura.io), [QuickNode](https://quicknode.com) ou [Ankr](https://ankr.com)).

### 🔧 1. Configuração e Execução do Backend

```bash
# Acesse o diretório do backend
cd alphractal-backend

# Instale as dependências
npm install

# Crie o arquivo .env a partir das suas credenciais
```

Crie o arquivo `alphractal-backend/.env`:
```env
PORT=3001
RPC_WSS_URL=wss://eth-mainnet.g.alchemy.com/v2/SUA_CHAVE_AQUI
```

```bash
# Inicie o servidor em modo de desenvolvimento (hot reload)
npm run dev

# Para compilar e rodar a versão de produção:
npm run build
npm start
```
O backend estará disponível em `http://127.0.0.1:3001`.

### 💻 2. Configuração e Execução do Frontend

Em outro terminal:

```bash
# Acesse o diretório do frontend
cd alphractal-frontend

# Instale as dependências
npm install
```

*(Opcional)* Se desejar apontar para um backend customizado ou em nuvem, crie o arquivo `alphractal-frontend/.env.local`:
```env
VITE_BACKEND_URL=http://127.0.0.1:3001
# Para apontar diretamente para o deploy na nuvem:
# VITE_BACKEND_URL=https://projeto-alphractal.onrender.com
```

```bash
# Inicie o servidor Vite de desenvolvimento
npm run dev
```
Acesse a aplicação no navegador em `http://localhost:5173`.

---

## 7. Ambientes e Deploys

- 🌐 **Backend em Produção**: [https://projeto-alphractal.onrender.com](https://projeto-alphractal.onrender.com)
  - Endpoint de Teste Rápido: [https://projeto-alphractal.onrender.com/health](https://projeto-alphractal.onrender.com/health)
  - Endpoint de Histórico: [https://projeto-alphractal.onrender.com/api/v1/fees/history](https://projeto-alphractal.onrender.com/api/v1/fees/history)
  - Endpoint de Stream SSE: `https://projeto-alphractal.onrender.com/api/v1/fees/stream`
- 🌐 **Frontend**: Configurado com roteamento SPA para a [Vercel](https://vercel.com) via `alphractal-frontend/vercel.json`.

---

## 8. Roadmap e Próximos Passos

- [x] **Fase 1 (MVP)**:
  - Ingestão WebSocket Mainnet e cálculo determinístico EIP-1559.
  - Oráculo com redundância tripla para ETH/USD.
  - Streaming Server-Sent Events (SSE) com *keep-alive*.
  - Dashboard interativo React 19 com gráficos e tiers em USD.
  - Deploy do backend no Render.
- [ ] **Fase 2 (Expansão de Métricas)**:
  - Estimativa de custos para transações complexas (Swaps no Uniswap v3, operações Aave/Compound e transferências ERC-20).
  - Alertas parametrizáveis de gas spikes na interface.
  - Análise em tempo real de transações pendentes na *mempool* para identificação precoce de congestionamentos.
- [ ] **Fase 3 (Integração Institucional)**:
  - Empacotamento como componente/microfrontend integrável à aba principal da Alphractal.
  - Suporte a redes Layer 2 (Arbitrum, Optimism, Base).

---

<p align="center">
  Desenvolvido com foco em excelência e rigor institucional pelo time <strong>Inteli Blockchain (IBC)</strong>.
</p>