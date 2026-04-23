"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Trash2, Search, Plus, Package, MapPin } from "lucide-react"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ProdutoSelectorModal } from "@/components/produto-selector-modal"
import { QuantidadeProdutoModal } from "@/components/quantidade-produto-modal"
import VendedorSelectorModal from "@/components/vendedor-selector-modal"
import { PedidoSyncService } from "@/lib/pedido-sync"
import { OfflineDataService } from '@/lib/offline-data-service'
import { db } from "@/lib/client-db"
import { ConfiguracaoProdutoModal, ConfiguracaoProduto, UnidadeVolume } from "@/components/configuracao-produto-modal"
import { ApproverSelectionModal } from "@/components/approver-selection-modal"
import { validatePolicyViolations } from "@/lib/policy-engine"
import { PoliticaComercial } from "@/lib/politicas-comerciais-service"

interface PedidoVendaFormProps {
  onSuccess?: () => void
  onCancel?: () => void
}

export default function PedidoVendaForm({ onSuccess, onCancel }: PedidoVendaFormProps) {
  const [pedido, setPedido] = useState({
    CODEMP: "1",
    CODCENCUS: "0",
    NUNOTA: "",
    MODELO_NOTA: "",
    DTNEG: new Date().toISOString().split('T')[0],
    DTFATUR: "",
    DTENTSAI: "",
    CODPARC: "",
    CODTIPOPER: "974",
    TIPMOV: "P",
    CODTIPVENDA: "0",
    CODTAB: "0",
    CODVEND: "0",
    OBSERVACAO: "",
    VLOUTROS: 0,
    VLRDESCTOT: 0,
    VLRFRETE: 0,
    TIPFRETE: "S",
    ORDEMCARGA: "",
    CODPARCTRANSP: "0",
    PERCDESC: 0,
    CODNAT: "0",
    TIPO_CLIENTE: "PJ",
    CPF_CNPJ: "",
    IE_RG: "",
    RAZAO_SOCIAL: "",
    RAZAOSOCIAL: "",
    // Dados de Endereço para exibição
    ENDERECO: "",
    NOMEBAI: "",
    NOMECID: "",
    UF: "",
    CEP: "",
  })

  const [itens, setItens] = useState<any[]>([])
  const [isAdminUser, setIsAdminUser] = useState(false)
  const [showProdutoModal, setShowProdutoModal] = useState(false)
  const [showEstoqueModal, setShowEstoqueModal] = useState(false)
  const [produtoEstoqueSelecionado, setProdutoEstoqueSelecionado] = useState<any>(null)

  // Approval Flow State
  const [showApproverModal, setShowApproverModal] = useState(false)
  const [violations, setViolations] = useState<string[]>([])
  const [pendingOrderPayload, setPendingOrderPayload] = useState<any>(null)

  const [showVendedorModal, setShowVendedorModal] = useState(false)
  const [vendedores, setVendedores] = useState<any[]>([])
  const [parceiros, setParceiros] = useState<any[]>([])
  const [showParceiroModal, setShowParceiroModal] = useState(false)
  const [searchParceiro, setSearchParceiro] = useState("")
  const [tiposOperacao, setTiposOperacao] = useState<any[]>([])
  const [loadingTiposOperacao, setLoadingTiposOperacao] = useState(false)
  const [tiposNegociacao, setTiposNegociacao] = useState<any[]>([])
  const [loadingTiposNegociacao, setLoadingTiposNegociacao] = useState(false)
  const [tabelasPrecos, setTabelasPrecos] = useState<any[]>([])
  const [loadingTabelasPrecos, setLoadingTabelasPrecos] = useState(false)

  const [isOffline, setIsOffline] = useState(false);
  const [empresas, setEmpresas] = useState<any[]>([])
  const [todasEmpresas, setTodasEmpresas] = useState<any[]>([])
  const [loadingEmpresas, setLoadingEmpresas] = useState(false)
  const [preferenciaEmpresaAtiva, setPreferenciaEmpresaAtiva] = useState(false)
  const [preferenciaTipoNegociacaoAtiva, setPreferenciaTipoNegociacaoAtiva] = useState(false)

  useEffect(() => {
    const initializeData = async () => {
      const offline = await OfflineDataService.isDataAvailable();
      setIsOffline(offline);

      if (offline) {
        console.log("Sistema offline: Carregando dados do serviço offline.");
        await carregarDadosOffline();
      } else {
        console.log("Sistema online: Carregando dados da API.");
        carregarVendedorUsuario();
        carregarEmpresas();
        carregarTiposOperacao(); // Adicionado
        carregarTiposNegociacao();
        verificarPermissaoAdmin();
        carregarTabelasPrecos();
      }
    };
    initializeData();

    // Verificação de Políticas Comerciais - Preferência de Empresa e de Negociação
    const verificarPreferencias = async () => {
      try {
        // SEMPRE buscar do IndexedDB para garantir consistência com a sincronização
        const politicas = await OfflineDataService.getPoliticas();
        const temPrefEmpresa = politicas.some((p: any) => p.ATIVO === 'S' && p.PREF_PARCEIRO_EMPRESA === 'S');
        const temPrefTipo = politicas.some((p: any) => p.ATIVO === 'S' && p.PREF_TIPO_NEGOCIACAO === 'S');
        
        setPreferenciaEmpresaAtiva(temPrefEmpresa);
        setPreferenciaTipoNegociacaoAtiva(temPrefTipo);
        
        if (temPrefEmpresa || temPrefTipo) {
          console.log('✅ Preferências detectadas via IndexedDB:', { temPrefEmpresa, temPrefTipo });
        }
      } catch (err) {
        console.error('Erro ao verificar preferências da política no IndexedDB', err);
      }
    };
    
    // Check inicial
    verificarPreferencias();
  }, []);

  // Helpers de Faturamento e Conversão
  const getPrecoExibicaoValor = (item: any) => {
    return Number(item.VLRUNIT) || 0;
  };

  const getQuantidadeExibicaoValor = (item: any) => {
    const qtd = Number(item.QTDNEG) || 0;
    return qtd;
  };

  const getQuantidadeExibicao = (item: any) => {
    const unit = item.CODVOL || 'UN';
    return `${Number(item.QTDNEG.toFixed(3))} ${unit}`;
  };

  const [itemEditando, setItemEditando] = useState<any>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [unidadesEdit, setUnidadesEdit] = useState<UnidadeVolume[]>([])
  const [configEditInicial, setConfigEditInicial] = useState<Partial<ConfiguracaoProduto>>({
    quantidade: 1,
    desconto: 0,
    preco: 0,
    unidade: 'UN'
  })

  const abrirEdicaoItem = async (item: any, index: number) => {
    try {
      const volumes = await OfflineDataService.getVolumes(item.CODPROD)
      const unidades: UnidadeVolume[] = [
        {
          CODVOL: item.CODVOL_PADRAO || item.UNIDADE || 'UN',
          DESCRICAO: `${item.CODVOL_PADRAO || item.UNIDADE || 'UN'} - Padrão`,
          QUANTIDADE: 1,
          isPadrao: true
        },
        ...volumes.filter((v: any) => v.ATIVO === 'S' && v.CODVOL !== (item.CODVOL_PADRAO || 'UN')).map((v: any) => ({
          CODVOL: v.CODVOL,
          DESCRICAO: v.DESCRDANFE || v.CODVOL,
          QUANTIDADE: v.QUANTIDADE || 1,
          DIVIDEMULTIPLICA: v.DIVIDEMULTIPLICA || 'M',
          isPadrao: false
        }))
      ]

      setUnidadesEdit(unidades)
      setItemEditando({ ...item, index, preco: item.AD_VLRUNIT || item.VLRUNIT })
      setConfigEditInicial({
        quantidade: item.QTDNEG,
        desconto: item.PERCDESC || 0,
        acrescimo: (item.VLRUNIT > (item.AD_VLRUNIT || item.preco))
          ? Number((((item.VLRUNIT - (item.AD_VLRUNIT || item.preco)) / (item.AD_VLRUNIT || item.preco)) * 100).toFixed(2))
          : 0,
        preco: item.VLRUNIT,
        unidade: item.CODVOL || item.UNIDADE || 'UN',
        precoBase: item.AD_VLRUNIT || item.preco || item.VLRUNIT
      })
      setShowEditModal(true)
    } catch (error) {
      console.error('Erro ao abrir edição:', error)
      toast.error('Erro ao carregar dados do item')
    }
  }

  const salvarEdicaoItem = (config: ConfiguracaoProduto) => {
    if (!itemEditando) return

    const precoBase = config.precoBase || config.preco
    const vlrTotal = config.preco * config.quantidade
    const vlrSubtotalOriginal = precoBase * config.quantidade
    const vlrDescontoReal = vlrSubtotalOriginal - vlrTotal

    const itemAtualizado = {
      ...itemEditando,
      QTDNEG: config.quantidade,
      PERCDESC: config.desconto,
      VLRUNIT: config.preco,
      VLRTOT: vlrTotal,
      VLRDESC: vlrDescontoReal > 0 ? vlrDescontoReal : 0,
      CODVOL: config.unidade,
      UNIDADE: config.unidade,
      FATOR: config.fator || 1,
      DIVIDEMULTIPLIC: config.dividemultiplic || 'M',
      AD_VLRUNIT: precoBase,
      preco: precoBase,
      politicaAplicada: itemEditando.politicaAplicada
    }

    setItens(prev => {
      const novos = [...prev]
      novos[itemEditando.index] = itemAtualizado
      return novos
    })

    setShowEditModal(false)
    setItemEditando(null)
    toast.success('Item atualizado')
  }

  const carregarDadosOffline = async () => {
    try {
      setLoadingTiposNegociacao(true);
      setLoadingTabelasPrecos(true);

      const [
        tiposOperacaoOffline,
        tiposNegociacaoOffline,
        tabelasPrecosConfigOffline,
        vendedoresOffline,
        parceirosOffline,
        empresasOffline
      ] = await Promise.all([
        OfflineDataService.getTiposOperacao(),
        OfflineDataService.getTiposNegociacao(),
        OfflineDataService.getTabelasPrecosConfig(),
        OfflineDataService.getVendedores(),
        OfflineDataService.getParceiros(),
        OfflineDataService.getEmpresas()
      ]);

      const operacoesFull = tiposOperacaoOffline || [];
      const negociacoesFull = tiposNegociacaoOffline || [];

      setTiposOperacao(operacoesFull);
      setTiposNegociacao(negociacoesFull);
      setTabelasPrecos(tabelasPrecosConfigOffline || []);
      setVendedores(vendedoresOffline || []);
      setParceiros(parceirosOffline || []);
      setEmpresas(empresasOffline || []);
      setTodasEmpresas(empresasOffline || []);

      // Fallback: Se não houver empresas (dev mode), adicionar uma manual
      if (!empresasOffline || empresasOffline.length === 0) {
        console.warn("⚠️ Nenhuma empresa encontrada offline. Adicionando empresa padrão de desenvolvimento.");
        const fallbackEmpresa = [{
          CODEMP: 1,
          NOMEFANTASIA: 'Empresa Teste Dev',
          RAZAOSOCIAL: 'Empresa Teste Desenvolvimento Ltda'
        }];
        setEmpresas(fallbackEmpresa);
        setTodasEmpresas(fallbackEmpresa);
        // Opcional: Salvar no banco para persistir
        try {
          await db.empresas.put({
            CODEMP: 1,
            NOMEFANTASIA: 'Empresa Teste Dev',
            RAZAOSOCIAL: 'Empresa Teste Desenvolvimento Ltda',
            CGC: '00.000.000/0001-00'
          });
        } catch (e) { console.error("Erro ao salvar empresa dev", e); }
      }

      console.log("✅ Dados offline carregados.");

      // Tentar carregar o vendedor e a empresa do usuário localmente
      const userStr = localStorage.getItem('currentUser'); // Assumindo que o usuário logado é salvo no localStorage

      console.log('🔍 [OFFLINE] LocalStorage currentUser string:', userStr);

      if (userStr) {
        const user = JSON.parse(userStr);
        console.log('🔍 [OFFLINE] LocalStorage currentUser object:', user);

        setPedido(prev => {
          const nextState = { ...prev };
          if (user.codVendedor) {
            nextState.CODVEND = String(user.codVendedor);
            console.log('✅ [OFFLINE] Vendedor do usuário carregado do localStorage:', user.codVendedor);
          }
          const codEmp = user.CODEMP || user.codEmp || user.cod_emp;
          console.log('🔍 [OFFLINE] Valor encontrado para Empresa no LocalStorage:', codEmp);
          if (codEmp) {
            nextState.CODEMP = String(codEmp);
            console.log('✅ [OFFLINE] Empresa filial do usuário carregada do localStorage:', codEmp);
          }
          return nextState;
        });
      }
      // Verificar permissão admin do localStorage também
      if (userStr) {
        const user = JSON.parse(userStr);
        setIsAdminUser(user.role === 'ADMIN');
      }

    } catch (error) {
      console.error("Erro ao carregar dados offline:", error);
      toast.error("Falha ao carregar dados offline.");
    } finally {
      setLoadingTiposNegociacao(false);
      setLoadingTabelasPrecos(false);
    }
  };

  const verificarPermissaoAdmin = () => {
    try {
      const userStr = document.cookie
        .split('; ')
        .find(row => row.startsWith('user='))
        ?.split('=')[1]

      if (userStr) {
        const user = JSON.parse(decodeURIComponent(userStr))
        setIsAdminUser(user.role === 'ADMIN')
      }
    } catch (error) {
      console.error('Erro ao verificar permissão admin:', error)
    }
  }

  const carregarVendedorUsuario = () => {
    try {
      const userStr = document.cookie
        .split('; ')
        .find(row => row.startsWith('user='))
        ?.split('=')[1]

      console.log('🔍 [ONLINE] Cookie user cru:', userStr);

      if (userStr) {
        const user = JSON.parse(decodeURIComponent(userStr))

        console.log('🔍 [ONLINE] Cookie user decodificado:', user);

        setPedido(prev => {
          const nextState = { ...prev }
          if (user.codVendedor) {
            nextState.CODVEND = String(user.codVendedor)
            console.log('✅ [ONLINE] Vendedor do usuário carregado:', user.codVendedor)
          }
          const codEmp = user.CODEMP || user.codEmp || user.cod_emp;
          console.log('🔍 [ONLINE] Valor encontrado para Empresa no cookie:', codEmp);
          if (codEmp) {
            nextState.CODEMP = String(codEmp);
            console.log('✅ [ONLINE] Empresa filial do usuário carregada:', codEmp);
          }
          return nextState;
        })
      }
    } catch (error) {
      console.error('Erro ao carregar vendedor do usuário:', error)
    }
  }

  const carregarVendedores = async () => {
    if (isOffline) {
      const cachedVendedores = await OfflineDataService.getVendedores();
      if (cachedVendedores) {
        setVendedores(cachedVendedores);
        console.log('✅ Vendedores carregados do serviço offline:', cachedVendedores.length);
      }
      return;
    }

    try {
      const response = await fetch('/api/vendedores'); // Assumindo que esta API retorna os vendedores
      if (!response.ok) throw new Error('Erro ao carregar vendedores');
      const data = await response.json();
      const vendedoresList = Array.isArray(data) ? data : (data.data || []);

      const vendedoresAtivos = vendedoresList.filter((v: any) =>
        v.ATIVO === 'S' && v.TIPVEND === 'V'
      );

      setVendedores(vendedoresAtivos);
      console.log('✅ Vendedores carregados da API:', vendedoresAtivos.length);
    } catch (error) {
      console.error('Erro ao carregar vendedores da API:', error);
      setVendedores([]);
      toast.error("Falha ao carregar vendedores.");
    }
  }

  const carregarTiposOperacao = async () => {
    if (isOffline) {
      const cachedTiposOperacao = await OfflineDataService.getTiposOperacao();
      if (cachedTiposOperacao) {
        setTiposOperacao(cachedTiposOperacao);
        console.log('✅ Tipos de operação carregados do serviço offline:', cachedTiposOperacao.length);
      }
      return;
    }

    try {
      setLoadingTiposOperacao(true)
      const response = await fetch('/api/sankhya/tipos-negociacao?tipo=operacao')
      if (response.ok) {
        const data = await response.json()
        const tiposOperacaoList = data.tiposOperacao || []
        setTiposOperacao(tiposOperacaoList)
        console.log('✅ Tipos de operação carregados:', tiposOperacaoList.length)
      }
    } catch (error) {
      console.error('Erro ao carregar tipos de operação:', error)
      setTiposOperacao([])
    } finally {
      setLoadingTiposOperacao(false)
    }
  }

  const carregarTiposNegociacao = async () => {
    if (isOffline) {
      const cachedTiposNegociacao = await OfflineDataService.getTiposNegociacao();
      if (cachedTiposNegociacao) {
        setTiposNegociacao(cachedTiposNegociacao);
        console.log('✅ Tipos de negociação carregados do serviço offline:', cachedTiposNegociacao.length);
      }
      return;
    }

    try {
      setLoadingTiposNegociacao(true)

      const response = await fetch('/api/sankhya/tipos-negociacao?tipo=negociacao')
      if (response.ok) {
        const data = await response.json()
        const tiposList = data.tiposNegociacao || []
        setTiposNegociacao(tiposList)
        console.log('✅ Tipos de negociação carregados:', tiposList.length)
      }
    } catch (error) {
      console.error('Erro ao carregar tipos de negociação:', error)
      setTiposNegociacao([])
    } finally {
      setLoadingTiposNegociacao(false)
    }
  }

  const carregarTabelasPrecos = async () => {
    if (isOffline) {
      const cachedTabelas = await OfflineDataService.getTabelasPrecos();
      if (cachedTabelas) {
        setTabelasPrecos(cachedTabelas);
        console.log('✅ Tabelas de preços carregadas do serviço offline:', cachedTabelas.length);
      }
      return;
    }

    try {
      setLoadingTabelasPrecos(true)

      const response = await fetch('/api/tabelas-precos-config')
      if (!response.ok) throw new Error('Erro ao carregar tabelas de preços configuradas')
      const data = await response.json()
      const tabelas = data.configs || []

      const tabelasFormatadas = tabelas.map((config: any) => ({
        NUTAB: config.NUTAB,
        CODTAB: config.CODTAB,
        DESCRICAO: config.DESCRICAO,
        ATIVO: config.ATIVO
      }))

      setTabelasPrecos(tabelasFormatadas)
      console.log('✅ Tabelas de preços configuradas carregadas:', tabelasFormatadas.length)
    } catch (error) {
      console.error('Erro ao carregar tabelas de preços configuradas:', error)
      toast.error("Falha ao carregar tabelas de preços. Verifique as configurações.")
      setTabelasPrecos([])
    } finally {
      setLoadingTabelasPrecos(false)
    }
  }

  const carregarEmpresas = async () => {
    if (isOffline) {
      const cachedEmpresas = await OfflineDataService.getEmpresas();
      if (cachedEmpresas) {
        setEmpresas(cachedEmpresas);
        console.log('✅ Empresas carregadas do serviço offline:', cachedEmpresas.length);
      }
      return;
    }

    try {
      setLoadingEmpresas(true)
      const response = await fetch('/api/public/empresas')
      if (response.ok) {
        const data = await response.json()
        setEmpresas(data)
        setTodasEmpresas(data)
        console.log('✅ Empresas carregadas:', data.length)
      }
    } catch (error) {
      console.error('Erro ao carregar empresas:', error)
      setEmpresas([])
    } finally {
      setLoadingEmpresas(false)
    }
  }

  const buscarParceiros = async (termo: string) => {
    if (termo.length < 3) {
      setParceiros([])
      return
    }

    if (isOffline) {
      const parceirosOffline = await OfflineDataService.getParceiros();
      const filteredParceiros = parceirosOffline?.filter((p: any) =>
        p.NOMEPARC.toLowerCase().includes(termo.toLowerCase()) ||
        p.RAZAOSOCIAL.toLowerCase().includes(termo.toLowerCase()) ||
        p.CODPARC.toString().includes(termo) ||
        p.CGC_CPF.replace(/[^\d]/g, '').includes(termo.replace(/[^\d]/g, ''))
      ) || [];
      setParceiros(filteredParceiros);
      console.log(`✅ Parceiros offline encontrados para "${termo}":`, filteredParceiros.length);
      return;
    }

    try {
      const response = await fetch(`/api/sankhya/parceiros/search?termo=${encodeURIComponent(termo)}`)
      if (response.ok) {
        const data = await response.json()
        setParceiros(data)
      }
    } catch (error) {
      console.error('Erro ao buscar parceiros:', error)
      toast.error('Erro ao buscar parceiros')
    }
  }

  const selecionarParceiro = async (parceiro: any) => {
    console.log('🔍 Parceiro selecionado:', parceiro)

    // Lógica de Preferência por Política Comercial
    if (preferenciaEmpresaAtiva) {
      try {
        setLoadingEmpresas(true);
        // Regra: Sempre buscar do IndexedDB
        console.log(`[DEBUG] Buscando vínculos para Parceiro: ${parceiro.CODPARC} (${parceiro.NOMEPARC})`);
        const vinculadas = await OfflineDataService.getEmpresasPorParceiro(parceiro.CODPARC);
        
        console.log(`[DEBUG] Resultado Empresas Vinculadas (${vinculadas?.length || 0}):`);
        if (vinculadas && vinculadas.length > 0) {
          console.table(vinculadas.map(e => ({ CODEMP: e.CODEMP, NOMEFANTASIA: e.NOMEFANTASIA })));
          setEmpresas(vinculadas);

          // Verifica se a empresa já selecionada está na nova lista vinculada
          if (pedido.CODEMP) {
            const empresaAindaDisponivel = vinculadas.find((e: any) => String(e.CODEMP) === String(pedido.CODEMP));
            // Se a empresa vinculada não contemplar a empresa selecionada, limpa ou seleciona a única opção
            if (!empresaAindaDisponivel) {
              if (vinculadas.length === 1) {
                setPedido(prev => ({ ...prev, CODEMP: String(vinculadas[0].CODEMP) }));
              } else {
                setPedido(prev => ({ ...prev, CODEMP: "" }));
                toast.warning(`A empresa selecionada não atende este cliente. Selecione uma das empresas disponíveis.`);
              }
            }
          } else if (vinculadas.length === 1) {
            // Auto-selecionar se houver apenas uma
            setPedido(prev => ({ ...prev, CODEMP: String(vinculadas[0].CODEMP) }));
          }
        } else {
          // Parceiro sem vínculo mas a preferência exige
          toast.warning(`Parceiro ${parceiro.NOMEPARC} não possui empresas vinculadas.`);
          setEmpresas([]);
          setPedido(prev => ({ ...prev, CODEMP: "" }));
        }
      } catch (error) {
        console.error("Erro ao buscar empresas vinculadas", error);
      } finally {
        setLoadingEmpresas(false);
      }
    } else {
      // Se a preferência não está ativa, restaura a lista completa
      setEmpresas(todasEmpresas);
    }

    // Lógica de Preferência por Tipo de Negociação (Condição Comercial)
    let autoTipoNegociacao = "";
    if (preferenciaTipoNegociacaoAtiva) {
      try {
        let sugTipNeg: any = null;
        // Regra: Sempre buscar do IndexedDB
        const complemento = await OfflineDataService.getComplementoParc(parceiro.CODPARC);
        console.log(`[DEBUG] Resultado Complemento Parceiro:`, complemento);
        
        if (complemento) {
          sugTipNeg = complemento.SUGTIPNEGSAID;
        }

        if (sugTipNeg) {
           console.log(`🔍 [Auto-Fill] Sugestão de Negociação encontrada: ${sugTipNeg}`);
           const existeNaLista = tiposNegociacao.find(t => 
             String(t.CODTIPVENDA || t.CODTIPVEND) === String(sugTipNeg)
           );
           
           if (existeNaLista) {
             autoTipoNegociacao = String(sugTipNeg);
             console.log(`✅ [Auto-Fill] Aplicando Condição Comercial: ${autoTipoNegociacao}`);
           } else {
             console.warn(`⚠️ [Auto-Fill] Código ${sugTipNeg} não encontrado na lista atual de negociações.`);
           }
        }
      } catch (error) {
        console.error("Erro ao verificar auto tipo de negociacao", error);
      }
    }

    setPedido(prev => ({
      ...prev,
      CODPARC: String(parceiro.CODPARC),
      RAZAOSOCIAL: parceiro.RAZAOSOCIAL || parceiro.NOMEPARC,
      RAZAO_SOCIAL: parceiro.RAZAOSOCIAL || parceiro.NOMEPARC,
      CPF_CNPJ: parceiro.CGC_CPF || '',
      IE_RG: parceiro.IDENTINSCESTAD || '',
      TIPO_CLIENTE: parceiro.TIPPESSOA === 'J' ? 'PJ' : 'PF',
      // Dados de endereço para exibição
      ENDERECO: parceiro.ENDERECO || "",
      NOMEBAI: parceiro.NOMEBAI || "",
      NOMECID: parceiro.NOMECID || "",
      UF: parceiro.UF || "",
      CEP: parceiro.CEP || "",
      ...(autoTipoNegociacao ? { CODTIPVENDA: autoTipoNegociacao } : {})
    }))

    if (autoTipoNegociacao) {
      toast.success(`Condição comercial auto-preenchida para ${autoTipoNegociacao}`);
    }

    setShowParceiroModal(false)
    setParceiros([])
    setSearchParceiro("")
    toast.success(`Parceiro ${parceiro.RAZAOSOCIAL || parceiro.NOMEPARC} selecionado`)
  }

  const handleVendedorSelect = (codVendedor: number) => {
    setPedido(prev => ({ ...prev, CODVEND: String(codVendedor) }))
    setShowVendedorModal(false)
    toast.success(`Vendedor ${codVendedor} selecionado`)
  }

  const handleConfirmarProdutoEstoque = async (
    produto: any,
    quantidade: number,
    desconto: number,
    tabelaPreco?: string,
    precoForcado?: number,
    maxDesconto?: number,
    maxAcrescimo?: number,
    precoBase?: number,
    politicaAplicada?: any
  ) => {
    try {
      console.log('📦 Produto confirmado:', { produto, quantidade, desconto, tabelaPreco, precoForcado, maxDesconto, maxAcrescimo })

      const isOfflineStatus = !navigator.onLine
      let vlrUnit = precoForcado || produto.AD_VLRUNIT || produto.preco || produto.VLRUNIT || 0
      let vlrUnitTabela = vlrUnit

      if (vlrUnit === 0 && tabelaPreco && tabelaPreco !== 'PADRAO' && !isOfflineStatus) {
        try {
          const responsePreco = await fetch(
            `/api/oracle/preco?codProd=${produto.CODPROD}&tabelaPreco=${encodeURIComponent(tabelaPreco)}`
          )

          if (responsePreco.ok) {
            const dataPreco = await responsePreco.json()
            if (dataPreco.preco) {
              vlrUnitTabela = dataPreco.preco
              vlrUnit = dataPreco.preco
              console.log('💰 Preço da tabela aplicado:', vlrUnitTabela)
            }
          }
        } catch (error) {
          console.error('❌ Erro ao buscar preço da tabela:', error)
          toast.error('Erro ao buscar preço da tabela')
        }
      } else if (vlrUnit === 0 && tabelaPreco && tabelaPreco !== 'PADRAO' && isOfflineStatus) {
        // Se offline e sem preço, tenta buscar o preço da tabela offline
        // Precisamos do NUTAB da config selecionada
        const configTabela = tabelasPrecos.find((t: any) => t.CODTAB === tabelaPreco);
        if (configTabela && configTabela.NUTAB) {
          const precosOffline = await OfflineDataService.getPrecos(produto.CODPROD, configTabela.NUTAB);
          if (precosOffline && precosOffline.length > 0) {
            vlrUnitTabela = precosOffline[0].VLRVENDA || precosOffline[0].preco || 0;
            vlrUnit = vlrUnitTabela;
            console.log('💰 Preço da tabela offline aplicado:', vlrUnitTabela);
          }
        }
      }

      const vlrDesconto = (vlrUnit * desconto) / 100
      const vlrUnitFinal = vlrUnit - vlrDesconto
      const vlrTotal = vlrUnitFinal * quantidade

      // Garantir que CODVOL_PADRAO seja a UNIDADE do produto
      const codVolPadrao = produto.UNIDADE || produto.CODVOL || 'UN';
      const codVol = codVolPadrao; 
      console.log('📦 CODVOL que será enviado:', codVol);

      const novoItem = {
        CODPROD: produto.CODPROD,
        DESCRPROD: produto.DESCRPROD,
        QTDNEG: quantidade,
        VLRUNIT: vlrUnitFinal,
        VLRTOT: vlrTotal,
        PERCDESC: desconto,
        VLRDESC: vlrDesconto * quantidade,
        CODVOL: codVol, // Garantir CODVOL sempre presente
        UNIDADE: codVol,
        CODVOL_PADRAO: produto.UNIDADE || produto.CODVOL || 'UN',
        FATOR: Number(produto.FATOR || 1),
        DIVIDEMULTIPLIC: produto.DIVIDEMULTIPLIC || 'M',
        CONTROLE: produto.CONTROLE || 'N',
        AD_VLRUNIT: precoBase !== undefined ? precoBase : vlrUnit, // Preservar preço base original
        preco: precoBase !== undefined ? precoBase : vlrUnit,
        TABELA_PRECO: tabelaPreco || 'PADRAO',
        MAX_DESC_PERMITIDO: maxDesconto,
        MAX_ACRE_PERMITIDO: maxAcrescimo,
        politicaAplicada: politicaAplicada
      }

      setItens(prev => [...prev, novoItem])
      setShowEstoqueModal(false)
      setProdutoEstoqueSelecionado(null)
      toast.success('Produto adicionado ao pedido')
    } catch (error) {
      console.error('❌ Erro ao adicionar produto:', error)
      toast.error('Erro ao adicionar produto')
    }
  }

  // Wrapper para adaptar a assinatura do modal
  // Wrapper para adaptar a assinatura do modal de seleção de produtos
  const handleConfirmarDoModal = (
    produto: any,
    preco: number,
    quantidade: number,
    tabela?: string,
    desconto?: number,
    controle?: string,
    localEstoque?: number,
    maxDesconto?: number,
    maxAcrescimo?: number,
    precoBase?: number,
    politicaAplicada?: any
  ) => {
    // Chama a função principal de adição de item repassando os parâmetros recebidos do modal
    handleConfirmarProdutoEstoque(
      produto, 
      quantidade, 
      desconto || 0, 
      tabela || 'PADRAO', 
      preco, 
      maxDesconto, 
      maxAcrescimo, 
      precoBase,
      politicaAplicada
    );
  }

  const removerItem = (index: number) => {
    setItens(prev => prev.filter((_, i) => i !== index))
    toast.success('Produto removido')
  }

  const calcularTotalPedido = () => {
    const totalItens = itens.reduce((acc, item) => acc + (item.VLRTOT || 0), 0)
    const totalItensFormatado = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(totalItens)
    return { total: totalItens, formatado: totalItensFormatado }
  }

  const handleSubmit = async () => {
    if (!isFormValid) return;

    // 1. Verificação de Políticas Comerciais
    const violacoesDetectadas: string[] = []

    itens.forEach(item => {
      // 1. Validar Desconto
      if (item.MAX_DESC_PERMITIDO !== undefined && item.MAX_DESC_PERMITIDO !== null) {
        if (item.PERCDESC > item.MAX_DESC_PERMITIDO) {
          violacoesDetectadas.push(`Produto ${item.CODPROD}: Desconto de ${item.PERCDESC}% excede o máximo permitido de ${item.MAX_DESC_PERMITIDO}%`);
        }
      }

      // 2. Validar Acréscimo (Markup)
      if (item.MAX_ACRE_PERMITIDO !== undefined && item.MAX_ACRE_PERMITIDO !== null) {
        const precoBase = item.AD_VLRUNIT || item.preco || 0;
        const vlrUnitarioDigitado = item.VLRUNIT / (1 - (item.PERCDESC / 100)); // Reverter desconto para pegar o preço bruto digitado

        if (vlrUnitarioDigitado > precoBase) {
          const markupPerc = ((vlrUnitarioDigitado - precoBase) / precoBase) * 100;
          if (markupPerc > (item.MAX_ACRE_PERMITIDO + 0.01)) {
            violacoesDetectadas.push(`Produto ${item.CODPROD}: Acréscimo de ${markupPerc.toFixed(2)}% excede o máximo permitido de ${item.MAX_ACRE_PERMITIDO}%`);
          }
        }
      }
    });

    if (violacoesDetectadas.length > 0) {
      setViolations(violacoesDetectadas);
      setPendingOrderPayload({ ...pedido, ITENS: itens });
      setShowApproverModal(true);
      return;
    }

    const isOnlineEnv = navigator.onLine;


    const itensMapeados = itens.map(item => {
      // Conforme diretriz do usuário:
      // 1. Enviamos a quantidade bruta (como digitada: ex 1 CX)
      // 2. Enviamos o preço bruto (como no banco: ex 8.99)
      // 3. O serviço de API se encarrega de converter a Qtd para a unidade padrão.
      
      const vlrUnitFinal = Number(item.VLRUNIT) || 0;
      const qtdFinal = Number(item.QTDNEG) || 0;
      const percdesc = item.PERCDESC || 0;
      
      // Cálculo local apenas para VLRTOT informativo no payload
      const vlrTotBruto = vlrUnitFinal * qtdFinal;
      const vlrDescFinal = (vlrTotBruto * percdesc) / 100;
      const vlrTotLiquido = vlrTotBruto - vlrDescFinal;

      return {
        ...item,
        CODPROD: String(item.CODPROD),
        QTDNEG: Number(qtdFinal.toFixed(3)),
        VLRUNIT: Number(vlrUnitFinal.toFixed(4)),
        PERCDESC: percdesc,
        VLRDESC: Number(vlrDescFinal.toFixed(2)),
        CODLOCALORIG: item.CODLOCALORIG || "700",
        CONTROLE: item.CONTROLE || "007",
        CODVOL: item.CODVOL || "UN",
        CODVOL_PADRAO: item.CODVOL_PADRAO || "UN",
        FATOR: Number(item.FATOR || 1),
        DIVIDEMULTIPLIC: item.DIVIDEMULTIPLIC || 'M',
        VLRTOT: Number(vlrTotLiquido.toFixed(2))
      };
    });

    try {
      if (!isOnlineEnv) {
        toast.loading("Salvando pedido offline...");
        // PedidoSyncService.salvarPedido já gerencia o modo offline internamente se necessário,
        // mas aqui garantimos que o payload enviado seja o mapeado.
      } else {
        toast.loading("Sincronizando pedido...");
      }

      const saveResult = await PedidoSyncService.salvarPedido({ ...pedido, ITENS: itensMapeados });

      if (saveResult.success) {
        toast.success("Pedido criado com sucesso!");
        if (onSuccess) onSuccess();
      } else {
        toast.error("Erro ao processar pedido: " + (saveResult.error || 'Erro desconhecido'));
      }
    } catch (error: any) {
      console.error("Erro no envio:", error);
      toast.error("Erro ao processar pedido: " + (error.message || 'Erro inesperado'));
    } finally {
      toast.dismiss();
    }
  };

  const handleRequestApproval = async (idAprovador: number, justificativa?: string) => {
    try {
      const isOnlineEnv = navigator.onLine;
      const payload = pendingOrderPayload || { ...pedido, ITENS: itens };

      if (!isOnlineEnv) {
        toast.loading("Salvando solicitação offline...");

        await PedidoSyncService.salvarOffline(payload, 'OFFLINE', {
          status: 'PENDENTE',
          violacoes: violations,
          justificativa,
          idAprovador
        });

        toast.success("Pedido com restrição salvo para aprovação offline!");
        setShowApproverModal(false);
        if (onSuccess) onSuccess();
        return;
      }

      toast.loading("Enviando solicitação de aprovação...");

      await PedidoSyncService.registrarAprovacaoOnline(
        payload,
        violations,
        justificativa,
        idAprovador
      );

      toast.success("Solicitação enviada com sucesso!");
      setShowApproverModal(false);
      if (onSuccess) onSuccess();

    } catch (error) {
      console.error("Erro ao solicitar aprovação:", error);
      toast.error("Erro ao salvar solicitação.");
    } finally {
      toast.dismiss();
    }
  }

  const totals = calcularTotalPedido()
  const totalQuantidade = itens.reduce((acc, item) => acc + (item.QTDNEG || 0), 0)

  const isFormValid = pedido.CODPARC && pedido.CODVEND !== "0" && itens.length > 0 && pedido.CODTIPOPER && pedido.MODELO_NOTA

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-4 overflow-y-auto pb-32 px-4 pt-4">

        {/* Dados do Parceiro */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-green-700">Dados do Pedido</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Empresa *</Label>
                <Select
                  value={pedido.CODEMP}
                  onValueChange={(val) => setPedido(prev => ({ ...prev, CODEMP: val }))}
                  disabled={loadingEmpresas}
                >
                  <SelectTrigger className="h-8 md:h-10 text-xs md:text-sm bg-gray-50">
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map((emp) => (
                      <SelectItem key={emp.CODEMP} value={String(emp.CODEMP)}>
                        {emp.CODEMP} - {emp.NOMEFANTASIA || emp.RAZAOSOCIAL}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-green-700">Dados do Parceiro</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Parceiro *</Label>
                <div className="flex gap-1">
                  <Input
                    value={pedido.RAZAOSOCIAL || pedido.RAZAO_SOCIAL || ''}
                    readOnly
                    placeholder="Buscar parceiro..."
                    className="text-xs md:text-sm h-8 md:h-10 bg-gray-50"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowParceiroModal(true)}
                    className="h-8 w-8 md:h-10 md:w-10"
                  >
                    <Search className="h-3 w-3 md:h-4 md:w-4" />
                  </Button>
                </div>
                {pedido.CODPARC && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="text-[10px] md:text-xs text-muted-foreground mt-1 mb-3">
                      Código: {pedido.CODPARC}
                    </div>
                    {/* Card de Endereço */}
                    <div className="p-4 bg-gray-50 rounded-3xl border border-gray-100 flex gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-white border border-gray-100 flex items-center justify-center shadow-sm flex-shrink-0">
                        <MapPin className="w-5 h-5 text-gray-400" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Endereço do Parceiro</p>
                        <p className="text-xs text-gray-700 font-medium leading-relaxed">
                          {pedido.ENDERECO ? `${pedido.ENDERECO}${pedido.NOMEBAI ? ` - ${pedido.NOMEBAI}` : ''}` : 'Endereço não disponível'}
                          <br />
                          <span className="text-gray-500">
                            {pedido.NOMECID ? `${pedido.NOMECID}/${pedido.UF || ''}` : ''} {pedido.CEP ? ` • CEP: ${pedido.CEP}` : ''}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Tipo Cliente *</Label>
                <Select value={pedido.TIPO_CLIENTE} onValueChange={(value) => setPedido({ ...pedido, TIPO_CLIENTE: value })}>
                  <SelectTrigger className="text-xs md:text-sm h-8 md:h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                    <SelectItem value="PF">Pessoa Física</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">CPF/CNPJ *</Label>
                <Input
                  value={pedido.CPF_CNPJ || ''}
                  onChange={(e) => setPedido(prev => ({ ...prev, CPF_CNPJ: e.target.value }))}
                  placeholder="Digite o CPF/CNPJ"
                  className="text-xs md:text-sm h-8 md:h-10"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">IE/RG *</Label>
                <Input
                  value={pedido.IE_RG || ''}
                  onChange={(e) => setPedido(prev => ({ ...prev, IE_RG: e.target.value }))}
                  placeholder="Digite a IE/RG"
                  className="text-xs md:text-sm h-8 md:h-10"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Razão Social *</Label>
                <Input
                  value={pedido.RAZAO_SOCIAL || ''}
                  onChange={(e) => setPedido(prev => ({ ...prev, RAZAO_SOCIAL: e.target.value }))}
                  placeholder="Digite a Razão Social"
                  className="text-xs md:text-sm h-8 md:h-10"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dados da Nota */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <h3 className="text-sm font-semibold text-green-700">Dados da Nota</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Modelo Nota *</Label>
                <Input
                  type="number"
                  value={pedido.MODELO_NOTA}
                  onChange={(e) => setPedido({ ...pedido, MODELO_NOTA: e.target.value })}
                  placeholder="Digite o número do modelo"
                  className="text-xs md:text-sm h-8 md:h-10"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Tipo de Movimento</Label>
                <Select value={pedido.TIPMOV} onValueChange={(value) => setPedido({ ...pedido, TIPMOV: value })}>
                  <SelectTrigger className="text-xs md:text-sm h-8 md:h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="P">Pedido</SelectItem>
                    <SelectItem value="V">Venda</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Tipo de Operação *</Label>
                <Select
                  value={pedido.CODTIPOPER}
                  onValueChange={(value) => setPedido({ ...pedido, CODTIPOPER: value })}
                  disabled={loadingTiposOperacao}
                >
                  <SelectTrigger className="text-xs md:text-sm h-8 md:h-10">
                    <SelectValue placeholder={loadingTiposOperacao ? "Carregando..." : "Selecione"} />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposOperacao.map((tipo) => (
                      <SelectItem key={tipo.CODTIPOPER} value={String(tipo.CODTIPOPER)}>
                        {tipo.CODTIPOPER} - {tipo.DESCRTIPOPER || tipo.NOME}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Condição de Pagamento *</Label>
                <Select
                  value={pedido.CODTIPVENDA}
                  onValueChange={(value) => setPedido({ ...pedido, CODTIPVENDA: value })}
                  disabled={loadingTiposNegociacao}
                >
                  <SelectTrigger className="text-xs md:text-sm h-8 md:h-10">
                    <SelectValue placeholder={loadingTiposNegociacao ? "Carregando..." : "Selecione"} />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposNegociacao.map((neg) => (
                      <SelectItem key={neg.CODTIPVENDA || neg.CODTIPVEND} value={String(neg.CODTIPVENDA || neg.CODTIPVEND)}>
                        {neg.CODTIPVENDA || neg.CODTIPVEND} - {neg.DESCRTIPVENDA || neg.DESCRTIPVEND || neg.NOME}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Data Negociação *</Label>
                <Input
                  type="date"
                  value={pedido.DTNEG}
                  onChange={(e) => setPedido({ ...pedido, DTNEG: e.target.value })}
                  max={new Date().toISOString().split('T')[0]}
                  className="text-xs md:text-sm h-8 md:h-10"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Tabela de Preço</Label>
                <Select
                  value={pedido.CODTAB}
                  onValueChange={(value) => setPedido({ ...pedido, CODTAB: value })}
                  disabled={loadingTabelasPrecos}
                >
                  <SelectTrigger className="text-xs md:text-sm h-8 md:h-10">
                    <SelectValue placeholder={loadingTabelasPrecos ? "Carregando..." : "Selecione"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Tabela Padrão (Sem Filtro)</SelectItem>
                    {tabelasPrecos.map((tabela) => (
                      <SelectItem key={tabela.NUTAB} value={String(tabela.CODTAB)}>
                        {tabela.CODTAB} - {tabela.DESCRICAO}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Vendedor *</Label>
                <div className="flex gap-1">
                  <Input
                    value={vendedores.find(v => v.CODVEND === Number(pedido.CODVEND))?.APELIDO || pedido.CODVEND || ''}
                    readOnly
                    placeholder="Vendedor"
                    className="text-xs md:text-sm h-8 md:h-10 bg-gray-50"
                  />
                  {isAdminUser && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setShowVendedorModal(true)}
                      className="h-8 w-8 md:h-10 md:w-10"
                    >
                      <Search className="h-3 w-3 md:h-4 md:w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Itens do Pedido */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-green-700">Produtos ({itens.length})</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowProdutoModal(true)}
                className="h-8 text-xs border-green-600 text-green-600 hover:bg-green-50"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Produto
              </Button>
            </div>

            {itens.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed rounded-lg bg-gray-50">
                <Package className="h-8 w-8 mx-auto text-gray-300" />
                <p className="text-xs text-muted-foreground mt-2">Nenhum produto adicionado</p>
              </div>
            ) : (
              <div className="space-y-2">
                {itens.map((item, index) => (
                  <Card key={index} className="border-green-100">
                    <CardContent className="p-3">
                      <div className="flex justify-between items-start gap-2">
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => abrirEdicaoItem(item, index)}
                        >
                          <p className="font-medium text-xs md:text-sm truncate">
                            {item.CODPROD} - {item.DESCRPROD}
                          </p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] md:text-xs text-muted-foreground">
                            <span>Qtd: <span className="font-semibold text-foreground">
                              {`${Number((item.QTDNEG || 0).toFixed(3))} ${item.CODVOL || item.UNIDADE || 'UN'}`}
                            </span></span>
                            <span>Unit: <span className="font-semibold text-foreground">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                item.VLRUNIT || 0
                              )}
                            </span></span>
                            {item.PERCDESC > 0 && (
                              <span className="text-red-500">Desc: {item.PERCDESC}%</span>
                            )}
                            <span className="font-bold text-green-600">Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.VLRTOT)}</span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removerItem(index)}
                          className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                        >
                          <Trash2 className="h-3 w-3 md:h-4 md:w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <ConfiguracaoProdutoModal
          open={showEditModal}
          onOpenChange={setShowEditModal}
          produto={itemEditando}
          unidades={unidadesEdit}
          configInicial={configEditInicial}
          onConfirmar={salvarEdicaoItem}
          modo="editar"
          maxDesconto={itemEditando?.MAX_DESC_PERMITIDO}
          maxAcrescimo={itemEditando?.MAX_ACRE_PERMITIDO}
          politicaAplicada={itemEditando?.politicaAplicada}
        />

        {/* Observações */}
        <Card>
          <CardContent className="pt-4 space-y-2">
            <Label className="text-xs">Observação</Label>
            <Textarea
              value={pedido.OBSERVACAO}
              onChange={(e) => setPedido({ ...pedido, OBSERVACAO: e.target.value })}
              placeholder="Informações adicionais do pedido..."
              className="text-xs md:text-sm min-h-[80px]"
            />
          </CardContent>
        </Card>
      </div>
      <ProdutoSelectorModal
        isOpen={showProdutoModal}
        onClose={() => setShowProdutoModal(false)}
        onConfirm={handleConfirmarDoModal}
        idEmpresa={pedido.CODEMP}
        codParc={pedido.CODPARC}
        titulo="Adicionar Item"
      />

      <VendedorSelectorModal
        isOpen={showVendedorModal}
        onClose={() => setShowVendedorModal(false)}
        onSelect={handleVendedorSelect}
        tipo="vendedor"
      />

      {/* Rodapé fixo do modal de pedido */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex items-center justify-between shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-50">
        <div className="flex gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-500 uppercase font-bold">Itens</span>
            <span className="text-lg font-bold text-[#2ECC71]">{itens.length}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-500 uppercase font-bold">Qtd</span>
            <span className="text-lg font-bold text-[#2ECC71]">{totalQuantidade}</span>
          </div>
          <div className="bg-[#2ECC71] px-4 py-1 rounded-lg flex flex-col justify-center">
            <span className="text-[10px] text-white/80 uppercase font-bold">Total</span>
            <span className="text-lg font-bold text-white leading-none">{totals.formatado}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            className="bg-[#2ECC71] hover:bg-[#27ae60] text-white font-bold"
            disabled={!isFormValid}
          >
            Criar Pedido
          </Button>
        </div>
      </div>
      <ApproverSelectionModal
        isOpen={showApproverModal}
        onClose={() => setShowApproverModal(false)}
        onConfirm={handleRequestApproval}
        violations={violations}
      />
    </div>
  )
}