
import { oracleService } from './oracle-db';
import { sankhyaGateway } from './sankhya-gateway-service';
import { pedidosFDVService } from './pedidos-fdv-service';
import { buscarProdutosPorCodigos } from './produtos-service';

export type StatusPortal = 
  | 'AGUARDANDO_APROVACAO' 
  | 'INTEGRADO' 
  | 'MONTANDO_CARGA' 
  | 'EM_FATURAMENTO' 
  | 'FATURADO' 
  | 'ERRO_INTEGRACAO';

export interface NotaFaturamento {
  nunota: number;
  numnota: number;
  dtneg: string;
  vlrnota: number;
}

export interface StatusPedidoDetalhado {
  idPedidoFdv: number;
  nunota?: number;
  status: StatusPortal;
  percentualFaturado: number;
  modeloFaturamento?: 'ALTERNATIVA' | 'PADRAO'; // Unidade usada no pedido
  itensResumo: {
    codProd: number;
    descrProd?: string;
    qtdPedida: number;      // Quantidade efetiva enviada ao Sankhya
    qtdOriginal?: number;   // Quantidade original digitada pelo vendedor
    qtdFaturada: number;
    unidade?: string;       // Unidade efetiva enviada ao Sankhya
    unidadeOriginal?: string; // Unidade digitada pelo vendedor
    unidadeFaturada?: string; // Unidade da nota fiscal
    unitMismatch?: boolean;
    isPesoVariavel?: boolean;
    registrarPeso?: string;
  }[];
  notasFaturamento?: NotaFaturamento[];
  detalhesERP?: any;
  temCorte?: boolean;
  temPesoVariavel?: boolean;
  ultimaAtualizacao?: string;
}

const CACHE_TTL_MINUTES = 10;

export class PedidosPortalService {
  
  /**
   * Obtém o status em tempo real de um pedido FDV consultando o Oracle e o Sankhya (Sem Cache)
   */
  static async obterStatusEmTempoReal(idEmpresa: number, idPedidoFdv: number, _forceRefresh = false): Promise<StatusPedidoDetalhado> {
    const resultado = await this.calcularStatusEmTempoReal(idEmpresa, idPedidoFdv);
    return { ...resultado, ultimaAtualizacao: new Date().toISOString() };
  }

  private static async calcularStatusEmTempoReal(idEmpresa: number, idPedidoFdv: number): Promise<StatusPedidoDetalhado> {
    // 1. Buscar dados básicos do pedido no Oracle FDV
    console.log(`🚀 [PortalService] Iniciando rastreio para Pedido FDV: ${idPedidoFdv} (Empresa: ${idEmpresa})`);
    const pedidoFdv = await pedidosFDVService.buscarPorId(idPedidoFdv);
    if (!pedidoFdv) {
      console.log(`❌ [PortalService] Pedido FDV ${idPedidoFdv} não encontrado no banco local.`);
      throw new Error('Pedido FDV não encontrado');
    }

    // Status 1: Aguardando Aprovação (Se o status no FDV for PENDENTE)
    if (pedidoFdv.STATUS === 'PENDENTE') {
      return this.formatarResultado(idPedidoFdv, 'AGUARDANDO_APROVACAO', 0, []);
    }

    // Se houver erro de integração no FDV
    if (pedidoFdv.STATUS === 'ERRO') {
      return this.formatarResultado(idPedidoFdv, 'ERRO_INTEGRACAO', 0, [], { erro: pedidoFdv.ERRO });
    }

    const nunota = pedidoFdv.NUNOTA;

    // Se não tem NUNOTA e não está pendente, algo está errado ou ainda não sincronizou
    if (!nunota) {
      return this.formatarResultado(idPedidoFdv, 'INTEGRADO', 0, []); // Ou status de transição
    }

    console.log(`🔗 [PortalService] Consultando CabecalhoNota (TGFCAB) para NUNOTA: ${nunota}`);
    const cabResult = await sankhyaGateway.loadRecords(
      idEmpresa,
      'CabecalhoNota',
      ['NUNOTA', 'ORDEMCARGA', 'PENDENTE', 'STATUSNOTA'],
      `NUNOTA = ${nunota}`
    );

    console.log(`📊 [PortalService] Resultado TGFCAB:`, JSON.stringify(cabResult, null, 2));

    if (cabResult.count === 0) {
      console.log(`⚠️ [PortalService] NUNOTA ${nunota} não encontrada no Sankhya.`);
      return this.formatarResultado(idPedidoFdv, 'INTEGRADO', 0, [], { msg: 'NUNOTA não encontrada no ERP' });
    }

    const cab = cabResult.data[0];

    // 4 & 5: Lógica de Faturamento (Variações e Itens)
    // 4.1. Buscar itens do pedido original e agrupar por CODPROD
    const itensPedidoRaw = pedidoFdv.CORPO_JSON.itens || [];
    // Detectar modelo de faturamento usado no pedido
    const fatUnidadeAlternativa = pedidoFdv.CORPO_JSON.fatUnidadeAlternativa === true ||
                                   pedidoFdv.CORPO_JSON.cabecalho?.fatUnidadeAlternativa === true;
    console.log(`📦 [PortalService] Itens originais do pedido FDV (${itensPedidoRaw.length}), fatUnidadeAlternativa=${fatUnidadeAlternativa}`);

    // Agrupar por CODPROD considerando a conversão de unidade aplicada no envio
    // qtdEfetiva = quantidade que foi efetivamente enviada ao Sankhya
    // unidEfetiva = unidade na qual o Sankhya recebeu o pedido
    const pedidoAgrupado: Record<number, { qtdEfetiva: number; unidEfetiva: string; qtdOriginal: number; unidOriginal: string }> = {};
    
    itensPedidoRaw.forEach((it: any) => {
      const cod = Number(it.CODPROD || it.codProd || it.codigo || it.ID_PRODUTO);
      const qtdOriginal = Number(it.QTDNEG || it.quantidade || 0);
      const codvol = it.CODVOL || it.codvol || it.UNIDADE || it.unidade || 'UN';
      const codvolPadrao = it.CODVOL_PADRAO || it.codvol_padrao || codvol;
      const fator = Number(it.FATOR || it.fator || 1);
      const regra = it.DIVIDEMULTIPLIC || it.dividemultiplic || 'M';

      let qtdEfetiva: number;
      let unidEfetiva: string;

      if (fatUnidadeAlternativa) {
        // Se faturar por unidade alternativa, Sankhya recebeu exatamente o que o vendedor digitou
        qtdEfetiva = qtdOriginal;
        unidEfetiva = codvol;
      } else {
        // Se faturar por unidade padrão, foi aplicada conversão antes do envio ao Sankhya
        qtdEfetiva = regra === 'D' ? qtdOriginal / fator : qtdOriginal * fator;
        unidEfetiva = codvolPadrao;
      }

      if (!pedidoAgrupado[cod]) {
        pedidoAgrupado[cod] = { qtdEfetiva: 0, unidEfetiva, qtdOriginal: 0, unidOriginal: codvol };
      }
      pedidoAgrupado[cod].qtdEfetiva += qtdEfetiva;
      pedidoAgrupado[cod].qtdOriginal += qtdOriginal;
    });

    if (itensPedidoRaw.length > 0) {
      console.log(`🔍 [PortalService] Estrutura do primeiro item:`, JSON.stringify(itensPedidoRaw[0], null, 2));
    }

    console.log(`🔢 [PortalService] Pedido agrupado por CODPROD (com conversão):`, JSON.stringify(pedidoAgrupado, null, 2));
    
    // 4. Buscar faturamento via TGFVAR -> TGFITE (Lógica oficial Sankhya)
    
    // 4.1. Buscar vínculos na TGFVAR (CompraVendavariosPedido)
    console.log(`🔍 [PortalService] Buscando notas vinculadas na TGFVAR para pedido: ${nunota}`);
    const varResult = await sankhyaGateway.loadRecords(
      idEmpresa,
      'CompraVendavariosPedido',
      ['NUNOTA', 'NUNOTAORIG'],
      `NUNOTAORIG = ${nunota}`
    );

    const nunotasFaturamentoIds = varResult.count > 0 
      ? Array.from(new Set(varResult.data.map(v => Number(v.NUNOTA))))
      : [];

    const faturadoPorProd: Record<string, any> = {};
    const notasFaturamento: NotaFaturamento[] = [];

    if (nunotasFaturamentoIds.length > 0) {
      console.log(`📑 [PortalService] Notas encontradas (${nunotasFaturamentoIds.length}): ${nunotasFaturamentoIds.join(', ')}`);
      
      // 4.2. Buscar itens faturados na TGFITE usando os NUNOTAs das notas encontradas
      const iteResult = await sankhyaGateway.loadRecords(
        idEmpresa,
        'ItemNota',
        ['NUNOTA', 'CODPROD', 'QTDNEG', 'CODVOL'],
        `NUNOTA IN (${nunotasFaturamentoIds.join(',')})`
      );

      iteResult.data.forEach(ite => {
        const cod = Number(ite.CODPROD);
        faturadoPorProd[cod] = (faturadoPorProd[cod] || 0) + Number(ite.QTDNEG);
        
        // Guardar a unidade FATURADA da nota (CODVOL da TGFITE)
        if (ite.CODVOL) {
          // Pode haver múltiplas notas: mantemos a última observada (todas devem ser iguais p/ mesmo produto)
          faturadoPorProd[`UNIT_FAT_${cod}`] = ite.CODVOL;
        }
      });

      // 4.3. Buscar detalhes do cabeçalho das notas (NUMNOTA, VLRNOTA, DTNEG)
      console.log(`📑 [PortalService] Buscando cabeçalhos das notas de faturamento: ${nunotasFaturamentoIds.join(', ')}`);
      const cabFatResult = await sankhyaGateway.loadRecords(
        idEmpresa,
        'CabecalhoNota',
        ['NUNOTA', 'NUMNOTA', 'DTNEG', 'VLRNOTA'],
        `NUNOTA IN (${nunotasFaturamentoIds.join(',')})`
      );

      cabFatResult.data.forEach(cabFat => {
        notasFaturamento.push({
          nunota: Number(cabFat.NUNOTA),
          numnota: Number(cabFat.NUMNOTA),
          dtneg: String(cabFat.DTNEG),
          vlrnota: Number(cabFat.VLRNOTA)
        });
      });
    } else {
      console.log(`ℹ️ [PortalService] Nenhuma nota de faturamento encontrada na TGFVAR.`);
    }
    
    console.log(`📉 [PortalService] Acumulado faturado por CODPROD:`, faturadoPorProd);
    
    // Caso iteResult não tenha sido criado (zero notas), criamos um objeto fake para o log de status não quebrar
    const iteResultCount = nunotasFaturamentoIds.length > 0 ? 1 : 0; 

    // Buscar nomes e unidades reais dos produtos no Oracle (AS_PRODUTOS)
    const codigosProdutos = Object.keys(pedidoAgrupado).map(Number);
    const produtosInfo = await buscarProdutosPorCodigos(codigosProdutos);
    const produtosMap: Record<number, any> = {};
    produtosInfo.forEach(p => {
      produtosMap[Number(p.CODPROD)] = p;
    });

    // Criar resumo comparativo por CODPROD
    let algumCorteReal = false;
    let algumaVariacaoPeso = false;

    // Buscar informações de peso variável diretamente no Sankhya (TGFPRO)
    console.log(`🔍 [PortalService] Consultando REGISTRARPESO para produtos na TGFPRO`);
    const prodSankhya = await sankhyaGateway.loadRecords(
      idEmpresa,
      'Produto',
      ['CODPROD', 'REGISTRARPESO'],
      `CODPROD IN (${codigosProdutos.join(',')})`
    );
    
    // Criar mapa de códigos de peso variável (M, A, AM)
    const mapPesoVariavel = new Map<number, string>();
    prodSankhya.data.forEach(p => {
      if (['M', 'A', 'AM'].includes(p.REGISTRARPESO)) {
        mapPesoVariavel.set(Number(p.CODPROD), p.REGISTRARPESO);
      }
    });

    const resumoItens = Object.keys(pedidoAgrupado).map(codStr => {
      const codProd = Number(codStr);
      const { qtdEfetiva, unidEfetiva, qtdOriginal, unidOriginal } = pedidoAgrupado[codProd];
      const qtdPedida = qtdEfetiva; // Compara com o que foi efetivamente enviado
      const qtdFaturada = faturadoPorProd[codProd] || 0;
      
      const itemOrig = itensPedidoRaw.find((it: any) => {
        const cod = it.CODPROD || it.codProd || it.codprod || it.codigo || it.ID_PRODUTO;
        return Number(cod) === codProd;
      });

      const infoOracle = produtosMap[codProd];

      const descrProd = infoOracle?.DESCRPROD || 
                        itemOrig?.DESCRPROD || 
                        itemOrig?.descrProd || 
                        itemOrig?.descrprod || 
                        itemOrig?.NOMEPROD || 
                        itemOrig?.nomeProd || 
                        itemOrig?.DESCPROD || 
                        itemOrig?.descProd || 
                        itemOrig?.DESCRICAO || 
                        itemOrig?.descricao || 
                        itemOrig?.NOME || 
                        itemOrig?.nome || 
                        itemOrig?.PRODUTO || 
                        'Produto não identificado';

      // Unidade do PEDIDO (a unidade efetiva que foi enviada pro Sankhya)
      const unidadePedido = unidEfetiva || infoOracle?.UNIDADE || 'UN';

      // Unidade FATURADA (CODVOL da TGFITE - pode ser diferente se faturado em outra embalagem)
      const unidadeFaturada = faturadoPorProd[`UNIT_FAT_${codProd}`] || unidadePedido;

      // Detectar divergência de unidade (comparando o que enviamos pro Sankhya com o que foi faturado)
      const unitMismatch = !!unidadeFaturada && !!unidadePedido &&
                           unidadeFaturada.toUpperCase() !== unidadePedido.toUpperCase();

      if (descrProd === 'Produto não identificado' && itemOrig) {
        console.warn(`⚠️ [PortalService] Falha ao extrair nome do produto. Campos disponíveis:`, Object.keys(itemOrig));
      }

      if (unitMismatch) {
        console.log(`⚠️ [PortalService] Unidade divergente para CODPROD ${codProd}: pedido='${unidadePedido}' faturado='${unidadeFaturada}'. Ignorando como corte.`);
      }

      const registrarPeso = mapPesoVariavel.get(codProd);
      const isPesoVariavel = !!registrarPeso;
      // Só considera corte se: há diferença E as unidades são iguais E não é peso variável
      const temDiferenca = qtdFaturada < (qtdPedida * 0.999);

      if (temDiferenca && !unitMismatch) {
        if (isPesoVariavel) {
          algumaVariacaoPeso = true;
        } else {
          algumCorteReal = true;
        }
      }

      return { 
        codProd, 
        descrProd, 
        unidadeOriginal: String(unidOriginal),
        qtdOriginal,
        unidade: String(unidadePedido), 
        unidadeFaturada: String(unidadeFaturada), 
        unitMismatch, 
        qtdPedida, 
        qtdFaturada, 
        isPesoVariavel, 
        registrarPeso 
      };
    });

    // Calcular progresso real baseado em quantidades globais
    // Itens com divergência de unidade (unitMismatch): se tem qtdFaturada > 0, conta como 100% daquele item
    let totalQtdPedida = 0;
    let totalQtdFaturada = 0;
    resumoItens.forEach(item => {
      totalQtdPedida += item.qtdPedida;
      // Se há mismatch de unidade e foi faturado algo, considera como atendido
      totalQtdFaturada += item.unitMismatch && item.qtdFaturada > 0 ? item.qtdPedida : item.qtdFaturada;
    });

    const percentualFaturadoReal = totalQtdPedida > 0 ? (totalQtdFaturada / totalQtdPedida) * 100 : 0;

    // Se o pedido está marcado como faturado no cabeçalho, garantimos 100%
    const isTotalmenteFaturadoSankhya = cab.PENDENTE === 'N';

    const temCorte = isTotalmenteFaturadoSankhya && algumCorteReal && percentualFaturadoReal < 99.9;
    const temPesoVariavel = isTotalmenteFaturadoSankhya && algumaVariacaoPeso && percentualFaturadoReal < 99.9;

    // Prioridade de status em ordem decrescente de evolução:
    // 1. FATURADO (Se Sankhya disse PENDENTE='N' OU o depara deu 100%)
    // 2. EM_FATURAMENTO (Se houver algum item faturado ou variação encontrada)
    // 3. MONTANDO_CARGA (Se houver ordem de carga)
    // 4. INTEGRADO (Se nada acima aconteceu)
    
    let statusFinal: StatusPortal = 'INTEGRADO';
    let percentualFinal = percentualFaturadoReal;

    if (isTotalmenteFaturadoSankhya || percentualFaturadoReal >= 100) {
      statusFinal = 'FATURADO';
      // Ajuste: mesmo que no ERP esteja como faturado (finalizado),
      // se houver corte real, mostramos o percentual real e não forçamos 100%
      percentualFinal = (temCorte || temPesoVariavel) ? percentualFaturadoReal : 100;
    } else if (percentualFaturadoReal > 0 || nunotasFaturamentoIds.length > 0) {
      statusFinal = 'EM_FATURAMENTO';
    } else if (cab.ORDEMCARGA) {
      statusFinal = 'MONTANDO_CARGA';
    }

    const resultadoFinal = this.formatarResultado(
      idPedidoFdv, statusFinal, percentualFinal, resumoItens, cab, nunota, notasFaturamento, temCorte, temPesoVariavel,
      fatUnidadeAlternativa ? 'ALTERNATIVA' : 'PADRAO'
    );
    console.log(`🏁 [PortalService] Resumo Final para ID ${idPedidoFdv}:`, JSON.stringify(resultadoFinal, null, 2));

    return resultadoFinal;
  }

  private static formatarResultado(
    idPedidoFdv: number, 
    status: StatusPortal, 
    percentual: number, 
    itens: any[], 
    detalhes?: any,
    nunota?: number,
    notasFaturamento?: NotaFaturamento[],
    temCorte?: boolean,
    temPesoVariavel?: boolean,
    modeloFaturamento?: 'ALTERNATIVA' | 'PADRAO'
  ): StatusPedidoDetalhado {
    return {
      idPedidoFdv,
      nunota,
      status,
      percentualFaturado: Math.round(percentual),
      modeloFaturamento,
      itensResumo: itens,
      notasFaturamento,
      detalhesERP: detalhes,
      temCorte,
      temPesoVariavel
    };
  }
}
