import axios from 'axios';
import { buscarPrecoProduto } from './produtos-service';
import { sankhyaDynamicAPI } from './sankhya-dynamic-api';
import { contratosService } from './contratos-service';

// Serviço de gerenciamento de pedidos de venda
export interface PedidoVenda {
  NUNOTA?: string
  CODEMP: string
  CODPARC: string
  CODTIPOPER: string
  DHTIPOPER?: string
  TIPMOV: string
  CODVEND: string
  CODTIPVENDA: string
  DHTIPVENDA?: string
  DTNEG: string
  DTFATUR?: string
  DTENTSAI?: string
  OBSERVACAO?: string
  VLRNOTA?: number
  CODNAT?: string
  CODCENCUS?: string
  VLRFRETE?: number
  TIPFRETE?: string
  ORDEMCARGA?: string
  CODPARCTRANSP?: string
  VLROUTROS?: number
  VLRDESCTOT?: number
  PERCDESC?: number
  // Campos do cliente
  TIPO_CLIENTE?: string
  CPF_CNPJ?: string
  IE_RG?: string
  RAZAO_SOCIAL?: string
  itens: ItemPedido[]
}

export interface ItemPedido {
  SEQUENCIA?: number
  CODPROD: string
  QTDNEG: number
  VLRUNIT: number
  VLRTOT?: number
  PERCDESC?: number
  VLRDESC?: number
  CODLOCALORIG: string
  CONTROLE?: string
  CODVOL?: string
  VLRTOTLIQ?: number
  IDALIQICMS?: string
  FATOR?: number
  DIVIDEMULTIPLIC?: string
  CODVOL_PADRAO?: string
}

// Criar Pedido de Venda usando a nova API dinâmica
export async function criarPedidoVenda(pedido: PedidoVenda & { idEmpresa: number }): Promise<any> {
  try {
    console.log("\n" + "🚀 ".repeat(40));
    console.log("INICIANDO CRIAÇÃO DE PEDIDO DE VENDA - API DINÂMICA");
    console.log(`📊 Empresa ID: ${pedido.idEmpresa}`);
    console.log("🚀 ".repeat(40));

    const { idEmpresa, ...restoPedido } = pedido;

    // Calcular valor total
    let valorTotal = 0;
    console.log("📝 ITENS BRUTOS RECEBIDOS PARA CÁLCULO DE TOTAL:");
    pedido.itens.forEach((item, idx) => {
      console.log(`   [Item ${idx + 1}] QTDNEG: ${item.QTDNEG}, VLRUNIT: ${item.VLRUNIT}, VLRTOT: ${item.VLRTOT}`);
      const vlrTotalItem = Number(item.QTDNEG) * Number(item.VLRUNIT);
      const vlrDescItem = item.PERCDESC ? (vlrTotalItem * Number(item.PERCDESC) / 100) : 0;
      valorTotal += (vlrTotalItem - vlrDescItem);
    });

    // Ajustar com frete, outros e descontos totais
    valorTotal += (pedido.VLRFRETE || 0);
    valorTotal += (pedido.VLROUTROS || 0);
    valorTotal -= (pedido.VLRDESCTOT || 0);

    // Converter data de YYYY-MM-DD para DD/MM/YYYY
    const formatarData = (dataStr: string) => {
      if (!dataStr) return "";
      const [ano, mes, dia] = dataStr.split('-');
      return `${dia}/${mes}/${ano}`;
    };

    // Obter hora atual no formato HH:mm
    const obterHoraAtual = () => {
      const agora = new Date();
      const horas = String(agora.getHours()).padStart(2, '0');
      const minutos = String(agora.getMinutes()).padStart(2, '0');
      return `${horas}:${minutos}`;
    };

    // Buscar preços dos produtos se não fornecidos
    const itensComPreco = await Promise.all(
      pedido.itens.map(async (item, index) => {
        let valorUnitario = item.VLRUNIT;

        // Se não tem preço, buscar da API
        if (!valorUnitario || valorUnitario === 0) {
          console.log(`🔍 Buscando preço do produto ${item.CODPROD}...`);
          valorUnitario = await buscarPrecoProduto(item.CODPROD);
          console.log(`💰 Preço encontrado: ${valorUnitario}`);
        }

        // Garantir que CODVOL sempre seja enviado (unidade padrão ou alternativa)
        const unidade = item.CODVOL || "UN";

        console.log(`📦 Item ${index + 1} - CODPROD: ${item.CODPROD}, CODVOL: ${unidade}`);

        return {
          "sequencia": index + 1,
          "codigoProduto": parseInt(item.CODPROD),
          "quantidade": parseFloat(item.QTDNEG.toString()),
          "controle": item.CONTROLE || "007",
          "codigoLocalEstoque": Number(item.CODLOCALORIG || 700),
          "unidade": unidade,
          "valorUnitario": parseFloat(valorUnitario.toString()),
          "FATOR": item.FATOR,
          "DIVIDEMULTIPLIC": item.DIVIDEMULTIPLIC,
          "CODVOL_PADRAO": item.CODVOL_PADRAO,
          "percdesc": item.PERCDESC || 0,
          "vlrdesc": item.VLRDESC || 0
        };
      })
    );

    // Validações antes de enviar
    if (!pedido.CODPARC) {
      throw new Error('Código do parceiro é obrigatório');
    }

    if (!pedido.CODVEND || pedido.CODVEND === '0') {
      throw new Error('Vendedor é obrigatório');
    }

    if (!pedido.CPF_CNPJ) {
      throw new Error('CPF/CNPJ do cliente é obrigatório');
    }

    if (!pedido.RAZAO_SOCIAL) {
      throw new Error('Razão Social do cliente é obrigatória');
    }

    // Capturar modelo da nota (campo obrigatório)
    console.log('\n🔍 DEBUG - Valores recebidos para modelo da nota:');
    console.log(`   - (pedido as any).MODELO_NOTA: "${(pedido as any).MODELO_NOTA}"`);
    console.log(`   - Tipo: ${typeof (pedido as any).MODELO_NOTA}`);

    // Validar que MODELO_NOTA foi fornecido
    if (!(pedido as any).MODELO_NOTA) {
      throw new Error('Modelo da Nota é obrigatório');
    }

    const modeloNota = Number((pedido as any).MODELO_NOTA);

    if (isNaN(modeloNota) || modeloNota <= 0) {
      throw new Error('Modelo da Nota inválido. Informe um número válido.');
    }

    console.log(`✅ Modelo da nota validado: ${modeloNota} (tipo: ${typeof modeloNota})`);

    const dataNegociacao = formatarData(pedido.DTNEG);
    const horaAtual = obterHoraAtual();

    // Garantir que a data não seja futura
    const hoje = new Date()
    const partesData = dataNegociacao.split('/')
    const dataDigitada = new Date(
      Number(partesData[2]),
      Number(partesData[1]) - 1,
      Number(partesData[0])
    )

    // Se a data for futura, usar a data de hoje
    const dataFinal = dataDigitada > hoje
      ? hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : dataNegociacao

    // Montar o payload simplificado conforme exemplo de sucesso do usuário (v1)
    // Empresa de DESTINO do pedido
    const codEmpDestino = pedido.CODEMP || (pedido as any).codEmp || idEmpresa;

    const dadosPedido: any = {
      codigoEmpresa: Number(codEmpDestino), 
      CODEMP: Number(codEmpDestino),        
      codEmp: Number(codEmpDestino),        
      notaModelo: modeloNota,
      data: dataFinal,
      hora: horaAtual,
      codigoVendedor: Number(pedido.CODVEND),
      CODVEND: Number(pedido.CODVEND),
      codVendedor: Number(pedido.CODVEND),
      codigoCliente: Number(pedido.CODPARC),
      CODTIPVENDA: Number(pedido.CODTIPVENDA),
      CODTAB: Number((pedido as any).CODTAB || 0),
      observacao: pedido.OBSERVACAO || "",
      valorTotal: Number(valorTotal.toFixed(2)),
        itens: itensComPreco.map((item, idx) => {
          const fator = Number((item as any).FATOR || (item as any).fator || 1);
          const regra = (item as any).DIVIDEMULTIPLIC || (item as any).dividemultiplic || 'M';
          const usarConversao = !!(item.unidade !== (item as any).CODVOL_PADRAO && (item as any).CODVOL_PADRAO);

          // Pega os valores originais que vieram do primeiro map para garantir integridade
          const qtdOriginal = Number(item.quantidade);
          const vlrUnitOriginal = Number(item.valorUnitario);

          // 1. Total original esperado pelo usuário (Calculado sobre os inputs brutos REAIS)
          const totalOriginalLinha = Number((qtdOriginal * vlrUnitOriginal).toFixed(2));
          
          // 2. Quantidade convertida
          let quantidadeBase = qtdOriginal;
          if (usarConversao) {
            quantidadeBase = regra === 'D' ? qtdOriginal / fator : qtdOriginal * fator;
          }

          // 3. Preço unitário convertido (Total / Quantidade Base)
          const valorUnitarioBase = quantidadeBase !== 0 
            ? totalOriginalLinha / quantidadeBase 
            : vlrUnitOriginal;

          console.log(`⚖️ [ITEM ${idx + 1}] LOG DE SINCRONIA:`);
          console.log(`   - Entrada Bruta: ${qtdOriginal} x R$ ${vlrUnitOriginal} = Total: R$ ${totalOriginalLinha}`);
          console.log(`   - Parâmetros: Fator ${fator}, Regra ${regra}, UsarConversão: ${usarConversao}`);
          console.log(`   - Saída Convertida: ${quantidadeBase} ${(item as any).CODVOL_PADRAO} @ R$ ${valorUnitarioBase.toFixed(4)}`);
          console.log(`   - Verificação Final: ${quantidadeBase} * ${valorUnitarioBase.toFixed(4)} = R$ ${(quantidadeBase * valorUnitarioBase).toFixed(2)}`);

          return {
            "sequencia": Number((item as any).sequencia),
            "codigoProduto": Number((item as any).codigoProduto),
            "quantidade": Number(quantidadeBase.toFixed(3)),
            "unidade": usarConversao ? (item as any).CODVOL_PADRAO : item.unidade,
            "valorUnitario": Number(valorUnitarioBase.toFixed(4)),
            "controle": (item as any).controle || "",
            "codigoLocalEstoque": Number((item as any).codigoLocalEstoque || 0),
            "percdesc": Number((item as any).percdesc || 0),
            "vlrdesc": Number((item as any).vlrdesc || 0),
            "impostos": []
          };
        })
    }

    // Na v1 NÃO SE USA requestBody, envia-se o objeto direto
    const corpoPedido = dadosPedido;

    console.log("\n" + "📤 ".repeat(40));
    console.log("CORPO DE ENVIO PARA API SANKHYA V1 - /v1/vendas/pedidos");
    console.log("📤 ".repeat(40));
    console.log(JSON.stringify(corpoPedido, null, 2));
    console.log("\n📅 DATAS:");
    console.log(`   - Data: ${dataFinal}`);
    console.log(`   - Hora: ${horaAtual}`);
    console.log("📤 ".repeat(40) + "\n")

    // Usar o endpoint v1 conforme documentação
    const endpoint = '/v1/vendas/pedidos';

    const resposta = await sankhyaDynamicAPI.fazerRequisicao(
      idEmpresa,
      endpoint,
      'POST',
      corpoPedido
    );

    console.log("\n📥 RESPOSTA COMPLETA:");
    console.log(JSON.stringify(resposta, null, 2));

    // Verificar se há erro na resposta
    if (resposta?.statusCode && resposta.statusCode >= 400) {
      console.error("\n" + "❌ ".repeat(40));
      console.error("ERRO NA RESPOSTA DA API SANKHYA");
      console.error("❌ ".repeat(40));
      console.error("\n📋 CORPO ENVIADO:");
      console.error(JSON.stringify(corpoPedido, null, 2));
      console.error("\n📥 RESPOSTA RECEBIDA:");
      console.error(JSON.stringify(resposta, null, 2));
      console.error("\n🔍 DETALHES DO ERRO:");
      console.error(`   - Status Code: ${resposta.statusCode}`);
      console.error(`   - Error Code: ${resposta.error?.code}`);
      console.error(`   - Message: ${resposta.error?.message}`);
      console.error(`   - Details: ${resposta.error?.details}`);
      console.error("❌ ".repeat(40) + "\n");

      // Criar mensagem de erro detalhada
      const errorDetails = resposta?.error?.details || resposta?.error?.message || '';
      const errorCode = resposta?.error?.code || resposta?.statusCode || '';
      const errorMessage = errorDetails
        ? `[${errorCode}] ${errorDetails}`
        : resposta?.statusMessage || 'Erro ao criar pedido';

      throw new Error(errorMessage);
    }

    if (resposta?.error) {
      console.error("\n" + "❌ ".repeat(40));
      console.error("ERRO NA RESPOSTA DA API SANKHYA");
      console.error("❌ ".repeat(40));
      console.error("\n📋 CORPO ENVIADO:");
      console.error(JSON.stringify(corpoPedido, null, 2));
      console.error("\n📥 RESPOSTA RECEBIDA:");
      console.error(JSON.stringify(resposta, null, 2));
      console.error("❌ ".repeat(40) + "\n");

      // Criar mensagem de erro detalhada
      const errorDetails = resposta.error.details || resposta.error.message || '';
      const errorCode = resposta.error.code || '';
      const errorMessage = errorDetails
        ? `[${errorCode}] ${errorDetails}`
        : 'Erro ao criar pedido';

      throw new Error(errorMessage);
    }

    // Tentar diferentes formas de extrair o NUNOTA
    console.log("\n🔍 DEBUG - Verificando estrutura da resposta:");
    console.log("- resposta:", resposta);
    console.log("- tipo de resposta:", typeof resposta);

    // Extrair NUNOTA ou ID do pedido da resposta
    let nunota =
      resposta?.responseBody?.pk?.NUNOTA || // Padrão saveRecord direto
      resposta?.retorno?.codigoPedido ||
      resposta?.codigoPedido ||
      resposta?.codigo ||
      resposta?.nunota ||
      resposta?.NUNOTA ||
      resposta?.id ||
      resposta?.data?.codigoPedido ||
      resposta?.data?.nunota ||
      resposta?.data?.NUNOTA ||
      resposta?.data?.id;

    // Se retornou transactionId, e não temos nunota, buscar o NUNOTA usando loadRecords
    if (!nunota && (resposta?.transactionId || resposta?.status === "0")) {
      console.log(`\n🔍 Pedido criado (transactionId: ${resposta?.transactionId}), buscando NUNOTA...`);
      console.log("📋 TransactionId:", resposta.transactionId);

      try {
        const credentials = await contratosService.getSankhyaCredentials(idEmpresa);
        // Aguardar 3 segundos para garantir commit da transação
        console.log("⏳ Aguardando 3 segundos para commit da transação...");
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Buscar usando loadRecords com critérios mais específicos para evitar notas antigas
        const searchEndpoint = `/gateway/v1/mge/service.sbr?serviceName=CRUDServiceProvider.loadRecords&outputType=json`;

        // Formatar data para o critério SQL
        const dataHoje = new Date().toLocaleDateString('pt-BR');

        const searchPayload = {
          serviceName: "CRUDServiceProvider.loadRecords",
          requestBody: {
            dataSet: {
              rootEntity: "CabecalhoNota",
              includePresentationFields: "N",
              offsetPage: "0",
              entity: {
                fieldset: {
                  list: "NUNOTA,DTNEG,CODPARC,VLRNOTA"
                }
              },
              criteria: {
                expression: {
                  $: `this.CODPARC = ${pedido.CODPARC} AND this.CODVEND = ${pedido.CODVEND} AND this.DTNEG = TO_DATE('${dataHoje}', 'DD/MM/YYYY') AND this.NUNOTA = (SELECT MAX(NUNOTA) FROM TGFCAB WHERE CODPARC = ${pedido.CODPARC} AND CODVEND = ${pedido.CODVEND} AND DTNEG = TO_DATE('${dataHoje}', 'DD/MM/YYYY'))`
                }
              }
            }
          }
        };

        console.log(`\n📤 Payload de busca MAX(NUNOTA) (${credentials.authType}):`);
        console.log(JSON.stringify(searchPayload, null, 2));

        const searchResponse = await sankhyaDynamicAPI.fazerRequisicao(
          idEmpresa,
          searchEndpoint,
          'POST',
          searchPayload
        );

        console.log("\n📥 Resposta da busca MAX(NUNOTA):");
        console.log(JSON.stringify(searchResponse, null, 2));

        // Processar resposta
        const entities = searchResponse?.responseBody?.entities;
        const total = parseInt(entities?.total || '0');

        console.log(`\n📊 Total de pedidos encontrados: ${total}`);

        if (entities && total > 0 && entities.entity) {
          const fieldNames = entities.metadata?.fields?.field?.map((f: any) => f.name) || [];
          const entityArray = Array.isArray(entities.entity) ? entities.entity : [entities.entity];

          console.log(`📋 Campos disponíveis:`, fieldNames);
          console.log(`📦 Total de registros retornados:`, entityArray.length);

          if (entityArray.length > 0 && entityArray[0]) {
            const pedidoCriado = entityArray[0];

            console.log(`🔍 Último pedido encontrado:`, JSON.stringify(pedidoCriado, null, 2));

            // Buscar NUNOTA no índice correto
            const nunotaIndex = fieldNames.indexOf('NUNOTA');
            if (nunotaIndex >= 0) {
              const fieldKey = `f${nunotaIndex}`;
              if (pedidoCriado[fieldKey]) {
                nunota = pedidoCriado[fieldKey].$;
                console.log(`\n✅ NUNOTA encontrado no índice ${nunotaIndex}: ${nunota}`);
              } else {
                console.warn(`⚠️ Campo ${fieldKey} não encontrado no registro`);
              }
            } else {
              console.warn(`⚠️ Campo NUNOTA não encontrado nos metadados`);
            }
          }
        } else {
          console.warn(`⚠️ Nenhum pedido encontrado com os critérios`);
          console.warn(`⚠️ Critério usado: MAX(NUNOTA) WHERE CODPARC=${pedido.CODPARC}`);
        }
      } catch (queryError: any) {
        console.error("\n⚠️ Erro ao buscar NUNOTA:", queryError.message);
        console.error("Stack:", queryError.stack);
        if (queryError.response?.data) {
          console.error("Resposta de erro:", JSON.stringify(queryError.response.data, null, 2));
        }
        console.warn("⚠️ O pedido foi criado, mas não conseguimos recuperar o número");
        // Não falhar - o pedido foi criado
      }
    }

    console.log("\n🔍 NUNOTA/ID EXTRAÍDO:", nunota);

    if (!nunota) {
      console.error("\n❌ ESTRUTURA COMPLETA DA RESPOSTA:");
      console.error(JSON.stringify(resposta, null, 2));
    }

    console.log("\n" + "✅ ".repeat(40));
    console.log(`PEDIDO CRIADO COM SUCESSO! ${nunota ? `NUNOTA: ${nunota}` : 'ID não identificado'}`);
    console.log("✅ ".repeat(40) + "\n");

    return {
      success: true,
      nunota: nunota,
      message: "Pedido criado com sucesso",
      resposta: resposta
    };
  } catch (erro: any) {
    console.error("\n" + "❌ ".repeat(40));
    console.error("ERRO AO CRIAR PEDIDO DE VENDA");
    console.error("Mensagem:", erro.message);
    console.error("❌ ESTRUTURA COMPLETA DA RESPOSTA:");
    console.error(JSON.stringify(erro.response?.data || erro, null, 2));
    console.error("❌ ".repeat(40) + "\n");

    // Criar um erro com informações detalhadas
    const errorData = erro.response?.data;

    // Criar mensagem de erro estruturada com todos os detalhes
    const errorMessage = errorData?.error?.details
      ? `${errorData.error.message || 'Erro'}\n\nDetalhes: ${errorData.error.details}`
      : errorData?.error?.message || errorData?.statusMessage || erro.message || 'Erro desconhecido ao criar pedido';

    const detailedError = new Error(errorMessage);
    (detailedError as any).response = erro.response;
    (detailedError as any).errorData = errorData; // Guardar dados completos do erro

    throw detailedError;
  }
}

// Função para buscar imagens de produtos usando sankhyaDynamicAPI
export async function buscarImagensProdutos(codProd: string, idEmpresa: number): Promise<any> {
  try {
    console.log("\n" + "🔍 ".repeat(40));
    console.log(`BUSCANDO IMAGENS DO PRODUTO ${codProd} - EMPRESA ${idEmpresa}`);
    console.log("🔍 ".repeat(40));

    const endpoint = `/api/sankhya/produtos/imagem?codProd=${codProd}`;

    const resposta = await sankhyaDynamicAPI.fazerRequisicao(
      idEmpresa,
      endpoint,
      'GET'
    );

    console.log("\n📥 RESPOSTA COMPLETA DA BUSCA DE IMAGEM:");
    console.log(JSON.stringify(resposta, null, 2));

    if (resposta?.statusCode && resposta.statusCode >= 400) {
      console.error("\n" + "❌ ".repeat(40));
      console.error("ERRO NA RESPOSTA DA API SANKHYA (BUSCA DE IMAGEM)");
      console.error("❌ ".repeat(40));
      console.error("\n🔍 DETALHES DO ERRO:");
      console.error(`   - Status Code: ${resposta.statusCode}`);
      console.error(`   - Error Code: ${resposta.error?.code}`);
      console.error(`   - Message: ${resposta.error?.message}`);
      console.error(`   - Details: ${resposta.error?.details}`);
      console.error("❌ ".repeat(40) + "\n");

      const errorDetails = resposta?.error?.details || resposta?.error?.message || '';
      const errorCode = resposta?.error?.code || resposta?.statusCode || '';
      const errorMessage = errorDetails
        ? `[${errorCode}] ${errorDetails}`
        : resposta?.statusMessage || 'Erro ao buscar imagem do produto';

      throw new Error(errorMessage);
    }

    console.log("\n" + "✅ ".repeat(40));
    console.log(`IMAGEM DO PRODUTO ${codProd} BUSCADA COM SUCESSO!`);
    console.log("✅ ".repeat(40) + "\n");

    return resposta;

  } catch (erro: any) {
    console.error("\n" + "❌ ".repeat(40));
    console.error("ERRO AO BUSCAR IMAGEM DO PRODUTO");
    console.error("Mensagem:", erro.message);
    console.error("❌ ESTRUTURA COMPLETA DA RESPOSTA:");
    console.error(JSON.stringify(erro.response?.data || erro, null, 2));
    console.error("❌ ".repeat(40) + "\n");

    const errorData = erro.response?.data;
    const errorMessage = errorData?.error?.details
      ? `${errorData.error.message || 'Erro'}\n\nDetalhes: ${errorData.error.details}`
      : errorData?.error?.message || errorData?.statusMessage || erro.message || 'Erro desconhecido ao buscar imagem do produto';

    const detailedError = new Error(errorMessage);
    (detailedError as any).response = erro.response;
    (detailedError as any).errorData = errorData;

    throw detailedError;
  }
}