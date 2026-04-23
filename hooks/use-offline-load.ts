
import { useState, useEffect } from 'react';
import { OfflineDataService } from '@/lib/offline-data-service';
import { toast } from 'sonner';

export function useOfflineLoad() {
  const [isLoading, setIsLoading] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    const loadLastSync = async () => {
      const sync = await OfflineDataService.getLastSync();
      if (sync) setLastSync(sync);
    };
    loadLastSync();
  }, []);

  const realizarCargaOffline = async () => {
    if (!navigator.onLine) {
      toast.error("Necessário internet para atualizar a base offline.");
      return;
    }

    setIsLoading(true);
    const loadingToast = toast.loading("Sincronizando base de dados...");

    try {
      console.log('🔄 Iniciando sincronização IndexedDB Fragmentada...');

      // Obter última sincronização para modo incremental
      const lastSyncTime = await OfflineDataService.getLastSync();
      console.log(`📊 [Carga] Última sincronização detectada: ${lastSyncTime || 'Nunca'}`);

      // Definição das categorias para carga paralela
      const categorias = [
        ['config', 'usuarios', 'vendedores', 'tipos', 'campanhas'],
        ['parceiros'],
        ['produtos'],
        ['precos'],
        ['financeiro', 'pedidos', 'geografia']
      ];

      let totalRegistros = 0;

      // Executar cargas em paralelo
      await Promise.all(categorias.map(async (cats) => {
        const response = await fetch('/api/prefetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastSync: lastSyncTime, categories: cats })
        });

        if (!response.ok) {
          console.error(`❌ Falha ao carregar categorias: ${cats.join(', ')}`);
          return;
        }

        const result = await response.json();
        if (result.success) {
          // Sincronizar este fragmento no IndexedDB
          await OfflineDataService.sincronizarTudo(result, `useOfflineLoad-${cats[0]}`);
          // Atualizar caches leves
          OfflineDataService.atualizarCachesSessionStorage(result);
          
          // Contagem global (ajustado para ignorar chaves de controle)
          Object.entries(result).forEach(([key, val]: [string, any]) => {
            if (val?.count) totalRegistros += val.count;
          });
        }
      }));

      const now = new Date().toISOString();
      setLastSync(now);

      toast.success(`✅ Base atualizada! ${totalRegistros} registros sincronizados.`);
      console.log('✅ Sincronização IndexedDB concluída com sucesso');

    } catch (error) {
      console.error('❌ Erro na sincronização:', error);
      toast.error("Falha na sincronização offline.");
    } finally {
      setIsLoading(false);
      toast.dismiss(loadingToast);
    }
  };

  return { realizarCargaOffline, isLoading, lastSync };
}
