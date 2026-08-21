import React from 'react';
import { useGasTelemetry } from './hooks/useGasTelemetry';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Layers, 
  Zap, 
  Clock, 
  ShieldCheck 
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';

export default function App() {
  const { currentData, history, isConnected, error } = useGasTelemetry();

  return (
    <div className="min-h-screen bg-brand-bg text-gray-100 p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Institucional */}
        <header className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-brand-border gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Alphractal</h1>
              <span className="bg-indigo-500/10 text-indigo-400 text-xs px-2.5 py-1 rounded-full border border-indigo-500/20 font-medium">
                Live Telemetry
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              Sub-aba "Fees": Monitoramento contínuo de volatilidade e custos de execução Ethereum EIP-1559.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <div className="flex items-center gap-2 bg-brand-card px-4 py-2 rounded-lg border border-brand-border">
              <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-xs font-medium text-gray-300">
                {isConnected ? 'Circuito SSE Ativo' : error ? 'Reconectando...' : 'Aguardando Stream'}
              </span>
            </div>
            <div className="bg-brand-card px-4 py-2 rounded-lg border border-brand-border text-xs font-mono text-gray-300">
              ETH/USD: ${currentData?.ethPriceUsd ? currentData.ethPriceUsd.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '---'}
            </div>
          </div>
        </header>

        {/* Métricas Principais (Cards EIP-1559) */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-brand-card p-5 rounded-xl border border-brand-border">
            <div className="flex justify-between items-start text-gray-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Base Fee Atual</span>
              <Activity className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono">
              {currentData?.baseFeeGwei ?? '---'} <span className="text-xs text-gray-400 font-sans font-normal">Gwei</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Bloco #{currentData?.blockNumber ?? '---'}</p>
          </div>

          <div className="bg-brand-card p-5 rounded-xl border border-brand-border">
            <div className="flex justify-between items-start text-gray-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Próx. Base Fee Est.</span>
              <Layers className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-indigo-300 font-mono">
              {currentData?.nextEstimatedBaseFeeGwei ?? '---'} <span className="text-xs text-gray-400 font-sans font-normal">Gwei</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Cálculo determinístico EIP-1559</p>
          </div>

          <div className="bg-brand-card p-5 rounded-xl border border-brand-border">
            <div className="flex justify-between items-start text-gray-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Ocupação do Bloco</span>
              <Zap className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono">
              {currentData?.utilizationPercentage ?? '---'}%
            </div>
            <div className="w-full bg-gray-800 rounded-full h-1.5 mt-3 overflow-hidden">
              <div 
                className={`h-1.5 rounded-full ${
                  (currentData?.utilizationPercentage ?? 0) > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(currentData?.utilizationPercentage ?? 0, 100)}%` }}
              />
            </div>
          </div>

          <div className="bg-brand-card p-5 rounded-xl border border-brand-border">
            <div className="flex justify-between items-start text-gray-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Tendência de Carga</span>
              {currentData?.congestionTrend === 'RISING' && <TrendingUp className="w-4 h-4 text-rose-500" />}
              {currentData?.congestionTrend === 'FALLING' && <TrendingDown className="w-4 h-4 text-emerald-500" />}
              {currentData?.congestionTrend === 'STABLE' && <Minus className="w-4 h-4 text-amber-500" />}
            </div>
            <div className="text-2xl font-bold text-white tracking-wide">
              {currentData?.congestionTrend ?? '---'}
            </div>
            <p className="text-xs text-gray-500 mt-2">Meta de equilíbrio: 50% de gás</p>
          </div>
        </section>

        {/* Tiers de Custo Operacional (USD) */}
        <section className="bg-brand-card p-6 rounded-xl border border-brand-border space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Estimativa de Custos Operacionais (USD)</h2>
            <p className="text-xs text-gray-400">Transferência Padrão (21.000 Gas) calculada pelo oráculo spot de mercado</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-brand-bg/60 p-4 rounded-lg border border-brand-border/60">
              <div className="flex items-center justify-between text-gray-400 mb-1">
                <span className="text-xs font-medium">Slow (Econômico)</span>
                <Clock className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-xl font-bold text-white font-mono">
                ${currentData?.estimatedCostUsd?.slow.toFixed(4) ?? '---'}
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Sem acréscimo de Priority Fee</p>
            </div>

            <div className="bg-brand-bg/60 p-4 rounded-lg border border-indigo-500/30 relative">
              <span className="absolute top-2 right-2 bg-indigo-500 text-[10px] text-white px-2 py-0.5 rounded font-semibold">
                Recomendado
              </span>
              <div className="flex items-center justify-between text-gray-400 mb-1">
                <span className="text-xs font-medium text-indigo-300">Standard (Mercado)</span>
              </div>
              <div className="text-xl font-bold text-indigo-200 font-mono">
                ${currentData?.estimatedCostUsd?.standard.toFixed(4) ?? '---'}
              </div>
              <p className="text-[11px] text-gray-400 mt-1">+1.5 Gwei de gorjeta estimada</p>
            </div>

            <div className="bg-brand-bg/60 p-4 rounded-lg border border-brand-border/60">
              <div className="flex items-center justify-between text-gray-400 mb-1">
                <span className="text-xs font-medium">Fast (Urgência)</span>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-emerald-400 font-mono">
                ${currentData?.estimatedCostUsd?.fast.toFixed(4) ?? '---'}
              </div>
              <p className="text-[11px] text-gray-500 mt-1">+3.0 Gwei para mempool congestionada</p>
            </div>
          </div>
        </section>

        {/* Gráfico de Volatilidade da Mempool em Tempo Real */}
        <section className="bg-brand-card p-6 rounded-xl border border-brand-border space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Volatilidade da Base Fee ao Vivo</h2>
            <p className="text-xs text-gray-400">Histórico in-memory dos últimos {history.length} blocos transmitidos via SSE</p>
          </div>

          <div className="h-64 w-full">
            {history.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gasGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222735" />
                  <XAxis 
                    dataKey="blockNumber" 
                    stroke="#6B7280" 
                    fontSize={11}
                    tickFormatter={(val) => `#${val.slice(-4)}`}
                  />
                  <YAxis stroke="#6B7280" fontSize={11} unit=" G" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#151922', borderColor: '#222735', borderRadius: '8px', color: '#F3F4F6', fontSize: '12px' }}
                    formatter={(val: number) => [`${val} Gwei`, 'Base Fee']}
                    labelFormatter={(label) => `Bloco #${label}`}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="baseFeeGwei" 
                    stroke="#6366F1" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#gasGradient)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-2">
                <Activity className="w-8 h-8 animate-pulse text-indigo-400/50" />
                <p className="text-xs">Aguardando validação dos primeiros blocos Ethereum para plotar a curva...</p>
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}