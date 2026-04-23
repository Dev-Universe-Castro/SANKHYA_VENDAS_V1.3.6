import { db } from './client-db';
import { authService } from './auth-service';

export class OfflineDataService {
  private static isSyncing = false;
  private static lastSyncTime: number = 0;
  private static readonly SYNC_COOLDOWN = 30000; // 30 segundos de trava
  private static listeners: ((isSyncing: boolean) => void)[] = [];

  private static async ensureInitialized() {
    if (this.lastSyncTime === 0) {
      try {
        const lastSync = await this.getLastSync();
        if (lastSync) {
          this.lastSyncTime = new Date(lastSync).getTime();
        }
      } catch (err) {
        console.warn('Erro ao restaurar lastSyncTime:', err);
      }
    }
  }

  static subscribeToSync(callback: (isSyncing: boolean) => void) {
    this.ensureInitialized();
    this.listeners.push(callback);
    callback(this.isSyncing); // Initial value

    // Debug helper
    if (typeof window !== 'undefined' && !(window as any)._OfflineDataStatus) {
      (window as any)._OfflineDataStatus = () => ({
        isSyncing: this.isSyncing,
        lastSyncTime: this.lastSyncTime ? new Date(this.lastSyncTime).toLocaleString() : 'Nunca',
        secondsSinceLastSync: Math.floor((Date.now() - this.lastSyncTime) / 1000),
        listeners: this.listeners.length
      });
    }

    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private static notifyListeners() {
    this.listeners.forEach(l => l(this.isSyncing));
  }

  /**
   * Atualiza os caches no sessionStorage com base nos dados recebidos da API de prefetch.
   * OTIMIZAÇÃO: Não salvamos mais tabelas gigantes no sessionStorage (Parceiros, Produtos, ICMS, etc)
   * para evitar travamentos de UI e estouro de cota do navegador.
   */
  static atualizarCachesSessionStorage(data: any) {
    if (typeof window === 'undefined') return;

    try {
      console.log('💾 [CACHE] Atualizando sessionStorages (apenas metadados leves)...');

      const cacheMap = [
        // { key: 'cached_parceiros', data: data.parceiros?.data }, // REMOVIDO: Muito grande
        // { key: 'cached_produtos', data: data.produtos?.data },   // REMOVIDO: Muito grande
        { key: 'cached_tiposNegociacao', data: data.tiposNegociacao?.data },
        { key: 'cached_tipos_negociacao', data: data.tiposNegociacao?.data },
        { key: 'cached_tiposPedido', data: data.tiposPedido?.data },
        { key: 'cached_tiposOperacao', data: data.tiposOperacao?.data },
        { key: 'cached_tipos_operacao', data: data.tiposOperacao?.data },
        { key: 'cached_pedidos', data: data.pedidos?.data },
        { key: 'cached_financeiro', data: data.financeiro?.data },
        { key: 'cached_usuarios', data: data.usuarios?.data },
        { key: 'cached_vendedores', data: data.vendedores?.data },
        // { key: 'cached_excecoesPrecos', data: data.excecoesPrecos?.data }, // REMOVIDO: Muito grande
        // { key: 'cached_regrasImpostos', data: data.regrasImpostos?.data }, // REMOVIDO: Pode ser grande
        { 
          key: 'cached_tabelasPrecos', 
          data: data.tabelasPrecos?.data || data.tabelasPrecos?.tabelas 
        },
        { 
          key: 'cached_tabelasPrecosConfig', 
          data: data.tabelasPrecosConfig?.data || data.tabelasPrecosConfig?.configs 
        },
        { key: 'cached_locaisEstoque', data: data.locaisEstoque?.data },
        // { key: 'cached_enderecos', data: data.enderecos?.data } // REMOVIDO: Muito grande
      ];

      cacheMap.forEach(item => {
        if (item.data && Array.isArray(item.data) && item.data.length > 0) {
          try {
            sessionStorage.setItem(item.key, JSON.stringify(item.data));
          } catch (e) {
            console.warn(`⚠️ [CACHE] Falha ao salvar ${item.key} no sessionStorage (provável limite de cota).`);
          }
        } else if (item.data && Array.isArray(item.data) && item.data.length === 0) {
            sessionStorage.removeItem(item.key);
        }
      });

      console.log('✅ [CACHE] SessionStorages leves atualizados.');
    } catch (error) {
      console.error('❌ [CACHE] Erro ao atualizar sessionStorages:', error);
    }
  }

  /**
   * Divide uma lista em pedaços (chunks) menores.
   */
  private static chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Executa bulkAdd em uma tabela dividindo os dados em chunks para evitar travamentos.
   */
  private static async chunkedBulkAdd(table: any, data: any[], chunkSize: number = 5000) {
    if (!data || data.length === 0) return;
    const chunks = this.chunkArray(data, chunkSize);
    for (let i = 0; i < chunks.length; i++) {
        await table.bulkAdd(chunks[i]);
        if (chunks.length > 1) {
            console.log(`📦 [BATCH] ${table.name}: ${i + 1}/${chunks.length} chunks processados...`);
        }
    }
  }

  /**
   * Executa bulkPut em uma tabela dividindo os dados em chunks para evitar travamentos.
   */
  private static async chunkedBulkPut(table: any, data: any[], chunkSize: number = 5000) {
    if (!data || data.length === 0) return;
    const chunks = this.chunkArray(data, chunkSize);
    for (let i = 0; i < chunks.length; i++) {
        await table.bulkPut(chunks[i]);
        if (chunks.length > 1) {
            console.log(`📦 [BATCH] ${table.name}: ${i + 1}/${chunks.length} chunks processados...`);
        }
    }
  }

  /**
   * Verifica se as tabelas críticas do banco de dados possuem dados.
   * Retorna true se a base mínima para funcionamento (tipos de pedido e vendedores) estiver presente.
   */
  static async isDataHealthy(): Promise<boolean> {
    try {
      // Contar tipos de pedido e vendedores (mínimo necessário para abrir novo pedido)
      const tiposCount = await db.tiposPedido.count();
      const vendedoresCount = await db.vendedores.count();
      
      console.log(`📊 [SALUD] Verificação de integridade: ${tiposCount} tipos, ${vendedoresCount} vendedores.`);
      
      // Se não houver tipos de pedido ou vendedores, a base é considerada "insalubre"
      return tiposCount > 0 && vendedoresCount > 0;
    } catch (error) {
      console.error('❌ [SALUD] Erro ao verificar integridade da base:', error);
      return false;
    }
  }

  // ==================== SINCRONIZAÇÃO ====================

  static async sincronizarTudo(prefetchData: any, triggerName: string = 'desconhecido') {
    const now = Date.now();
    
    // Garantir que carregamos o tempo do banco antes de verificar cooldown
    await this.ensureInitialized();
    
    const timeSinceLastSync = now - this.lastSyncTime;

    if (this.isSyncing) {
      console.warn(`⚠️ [SYNC] Sincronização já em curso (disparada por: ${triggerName}). Ignorando nova chamada.`);
      return false;
    }

    // Se for uma sincronização parcial (apenas algumas categorias), ignoramos o cooldown
    const isPartial = Object.keys(prefetchData).length < 15; // Prefetch completo tem > 20 chaves

    if (!isPartial && this.lastSyncTime > 0 && timeSinceLastSync < this.SYNC_COOLDOWN) {
      console.log(`ℹ️ [SYNC] Ignorando sincronização redundante (disparada por: ${triggerName}). Última sincronização finalizada há ${Math.floor(timeSinceLastSync / 1000)}s.`);
      return true;
    }

    const isDelta = !!prefetchData?.isDelta;
    const syncType = isDelta ? 'INCREMENTAL (Delta)' : 'COMPLETA (Full)';

    try {
      this.isSyncing = true;
      this.notifyListeners();
      console.log(`🔄 [SYNC] Iniciando sincronização ${syncType} do IndexedDB (Disparada por: ${triggerName})...`);

      const promises = [];

      // Produtos
      if (prefetchData.produtos?.data) {
        if (prefetchData.produtos.data.length > 0) {
          console.log('🔍 [SYNC] Amostra de produto para salvar:', {
            CODPROD: prefetchData.produtos.data[0].CODPROD,
            CODMARCA: prefetchData.produtos.data[0].CODMARCA,
            CODGRUPOPROD: prefetchData.produtos.data[0].CODGRUPOPROD
          });
        }
        if (isDelta) {
          promises.push(
            this.chunkedBulkPut(db.produtos, prefetchData.produtos.data).then(() =>
              console.log(`✅ ${prefetchData.produtos.count} produtos atualizados (Delta)`)
            )
          );
        } else {
          promises.push(
            db.produtos.clear().then(() =>
              this.chunkedBulkAdd(db.produtos, prefetchData.produtos.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.produtos.count} produtos sincronizados (Full)`)
            )
          );
        }
      }

      // Parceiros
      if (prefetchData.parceiros?.data) {
        if (prefetchData.parceiros.data.length > 0) {
          console.log('🔍 [SYNC] Amostra de parceiro para salvar:', {
            CODPARC: prefetchData.parceiros.data[0].CODPARC,
            CODREG: prefetchData.parceiros.data[0].CODREG
          });
        }
        const parceirosProcessados = prefetchData.parceiros.data.map((p: any) => ({
          ...p,
          CODTAB: Number(p.CODTAB) || 0
        }));

        if (isDelta) {
          promises.push(
            this.chunkedBulkPut(db.parceiros, parceirosProcessados).then(() =>
              console.log(`✅ ${prefetchData.parceiros.count} parceiros atualizados (Delta)`)
            )
          );
        } else {
          promises.push(
            db.parceiros.clear().then(() =>
              this.chunkedBulkAdd(db.parceiros, parceirosProcessados)
            ).then(() =>
              console.log(`✅ ${prefetchData.parceiros.count} parceiros sincronizados (Full)`)
            )
          );
        }
      }

      // Financeiro
      if (prefetchData.financeiro?.data) {
        if (isDelta) {
          promises.push(
            db.financeiro.bulkPut(prefetchData.financeiro.data).then(() =>
              console.log(`✅ ${prefetchData.financeiro.count} títulos financeiros atualizados (Delta)`)
            )
          );
        } else {
          promises.push(
            db.financeiro.clear().then(() =>
              db.financeiro.bulkAdd(prefetchData.financeiro.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.financeiro.count} títulos financeiros sincronizados (Full)`)
            )
          );
        }
      }

      // Tipos de Negociação
      if (prefetchData.tiposNegociacao?.data) {
        if (isDelta) {
          promises.push(
            db.tiposNegociacao.bulkPut(prefetchData.tiposNegociacao.data).then(() =>
              console.log(`✅ ${prefetchData.tiposNegociacao.count} tipos de negociação atualizados (Delta)`)
            )
          );
        } else {
          promises.push(
            db.tiposNegociacao.clear().then(() =>
              db.tiposNegociacao.bulkAdd(prefetchData.tiposNegociacao.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.tiposNegociacao.count} tipos de negociação sincronizados (Full)`)
            )
          );
        }
      }

      // Tipos de Operação
      if (prefetchData.tiposOperacao?.data) {
        if (isDelta) {
          promises.push(
            db.tiposOperacao.bulkPut(prefetchData.tiposOperacao.data).then(() =>
              console.log(`✅ ${prefetchData.tiposOperacao.count} tipos de operação atualizados (Delta)`)
            )
          );
        } else {
          promises.push(
            db.tiposOperacao.clear().then(() =>
              db.tiposOperacao.bulkAdd(prefetchData.tiposOperacao.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.tiposOperacao.count} tipos de operação sincronizados (Full)`)
            )
          );
        }
      }

      // Tipos de Pedido
      if (prefetchData.tiposPedido?.data) {
        if (isDelta) {
          promises.push(
            db.tiposPedido.bulkPut(prefetchData.tiposPedido.data).then(() =>
              console.log(`✅ ${prefetchData.tiposPedido.count} tipos de pedido atualizados (Delta)`)
            )
          );
        } else {
          promises.push(
            db.tiposPedido.clear().then(() =>
              db.tiposPedido.bulkAdd(prefetchData.tiposPedido.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.tiposPedido.count} tipos de pedido sincronizados (Full)`)
            )
          );
        }
      }



      // Preços (exceções)
      if (prefetchData.excecoesPrecos?.data) {
        if (isDelta) {
          promises.push(
            this.chunkedBulkPut(db.precos, prefetchData.excecoesPrecos.data).then(() =>
              console.log(`✅ ${prefetchData.excecoesPrecos.count} preços atualizados (Delta)`)
            )
          );
        } else {
          promises.push(
            db.precos.clear().then(() =>
              this.chunkedBulkAdd(db.precos, prefetchData.excecoesPrecos.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.excecoesPrecos.count} preços sincronizados (Full)`)
            )
          );
        }
      }

      // Tabelas de Preços
      if (prefetchData.tabelasPrecos?.data) {
        if (isDelta) {
          promises.push(
            db.tabelasPrecos.bulkPut(prefetchData.tabelasPrecos.data).then(() =>
              console.log(`✅ ${prefetchData.tabelasPrecos.count} tabelas de preços atualizadas (Delta)`)
            )
          );
        } else {
          promises.push(
            db.tabelasPrecos.clear().then(() =>
              db.tabelasPrecos.bulkAdd(prefetchData.tabelasPrecos.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.tabelasPrecos.count} tabelas de preços sincronizadas (Full)`)
            )
          );
        }
      }

      // Tabelas de Preços Config
      if (prefetchData.tabelasPrecosConfig?.data) {
        if (isDelta) {
          promises.push(
            db.tabelasPrecosConfig.bulkPut(prefetchData.tabelasPrecosConfig.data).then(() =>
              console.log(`✅ ${prefetchData.tabelasPrecosConfig.count} tabelas de preços config atualizadas (Delta)`)
            )
          );
        } else {
          promises.push(
            db.tabelasPrecosConfig.clear().then(() =>
              db.tabelasPrecosConfig.bulkAdd(prefetchData.tabelasPrecosConfig.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.tabelasPrecosConfig.count} tabelas de preços config sincronizadas (Full)`)
            )
          );
        }
      }

      // Regiões
      if (prefetchData.regioes?.data) {
        if (isDelta) {
          promises.push(
            db.regioes.bulkPut(prefetchData.regioes.data).then(() =>
              console.log(`✅ ${prefetchData.regioes.count} regiões atualizadas (Delta)`)
            )
          );
        } else {
          promises.push(
            db.regioes.clear().then(() =>
              db.regioes.bulkAdd(prefetchData.regioes.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.regioes.count} regiões sincronizadas (Full)`)
            )
          );
        }
      }

      // Políticas Comerciais
      if (prefetchData.politicasComerciais?.data) {
        if (isDelta) {
          promises.push(
            db.politicasComerciais.bulkPut(prefetchData.politicasComerciais.data).then(() =>
              console.log(`✅ ${prefetchData.politicasComerciais.count} políticas comerciais atualizadas (Delta)`)
            )
          );
        } else {
          promises.push(
            db.politicasComerciais.clear().then(() =>
              db.politicasComerciais.bulkAdd(prefetchData.politicasComerciais.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.politicasComerciais.count} políticas comerciais sincronizadas (Full)`)
            )
          );
        }
      }

      // Pedidos
      if (prefetchData.pedidos?.data) {
        if (isDelta) {
          promises.push(
            db.pedidos.bulkPut(prefetchData.pedidos.data).then(() =>
              console.log(`✅ ${prefetchData.pedidos.count} pedidos atualizados (Delta)`)
            )
          );
        } else {
          promises.push(
            db.pedidos.clear().then(() =>
              db.pedidos.bulkAdd(prefetchData.pedidos.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.pedidos.count} pedidos sincronizados (Full)`)
            )
          );
        }
      }

      // Usuários
      if (prefetchData.usuarios?.data) {
        const usuariosProcessados = prefetchData.usuarios.data.map((u: any) => ({
          ...u,
          username: u.email || u.EMAIL
        }));

        if (isDelta) {
          promises.push(
            db.usuarios.bulkPut(usuariosProcessados).then(() =>
              console.log(`✅ ${prefetchData.usuarios.count} usuários atualizados (Delta)`)
            )
          );
        } else {
          promises.push(
            db.usuarios.clear().then(() =>
              db.usuarios.bulkAdd(usuariosProcessados)
            ).then(() =>
              console.log(`✅ ${prefetchData.usuarios.count} usuários sincronizados (Full)`)
            )
          );
        }
      }

      // Vendedores
      if (prefetchData.vendedores?.data) {
        if (isDelta) {
          promises.push(
            db.vendedores.bulkPut(prefetchData.vendedores.data).then(() =>
              console.log(`✅ ${prefetchData.vendedores.count} vendedores atualizados (Delta)`)
            )
          );
        } else {
          promises.push(
            db.vendedores.clear().then(() =>
              db.vendedores.bulkAdd(prefetchData.vendedores.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.vendedores.count} vendedores sincronizados (Full)`)
            )
          );
        }
      }

      // Volumes Alternativos
      if (prefetchData.volumes?.data) {
        if (isDelta) {
          promises.push(
            db.volumes.bulkPut(prefetchData.volumes.data).then(() =>
              console.log(`✅ ${prefetchData.volumes.count} volumes alternativos atualizados (Delta)`)
            )
          );
        } else {
          promises.push(
            db.volumes.clear().then(() =>
              db.volumes.bulkAdd(prefetchData.volumes.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.volumes.count} volumes alternativos sincronizados (Full)`)
            )
          );
        }
      }

      // Regras de Impostos
      if (prefetchData.regrasImpostos?.data) {
        if (isDelta) {
          promises.push(
            db.regrasImpostos.bulkPut(prefetchData.regrasImpostos.data).then(() =>
              console.log(`✅ ${prefetchData.regrasImpostos.count} regras de impostos atualizadas (Delta)`)
            )
          );
        } else {
          promises.push(
            db.regrasImpostos.clear().then(() =>
              db.regrasImpostos.bulkAdd(prefetchData.regrasImpostos.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.regrasImpostos.count} regras de impostos sincronizadas (Full)`)
            )
          );
        }
      }

      // Acessos do Usuário
      if (prefetchData.acessos?.data?.acessoUsuario) {
        promises.push(
          db.acessosUsuario.clear().then(() =>
            db.acessosUsuario.put(prefetchData.acessos.data.acessoUsuario)
          ).then(() =>
            console.log(`✅ Acessos do usuário sincronizados`)
          )
        );

        if (prefetchData.acessos.data.clientesManuais?.length > 0) {
          promises.push(
            db.acessosClientes.clear().then(() =>
              db.acessosClientes.bulkAdd(prefetchData.acessos.data.clientesManuais)
            ).then(() =>
              console.log(`✅ ${prefetchData.acessos.data.clientesManuais.length} clientes manuais sincronizados`)
            )
          );
        }

        if (prefetchData.acessos.data.produtosManuais?.length > 0) {
          promises.push(
            db.acessosProdutos.clear().then(() =>
              db.acessosProdutos.bulkAdd(prefetchData.acessos.data.produtosManuais)
            ).then(() =>
              console.log(`✅ ${prefetchData.acessos.data.produtosManuais.length} produtos manuais sincronizados`)
            )
          );
        }
      }

      // Equipes
      if (prefetchData.equipes?.data?.length > 0) {
        if (isDelta) {
          promises.push(
            db.equipes.bulkPut(prefetchData.equipes.data).then(() =>
              console.log(`✅ ${prefetchData.equipes.count} equipes atualizadas (Delta)`)
            )
          );
        } else {
          promises.push(
            db.equipes.clear().then(() =>
              db.equipes.bulkAdd(prefetchData.equipes.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.equipes.count} equipes sincronizadas (Full)`)
            )
          );
        }

        if (prefetchData.equipes.membros?.length > 0) {
          if (isDelta) {
            promises.push(
              db.equipesMembros.bulkPut(prefetchData.equipes.membros).then(() =>
                console.log(`✅ ${prefetchData.equipes.membros.length} membros de equipes atualizados (Delta)`)
              )
            );
          } else {
            promises.push(
              db.equipesMembros.clear().then(() =>
                db.equipesMembros.bulkAdd(prefetchData.equipes.membros)
              ).then(() =>
                console.log(`✅ ${prefetchData.equipes.membros.length} membros de equipes sincronizados (Full)`)
              )
            );
          }
        }
      }

      // Rotas
      if (prefetchData.rotas?.data) {
        if (isDelta) {
          promises.push(
            db.rotas.bulkPut(prefetchData.rotas.data).then(() =>
              console.log(`✅ ${prefetchData.rotas.count} rotas atualizadas (Delta)`)
            )
          );
        } else {
          promises.push(
            db.rotas.clear().then(() =>
              db.rotas.bulkAdd(prefetchData.rotas.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.rotas.count} rotas sincronizadas (Full)`)
            )
          );
        }
      }

      // Marcas
      if (prefetchData.marcas?.data) {
        if (isDelta) {
          promises.push(
            db.marcas.bulkPut(prefetchData.marcas.data).then(() =>
              console.log(`✅ ${prefetchData.marcas.count} marcas atualizadas (Delta)`)
            )
          );
        } else {
          promises.push(
            db.marcas.clear().then(() =>
              db.marcas.bulkAdd(prefetchData.marcas.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.marcas.count} marcas sincronizadas (Full)`)
            )
          );
        }
      }

      // Grupos de Produtos
      if (prefetchData.gruposProdutos?.data) {
        if (isDelta) {
          promises.push(
            db.gruposProdutos.bulkPut(prefetchData.gruposProdutos.data).then(() =>
              console.log(`✅ ${prefetchData.gruposProdutos.count} grupos de produtos atualizados (Delta)`)
            )
          );
        } else {
          promises.push(
            db.gruposProdutos.clear().then(() =>
              db.gruposProdutos.bulkAdd(prefetchData.gruposProdutos.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.gruposProdutos.count} grupos de produtos sincronizados (Full)`)
            )
          );
        }
      }

      // Cidades
      if (prefetchData.cidades?.data) {
        if (prefetchData.cidades.data.length > 0) {
          console.log('🔍 [SYNC] Amostra de cidade para salvar:', {
            CODCID: prefetchData.cidades.data[0].CODCID,
            UF: prefetchData.cidades.data[0].UF,
            UFSIGLA: prefetchData.cidades.data[0].UFSIGLA
          });
        }
        if (isDelta) {
          promises.push(
            db.cidades.bulkPut(prefetchData.cidades.data).then(() =>
              console.log(`✅ ${prefetchData.cidades.count} cidades atualizadas (Delta)`)
            )
          );
        } else {
          promises.push(
            db.cidades.clear().then(() =>
              db.cidades.bulkAdd(prefetchData.cidades.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.cidades.count} cidades sincronizadas (Full)`)
            )
          );
        }
      }

      // Bairros
      if (prefetchData.bairros?.data) {
        if (isDelta) {
          promises.push(
            db.bairros.bulkPut(prefetchData.bairros.data).then(() =>
              console.log(`✅ ${prefetchData.bairros.count} bairros atualizados (Delta)`)
            )
          );
        } else {
          promises.push(
            db.bairros.clear().then(() =>
              db.bairros.bulkAdd(prefetchData.bairros.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.bairros.count} bairros sincronizados (Full)`)
            )
          );
        }
      }

      // Estados
      if (prefetchData.estados?.data) {
        if (isDelta) {
          promises.push(
            db.estados.bulkPut(prefetchData.estados.data).then(() =>
              console.log(`✅ ${prefetchData.estados.count} estados atualizados (Delta)`)
            )
          );
        } else {
          promises.push(
            db.estados.clear().then(() =>
              db.estados.bulkAdd(prefetchData.estados.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.estados.count} estados sincronizados (Full)`)
            )
          );
        }
      }

      // Empresas
      if (prefetchData.empresas?.data) {
        if (isDelta) {
          promises.push(
            db.empresas.bulkPut(prefetchData.empresas.data).then(() =>
              console.log(`✅ ${prefetchData.empresas.count} empresas atualizadas (Delta)`)
            )
          );
        } else {
          promises.push(
            db.empresas.clear().then(() =>
              db.empresas.bulkAdd(prefetchData.empresas.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.empresas.count} empresas sincronizadas (Full)`)
            )
          );
        }
      }

      // Regras de ICMS (Novo v24)
      if (prefetchData.regrasIcms?.data) {
        if (isDelta) {
          promises.push(
            this.chunkedBulkPut(db.regrasIcmsParceiroEmpresa, prefetchData.regrasIcms.data).then(() =>
              console.log(`✅ ${prefetchData.regrasIcms.count} regras de ICMS atualizadas (Delta)`)
            )
          );
        } else {
          promises.push(
            db.regrasIcmsParceiroEmpresa.clear().then(() =>
              this.chunkedBulkAdd(db.regrasIcmsParceiroEmpresa, prefetchData.regrasIcms.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.regrasIcms.count} regras de ICMS sincronizadas (Full)`)
            )
          );
        }
      }

      // Complemento do Parceiro
      if (prefetchData.complementoParc?.data) {
        if (isDelta) {
          promises.push(
            this.chunkedBulkPut(db.complementoParc, prefetchData.complementoParc.data).then(() =>
              console.log(`✅ ${prefetchData.complementoParc.count} complementos de parceiro atualizados (Delta)`)
            )
          );
        } else {
          promises.push(
            db.complementoParc.clear().then(() =>
              this.chunkedBulkAdd(db.complementoParc, prefetchData.complementoParc.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.complementoParc.count} complementos de parceiro sincronizados (Full)`)
            )
          );
        }
      }

      // Locais de Estoque
      if (prefetchData.locaisEstoque?.data) {
        if (isDelta) {
          promises.push(
            db.locaisEstoque.bulkPut(prefetchData.locaisEstoque.data).then(() =>
              console.log(`✅ ${prefetchData.locaisEstoque.count} locais de estoque atualizados (Delta)`)
            )
          );
        } else {
          promises.push(
            db.locaisEstoque.clear().then(() =>
              db.locaisEstoque.bulkAdd(prefetchData.locaisEstoque.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.locaisEstoque.count} locais de estoque sincronizados (Full)`)
            )
          );
        }
      }

      // Endereços (Novo v29)
      if (prefetchData.enderecos?.data) {
        if (isDelta) {
          promises.push(
            this.chunkedBulkPut(db.enderecos, prefetchData.enderecos.data).then(() =>
              console.log(`✅ ${prefetchData.enderecos.count} endereços atualizados (Delta)`)
            )
          );
        } else {
          promises.push(
            db.enderecos.clear().then(() =>
              this.chunkedBulkAdd(db.enderecos, prefetchData.enderecos.data)
            ).then(() =>
              console.log(`✅ ${prefetchData.enderecos.count} endereços sincronizados (Full)`)
            )
          );
        }
      }

      await Promise.all(promises);

      // Políticas Comerciais
      if (prefetchData.politicasComerciais?.data) {
        await db.politicasComerciais.clear();
        await db.politicasComerciais.bulkAdd(prefetchData.politicasComerciais.data);
        console.log(`✅ ${prefetchData.politicasComerciais.count} políticas comerciais sincronizadas`);
      }

      // Campanhas
      if (prefetchData.campanhas?.data) {
        // REGRA: Mantém campanhas criadas localmente (que não possuem ID do Sankhya e usam Date.now())
        const campanhasLocais = await db.campanhas.filter(c => Number(c.ID_CAMPANHA) > 1000000000000).toArray();
        const itensLocais = await db.campanhaItens.filter(i => Number(i.ID_CAMPANHA) > 1000000000000).toArray();

        if (isDelta) {
          // No modo delta, apenas mesclamos o que veio do servidor
          await db.campanhas.bulkPut(prefetchData.campanhas.data);
          if (prefetchData.campanhaItens?.data) {
            await db.campanhaItens.bulkPut(prefetchData.campanhaItens.data);
          }
          console.log(`✅ ${prefetchData.campanhas.count} campanhas atualizadas (Delta)`);
        } else {
          // No modo Full, limpamos e mantemos apenas as locais
          await db.campanhas.clear();
          await db.campanhas.bulkAdd([...prefetchData.campanhas.data, ...campanhasLocais]);

          await db.campanhaItens.clear();
          await db.campanhaItens.bulkAdd([...(prefetchData.campanhaItens?.data || []), ...itensLocais]);
          console.log(`✅ ${prefetchData.campanhas.count} campanhas sincronizadas (Full)`);
        }
      }

      // Salvar metadados da sincronização
      await db.metadados.put({
        chave: 'lastSync',
        valor: new Date().toISOString(),
        timestamp: Date.now()
      });

      console.log(`✅ Sincronização ${syncType} do IndexedDB finalizada!`);
      this.lastSyncTime = Date.now();
      return true;

    } catch (error) {
      console.error('❌ Erro na sincronização do IndexedDB:', error);
      throw error;
    } finally {
      this.isSyncing = false;
      this.notifyListeners();
    }
  }

  // ==================== LEITURA DE DADOS ====================

  // getProdutos movido para o final da classe (implementação nova)

  static async getVolumes(codProd?: string | number) {
    try {
      if (codProd) {
        // Busca resiliente a tipos (pode ser string ou numero no IndexedDB)
        let volumes = await db.volumes.where('CODPROD').equals(Number(codProd)).toArray();
        if (volumes.length === 0) {
          // Tenta como string se não encontrou nada como número
          volumes = await db.volumes.where('CODPROD').equals(String(codProd)).toArray();
        }
        
        console.log(`🔍 [OfflineDataService] Encontrados ${volumes.length} volumes para CODPROD ${codProd}`);
        return volumes;
      }
      return await db.volumes.toArray();
    } catch (error) {
      console.error('[OFFLINE] Erro ao buscar volumes:', error);
      return [];
    }
  }

  static async getParceiros(filtros?: { codVend?: number, search?: string }) {
    try {
      // Otimização: Se houver busca, tentar usar o índice CODPARC se for número
      if (filtros?.search) {
        const s = filtros.search.toLowerCase();

        // Se for código exato, busca direta é instantânea
        if (!isNaN(Number(s))) {
          const p = await db.parceiros.get(s) || await db.parceiros.get(Number(s));
          if (p) return [p];
        }

        // Caso contrário, busca por coleção com limite (mais eficiente que toArray().filter())
        return await db.parceiros
          .filter(p =>
            p.NOMEPARC?.toLowerCase().includes(s) ||
            p.RAZAOSOCIAL?.toLowerCase().includes(s) ||
            p.CGC_CPF?.includes(s) ||
            p.CODPARC?.toString().includes(s)
          )
          .limit(20)
          .toArray();
      }

      if (filtros?.codVend) {
        return await db.parceiros.where('CODVEND').equals(filtros.codVend).toArray();
      }

      return await db.parceiros.toArray();
    } catch (error) {
      console.error('Erro ao buscar parceiros:', error);
      return [];
    }
  }

  static async saveParceiros(parceiros: any[]) {
    try {
      await db.parceiros.clear();
      await db.parceiros.bulkAdd(parceiros);
      console.log(`✅ ${parceiros.length} parceiros salvos no IndexedDB`);
    } catch (error) {
      console.error('❌ Erro ao salvar parceiros no IndexedDB:', error);
      throw error;
    }
  }

  static async getComplementoParc(codParc: number | string) {
    try {
      if (codParc) {
        const p = await db.complementoParc.get(String(codParc)) || await db.complementoParc.get(Number(codParc));
        return p;
      }
      return null;
    } catch (error) {
      console.error('❌ Erro ao buscar complemento de parceiro:', error);
      return null;
    }
  }

  static async getFinanceiro(codParc?: number) {
    try {
      if (codParc) {
        return await db.financeiro.where('CODPARC').equals(codParc).toArray();
      }
      return await db.financeiro.toArray();
    } catch (error) {
      console.error('❌ Erro ao buscar financeiro:', error);
      return [];
    }
  }

  static async getTitulos(filtros?: { searchTerm?: string, searchNroTitulo?: string }) {
    try {
      let titulos = await db.financeiro.toArray();

      // Aplicar filtros
      if (filtros?.searchNroTitulo) {
        titulos = titulos.filter(t =>
          t.NUFIN?.toString().includes(filtros.searchNroTitulo!)
        );
      }

      if (filtros?.searchTerm) {
        const searchLower = filtros.searchTerm.toLowerCase();
        titulos = titulos.filter(t =>
          t.CODPARC?.toString().includes(filtros.searchTerm!) ||
          t.NOMEPARC?.toLowerCase().includes(searchLower)
        );
      }

      // Mapear para o formato esperado
      return titulos.map((t: any) => {
        const estaBaixado = t.DHBAIXA || (t.VLRBAIXA && parseFloat(t.VLRBAIXA) > 0);
        const valorTitulo = estaBaixado
          ? parseFloat(t.VLRBAIXA || 0)
          : parseFloat(t.VLRDESDOB || 0);

        return {
          nroTitulo: t.NUFIN?.toString() || '',
          parceiro: t.NOMEPARC || `Parceiro ${t.CODPARC}`,
          valor: valorTitulo,
          dataVencimento: t.DTVENC ? new Date(t.DTVENC).toISOString().split('T')[0] : '',
          dataNegociacao: t.DTNEG ? new Date(t.DTNEG).toISOString().split('T')[0] : '',
          tipo: t.PROVISAO === 'S' ? 'Provisão' : 'Real',
          status: estaBaixado ? 'Baixado' : 'Aberto',
          numeroParcela: 1,
          CODPARC: t.CODPARC,
          NOMEPARC: t.NOMEPARC,
          DTVENC: t.DTVENC
        };
      });
    } catch (error) {
      console.error('❌ Erro ao buscar títulos:', error);
      return [];
    }
  }

  static async getPedidos(filtros?: { codVend?: number }) {
    try {
      if (filtros?.codVend) {
        return await db.pedidos.where('CODVEND').equals(filtros.codVend).toArray();
      }
      return await db.pedidos.toArray();
    } catch (error) {
      console.error('❌ Erro ao buscar pedidos:', error);
      return [];
    }
  }

  static async savePedidos(pedidos: any[]) {
    try {
      await db.pedidos.clear();
      await db.pedidos.bulkAdd(pedidos);
      console.log(`✅ ${pedidos.length} pedidos salvos no IndexedDB`);
    } catch (error) {
      console.error('❌ Erro ao salvar pedidos no IndexedDB:', error);
      throw error;
    }
  }

  static async getTiposNegociacao(search: string = '') {
    try {
      let collection = db.tiposNegociacao.toCollection();
      if (search) {
        const searchNormal = search.toLowerCase();
        collection = collection.filter((t) =>
          String(t.CODTIPVENDA).includes(searchNormal) ||
          (t.DESCRTIPVENDA || '').toLowerCase().includes(searchNormal)
        );
      }
      return await collection.toArray();
    } catch (error) {
      console.error('❌ Erro ao buscar tipos de negociação:', error);
      return [];
    }
  }

  static async getTiposOperacao(search: string = '') {
    try {
      let collection = db.tiposOperacao.toCollection();
      if (search) {
        const searchNormal = search.toLowerCase();
        collection = collection.filter((t) =>
          String(t.CODTIPOPER).includes(searchNormal) ||
          (t.DESCRTIPOPER || '').toLowerCase().includes(searchNormal)
        );
      }
      return await collection.toArray();
    } catch (error) {
      console.error('❌ Erro ao buscar tipos de operação:', error);
      return [];
    }
  }

  static async getTiposPedido(search: string = '') {
    try {
      let collection = db.tiposPedido.toCollection();
      if (search) {
        const searchNormal = search.toLowerCase();
        collection = collection.filter((t) =>
          String(t.CODTIPOPEDIDO).includes(searchNormal) ||
          String(t.CODTIPOPER || '').includes(searchNormal)
        );
      }
      return await collection.toArray();
    } catch (error) {
      console.error('❌ Erro ao buscar tipos de pedido:', error);
      return [];
    }
  }

  static async getRegrasImpostos() {
    try {
      return await db.regrasImpostos.where('ATIVO').equals('S').toArray();
    } catch (error) {
      console.error('❌ Erro ao buscar regras de impostos:', error);
      return [];
    }
  }

  static async updateTiposPedido(tipos: any[]) {
    try {
      await db.tiposPedido.clear();
      await db.tiposPedido.bulkAdd(tipos);
      console.log(`✅ ${tipos.length} tipos de pedido atualizados no IndexedDB`);
      return true;
    } catch (error) {
      console.error('❌ Erro ao atualizar tipos de pedido no IndexedDB:', error);
      return false;
    }
  }

  static async updateRegrasImpostos(regras: any[]) {
    try {
      await db.regrasImpostos.clear();
      await db.regrasImpostos.bulkAdd(regras);
      console.log(`✅ ${regras.length} regras de impostos atualizadas no IndexedDB`);
      return true;
    } catch (error) {
      console.error('❌ Erro ao atualizar regras de impostos no IndexedDB:', error);
      return false;
    }
  }

  static async getProdutos(filters?: { ativo?: string, search?: string, codProd?: string | number }) {
    try {
      if (filters?.codProd) {
        return await db.produtos.where('CODPROD').equals(Number(filters.codProd)).toArray();
      }

      let collection = db.produtos.toCollection();

      if (filters?.ativo) {
        collection = db.produtos.where('ATIVO').equals(filters.ativo);
      }

      if (filters?.search) {
        const searchNormal = filters.search.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const searchTerm = filters.search;

        collection = collection.filter((p) => {
          const desc = p.DESCRPROD ? p.DESCRPROD.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : '';
          const cod = String(p.CODPROD);
          return desc.includes(searchNormal) || cod.includes(searchTerm);
        });
      }

      // Limit results if searching to avoid performance hit
      if (filters?.search) {
        return await collection.limit(50).toArray();
      }

      return await collection.toArray();
    } catch (error) {
      console.error('❌ Erro ao buscar produtos:', error);
      return [];
    }
  }



  static async getPoliticasComerciais() {
    try {
      return await db.politicasComerciais.toArray();
    } catch (error) {
      console.error('❌ Erro ao buscar políticas comerciais:', error);
      return [];
    }
  }

  static async saveVolumes(volumes: any[]) {
    try {
      await db.volumes.clear();
      await db.volumes.bulkAdd(volumes);
      console.log(`✅ ${volumes.length} volumes alternativos salvos no IndexedDB`);
    } catch (error) {
      console.error('❌ Erro ao salvar volumes no IndexedDB:', error);
      throw error;
    }
  }

  static async getPrecos(codProd: number, nutab?: number) {
    try {
      const totalPrecos = await db.precos.count();
      if (totalPrecos === 0) return [];

      // Buscar por CODPROD (sempre numérico)
      const todosPrecoProduto = await db.precos.where('CODPROD').equals(Number(codProd)).toArray();

      console.log(`[OFFLINE] Buscando preço para CODPROD: ${codProd}, NUTAB: ${nutab}. Encontrados para o produto:`, todosPrecoProduto.length);

      if (nutab !== undefined && nutab !== null) {
        const nutabBusca = Number(nutab);
        const precos = todosPrecoProduto.filter(p => {
          const pNutab = p.NUTAB !== undefined ? p.NUTAB : p.nutab;
          return pNutab !== undefined && pNutab !== null && Number(pNutab) === nutabBusca;
        });

        console.log(`[OFFLINE] Preços após filtrar por NUTAB ${nutabBusca}:`, precos.length);
        return precos;
      }

      return todosPrecoProduto;
    } catch (error) {
      console.error('❌ Erro ao buscar preços:', error);
      return [];
    }
  }

  static async getExcecoesPrecos() {
    try {
      return await db.precos.toArray();
    } catch (error) {
      console.error('❌ Erro ao buscar exceções de preços:', error);
      return [];
    }
  }

  static async saveExcecoesPrecos(excecoes: any[]) {
    try {
      await db.precos.clear();
      await db.precos.bulkAdd(excecoes);
      console.log(`✅ ${excecoes.length} exceções de preços salvas no IndexedDB`);
    } catch (error) {
      console.error('❌ Erro ao salvar exceções de preços no IndexedDB:', error);
      throw error;
    }
  }

  static async saveTabelasPrecos(tabelas: any[]) {
    try {
      await db.tabelasPrecos.clear();
      await db.tabelasPrecos.bulkAdd(tabelas);
      console.log(`✅ ${tabelas.length} tabelas de preços salvas no IndexedDB`);
    } catch (error) {
      console.error('❌ Erro ao salvar tabelas de preços no IndexedDB:', error);
      throw error;
    }
  }

  static async saveTabelasPrecosConfig(configs: any[]) {
    try {
      await db.tabelasPrecosConfig.clear();
      await db.tabelasPrecosConfig.bulkAdd(configs);
      console.log(`✅ ${configs.length} configurações de tabelas de preços salvas no IndexedDB`);
    } catch (error) {
      console.error('❌ Erro ao salvar configurações de tabelas de preços no IndexedDB:', error);
      throw error;
    }
  }



  static async getTabelasPrecosConfig() {
    try {
      return await db.tabelasPrecosConfig.toArray();
    } catch (error) {
      console.error('❌ Erro ao buscar tabelas de preços config:', error);
      return [];
    }
  }

  static async getUsuarios(filtros?: { search?: string, status?: string }) {
    try {
      let query = db.usuarios.toCollection();

      let usuarios = await query.toArray();

      // Aplicar filtros
      if (filtros?.status) {
        usuarios = usuarios.filter(u => u.STATUS === filtros.status);
      }

      if (filtros?.search) {
        const searchLower = filtros.search.toLowerCase();
        usuarios = usuarios.filter(u =>
          u.NOME?.toLowerCase().includes(searchLower) ||
          u.EMAIL?.toLowerCase().includes(searchLower) ||
          u.FUNCAO?.toLowerCase().includes(searchLower)
        );
      }

      return usuarios;
    } catch (error) {
      console.error('❌ Erro ao buscar usuários:', error);
      return [];
    }
  }

  static async saveCampanha(campanhaData: any, itens: any[]) {
    try {
      const user = authService.getCurrentUser();
      const idEmpresa = user?.ID_EMPRESA || 0;
      const isOnline = typeof window !== 'undefined' && window.navigator.onLine;

      let idCampanhaFinal = campanhaData.ID_CAMPANHA;
      let syncWithServer = false;

      // Se estiver online, tenta salvar no Oracle primeiro
      if (isOnline) {
        try {
          console.log('🌐 Tentando salvar campanha no Oracle...');
          const response = await fetch('/api/campanhas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campanha: campanhaData, itens })
          });

          if (response.ok) {
            const result = await response.json();
            if (result.success && result.idCampanha) {
              idCampanhaFinal = result.idCampanha;
              syncWithServer = true;
              console.log('✅ Campanha sincronizada com Oracle, ID:', idCampanhaFinal);
            }
          } else {
            console.warn('⚠️ Falha ao salvar no Oracle, salvando apenas localmente:', await response.text());
          }
        } catch (srvErr) {
          console.error('❌ Erro na comunicação com API de campanhas:', srvErr);
        }
      }

      // Se não sincronizou com o servidor (ou está offline), gera um ID temporário se necessário
      if (!idCampanhaFinal) {
        idCampanhaFinal = Date.now(); // ID temporário local
      }

      const novaCampanha = {
        ...campanhaData,
        ID_CAMPANHA: Number(idCampanhaFinal),
        ID_EMPRESA: Number(idEmpresa),
        ATIVO: campanhaData.ATIVO || 'S',
        DTINICIO: campanhaData.DTINICIO || new Date().toISOString(),
      };

      await db.campanhas.put(novaCampanha);

      if (itens && itens.length > 0) {
        const itensComId = itens.map((item, index) => ({
          ...item,
          ID_ITEM: item.ID_ITEM || (Number(idCampanhaFinal) * 1000 + index),
          ID_CAMPANHA: Number(idCampanhaFinal),
          CODPROD: Number(item.CODPROD)
        }));
        await db.campanhaItens.bulkPut(itensComId);

        // Marcar produtos com a flag TEM_CAMPANHA no IndexedDB
        const idsProdutos = itens.map(i => Number(i.CODPROD));
        await db.produtos.where('CODPROD').anyOf(idsProdutos).modify({ TEM_CAMPANHA: 'S' });
      }

      console.log(`✅ Campanha ${syncWithServer ? '(Sincronizada)' : '(Local)'} salva com sucesso`);
      return idCampanhaFinal;
    } catch (error) {
      console.error('❌ Erro ao salvar campanha:', error);
      throw error;
    }
  }

  static async getCampanhas(tipo?: string) {
    try {
      const user = authService.getCurrentUser();
      const idEmpresa = user?.ID_EMPRESA || 0;

      let query = db.campanhas.where('ID_EMPRESA').equals(idEmpresa);

      if (tipo) {
        return await query.and(c => c.TIPO === tipo).toArray();
      }
      return await query.toArray();
    } catch (error) {
      console.error('❌ Erro ao buscar campanhas:', error);
      return [];
    }
  }

  static async getCampanhasPorProduto(codProd: number | string) {
    try {
      const user = authService.getCurrentUser();
      const idEmpresa = user?.ID_EMPRESA || 0;
      const codProdNum = Number(codProd);
      const codProdStr = String(codProd);

      console.log(`🔍 [Campanha] Buscando para produto ${codProd} na empresa ${idEmpresa}`);

      // Busca itens que combinem com o código (seja como número ou string no DB)
      const itensRelacionados = await db.campanhaItens
        .where('CODPROD').anyOf([codProdNum, codProdStr])
        .toArray();

      console.log(`🔍 [Campanha] Itens relacionados encontrados:`, itensRelacionados.length);

      if (itensRelacionados.length === 0) return [];

      const idsCampanhas = Array.from(new Set(itensRelacionados.map(i => i.ID_CAMPANHA)));

      const campanhas = await db.campanhas
        .where('ID_CAMPANHA').anyOf(idsCampanhas)
        .filter(c => {
          const matchAtivo = c.ATIVO === 'S';
          const matchEmpresa = Number(c.ID_EMPRESA) === Number(idEmpresa);
          return matchAtivo && matchEmpresa;
        })
        .toArray();

      console.log(`🔍 [Campanha] Campanhas ativas encontradas para a empresa:`, campanhas.length);

      // Mapeia os itens específicos para cada campanha encontrada
      return campanhas.map(c => ({
        ...c,
        itens: itensRelacionados.filter(i => i.ID_CAMPANHA === c.ID_CAMPANHA)
      }));
    } catch (error) {
      console.error('❌ Erro ao buscar campanhas por produto:', error);
      return [];
    }
  }

  static async getItensCampanha(idCampanha: number) {
    try {
      return await db.campanhaItens.where('ID_CAMPANHA').equals(idCampanha).toArray();
    } catch (error) {
      console.error('❌ Erro ao buscar itens da campanha:', error);
      return [];
    }
  }

  static async setUsuarios(usuarios: any[]) {
    try {
      await db.usuarios.clear();
      await db.usuarios.bulkAdd(usuarios.map(u => ({
        ...u,
        username: u.email || u.EMAIL,
        CODUSUARIO: u.CODUSUARIO || u.id,
        NOME: u.NOME || u.name,
        EMAIL: u.EMAIL || u.email,
        FUNCAO: u.FUNCAO || u.role,
        STATUS: u.STATUS || u.status,
        AVATAR: u.AVATAR || u.avatar,
        CODVEND: u.CODVEND || u.codVendedor
      })));
      console.log(`✅ ${usuarios.length} usuários salvos no IndexedDB`);
    } catch (error) {
      console.error('❌ Erro ao salvar usuários no IndexedDB:', error);
      throw error;
    }
  }

  static async addUsuario(usuario: any) {
    try {
      await db.usuarios.add({
        ...usuario,
        username: usuario.email || usuario.EMAIL,
        CODUSUARIO: usuario.CODUSUARIO || usuario.id,
        NOME: usuario.NOME || usuario.name,
        EMAIL: usuario.EMAIL || usuario.email,
        FUNCAO: usuario.FUNCAO || usuario.role,
        STATUS: usuario.STATUS || usuario.status,
        AVATAR: usuario.AVATAR || usuario.avatar,
        CODVEND: usuario.CODVEND || usuario.codVendedor
      });
      console.log('✅ Usuário adicionado ao IndexedDB');
    } catch (error) {
      console.error('❌ Erro ao adicionar usuário:', error);
      throw error;
    }
  }

  static async updateUsuario(usuario: any) {
    try {
      const codusuario = usuario.CODUSUARIO || usuario.id;
      await db.usuarios.update(codusuario, {
        ...usuario,
        username: usuario.email || usuario.EMAIL,
        CODUSUARIO: codusuario,
        NOME: usuario.NOME || usuario.name,
        EMAIL: usuario.EMAIL || usuario.email,
        FUNCAO: usuario.FUNCAO || usuario.role,
        STATUS: usuario.STATUS || usuario.status,
        AVATAR: usuario.AVATAR || usuario.avatar,
        CODVEND: usuario.CODVEND || usuario.codVendedor
      });
      console.log('✅ Usuário atualizado no IndexedDB');
    } catch (error) {
      console.error('❌ Erro ao atualizar usuário:', error);
      throw error;
    }
  }

  static async updateUsuarioStatus(id: number, status: string) {
    try {
      await db.usuarios.update(id, { STATUS: status });
      console.log(`✅ Status do usuário ${id} atualizado para ${status}`);
    } catch (error) {
      console.error('❌ Erro ao atualizar status do usuário:', error);
      throw error;
    }
  }

  static async deleteUsuario(id: number) {
    try {
      await db.usuarios.delete(id);
      console.log(`✅ Usuário ${id} removido do IndexedDB`);
    } catch (error) {
      console.error('❌ Erro ao deletar usuário:', error);
      throw error;
    }
  }

  // getVendedores movido para o final da classe

  static async getLastSync() {
    try {
      const meta = await db.metadados.get('lastSync');
      return meta?.valor || null;
    } catch (error) {
      console.error('❌ Erro ao buscar última sincronização:', error);
      return null;
    }
  }

  static async isDataAvailable() {
    try {
      const [produtos, parceiros] = await Promise.all([
        db.produtos.limit(1).toArray(),
        db.parceiros.limit(1).toArray()
      ]);

      return produtos.length > 0 && parceiros.length > 0;
    } catch (error) {
      return false;
    }
  }

  // ==================== NOVOS GETTERS PARA COND. COMERCIAIS (CORRIGIDOS) ====================


  static async getRotas(filtros?: { codVend?: number, search?: string }) {
    try {
      let query = db.rotas.toCollection();

      if (filtros?.codVend) {
        query = db.rotas.where('CODVEND').equals(filtros.codVend);
      }

      let rotas = await query.toArray();

      if (filtros?.search) {
        const s = filtros.search.toLowerCase();
        rotas = rotas.filter((r: any) =>
          r.DESCRICAO?.toLowerCase().includes(s) ||
          r.CODROTA?.toString().includes(s)
        );
      }

      return rotas;
    } catch (error) {
      console.error('❌ Erro ao buscar rotas:', error);
      return [];
    }
  }

  static async getEstados(search?: string) {
    try {
      let estados = await db.estados.orderBy('UF').toArray();

      if (search) {
        const s = search.toLowerCase();
        estados = estados.filter((e: any) =>
          e.UF?.toLowerCase().includes(s) ||
          e.DESCRICAO?.toLowerCase().includes(s)
        );
      }
      return estados;
    } catch (error) {
      console.error('❌ Erro ao buscar estados:', error);
      return [];
    }
  }

  static async getCidades(filtros?: { uf?: string, search?: string }) {
    try {
      let cidades = [];

      if (filtros?.uf) {
        // Verifica se é múltiplo "SP,RJ"
        if (filtros.uf.includes(',')) {
          const ufs = filtros.uf.split(',').map(s => s.trim());
          cidades = await db.cidades.where('UFNOMECID').anyOf(ufs).toArray();
        } else {
          cidades = await db.cidades.where('UFNOMECID').startsWith(filtros.uf).toArray();
        }
      } else {
        // Se não tem UF, mas tem search, busca global (cuidado com performance)
        if (filtros?.search && filtros.search.length >= 3) {
          cidades = await db.cidades
            .filter(c => c.NOMECID.toLowerCase().includes(filtros.search!.toLowerCase()))
            .limit(50)
            .toArray();
          return cidades;
        }
        // Se não tem filtro nenhum, retorna vazio ou limitado para não travar
        return await db.cidades.limit(100).toArray();
      }

      if (filtros?.search) {
        const s = filtros.search.toLowerCase();
        cidades = cidades.filter((c: any) => c.NOMECID.toLowerCase().includes(s));
      }

      return cidades;
    } catch (error) {
      console.error('❌ Erro ao buscar cidades:', error);
      return [];
    }
  }

  static async getCidade(codCid: number) {
    try {
      const resp = await db.cidades.get(Number(codCid));
      console.log(`🔍 [OfflineDataService] getCidade(${codCid}) result:`, resp);
      return resp;
    } catch (error) {
      console.error('❌ Erro ao buscar cidade:', error);
      return null;
    }
  }

  static async getBairros(filtros?: { codCid?: number | string, search?: string }) {
    try {
      let bairros = [];

      if (filtros?.codCid) {
        if (String(filtros.codCid).includes(',')) {
          const cids = String(filtros.codCid).split(',').map(c => Number(c.trim()));
          bairros = await db.bairros.where('CODCID').anyOf(cids).toArray();
        } else {
          bairros = await db.bairros.where('CODCID').equals(Number(filtros.codCid)).toArray();
        }
      } else {
        if (filtros?.search && filtros.search.length >= 3) {
          bairros = await db.bairros
            .filter(b => b.NOMEBAI.toLowerCase().includes(filtros.search!.toLowerCase()))
            .limit(50)
            .toArray();
          return bairros;
        }
        return await db.bairros.limit(100).toArray();
      }

      if (filtros?.search) {
        const s = filtros.search.toLowerCase();
        bairros = bairros.filter((b: any) => b.NOMEBAI.toLowerCase().includes(s));
      }

      return bairros;
    } catch (error) {
      console.error('❌ Erro ao buscar bairros:', error);
      return [];
    }
  }

  // getMarcas, getGruposProdutos, getEquipes movidos para o final da classe

  static async getRegioes(search: string = '') {
    let collection = db.regioes.toCollection();
    if (search) {
      const searchNormal = search.toLowerCase();
      collection = collection.filter((r) =>
        (r.NOMEREG || '').toLowerCase().includes(searchNormal)
      );
    }
    return await collection.limit(50).toArray();
  }

  static async getEquipes(search: string = '') {
    let collection = db.equipes.toCollection();
    if (search) {
      const searchNormal = search.toLowerCase();
      // Join with usuarios for NOME? Or just search whatever is in equipes
      // Assuming equipes has NOME or retrieving it. For now, simple search.
      // Usually equipes join with usuarios on CODUSUARIO_GESTOR or similar? 
      // User said: Lista: CODEQUIPE (AD_EQUIPES_MEMBROS) > NOME (AD_EQUIPES) ?? 
      // Let's assume 'equipes' table has NOME.
      collection = collection.filter((e) =>
        String(e.CODEQUIPE).includes(searchNormal) || (e.NOME || '').toLowerCase().includes(searchNormal)
      );
    }
    return await collection.limit(50).toArray();
  }

  static async getVendedores(search: string = '') {
    let collection = db.vendedores.toCollection();
    if (search) {
      const searchNormal = search.toLowerCase();
      collection = collection.filter((v) =>
        (v.APELIDO || '').toLowerCase().includes(searchNormal) ||
        String(v.CODVEND).includes(searchNormal)
      );
    }
    return await collection.toArray();
  }

  static async getClientes(search: string = '') {
    // Alias for Parceiros
    let collection = db.parceiros.toCollection();
    if (search) {
      const searchNormal = search.toLowerCase();
      collection = collection.filter((p) =>
        (p.NOMEPARC || '').toLowerCase().includes(searchNormal) ||
        String(p.CODPARC).includes(searchNormal)
      );
    }
    return await collection.limit(50).toArray();
  }

  static async getMarcas(search: string = '') {
    let collection = db.marcas.toCollection();
    if (search) {
      const searchNormal = search.toLowerCase();
      collection = collection.filter((m) =>
        (m.DESCRICAO || '').toLowerCase().includes(searchNormal)
      );
    }
    return await collection.limit(50).toArray();
  }

  static async getGruposProdutos(search: string = '') {
    let collection = db.gruposProdutos.toCollection();
    if (search) {
      const searchNormal = search.toLowerCase();
      collection = collection.filter((g) =>
        (g.DESCRGRUPOPROD || '').toLowerCase().includes(searchNormal)
      );
    }
    return await collection.limit(50).toArray();
  }

  static async getProdutosOld(search: string = '') {
    // Deprecated/Removed
    return [];
  }


  static async getEmpresas(search: string = '') {
    let collection = db.empresas.toCollection();
    if (search) {
      const searchNormal = search.toLowerCase();
      collection = collection.filter((e) =>
        (e.NOMEFANTASIA || '').toLowerCase().includes(searchNormal) ||
        String(e.CODEMP).includes(searchNormal)
      );
    }
    return await collection.limit(50).toArray();
  }

  static async getTabelasPrecos(search: string = '') {
    try {
      let collection = db.tabelasPrecos.toCollection();
      if (search) {
        const searchNormal = search.toLowerCase();
        collection = collection.filter((t: any) =>
          String(t.NUTAB).includes(searchNormal) ||
          String(t.CODTAB || '').includes(searchNormal) ||
          (t.DESCRICAO || '').toLowerCase().includes(searchNormal)
        );
      }
      return await collection.limit(50).toArray();
    } catch (error) {
      console.error('❌ Erro ao buscar tabelas de preços:', error);
      return [];
    }
  }

  static async getAcessosUsuario(codUsuario: number) {
    try {
      const acesso = await db.acessosUsuario.get(Number(codUsuario));
      return acesso || {
        CODUSUARIO: codUsuario,
        ACESSO_CLIENTES: 'VINCULADO',
        ACESSO_PRODUTOS: 'TODOS',
        ACESSO_TAREFAS: 'VINCULADO',
        ACESSO_ADMINISTRACAO: 'N',
        ACESSO_USUARIOS: 'N',
        TELA_PEDIDOS_VENDAS: 'S',
      };
    } catch (error) {
      console.error('Erro ao buscar acessos do usuário:', error);
      return null;
    }
  }

  static async getPoliticas(codEmp?: number) {
    try {
      if (codEmp) {
        // Fetch all policies then filter in-memory since CODEMP is not indexed in Dexie schema
        const todas = await db.politicasComerciais.toArray();
        // A política pode estar salva com CODEMP ou ID_EMPRESA ou precisar ser filtrada lá na engine. 
        // Para não arriscar bloquear aqui de novo, vamos retornar *todas* e o próprio `resolveBestPolicy`
        // já valida a empresa pelo `ESCOPO_EMPRESAS` ou `ID_EMPRESA`.
        return todas;
      }
      return await db.politicasComerciais.toArray();
    } catch (error) {
      console.error('Erro ao buscar políticas comerciais:', error);
      return [];
    }
  }

  // ==================== RESOLUÇÃO DE LABELS (BY IDS) ====================

  static async getEstadosByIds(ids: number[]) {
    return await db.estados.where('CODUF').anyOf(ids).toArray();
  }

  static async getCidadesByIds(ids: number[]) {
    return await db.cidades.where('CODCID').anyOf(ids).toArray();
  }

  static async getBairrosByIds(ids: number[]) {
    return await db.bairros.where('CODBAI').anyOf(ids).toArray();
  }

  static async getRotasByIds(ids: number[]) {
    return await db.rotas.where('CODROTA').anyOf(ids).toArray();
  }

  static async getRegioesByIds(ids: number[]) {
    return await db.regioes.where('CODREG').anyOf(ids).toArray();
  }

  static async getEquipesByIds(ids: number[]) {
    return await db.equipes.where('CODEQUIPE').anyOf(ids).toArray();
  }

  static async getVendedoresByIds(ids: number[]) {
    return await db.vendedores.where('CODVEND').anyOf(ids).toArray();
  }

  static async getClientesByIds(ids: number[]) {
    return await db.parceiros.where('CODPARC').anyOf(ids).toArray();
  }

  static async getMarcasByIds(ids: number[]) {
    // Marcas key is CODIGO
    return await db.marcas.where('CODIGO').anyOf(ids).toArray();
  }

  static async getGruposProdutosByIds(ids: number[]) {
    return await db.gruposProdutos.where('CODGRUPOPROD').anyOf(ids).toArray();
  }

  static async getProdutosByIds(ids: number[]) {
    return await db.produtos.where('CODPROD').anyOf(ids).toArray();
  }

  static async getTabelasPrecosByIds(ids: number[]) {
    return await db.tabelasPrecos.where('NUTAB').anyOf(ids).toArray();
  }

  static async getEmpresasByIds(ids: number[]) {
    return await db.empresas.where('CODEMP').anyOf(ids).toArray();
  }

  static async savePolitica(politica: any) {
    try {
      await db.politicasComerciais.put(politica);
      console.log(`✅ Política ${politica.ID_POLITICA} salva/atualizada no IndexedDB`);
    } catch (error) {
      console.error('❌ Erro ao salvar política no IndexedDB:', error);
      throw error;
    }
  }

  static async deletePolitica(id: number) {
    try {
      await db.politicasComerciais.delete(id);
      console.log(`✅ Política ${id} removida do IndexedDB`);
    } catch (error) {
      console.error('❌ Erro ao remover política do IndexedDB:', error);
      throw error;
    }
  }

  static async getGestorUsuarioLogado(codUsuario: number) {
    try {
      const membro = await db.equipesMembros.where('CODUSUARIO').equals(codUsuario).first();
      if (!membro) return null;
      const equipe = await db.equipes.where('CODEQUIPE').equals(membro.CODEQUIPE).first();
      if (!equipe || !equipe.CODUSUARIO_GESTOR) return null;
      return await db.usuarios.where('CODUSUARIO').equals(equipe.CODUSUARIO_GESTOR).first();
    } catch (error) {
      console.error('❌ Erro ao buscar gestor do usuário:', error);
      return null;
    }
  }

  static async getRegraIcms(idSistema: number, codEmp: number, codParc: number) {
    try {
      console.log(`🔍 [OfflineDataService] Buscando regra ICMS: Sistema=${idSistema}, Empresa=${codEmp}, Parceiro=${codParc}`);
      const regra = await db.regrasIcmsParceiroEmpresa
        .where('[ID_SISTEMA+CODEMP+CODPARC]')
        .equals([idSistema, codEmp, codParc])
        .first();
      
      if (regra) {
        console.log('✅ [OfflineDataService] Regra ICMS encontrada:', regra);
      } else {
        console.log('⚠️ [OfflineDataService] Nenhuma regra ICMS encontrada para esta combinação.');
      }
      return regra;
    } catch (error) {
      console.error('❌ Erro ao buscar regra ICMS:', error);
      return null;
    }
  }

  static async getEmpresasPorParceiro(codParc: number) {
    try {
      console.log(`🔍 [OfflineDataService] Buscando empresas vinculadas ao Parceiro=${codParc}`);
      const regras = await db.regrasIcmsParceiroEmpresa
        .where('CODPARC')
        .equals(Number(codParc))
        .toArray();
      
      // Filtra as regras removendo aquelas onde o CODTAB é null, undefined, vazio, 'null' ou '(null)'
      const regrasComCodtab = regras.filter((r: any) => {
        const codtab = r.CODTAB !== undefined ? r.CODTAB : r.codtab;
        if (!codtab) return false;
        const strVal = String(codtab).trim().toLowerCase();
        return strVal !== "" && strVal !== "null" && strVal !== "(null)" && strVal !== "0";
      });

      const codEmps = Array.from(new Set(regrasComCodtab.map((r: any) => r.CODEMP)));
      
      if (codEmps.length === 0) {
        return [];
      }
      
      const empresas = await db.empresas
        .where('CODEMP')
        .anyOf(codEmps)
        .toArray();
        
      return empresas;
    } catch (error) {
      console.error('❌ Erro ao buscar empresas vinculadas offline:', error);
      return [];
    }
  }

  static async getMelhorPreco(codProd: number, codTab: number) {
    try {
      console.log(`🔍 [getMelhorPreco] CODPROD ${codProd}, CODTAB ${codTab}`);
      // 1. Encontrar o ÚLTIMO NUTAB para a CODTAB fornecida (TGFTAB)
      // Busca resiliente a tipos (string ou numero)
      let tabelas = await db.tabelasPrecos.where('CODTAB').equals(Number(codTab)).toArray();
      if (tabelas.length === 0) {
        tabelas = await db.tabelasPrecos.where('CODTAB').equals(String(codTab)).toArray();
      }

      if (tabelas.length === 0) {
        console.warn(`⚠️ Nenhuma instância (NUTAB) encontrada para CODTAB ${codTab}`);
        return null;
      }

      // Ordenar decrescente pelo NUTAB e pegar o maior (mais recente)
      const ultimoNutab = tabelas.sort((a, b) => b.NUTAB - a.NUTAB)[0].NUTAB;
      console.log(`🔍 Último NUTAB encontrado para CODTAB ${codTab}:`, ultimoNutab);

      // 2. Buscar preço para o produto APENAS neste último NUTAB (AS_EXCECAO_PRECO)
      const preco = await db.precos
        .where('[CODPROD+NUTAB]')
        .equals([Number(codProd), Number(ultimoNutab)])
        .first();

      if (preco) {
        console.log(`✅ Preço encontrado no NUTAB ${ultimoNutab}:`, preco.VLRVENDA);
      } else {
        console.warn(`⚠️ Produto ${codProd} não possui preço definido no último NUTAB ${ultimoNutab}`);
      }

      return preco;
    } catch (error) {
      console.error('❌ Erro ao buscar melhor preço:', error);
      return null;
    }
  }

  static async getLocaisEstoque(search: string = '') {
    try {
      let collection = db.locaisEstoque.toCollection();
      if (search) {
        const searchNormal = search.toLowerCase();
        collection = collection.filter((l: any) =>
          String(l.CODLOCAL).includes(searchNormal) ||
          (l.DESCRLOCAL || '').toLowerCase().includes(searchNormal)
        );
      }
      return await collection.toArray();
    } catch (error) {
      console.error('❌ Erro ao buscar locais de estoque:', error);
      return [];
    }
  }

  static async updateTiposPedido(data: any) {
    if (data && Array.isArray(data)) {
      await db.tiposPedido.clear();
      await db.tiposPedido.bulkAdd(data);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('cached_tiposPedido', JSON.stringify(data));
      }
    }
  }

  static async getEnderecos(search: string = '') {
    try {
      let collection = db.enderecos.toCollection();
      if (search) {
        const searchNormal = search.toLowerCase();
        collection = collection.filter((e: any) =>
          String(e.CODEND).includes(searchNormal) ||
          (e.NOMEEND || '').toLowerCase().includes(searchNormal)
        );
      }
      return await collection.limit(50).toArray();
    } catch (error) {
      console.error('❌ Erro ao buscar endereços:', error);
      return [];
    }
  }

  static async getEndereco(codEnd: number | string) {
    try {
      if (!codEnd || codEnd === '0' || codEnd === 0) return null;
      return await db.enderecos.get(Number(codEnd));
    } catch (error) {
      console.error(`❌ Erro ao buscar endereço ${codEnd}:`, error);
      return null;
    }
  }
}