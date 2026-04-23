import { oracleAuthService } from './oracle-auth-service'

// Serviço de prefetch de dados para otimizar o carregamento inicial
export async function prefetchLoginData() {
  try {
    const { OfflineDataService } = await import('./offline-data-service')
    const lastSyncTime = await OfflineDataService.getLastSync();
    
    console.log(`🔄 Iniciando prefetch fragmentado (Delta: ${lastSyncTime || 'Não'})`)

    // Definição das categorias para carga paralela
    const categorias = [
      ['config', 'usuarios', 'vendedores', 'tipos', 'campanhas'],
      ['parceiros'],
      ['produtos', 'precos'], // Juntei esses aqui para o login ser mais compacto
      ['financeiro', 'pedidos', 'geografia']
    ];

    let summary: any = {};

    // Executar cargas em paralelo
    await Promise.all(categorias.map(async (cats) => {
      try {
        const response = await fetch('/api/prefetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastSync: lastSyncTime, categories: cats })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            await OfflineDataService.sincronizarTudo(result, `LoginPrefetch-${cats[0]}`);
            OfflineDataService.atualizarCachesSessionStorage(result);
            
            // Mesclar no resumo para o retorno da função
            Object.keys(result).forEach(key => {
               if (result[key]?.count !== undefined) {
                 summary[key] = (summary[key] || 0) + result[key].count;
               }
            });
          }
        }
      } catch (err) {
        console.error(`❌ Erro ao sincronizar ${cats.join(',')}:`, err);
      }
    }));

    return {
      parceiros: summary.parceiros || 0,
      produtos: summary.produtos || 0,
      tiposNegociacao: summary.tiposNegociacao || 0,
      tiposOperacao: summary.tiposOperacao || 0,
      pedidos: summary.pedidos || 0,
      financeiro: summary.financeiro || 0,
      usuarios: summary.usuarios || 0,
      total: Object.values(summary).reduce((a: any, b: any) => a + b, 0)
    }
  } catch (error) {
    console.error('❌ Erro no prefetch de dados:', error)
    return {
      parceiros: 0,
      produtos: 0,
      tiposNegociacao: 0,
      tiposOperacao: 0,
      pedidos: 0,
      financeiro: 0,
      usuarios: 0,
      total: 0
    }
  }
}

// Limpar cache de prefetch (útil para forçar atualização)
export async function clearPrefetchCache() {
  try {
    // Chamar endpoint de limpeza de cache
    await fetch('/api/cache/clear', {
      method: 'POST',
    })
    console.log('🗑️ Cache de prefetch limpo')
  } catch (error) {
    console.error('❌ Erro ao limpar cache de prefetch:', error)
  }
}