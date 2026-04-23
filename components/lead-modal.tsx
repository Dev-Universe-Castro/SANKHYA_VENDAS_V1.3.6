"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { X, Mail, Phone, MessageSquare, FileText, Users, Calendar, DollarSign, User, Clock, Plus, CheckCircle2, AlertCircle, MoreVertical, CheckCircle, XCircle, Trash2, Search, Save, Pencil, MapPin, CheckSquare, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { Lead } from "@/lib/leads-service"
import { useToast } from "@/hooks/use-toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useIsMobile } from "@/hooks/use-mobile"
import { atualizarStatusLead } from "@/lib/lead-atividades-service"
import PedidoVendaFromLead from "@/components/pedido-venda-from-lead"
import { useLeadContext, formatLeadContextForAI } from "@/hooks/use-lead-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ProdutoSelectorModal } from "@/components/produto-selector-modal"

// Placeholder for the EstoqueModal component.
// This component needs to be defined elsewhere or imported.
// For now, we assume it exists and has the props `isOpen`, `onClose`, `product`, and `onConfirm`.
// const EstoqueModal = dynamic(() => import('@/components/estoque-modal')); // Example if it's a dynamic import

// Define a type for the product, if not already defined elsewhere.
// interface Produto {
//   CODPROD: string;
//   DESCRPROD: string;
//   // Add other relevant properties like VLRCOMERC, estoque, etc.
// }


interface LeadModalProps {
  isOpen: boolean
  onClose: () => void
  lead: Lead | null
  onSave: () => void
  funilSelecionado?: any
  onLeadUpdated?: () => void // Callback para notificar que o lead foi atualizado
}

interface Partner {
  CODPARC: string
  NOMEPARC: string
  CGC_CPF: string
  TIPPESSOA?: 'J' | 'F'
  IDENTINSCESTAD?: string
  RAZAOSOCIAL?: string
}

const TIPOS_TAG = [
  'Ads Production',
  'Landing Page',
  'Dashboard',
  'UX Design',
  'Video Production',
  'Typeface',
  'Web Design'
]

interface AtividadeItemProps {
  atividade: any
  codLead: string
  onReload: () => void
  isLeadPerdido?: boolean // Adicionado para indicar se o lead está perdido ou ganho
}

function AtividadeItem({ atividade, codLead, onReload, isLeadPerdido }: AtividadeItemProps) {
  const { toast } = useToast()
  const [editandoAtividade, setEditandoAtividade] = useState(false)
  const [tituloAtividade, setTituloAtividade] = useState(atividade.TITULO || '')
  const [descricaoAtividade, setDescricaoAtividade] = useState(atividade.DESCRICAO || '')
  const [tipoAtividade, setTipoAtividade] = useState(atividade.TIPO)
  const [corAtividade, setCorAtividade] = useState(atividade.COR || '#22C55E')
  const [dataInicioAtividade, setDataInicioAtividade] = useState(atividade.DATA_INICIO ? atividade.DATA_INICIO.slice(0, 16) : new Date().toISOString().slice(0, 16))
  const [dataFimAtividade, setDataFimAtividade] = useState(atividade.DATA_FIM ? atividade.DATA_FIM.slice(0, 16) : new Date().toISOString().slice(0, 16))
  const [salvandoAtividade, setSalvandoAtividade] = useState(false)
  const [concluindoAtividade, setConcluindoAtividade] = useState(false)
  const [inativandoAtividade, setInativandoAtividade] = useState(false)
  const [mostrarOpcoes, setMostrarOpcoes] = useState(false)
  const estaRealizado = atividade.STATUS === 'REALIZADO'

  const marcarRealizadoAtividade = async () => {
    try {
      setConcluindoAtividade(true)
      const response = await fetch('/api/leads/atividades/atualizar-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CODATIVIDADE: atividade.CODATIVIDADE, STATUS: 'REALIZADO' })
      })

      if (!response.ok) throw new Error('Erro ao marcar como concluído')

      toast({
        title: "Sucesso",
        description: "Tarefa concluída",
      })

      await onReload()
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setConcluindoAtividade(false)
    }
  }

  const marcarAguardandoAtividade = async () => {
    try {
      setConcluindoAtividade(true)
      const response = await fetch('/api/leads/atividades/atualizar-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CODATIVIDADE: atividade.CODATIVIDADE, STATUS: 'AGUARDANDO' })
      })

      if (!response.ok) throw new Error('Erro ao alterar status')

      toast({
        title: "Sucesso",
        description: "Status alterado para Aguardando",
      })

      await onReload()
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setConcluindoAtividade(false)
    }
  }

  const salvarEdicaoAtividade = async () => {
    try {
      setSalvandoAtividade(true)

      // Adicionar ':00Z' para forçar UTC e evitar conversão de timezone
      const dataInicioUTC = dataInicioAtividade + ':00Z'
      const dataFimUTC = dataFimAtividade + ':00Z'

      const response = await fetch('/api/leads/atividades/atualizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          CODATIVIDADE: atividade.CODATIVIDADE,
          TITULO: tituloAtividade,
          DESCRICAO: descricaoAtividade,
          TIPO: tipoAtividade,
          COR: corAtividade,
          DATA_INICIO: dataInicioUTC,
          DATA_FIM: dataFimUTC
        })
      })

      if (!response.ok) throw new Error('Erro ao atualizar')

      setEditandoAtividade(false)
      await onReload()

      toast({
        title: "Sucesso",
        description: "Atividade atualizada",
      })
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setSalvandoAtividade(false)
    }
  }

  const inativarAtividade = async () => {
    try {
      setInativandoAtividade(true)
      const response = await fetch('/api/leads/atividades/atualizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          CODATIVIDADE: atividade.CODATIVIDADE,
          ATIVO: 'N'
        })
      })

      if (!response.ok) throw new Error('Erro ao inativar')

      toast({
        title: "Sucesso",
        description: "Atividade inativada",
      })

      await onReload()
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setInativandoAtividade(false)
    }
  }

  const getIconeTipo = () => {
    const iconeClasses = "w-5 h-5 flex-shrink-0"
    switch (atividade.TIPO) {
      case 'NOTA': return <FileText className={iconeClasses} />
      case 'LIGACAO': return <Phone className={iconeClasses} />
      case 'EMAIL': return <Mail className={iconeClasses} />
      case 'WHATSAPP': return <MessageSquare className={iconeClasses} />
      case 'REUNIAO': return <Users className={iconeClasses} />
      case 'VISITA': return <MapPin className={iconeClasses} />
      case 'PROPOSTA': return <FileText className={iconeClasses} />
      default: return <FileText className={iconeClasses} />
    }
  }

  const formatarData = (dataStr: string) => {
    if (!dataStr) return ''
    try {
      const data = new Date(dataStr)
      const dia = data.getDate().toString().padStart(2, '0')
      const mes = (data.getMonth() + 1).toString().padStart(2, '0')
      const ano = data.getFullYear()
      const hora = data.getHours().toString().padStart(2, '0')
      const min = data.getMinutes().toString().padStart(2, '0')
      return `Added at ${dia}/${mes}/${ano} - ${hora}:${min}`
    } catch {
      return dataStr
    }
  }

  // Layout unificado (mobile e desktop)
  if (!editandoAtividade) {
    return (
      <div className="flex items-start gap-3 py-3 border-b last:border-b-0">
        <div className="flex-shrink-0 mt-0.5">
          {estaRealizado ? (
            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
          ) : (
            <button
              onClick={marcarRealizadoAtividade}
              disabled={concluindoAtividade || isLeadPerdido}
              className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center hover:border-green-500 transition-colors disabled:opacity-50"
            >
              {concluindoAtividade && <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />}
            </button>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
              style={{ backgroundColor: atividade.COR || '#6B7280' }}
            >
              {getIconeTipo()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-gray-900">{atividade.NOME_USUARIO || 'Usuário'}</span>
                <span className="text-xs text-gray-500">{atividade.TIPO}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{formatarData(atividade.DATA_INICIO || atividade.DATA_HORA)}</p>
              {atividade.TITULO && <p className="text-sm text-gray-700 mt-1 font-medium">{atividade.TITULO}</p>}
              {atividade.DESCRICAO && <p className="text-xs text-gray-600 mt-1">{atividade.DESCRICAO}</p>}
            </div>
            <DropdownMenu open={mostrarOpcoes} onOpenChange={setMostrarOpcoes}>
              <DropdownMenuTrigger asChild>
                <button className="p-1 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0">
                  <MoreVertical className="w-5 h-5 text-gray-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {!estaRealizado && (
                  <DropdownMenuItem onClick={() => { marcarRealizadoAtividade(); setMostrarOpcoes(false); }} disabled={concluindoAtividade || isLeadPerdido}>
                    <CheckCircle className="w-4 h-4 mr-2" /> Concluir
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => { setEditandoAtividade(true); setMostrarOpcoes(false); }} disabled={isLeadPerdido}>
                  <Pencil className="w-4 h-4 mr-2" /> Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { inativarAtividade(); setMostrarOpcoes(false); }} disabled={inativandoAtividade || isLeadPerdido} className="text-red-600">
                  <Trash2 className="w-4 h-4 mr-2" /> Inativar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    )
  }

  // Modo de edição
  return (
    <div className={`border rounded-lg p-3 space-y-3 ${isLeadPerdido ? 'bg-gray-100' : 'bg-white'}`}>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Título</Label>
          <Input value={tituloAtividade} onChange={(e) => setTituloAtividade(e.target.value)} className="text-xs" disabled={salvandoAtividade || isLeadPerdido} />
        </div>
        <div>
          <Label className="text-xs">Descrição</Label>
          <Textarea value={descricaoAtividade} onChange={(e) => setDescricaoAtividade(e.target.value)} className="text-xs" disabled={salvandoAtividade || isLeadPerdido} rows={2} />
        </div>
        <div>
          <Label className="text-xs">Tipo</Label>
          <Select value={tipoAtividade} onValueChange={setTipoAtividade} disabled={salvandoAtividade || isLeadPerdido}>
            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NOTA">Nota</SelectItem>
              <SelectItem value="LIGACAO">Ligação</SelectItem>
              <SelectItem value="EMAIL">E-mail</SelectItem>
              <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
              <SelectItem value="REUNIAO">Reunião</SelectItem>
              <SelectItem value="VISITA">Visita</SelectItem>
              <SelectItem value="PROPOSTA">Proposta</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Data Início</Label><Input type="datetime-local" value={dataInicioAtividade} onChange={(e) => setDataInicioAtividade(e.target.value)} className="text-xs" disabled={salvandoAtividade || isLeadPerdido} /></div>
          <div><Label className="text-xs">Data Fim</Label><Input type="datetime-local" value={dataFimAtividade} onChange={(e) => setDataFimAtividade(e.target.value)} className="text-xs" disabled={salvandoAtividade || isLeadPerdido} /></div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={salvarEdicaoAtividade} disabled={salvandoAtividade || isLeadPerdido} className="flex-1">{salvandoAtividade ? 'Salvando...' : 'Salvar'}</Button>
          <Button size="sm" variant="outline" onClick={() => setEditandoAtividade(false)} disabled={salvandoAtividade || isLeadPerdido} className="flex-1">Cancelar</Button>
        </div>
      </div>
    </div>
  )
}

export function LeadModal({ isOpen, onClose, lead, onSave, funilSelecionado, onLeadUpdated }: LeadModalProps) {
  const { toast } = useToast()

  const [formData, setFormData] = useState<Partial<Lead>>({
    NOME: "",
    DESCRICAO: "",
    VALOR: 0,
    CODESTAGIO: "",
    DATA_VENCIMENTO: new Date().toISOString().split('T')[0],
    TIPO_TAG: "",
    COR_TAG: "#3b82f6",
    CODPARC: undefined,
    CODFUNIL: undefined,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState("")
  const [parceiros, setParceiros] = useState<Partner[]>([]) // Garantir que sempre é um array
  const [isLoadingPartners, setIsLoadingPartners] = useState(false)
  const [estagios, setEstagios] = useState<any[]>([])
  const [partnerSearch, setPartnerSearch] = useState("")
  const [partnerLoadError, setPartnerLoadError] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [atividades, setAtividades] = useState<any[]>([])
  const [eventos, setEventos] = useState<any[]>([])
  const [activeAtividadeTab, setActiveAtividadeTab] = useState<'nota' | 'email' | 'ligacao' | 'whatsapp' | 'proposta' | 'reuniao' | 'visita'>('nota')
  const [atividadeForm, setAtividadeForm] = useState({
    titulo: '', // Campo adicionado para o título
    descricao: '',
    dataInicial: new Date().toISOString().slice(0, 16), // formato: YYYY-MM-DDTHH:mm
    dataFinal: new Date().toISOString().slice(0, 16) // formato: YYYY-MM-DDTHH:mm
  })
  const [produtosLead, setProdutosLead] = useState<any[]>([])
  const [isSavingAtividade, setIsSavingAtividade] = useState(false)
  const [isLoadingAtividades, setIsLoadingAtividades] = useState(false)
  const [isLoadingProdutos, setIsLoadingProdutos] = useState(false)
  const [editandoProduto, setEditandoProduto] = useState<string | null>(null)
  const [produtoEditForm, setProdutoEditForm] = useState({ quantidade: 0, vlrunit: 0 })
  const [showModalEdicaoProduto, setShowModalEdicaoProduto] = useState(false)
  const [produtoSelecionadoEdicao, setProdutoSelecionadoEdicao] = useState<any | null>(null)

  const [showAdicionarProdutoModal, setShowAdicionarProdutoModal] = useState(false)
  const [showEditarTituloModal, setShowEditarTituloModal] = useState(false)
  const [novoTitulo, setNovoTitulo] = useState("")
  const [showPerdidoModal, setShowPerdidoModal] = useState(false)
  const [motivoPerda, setMotivoPerda] = useState("")
  const [showPedidoVendaModal, setShowPedidoVendaModal] = useState(false)
  const [dadosPedidoVenda, setDadosPedidoVenda] = useState<any>(null)
  const [isConfirmingPerdido, setIsConfirmingPerdido] = useState(false)
  const [mostrarDialogoStatus, setMostrarDialogoStatus] = useState(false)
  const [mostrarDialogoPerda, setMostrarDialogoPerda] = useState(false)
  const [mostrarConfirmacaoExclusao, setMostrarConfirmacaoExclusao] = useState(false)
  const [mostrarPedidoVenda, setMostrarPedidoVenda] = useState(false) // Adicionado para controlar a visibilidade do modal de pedido de venda
  const [showConfirmacaoGanho, setShowConfirmacaoGanho] = useState(false) // Estado para confirmação de ganho
  const [isLoadingPedido, setIsLoadingPedido] = useState(false) // Estado para controlar o carregamento do pedido
  const [showPedidoRapido, setShowPedidoRapido] = useState(false) // Estado para controlar a visibilidade do modal Pedido Rápido
  const [showProdutoModal, setShowProdutoModal] = useState(false); // Estado para controlar a visibilidade do modal de produto
  const [salvandoPedido, setSalvandoPedido] = useState(false) // Estado para controlar o salvamento do pedido
  const [salvarPedidoFn, setSalvarPedidoFn] = useState<(() => Promise<boolean | undefined>) | null>(null) // Função para salvar o pedido
  const [showCarrinhoModalPedido, setShowCarrinhoModalPedido] = useState(false) // Adicionado para controlar a visibilidade do carrinho do modal de pedido


  // Mobile specific states
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  const [novaAtividade, setNovaAtividade] = useState({
    tipo: 'NOTA',
    titulo: '',
    descricao: '',
    dataInicio: new Date().toISOString().slice(0, 16),
    dataFim: new Date().toISOString().slice(0, 16)
  })
  const [isLeadGanho, setIsLeadGanho] = useState(false) // Adicionado para controle de estado visual
  const [isLeadPerdido, setIsLeadPerdido] = useState(false) // Adicionado para controle de estado visual

  const handleClose = useCallback(() => {
    // Limpar todos os estados de modais
    setShowModalEdicaoProduto(false)
    setShowAdicionarProdutoModal(false)
    setShowEditarTituloModal(false)
    setShowPerdidoModal(false)
    setShowPedidoVendaModal(false)
    setMostrarDialogoStatus(false)
    setMostrarDialogoPerda(false)
    setMostrarConfirmacaoExclusao(false)
    setMostrarPedidoVenda(false)
    setShowConfirmacaoGanho(false)
    setShowProdutoModal(false)
    setSalvandoPedido(false)
    setSalvarPedidoFn(null)
    setShowMoreOptions(false)
    setShowCarrinhoModalPedido(false) // Limpar estado do carrinho do pedido

    // Limpar estados de dados
    setProdutoSelecionadoEdicao(null)
    setProdutoEditForm({ quantidade: 0, vlrunit: 0 })
    setMotivoPerda("")
    setDadosPedidoVenda(null)
    setPartnerSearch("")
    setAtividades([])
    setEventos([])
    setProdutosLead([])

    // Resetar formulários
    setFormData({
      NOME: "",
      DESCRICAO: "",
      VALOR: 0,
      CODESTAGIO: "",
      DATA_VENCIMENTO: new Date().toISOString().split('T')[0],
      TIPO_TAG: "",
      COR_TAG: "#3b82f6",
      CODPARC: undefined,
      CODFUNIL: undefined,
    })

    setAtividadeForm({
      titulo: '',
      descricao: '',
      dataInicial: new Date().toISOString().slice(0, 16),
      dataFinal: new Date().toISOString().slice(0, 16)
    })

    setNovaAtividade({
      tipo: 'NOTA',
      titulo: '',
      descricao: '',
      dataInicio: new Date().toISOString().slice(0, 16),
      dataFim: new Date().toISOString().slice(0, 16)
    })

    // Fechar o modal principal
    onClose()
  }, [onClose])

  // Função para confirmar ganho (chamada pelo modal de Pedido de Venda)
  const handleConfirmarGanho = useCallback(async () => {
    console.log('🎯 Confirmando lead como ganho...')

    if (!salvarPedidoFn) {
      console.error('❌ Função salvarPedido não disponível')
      toast({
        title: "Erro",
        description: "Função de salvar pedido não está disponível",
        variant: "destructive",
      })
      return
    }

    if (!lead) {
      console.error('❌ Lead não disponível')
      toast({
        title: "Erro",
        description: "Lead não encontrado",
        variant: "destructive",
      })
      return
    }

    try {
      setSalvandoPedido(true)
      console.log('💾 Executando salvarPedido...')

      // Executar a função de salvar pedido
      const sucesso = await salvarPedidoFn()

      console.log('📊 Resultado do salvamento:', sucesso)

      if (!sucesso) {
        console.log('❌ Pedido não foi salvo - interrompendo fluxo')
        setSalvandoPedido(false)
        return
      }

      console.log('✅ Pedido salvo - atualizando status do lead...')

      // Atualizar status do lead para GANHO
      const { atualizarStatusLead } = await import('@/lib/lead-atividades-service')
      await atualizarStatusLead(lead.CODLEAD, 'GANHO')

      console.log('✅ Status atualizado para GANHO')

      toast({
        title: "Sucesso!",
        description: "Pedido criado e lead marcado como ganho!",
      })

      // Limpar estados na ordem correta
      setSalvandoPedido(false)
      setSalvarPedidoFn(null)
      setDadosPedidoVenda(null)

      // Fechar modais na ordem correta
      setMostrarPedidoVenda(false)
      setShowConfirmacaoGanho(false)
      setMostrarDialogoStatus(false)

      // Aguardar um momento para garantir que os modais fecharam
      await new Promise(resolve => setTimeout(resolve, 100))

      // Atualizar kanban
      console.log('🔄 Atualizando kanban...')
      await onSave()

      // Aguardar renderização
      await new Promise(resolve => setTimeout(resolve, 100))

      // Fechar modal do lead
      console.log('🚪 Fechando modal do lead...')
      handleClose()

      console.log('✅ Fluxo completo finalizado com sucesso')

    } catch (error: any) {
      console.error('❌ Erro ao atualizar status:', error)
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar status do lead",
        variant: "destructive",
      })
      setSalvandoPedido(false)
    }
  }, [lead, salvarPedidoFn, toast, onSave, handleClose])

  // Função para lidar com o sucesso da criação do pedido de venda
  const handlePedidoSucesso = useCallback(async () => {
    console.log('✅ [handlePedidoSucesso] Pedido criado - iniciando atualização...')

    try {
      if (!lead) {
        throw new Error('Lead não encontrado')
      }

      // Atualizar status do lead para GANHO
      console.log('🏆 [handlePedidoSucesso] Marcando lead como GANHO...')
      const { atualizarStatusLead } = await import('@/lib/lead-atividades-service')
      await atualizarStatusLead(lead.CODLEAD, 'GANHO')
      console.log('✅ [handlePedidoSucesso] Status do lead atualizado para GANHO')

      toast({
        title: "Sucesso!",
        description: "Pedido criado e lead marcado como ganho!",
      })

      console.log('🔄 [handlePedidoSucesso] Atualizando kanban...')

      // Atualizar kanban PRIMEIRO para refletir mudanças
      await onSave()

      console.log('✅ [handlePedidoSucesso] Kanban atualizado')

      // Aguardar renderização
      await new Promise(resolve => setTimeout(resolve, 300))

      // Limpar estados
      console.log('🧹 [handlePedidoSucesso] Limpando estados...')
      setSalvandoPedido(false)
      setSalvarPedidoFn(null)
      setDadosPedidoVenda(null)

      // Fechar modais
      console.log('🚪 [handlePedidoSucesso] Fechando modais...')
      setMostrarPedidoVenda(false)
      setMostrarDialogoStatus(false)
      setShowConfirmacaoGanho(false)

      // Aguardar modais fecharem
      await new Promise(resolve => setTimeout(resolve, 200))

      // Fechar modal do lead também
      console.log('🚪 [handlePedidoSucesso] Fechando modal do lead...')
      handleClose()

      console.log('✅ [handlePedidoSucesso] Fluxo finalizado')

    } catch (error: any) {
      console.error('❌ [handlePedidoSucesso] Erro:', error)
      toast({
        title: "Erro",
        description: error.message || "Erro ao finalizar operação",
        variant: "destructive",
      })
      setSalvandoPedido(false)
    }
  }, [lead, toast, onSave, handleClose])

  // Hook para coletar contexto completo do lead para IA
  const { context: leadContext, isLoading: isLoadingContext } = useLeadContext(
    lead,
    funilSelecionado,
    estagios,
    parceiros
  )

  // Log do contexto para IA quando disponível
  useEffect(() => {
    if (leadContext && lead) {
      const contextForAI = formatLeadContextForAI(leadContext)
      console.log('🤖 CONTEXTO DO LEAD PARA IA:', contextForAI)

      // Disponibilizar no window para acesso global (útil para ferramentas de IA)
      if (typeof window !== 'undefined') {
        (window as any).currentLeadContext = {
          raw: leadContext,
          formatted: contextForAI
        }
      }
    }
  }, [leadContext, lead])

  useEffect(() => {
    if (isOpen) {
      setIsInitializing(true)

      if (lead) {
        console.log('🔍 Lead carregado - CODPARC:', lead.CODPARC)
        setIsLeadGanho(lead.STATUS_LEAD === 'GANHO')
        setIsLeadPerdido(lead.STATUS_LEAD === 'PERDIDO')

        setFormData({
          NOME: lead.NOME || "",
          DESCRICAO: lead.DESCRICAO || "",
          VALOR: lead.VALOR || 0,
          CODESTAGIO: lead.CODESTAGIO || "",
          DATA_VENCIMENTO: lead.DATA_VENCIMENTO || "",
          TIPO_TAG: lead.TIPO_TAG || "",
          COR_TAG: lead.COR_TAG || "#3b82f6",
          CODPARC: lead.CODPARC || undefined,
          CODFUNIL: lead.CODFUNIL || undefined,
        })

        // Carregar lista completa de parceiros do cache primeiro
        loadPartners("").then(() => {
          // Se existe CODPARC, buscar o nome do parceiro selecionado
          if (lead.CODPARC) {
            // Buscar do IndexedDB
            import('@/lib/offline-data-service').then(({ OfflineDataService }) => {
              OfflineDataService.getParceiroById(lead.CODPARC).then((parceiro: any) => {
                if (parceiro) {
                  setPartnerSearch(parceiro.NOMEPARC)
                  console.log('✅ Parceiro encontrado no IndexedDB:', parceiro.NOMEPARC)
                } else {
                  console.warn('⚠️ Parceiro não encontrado no IndexedDB:', lead.CODPARC)
                }
              }).catch((e) => {
                console.error('Erro ao buscar parceiro do IndexedDB:', e)
              })
            })
          } else {
            setPartnerSearch("")
          }
        })

        loadAtividades(lead.CODLEAD)
        loadEventos(lead.CODLEAD)
        loadProdutosLead(lead.CODLEAD)
      } else {
        setFormData({
          NOME: "",
          DESCRICAO: "",
          VALOR: 0,
          CODESTAGIO: "",
          DATA_VENCIMENTO: new Date().toISOString().split('T')[0],
          TIPO_TAG: "",
          COR_TAG: "#3b82f6",
          CODPARC: undefined,
          CODFUNIL: undefined,
        })
        setAtividades([])
        setEventos([])
        loadPartners("")
        setPartnerSearch("")
        setIsLeadGanho(false)
        setIsLeadPerdido(false)
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsInitializing(false)
        })
      })
    }
  }, [lead, isOpen])

  useEffect(() => {
    if (!isOpen) {
      setIsInitializing(false)
      setPartnerSearch("")
      setShowMoreOptions(false) // Fechar opções mobile ao fechar modal
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      loadPartners()
      if (funilSelecionado) {
        setEstagios(funilSelecionado.estagios)
        if (!lead && funilSelecionado.estagios.length > 0) {
          setFormData(prev => ({
            ...prev,
            CODFUNIL: funilSelecionado.CODFUNIL,
            CODESTAGIO: funilSelecionado.estagios[0].CODESTAGIO
          }))
        } else if (lead && lead.CODFUNIL === funilSelecionado.CODFUNIL) {
          setFormData(prev => ({
            ...prev,
            CODFUNIL: funilSelecionado.CODFUNIL,
            CODESTAGIO: lead.CODESTAGIO || (funilSelecionado.estagios.length > 0 ? funilSelecionado.estagios[0].CODESTAGIO : "")
          }))
        }
      }
    }
  }, [isOpen, funilSelecionado, lead])

  const loadPartners = async (search: string = "") => {
    try {
      setIsLoadingPartners(true)
      console.log('🔍 Carregando parceiros do IndexedDB...')

      // Buscar do IndexedDB
      const { OfflineDataService } = await import('@/lib/offline-data-service')
      const allParceiros = await OfflineDataService.getParceiros({ search })

      setParceiros(allParceiros)
      console.log(`✅ ${allParceiros.length} parceiros carregados do IndexedDB`)
    } catch (error) {
      console.error('❌ Erro ao carregar parceiros do IndexedDB:', error)
      setParceiros([])
    } finally {
      setIsLoadingPartners(false)
    }
  }

  const handlePartnerSearch = async (value: string) => {
    if (value.length < 2) {
      setParceiros([])
      setIsLoadingPartners(false)
      return
    }

    setIsLoadingPartners(true)

    try {
      console.log('🔍 Buscando parceiros no IndexedDB para:', value)

      // Buscar do IndexedDB
      const { OfflineDataService } = await import('@/lib/offline-data-service')
      const allParceiros = await OfflineDataService.getParceiros({ search: value })

      console.log(`✅ ${allParceiros.length} parceiros encontrados no IndexedDB`)
      setParceiros(allParceiros)
    } catch (error) {
      console.error('❌ Erro ao buscar parceiros no IndexedDB:', error)
      setParceiros([])
    } finally {
      setIsLoadingPartners(false)
    }
  }

  const selecionarParceiro = (codParc: string, nomeParc: string) => {
    setFormData({ ...formData, CODPARC: String(codParc) })
    setPartnerSearch(nomeParc)
    setParceiros([]) // Limpar lista após seleção
  }

  const loadAtividades = async (codLead: string) => {
    try {
      setIsLoadingAtividades(true)
      // Adicionar timestamp para evitar cache e forçar recarga
      const timestamp = new Date().getTime()
      const response = await fetch(`/api/leads/atividades?codLead=${codLead}&ativo=S&t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      })
      if (!response.ok) throw new Error('Erro ao carregar atividades')
      const data = await response.json()
      console.log('✅ Atividades carregadas:', data.length)
      if (data.length > 0) {
        console.log('📋 Primeira atividade:', data[0])
      }
      setAtividades(data)
    } catch (error) {
      console.error('Erro ao carregar atividades:', error)
      setAtividades([])
    } finally {
      setIsLoadingAtividades(false)
    }
  }

  const loadEventos = async (codLead: string) => {
    try {
      const response = await fetch(`/api/leads/eventos?codLead=${codLead}`)
      if (!response.ok) throw new Error('Erro ao carregar eventos')
      const data = await response.json()
      setEventos(data)
    } catch (error) {
      console.error('Erro ao carregar eventos:', error)
    }
  }

  const loadProdutosLead = async (codLead: string) => {
    try {
      setIsLoadingProdutos(true)
      const response = await fetch(`/api/leads/produtos?codLead=${codLead}`)
      if (!response.ok) throw new Error('Erro ao carregar produtos')
      const data = await response.json()
      setProdutosLead(data)
    } catch (error) {
      console.error('Erro ao carregar produtos do lead:', error)
      setProdutosLead([])
    } finally {
      setIsLoadingProdutos(false)
    }
  }

  const handleRemoverProduto = async (codItem: string) => {
    if (!confirm('Deseja realmente remover este produto?')) return
    if (!lead) return

    setIsSaving(true)
    setLoadingMessage("Removendo produto...")

    try {
      const response = await fetch('/api/leads/produtos/remover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codItem,
          codLead: lead.CODLEAD
        })
      })

      if (!response.ok) throw new Error('Erro ao remover produto')

      const resultado = await response.json()

      toast({
        title: "Sucesso",
        description: "Produto removido com sucesso",
      })

      // Atualizar valor total do lead no formData ANTES de recarregar
      if (resultado.novoValorTotal !== undefined) {
        console.log('💰 Atualizando valor total do modal:', resultado.novoValorTotal)
        setFormData(prev => ({
          ...prev,
          VALOR: resultado.novoValorTotal
        }))
      }

      // Recarregar produtos do lead
      await loadProdutosLead(lead.CODLEAD)

      // Recarregar a lista de leads para atualizar o valor no kanban
      await onSave()
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
      setLoadingMessage("")
    }
  }



  const handleEditarProduto = (produto: any) => {
    setProdutoSelecionadoEdicao(produto)
    setProdutoEditForm({
      quantidade: produto.QUANTIDADE,
      vlrunit: produto.VLRUNIT
    })
    setShowModalEdicaoProduto(true)
  }

  const handleSalvarEdicaoProduto = async () => {
    if (!produtoSelecionadoEdicao || !lead) return

    console.log('💾 Salvando edição do produto:', produtoSelecionadoEdicao)
    setIsSaving(true)
    setLoadingMessage("Atualizando produto...")

    try {
      const payload = {
        codItem: String(produtoSelecionadoEdicao.CODITEM),
        codLead: String(lead.CODLEAD),
        quantidade: Number(produtoEditForm.quantidade),
        vlrunit: Number(produtoEditForm.vlrunit)
      }

      console.log('📤 Payload sendo enviado:', payload)

      const response = await fetch('/api/leads/produtos/atualizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Erro ao atualizar produto')
      }

      const resultado = await response.json()
      console.log('✅ Resultado da atualização:', resultado)

      // Atualizar valor total do lead no formData IMEDIATAMENTE
      if (resultado.novoValorTotal !== undefined) {
        console.log('💰 Atualizando valor total do lead:', resultado.novoValorTotal)
        setFormData(prev => ({
          ...prev,
          VALOR: resultado.novoValorTotal
        }))
      }

      toast({
        title: "Sucesso",
        description: "Produto atualizado com sucesso",
      })

      // Fechar modal e limpar formulário
      setShowModalEdicaoProduto(false)
      setProdutoSelecionadoEdicao(null)
      setProdutoEditForm({ quantidade: 0, vlrunit: 0 })

      // Recarregar produtos
      await loadProdutosLead(lead.CODLEAD)

      // Notificar parent para atualizar kanban IMEDIATAMENTE
      if (onLeadUpdated) {
        onLeadUpdated()
      }

      // Recarregar a lista de leads para atualizar o valor no kanban
      await onSave()
    } catch (error: any) {
      console.error('❌ Erro ao salvar edição:', error)
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
      setLoadingMessage("")
    }
  }

  const handleCriarAtividade = async () => {
    if (!lead || !atividadeForm.descricao) { // Alterado para verificar título E descrição
      toast({
        title: "Atenção",
        description: "Preencha o título e a descrição da atividade",
        variant: "destructive",
      })
      return
    }

    const tipoMap: any = {
      'nota': 'NOTA',
      'email': 'EMAIL',
      'ligacao': 'LIGACAO',
      'whatsapp': 'WHATSAPP',
      'proposta': 'PROPOSTA',
      'reuniao': 'REUNIAO',
      'visita': 'VISITA'
    }

    // Cores predefinidas por tipo
    const coresMap: any = {
      'nota': '#EAB308',      // Amarelo
      'ligacao': '#9333EA',   // Roxo
      'email': '#3B82F6',     // Azul
      'whatsapp': '#22C55E',  // Verde
      'proposta': '#6B7280',  // Cinza
      'reuniao': '#F97316',   // Laranja
      'visita': '#000000'     // Preto
    }

    // Atividade criada com sucesso - eventos removidos do sistema

    setIsSavingAtividade(true)

    try {
      // Criar atividade - manter a data/hora exata inserida pelo usuário
      // Adicionar 'Z' para forçar UTC e evitar conversão de fuso horário
      const dataInicio = atividadeForm.dataInicial + ':00.000Z';
      const dataFim = atividadeForm.dataFinal + ':00.000Z';

      // Título e descrição agora são campos separados
      const titulo = atividadeForm.titulo || '';
      const descricao = atividadeForm.descricao || '';

      const response = await fetch('/api/leads/atividades/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          CODLEAD: lead.CODLEAD,
          TIPO: tipoMap[activeAtividadeTab],
          TITULO: titulo,
          DESCRICAO: descricao,
          DADOS_COMPLEMENTARES: '',
          COR: coresMap[activeAtividadeTab],
          DATA_INICIO: dataInicio,
          DATA_FIM: dataFim,
          CODPARC: formData.CODPARC ? String(formData.CODPARC) : undefined
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Erro ao criar atividade')
      }

      const atividadeCriada = await response.json()
      console.log('✅ Atividade criada:', atividadeCriada)

      // Limpar formulário antes de recarregar
      setAtividadeForm({
        titulo: '',
        descricao: '',
        dataInicial: new Date().toISOString().slice(0, 16),
        dataFinal: new Date().toISOString().slice(0, 16)
      })

      toast({
        title: "Sucesso",
        description: "Atividade registrada com sucesso",
      })

      // Aguardar um pequeno delay para garantir que o banco foi atualizado
      await new Promise(resolve => setTimeout(resolve, 300))

      // Recarregar atividades com timestamp para forçar atualização
      await loadAtividades(lead.CODLEAD)
      await loadEventos(lead.CODLEAD)
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setIsSavingAtividade(false)
    }
  }

  const handleStatusChange = async (status: 'EM_ANDAMENTO' | 'GANHO' | 'PERDIDO') => {
    if (!lead) return

    // Bloquear alterações se já estiver GANHO ou PERDIDO
    if (lead.STATUS_LEAD === 'GANHO' || lead.STATUS_LEAD === 'PERDIDO') {
      toast({
        title: "Atenção",
        description: "Este lead já foi finalizado e não pode ser alterado",
        variant: "destructive",
      })
      return
    }

    if (status === 'PERDIDO') {
      setShowPerdidoModal(true)
      return
    }

    if (status === 'GANHO') {
      // Validar se tem produtos antes de abrir modal de pedido
      if (produtosLead.length === 0) {
        toast({
          title: "Atenção",
          description: "Adicione pelo menos um produto antes de marcar como ganho",
          variant: "destructive",
        })
        return
      }

      // Preparar dados do pedido de venda com informações do lead
      const parceiro = parceiros.find(p => p.CODPARC === formData.CODPARC)

      // Obter vendedor do usuário logado
      let codVendUsuario = "0"
      try {
        const userStr = document.cookie
          .split('; ')
          .find(row => row.startsWith('user='))
          ?.split('=')[1]

        if (userStr) {
          const user = JSON.parse(decodeURIComponent(userStr))
          if (user.codVendedor) {
            codVendUsuario = String(user.codVendedor)
          }
        }
      } catch (error) {
        console.error('Erro ao carregar vendedor do usuário:', error)
      }

      const dadosPedido = {
        CODLEAD: lead.CODLEAD, // IMPORTANTE: Passar CODLEAD para atualização posterior
        CODEMP: "1",
        CODCENCUS: "0",
        NUNOTA: "",
        DTNEG: new Date().toISOString().split('T')[0],
        DTFATUR: "",
        DTENTSAI: "",
        CODPARC: formData.CODPARC || "",
        CODTIPOPER: "974",
        TIPMOV: "P",
        CODTIPVENDA: "1",
        CODVEND: codVendUsuario,
        OBSERVACAO: `Lead: ${lead.NOME} - ${formData.DESCRICAO || ''}`,
        VLOUTROS: 0,
        VLRDESCTOT: 0,
        VLRFRETE: 0,
        TIPFRETE: "S",
        ORDEMCARGA: "",
        CODPARCTRANSP: "0",
        PERCDESC: 0,
        CODNAT: "0",
        TIPO_CLIENTE: parceiro?.TIPPESSOA === 'J' ? 'PJ' : parceiro?.TIPPESSOA === 'F' ? 'PF' : 'PJ',
        CPF_CNPJ: parceiro?.CGC_CPF || '',
        IE_RG: parceiro?.IDENTINSCESTAD || '',
        RAZAOSOCIAL: parceiro?.RAZAOSOCIAL || parceiro?.NOMEPARC || '',
        RAZAO_SOCIAL: parceiro?.RAZAOSOCIAL || parceiro?.NOMEPARC || '',
        itens: produtosLead.map(prod => ({
          CODPROD: String(prod.CODPROD),
          DESCRPROD: prod.DESCRPROD,
          QTDNEG: prod.QUANTIDADE,
          VLRUNIT: prod.VLRUNIT,
          PERCDESC: 0,
          CODLOCALORIG: "700",
          CONTROLE: "007",
          CODVOL: "UN",
          IDALIQICMS: "0"
        }))
      }

      console.log('📦 Dados do pedido preparados com CODLEAD:', dadosPedido.CODLEAD);

      setDadosPedidoVenda(dadosPedido)
      setMostrarPedidoVenda(true) // Abre o modal de pedido de venda
      return
    }

    // EM_ANDAMENTO
    try {
      console.log('🔄 Atualizando status do lead para:', status)
      await atualizarStatusLead(lead.CODLEAD, status)
      toast({
        title: "Sucesso",
        description: "Lead marcado como Em Andamento",
      })
      await onSave()
    } catch (error: any) {
      console.error('❌ Erro ao atualizar status:', error)
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const confirmarPerdido = async () => {
    if (!lead || !motivoPerda.trim()) {
      toast({
        title: "Atenção",
        description: "Informe o motivo da perda",
        variant: "destructive",
      })
      return
    }

    setIsConfirmingPerdido(true)

    try {
      console.log('🔄 Iniciando marcação como perdido - CODLEAD:', lead.CODLEAD)
      console.log('📝 Motivo da perda:', motivoPerda)

      // Atualizar status do lead para PERDIDO com motivo via API
      const response = await fetch('/api/leads/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codLead: lead.CODLEAD,
          status: 'PERDIDO',
          motivoPerda: motivoPerda.trim()
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Erro ao atualizar status')
      }

      const result = await response.json()
      console.log('✅ Resposta da API:', result)
      console.log('✅ Lead marcado como perdido com sucesso')

      toast({
        title: "Sucesso",
        description: "Lead marcado como Perdido",
      })

      // Fechar modal de perda
      setMostrarDialogoPerda(false)
      setMotivoPerda("")

      // Recarregar dados do kanban
      await onSave()

      // Fechar modal do lead
      onClose()
    } catch (error: any) {
      console.error('❌ Erro ao confirmar perda:', error)
      toast({
        title: "Erro",
        description: error.message || 'Erro ao marcar lead como perdido',
        variant: "destructive",
      })
    } finally {
      setIsConfirmingPerdido(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Bloquear salvamento se lead já estiver finalizado
    if (lead && (lead.STATUS_LEAD === 'GANHO' || lead.STATUS_LEAD === 'PERDIDO')) {
      toast({
        title: "Atenção",
        description: "Este lead já foi finalizado e não pode ser alterado",
        variant: "destructive",
      })
      return
    }

    if (!formData.CODFUNIL && !funilSelecionado) {
      toast({
        title: "Atenção",
        description: "Nenhum funil foi selecionado.",
        variant: "destructive",
      })
      return
    }

    if (!formData.CODESTAGIO) {
      toast({
        title: "Atenção",
        description: "Por favor, selecione um estágio.",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    setLoadingMessage(lead ? "Atualizando lead..." : "Criando lead...")

    try {
      const dataToSave: any = {
        NOME: formData.NOME,
        DESCRICAO: formData.DESCRICAO,
        VALOR: formData.VALOR || 0,
        CODESTAGIO: formData.CODESTAGIO,
        CODFUNIL: formData.CODFUNIL || funilSelecionado?.CODFUNIL,
        DATA_VENCIMENTO: formData.DATA_VENCIMENTO,
        TIPO_TAG: formData.TIPO_TAG,
        COR_TAG: formData.COR_TAG
      }

      // Incluir CODLEAD se for atualização
      if (lead?.CODLEAD) {
        dataToSave.CODLEAD = lead.CODLEAD
      }

      // Incluir CODPARC apenas se foi selecionado
      if (formData.CODPARC) {
        dataToSave.CODPARC = String(formData.CODPARC)
        console.log('💾 Salvando lead com CODPARC:', dataToSave.CODPARC)
      } else {
        console.log('💾 Salvando lead sem CODPARC (vazio)')
      }

      // NÃO incluir produtos ao atualizar lead existente para evitar duplicação
      // Os produtos já estão salvos separadamente na tabela AD_ADLEADSPRODUTOS

      const response = await fetch('/api/leads/salvar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Falha ao salvar lead')
      }

      const resultado = await response.json()
      console.log('✅ Lead salvo com sucesso:', resultado)

      toast({
        title: "Sucesso",
        description: lead ? "Lead atualizado com sucesso!" : "Lead criado com sucesso!",
      })

      await onSave()
      onClose()
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Falha ao salvar lead. Tente novamente.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
      setLoadingMessage("")
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return ''
    try {
      // Se a data já está no formato DD/MM/YYYY
      if (dateString.includes('/')) {
        return dateString
      }
      // Se a data está no formato ISO ou YYYY-MM-DD
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return ''
      return date.toLocaleDateString('pt-BR')
    } catch (e) {
      return ''
    }
  }

  const [activeTab, setActiveTab] = useState<'atividades' | 'valor' | 'dados'>('atividades')

  if (!isOpen) return null

  if (isInitializing) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div className="relative flex flex-col items-center gap-4 p-6 bg-card rounded-lg shadow-lg border">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-foreground">Carregando dados...</p>
        </div>
      </div>
    )
  }

  const parceiroSelecionado = Array.isArray(parceiros) ? parceiros.find(p => p.CODPARC === formData.CODPARC) : undefined
  const estagioAtual = Array.isArray(estagios) ? estagios.find(e => e.CODESTAGIO === formData.CODESTAGIO) : undefined
  const currentUser = lead ? { name: 'Usuário Atual' } : null // Simulação de usuário logado

  // Função para reativar o lead
  const handleReativarLead = async () => {
    if (!lead) return

    setIsSaving(true)
    setLoadingMessage("Reativando lead...")

    try {
      console.log('🔄 Reativando lead - CODLEAD:', lead.CODLEAD)

      // Usar a rota de status existente
      const response = await fetch('/api/leads/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codLead: lead.CODLEAD,
          status: 'EM_ANDAMENTO'
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Erro ao reativar lead')
      }

      console.log('✅ Lead reativado com sucesso')

      toast({
        title: "Sucesso",
        description: "Lead reativado para Em Andamento",
      })

      // Aguardar para garantir que o backend processou
      await new Promise(resolve => setTimeout(resolve, 500))

      // Recarregar dados
      await onSave()

      // Aguardar renderização
      await new Promise(resolve => setTimeout(resolve, 300))

      // Fechar modal para forçar reabertura com dados atualizados
      onClose()

    } catch (error: any) {
      console.error('❌ Erro ao reativar lead:', error)
      toast({
        title: "Erro",
        description: error.message || 'Erro ao reativar lead',
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
      setLoadingMessage("")
    }
  }

  // Função para confirmar a exclusão do lead
  const handleConfirmarExclusao = async () => {
    if (!lead) return
    setIsSaving(true)
    setLoadingMessage("Excluindo lead...")
    try {
      const response = await fetch(`/api/leads/excluir/${lead.CODLEAD}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Erro ao excluir lead')
      toast({ title: "Sucesso", description: "Lead excluído com sucesso" })
      setMostrarConfirmacaoExclusao(false)
      onClose()
      onSave()
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" })
    } finally {
      setIsSaving(false)
      setLoadingMessage("")
    }
  }

  // Funções mobile helpers
  const handleMarcarComoPerdido = () => {
    setMostrarDialogoPerda(true)
    setShowMoreOptions(false) // Fechar menu mobile
  }
  const handleMarcarComoGanho = () => {
    handleStatusChange('GANHO')
    setShowMoreOptions(false) // Fechar menu mobile
  }

  // Funções para salvar nova atividade mobile
  const handleSalvarAtividade = async () => {
    if (!lead || !novaAtividade.titulo.trim()) {
      toast({ title: 'Atenção', description: 'Preencha o título da atividade', variant: 'destructive' })
      return
    }
    setIsSaving(true)
    try {
      const coresMap: any = {
        'NOTA': '#6B7280',
        'LIGACAO': '#3B82F6',
        'EMAIL': '#9333EA',
        'WHATSAPP': '#22C55E',
        'PROPOSTA': '#6366F1',
        'REUNIAO': '#10B981',
        'VISITA': '#EF4444'
      }

      const response = await fetch('/api/leads/atividades/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          CODLEAD: lead.CODLEAD,
          TIPO: novaAtividade.tipo,
          TITULO: novaAtividade.titulo,
          DESCRICAO: novaAtividade.descricao,
          COR: coresMap[novaAtividade.tipo] || '#3B82F6',
          DATA_INICIO: novaAtividade.dataInicio + ':00Z',
          DATA_FIM: novaAtividade.dataFim + ':00Z',
          CODPARC: formData.CODPARC ? String(formData.CODPARC) : undefined
        })
      })
      if (!response.ok) throw new Error('Erro ao criar atividade')
      toast({ title: 'Sucesso', description: 'Atividade criada' })
      setNovaAtividade({ tipo: 'NOTA', titulo: '', descricao: '', dataInicio: new Date().toISOString().slice(0, 16), dataFim: new Date().toISOString().slice(0, 16) })
      await loadAtividades(lead.CODLEAD)
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center md:p-4 text-slate-900">
      {isSaving && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="relative flex flex-col items-center gap-4 p-6 bg-card rounded-lg shadow-lg border">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-foreground">{loadingMessage}</p>
          </div>
        </div>
      )}

      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-card md:rounded-lg shadow-xl w-full h-full md:h-auto md:max-w-7xl md:max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header Mobile */}
        <div className="md:hidden flex-shrink-0 bg-[#f5f5f5] border-b px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-gray-900 truncate">
                {lead ? `${lead.CODLEAD} - ${formData.NOME}` : "Novo Lead"}
              </h2>
              <p className="text-xs text-gray-600 truncate">
                {lead && estagioAtual ? estagioAtual.NOME : 'Criar novo lead'}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="flex-shrink-0 p-2 text-gray-700 hover:bg-gray-200 rounded-full transition-colors"
              type="button"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Header Desktop */}
        <div className="hidden md:block border-b bg-background/50 px-3 md:px-6 py-3 md:py-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-3 md:mb-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <h2 className="text-base md:text-lg font-bold text-foreground truncate">
                {lead ? `${lead.CODLEAD} - ${formData.NOME}` : "Novo Lead"}
              </h2>
              <button
                onClick={handleClose}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 ml-auto"
                type="button"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground flex-wrap">
            <span className="whitespace-nowrap">Período indefinido</span>
            <div className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <span className="whitespace-nowrap">{currentUser?.name || 'Usuário'}</span>
            </div>
            {lead && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors ml-auto">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => {
                      setNovoTitulo(formData.NOME || "")
                      setShowEditarTituloModal(true)
                    }}
                    disabled={isLeadPerdido}
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    Editar título
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Funil Progress - Mobile: apenas estágio atual, Desktop: todos os estágios */}
          {estagios.length > 0 && (
            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-2 mb-4 md:mb-3">
              <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span>{funilSelecionado?.NOME || 'Funil de Vendas'}</span>
              </div>

              {/* Mobile: Apenas estágio atual */}
              <div className="md:hidden">
                {estagioAtual && (
                  <div
                    className="px-3 py-1.5 text-xs font-medium rounded-md text-white flex items-center justify-center"
                    style={{ backgroundColor: estagioAtual.COR }}
                  >
                    <span>{estagioAtual.NOME}</span>
                  </div>
                )}
              </div>

              {/* Desktop: Todos os estágios */}
              <div className="hidden md:flex items-center flex-1 relative overflow-x-auto">
                {estagios.sort((a, b) => a.ORDEM - b.ORDEM).map((estagio, index) => {
                  const isActive = estagio.CODESTAGIO === formData.CODESTAGIO;
                  const isPast = index < estagios.findIndex(e => e.CODESTAGIO === formData.CODESTAGIO);

                  return (
                    <div
                      key={estagio.CODESTAGIO}
                      className={`
                    relative px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium
                    ${isActive ? 'bg-primary text-primary-foreground' : isPast ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}
                    ${index === 0 ? 'rounded-l-md pl-3 md:pl-4' : 'pl-4 md:pl-5'}
                    ${index === estagios.length - 1 ? 'rounded-r-md pr-3 md:pr-4' : 'pr-2 md:pr-3'}
                    transition-all duration-200
                    flex items-center justify-center
                    flex-1 min-w-fit
                  `}
                      style={{
                        clipPath: index === estagios.length - 1
                          ? undefined
                          : 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)',
                        marginRight: index === estagios.length - 1 ? '0' : '-8px',
                        zIndex: estagios.length - index
                      }}
                    >
                      <span className="relative whitespace-nowrap">{estagio.NOME}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Container: Opções do Cabeçalho - Estilo Pills (Desktop apenas) */}
          {lead && (
            <div className="hidden md:flex items-center gap-2 flex-wrap mt-3 md:mt-0">
              {/* Botão ATIVAR - apenas para leads perdidos, não para GANHO */}
              {lead.STATUS_LEAD === 'PERDIDO' && (
                <button
                  onClick={handleReativarLead}
                  className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-1.5 rounded-md transition-all duration-200 bg-blue-500 border-blue-500 text-white hover:bg-blue-600 hover:border-blue-600"
                >
                  <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="text-xs md:text-sm font-medium">ATIVAR</span>
                </button>
              )}

              <button
                onClick={() => setMostrarDialogoPerda(true)}
                disabled={lead.STATUS_LEAD === 'PERDIDO' || lead.STATUS_LEAD === 'GANHO'}
                className={`flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-1.5 rounded-md transition-all duration-200 ${lead.STATUS_LEAD === 'PERDIDO'
                  ? 'bg-red-500 border-red-500 text-white cursor-not-allowed'
                  : lead.STATUS_LEAD === 'GANHO'
                    ? 'bg-gray-300 border-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-white border border-red-200 text-red-700 hover:bg-red-500 hover:text-white hover:border-red-500'
                  }`}
              >
                <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-xs md:text-sm font-medium">Perdido</span>
              </button>

              <button
                onClick={() => handleStatusChange('EM_ANDAMENTO')}
                disabled={lead.STATUS_LEAD === 'EM_ANDAMENTO' || !lead.STATUS_LEAD || lead.STATUS_LEAD === 'PERDIDO' || lead.STATUS_LEAD === 'GANHO'}
                className={`flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-1.5 rounded-md transition-all duration-200 ${lead.STATUS_LEAD === 'EM_ANDAMENTO' || !lead.STATUS_LEAD
                  ? 'bg-orange-500 border-orange-500 text-white cursor-not-allowed'
                  : (lead.STATUS_LEAD === 'PERDIDO' || lead.STATUS_LEAD === 'GANHO')
                    ? 'bg-gray-300 border-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-white border border-orange-200 text-orange-700 hover:bg-orange-500 hover:text-white hover:border-orange-500'
                  }`}
              >
                <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs md:text-sm font-medium">Em andamento</span>
              </button>

              <button
                onClick={() => setMostrarDialogoStatus(true)}
                disabled={lead.STATUS_LEAD === 'PERDIDO' || lead.STATUS_LEAD === 'GANHO'}
                className={`flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-1.5 rounded-md transition-all duration-200 ${lead.STATUS_LEAD === 'GANHO'
                  ? 'bg-green-500 border-green-500 text-white cursor-not-allowed shadow-sm'
                  : lead.STATUS_LEAD === 'PERDIDO'
                    ? 'bg-gray-300 border-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-white border border-green-200 text-green-700 hover:bg-green-500 hover:text-white hover:border-green-500'
                  }`}
              >
                <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-xs md:text-sm font-medium">
                  {lead.STATUS_LEAD === 'GANHO' ? 'Lead Ganho' : 'Ganho'}
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50 space-y-4 md:space-y-6 scrollbar-hide">
            <style jsx>{`
              .scrollbar-hide {
                -ms-overflow-style: none;
                scrollbar-width: none;
              }
              .scrollbar-hide::-webkit-scrollbar {
                display: none;
              }
            `}</style>

            {/* Mobile Tabs - apenas para leads existentes */}
            {lead && (
              <div className="md:hidden">
                {/* Botões de Status e Alterar Estágio - Mobile */}
                <div className="px-4 pb-3 space-y-2">
                  {/* Botões de Status */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (lead.STATUS_LEAD === 'EM_ANDAMENTO' || !lead.STATUS_LEAD) {
                          // Já está em andamento
                          toast({
                            title: "Informação",
                            description: "Lead já está em andamento",
                          })
                        } else {
                          handleStatusChange('EM_ANDAMENTO')
                        }
                      }}
                      disabled={lead.STATUS_LEAD === 'EM_ANDAMENTO' || !lead.STATUS_LEAD}
                      className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all ${lead.STATUS_LEAD === 'EM_ANDAMENTO' || !lead.STATUS_LEAD
                        ? 'bg-orange-500 text-white'
                        : 'bg-white border border-orange-200 text-orange-700 active:bg-orange-500 active:text-white'
                        }`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Em Andamento</span>
                      </div>
                    </button>
                    <button
                      onClick={() => setMostrarDialogoStatus(true)}
                      disabled={lead.STATUS_LEAD === 'PERDIDO' || lead.STATUS_LEAD === 'GANHO'}
                      className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all ${lead.STATUS_LEAD === 'GANHO'
                        ? 'bg-green-500 text-white'
                        : lead.STATUS_LEAD === 'PERDIDO'
                          ? 'bg-gray-300 text-gray-500'
                          : 'bg-white border border-green-200 text-green-700 active:bg-green-500 active:text-white'
                        }`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>{lead.STATUS_LEAD === 'GANHO' ? 'Lead Ganho' : 'Ganho'}</span>
                      </div>
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setMostrarDialogoPerda(true)}
                      disabled={lead.STATUS_LEAD === 'PERDIDO' || lead.STATUS_LEAD === 'GANHO'}
                      className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all ${lead.STATUS_LEAD === 'PERDIDO'
                        ? 'bg-red-500 text-white'
                        : lead.STATUS_LEAD === 'GANHO'
                          ? 'bg-gray-300 text-gray-500'
                          : 'bg-white border border-red-200 text-red-700 active:bg-red-500 active:text-white'
                        }`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Perdido</span>
                      </div>
                    </button>
                  </div>

                  {/* Botão de Reativar - apenas para leads perdidos */}
                  {lead.STATUS_LEAD === 'PERDIDO' && (
                    <button
                      onClick={handleReativarLead}
                      className="w-full px-3 py-2 rounded-md text-xs font-medium transition-all bg-blue-500 text-white active:bg-blue-600"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>Reativar Lead</span>
                      </div>
                    </button>
                  )}
                </div>

                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                  <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="atividades" className="text-xs">Atividades</TabsTrigger>
                    <TabsTrigger value="valor" className="text-xs">Valor</TabsTrigger>
                    <TabsTrigger value="dados" className="text-xs">Dados</TabsTrigger>
                  </TabsList>

                  <TabsContent value="atividades" className="mt-0 pb-32">
                    {/* Histórico de Atividades - Primeiro */}
                    <div className="space-y-3 mb-4">
                      {isLoadingAtividades ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : atividades.length === 0 ? (
                        <div className="text-center py-8 px-4 bg-gray-50 rounded-lg border border-dashed">
                          <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda</p>
                          <p className="text-xs text-muted-foreground mt-1">Use o campo abaixo para adicionar a primeira</p>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xs font-medium text-muted-foreground uppercase">Histórico</h3>
                            <span className="text-xs text-muted-foreground">{atividades.length} atividade{atividades.length !== 1 ? 's' : ''}</span>
                          </div>
                          {atividades.map((ativ, index) => (
                            <AtividadeItem
                              key={ativ.CODATIVIDADE || index}
                              atividade={ativ}
                              codLead={lead!.CODLEAD}
                              onReload={() => loadAtividades(lead!.CODLEAD)}
                              isLeadPerdido={isLeadPerdido}
                            />
                          ))}
                        </>
                      )}
                    </div>

                    {/* Input de Nova Atividade - Fixo no rodapé */}
                    <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-lg z-40">
                      <div className="max-w-2xl mx-auto space-y-3">
                        {/* Botões de tipo de atividade - Compactos */}
                        <div className="flex gap-1.5 overflow-x-auto pb-1">
                          <button onClick={() => setNovaAtividade({ ...novaAtividade, tipo: 'NOTA' })} className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${novaAtividade.tipo === 'NOTA' ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                            <FileText className="w-4 h-4" />
                          </button>
                          <button onClick={() => setNovaAtividade({ ...novaAtividade, tipo: 'LIGACAO' })} className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${novaAtividade.tipo === 'LIGACAO' ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-500'}`}>
                            <Phone className="w-4 h-4" />
                          </button>
                          <button onClick={() => setNovaAtividade({ ...novaAtividade, tipo: 'EMAIL' })} className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${novaAtividade.tipo === 'EMAIL' ? 'bg-purple-500 text-white' : 'bg-purple-50 text-purple-500'}`}>
                            <Mail className="w-4 h-4" />
                          </button>
                          <button onClick={() => setNovaAtividade({ ...novaAtividade, tipo: 'WHATSAPP' })} className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${novaAtividade.tipo === 'WHATSAPP' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-600'}`}>
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          <button onClick={() => setNovaAtividade({ ...novaAtividade, tipo: 'REUNIAO' })} className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${novaAtividade.tipo === 'REUNIAO' ? 'bg-green-500 text-white' : 'bg-green-50 text-green-500'}`}>
                            <Users className="w-4 h-4" />
                          </button>
                          <button onClick={() => setNovaAtividade({ ...novaAtividade, tipo: 'VISITA' })} className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${novaAtividade.tipo === 'VISITA' ? 'bg-red-500 text-white' : 'bg-red-50 text-red-500'}`}>
                            <MapPin className="w-4 h-4" />
                          </button>
                          <button onClick={() => setNovaAtividade({ ...novaAtividade, tipo: 'PROPOSTA' })} className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${novaAtividade.tipo === 'PROPOSTA' ? 'bg-indigo-500 text-white' : 'bg-indigo-50 text-indigo-500'}`}>
                            <FileText className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Input expandível */}
                        <div className="flex gap-2 items-end">
                          <div className="flex-1 space-y-2">
                            <Input
                              placeholder="Escrever nota..."
                              value={novaAtividade.titulo}
                              onChange={(e) => setNovaAtividade({ ...novaAtividade, titulo: e.target.value })}
                              className="text-sm"
                              disabled={isLeadPerdido}
                            />
                            {novaAtividade.titulo.trim() && (
                              <>
                                <Textarea
                                  placeholder="Adicionar mais detalhes (opcional)"
                                  value={novaAtividade.descricao}
                                  onChange={(e) => setNovaAtividade({ ...novaAtividade, descricao: e.target.value })}
                                  className="text-sm min-h-[50px] resize-none"
                                  disabled={isLeadPerdido}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    type="datetime-local"
                                    value={novaAtividade.dataInicio}
                                    onChange={(e) => setNovaAtividade({ ...novaAtividade, dataInicio: e.target.value })}
                                    className="text-xs"
                                    disabled={isLeadPerdido}
                                  />
                                  <Input
                                    type="datetime-local"
                                    value={novaAtividade.dataFim}
                                    onChange={(e) => setNovaAtividade({ ...novaAtividade, dataFim: e.target.value })}
                                    className="text-xs"
                                    disabled={isLeadPerdido}
                                    placeholder="Data fim (opcional)"
                                  />
                                </div>
                              </>
                            )}
                          </div>
                          <Button
                            onClick={handleSalvarAtividade}
                            size="icon"
                            className="h-10 w-10 rounded-full bg-green-500 hover:bg-green-600 flex-shrink-0"
                            disabled={isSaving || isLeadPerdido || !novaAtividade.titulo.trim()}
                          >
                            {isSaving ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                              </svg>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="valor" className="space-y-4 mt-0">
                    {/* Valor do Lead - Destaque */}
                    <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg p-6 text-center border border-primary/20">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <DollarSign className="w-5 h-5 text-primary" />
                        <span className="text-xs font-medium text-primary uppercase tracking-wide">Valor do Negócio</span>
                      </div>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={formData.VALOR ? formatCurrency(formData.VALOR) : ''}
                        onChange={(e) => {
                          const valor = e.target.value.replace(/[^\d,]/g, '').replace(',', '.')
                          setFormData({ ...formData, VALOR: parseFloat(valor) || 0 })
                        }}
                        placeholder="R$ 0,00"
                        className="text-3xl font-bold text-foreground text-center border-none bg-transparent focus-visible:ring-0"
                        disabled={isLeadPerdido}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Produtos e serviços</p>
                    </div>

                    {/* Lista de Produtos - Mobile */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-xs font-medium text-muted-foreground uppercase">Produtos vinculados</h3>
                        <Button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowAdicionarProdutoModal(true);
                          }}
                          size="sm"
                          className="h-8 text-xs bg-primary/10 hover:bg-primary/20 text-primary"
                          disabled={isLeadPerdido}
                          type="button"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Adicionar
                        </Button>
                      </div>
                      {isLoadingProdutos ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : produtosLead.length > 0 ? (
                        produtosLead.map((produto, index) => (
                          <div key={produto.CODITEM || index} className="bg-white rounded-lg border p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{produto.DESCRPROD}</p>
                                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                  <span>Qtd: {produto.QUANTIDADE}</span>
                                  <span>•</span>
                                  <span>{formatCurrency(produto.VLRUNIT)}</span>
                                </div>
                                <p className="text-sm font-semibold text-foreground mt-1">{formatCurrency(produto.VLRTOTAL)}</p>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleEditarProduto(produto)}
                                  className="w-8 h-8 flex items-center justify-center rounded-md text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition-colors"
                                  disabled={isLeadPerdido}
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleRemoverProduto(produto.CODITEM)}
                                  className="w-8 h-8 flex items-center justify-center rounded-md text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
                                  disabled={isLeadPerdido}
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 px-4 bg-gray-50 rounded-lg border border-dashed">
                          <p className="text-sm text-muted-foreground">Nenhum produto vinculado</p>
                          <p className="text-xs text-muted-foreground mt-1">Toque em Adicionar para começar</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="dados" className="space-y-4 mt-0">
                    {/* Dados Principais */}
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase block mb-2">Responsável</label>
                        <div className="flex items-center gap-3 bg-white rounded-lg border p-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                            {(currentUser?.name || 'U')[0].toUpperCase()}
                          </div>
                          <span className="text-sm font-medium">{currentUser?.name || 'Usuário Atual'}</span>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase block mb-2">Data de início</label>
                        <div className="flex items-center gap-2 bg-white rounded-lg border p-3">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">Hoje</span>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="dataFimMobile" className="text-xs font-medium text-muted-foreground uppercase block mb-2">Data de conclusão</Label>
                        <Input
                          id="dataFimMobile"
                          type="date"
                          value={formData.DATA_VENCIMENTO || ''}
                          onChange={(e) => setFormData({ ...formData, DATA_VENCIMENTO: e.target.value })}
                          className="text-sm"
                          disabled={isLeadPerdido}
                        />
                      </div>

                      <div>
                        <Label htmlFor="descricaoMobile" className="text-xs font-medium text-muted-foreground uppercase block mb-2">Descrição</Label>
                        <Textarea
                          id="descricaoMobile"
                          value={formData.DESCRICAO}
                          onChange={(e) => setFormData({ ...formData, DESCRICAO: e.target.value })}
                          placeholder="Adicionar descrição"
                          className="text-sm min-h-[100px]"
                          disabled={isLeadPerdido}
                        />
                      </div>
                    </div>

                    {/* Metadados no Rodapé */}
                    {lead && (
                      <div className="mt-8 pt-4 border-t space-y-2">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3">Informações do Sistema</p>
                        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                          <div>
                            <p className="text-[10px] uppercase mb-1">Cadastrado por</p>
                            <p className="text-foreground/70">{currentUser?.name || 'Usuário Atual'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase mb-1">Data cadastro</p>
                            <p className="text-foreground/70">{lead.DTCAD ? formatDate(lead.DTCAD) : '-'}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-[10px] uppercase mb-1">Última atualização</p>
                            <p className="text-foreground/70">{lead.DTATU ? formatDate(lead.DTATU) : '-'}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            )}

            {/* Desktop Content - Tabs (igual ao mobile) */}
            {lead && (
              <div className="hidden md:block">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                  <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="atividades" className="text-sm">Atividades</TabsTrigger>
                    <TabsTrigger value="valor" className="text-sm">Valor</TabsTrigger>
                    <TabsTrigger value="dados" className="text-sm">Dados</TabsTrigger>
                  </TabsList>

                  <TabsContent value="atividades" className="space-y-6 mt-0">
                    {/* Container: Registrar Atividade - Desktop */}
                    <div className="bg-white rounded-lg shadow-sm border p-4">
                      <h3 className="text-sm font-semibold text-foreground mb-3">Registrar Atividade</h3>
                      <div className="flex gap-2 mb-4 flex-wrap overflow-x-auto">
                        <button
                          onClick={() => setActiveAtividadeTab('nota')}
                          className={`px-3 py-1.5 text-xs font-medium flex items-center gap-2 rounded-md transition-colors whitespace-nowrap ${activeAtividadeTab === 'nota' ? 'text-white' : 'bg-gray-100 text-muted-foreground hover:bg-gray-200'
                            }`}
                          style={activeAtividadeTab === 'nota' ? { backgroundColor: '#EAB308' } : {}}
                        >
                          <FileText className="w-3 h-3" />
                          Nota
                        </button>
                        <button
                          onClick={() => setActiveAtividadeTab('ligacao')}
                          className={`px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium flex items-center gap-1 md:gap-2 rounded-md transition-colors whitespace-nowrap ${activeAtividadeTab === 'ligacao' ? 'text-white' : 'bg-gray-100 text-muted-foreground hover:bg-gray-200'
                            }`}
                          style={activeAtividadeTab === 'ligacao' ? { backgroundColor: '#9333EA' } : {}}
                        >
                          <Phone className="w-3 h-3" />
                          Ligação
                        </button>
                        <button
                          onClick={() => setActiveAtividadeTab('email')}
                          className={`px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium flex items-center gap-1 md:gap-2 rounded-md transition-colors whitespace-nowrap ${activeAtividadeTab === 'email' ? 'text-white' : 'bg-gray-100 text-muted-foreground hover:bg-gray-200'
                            }`}
                          style={activeAtividadeTab === 'email' ? { backgroundColor: '#3B82F6' } : {}}
                        >
                          <Mail className="w-3 h-3" />
                          E-mail
                        </button>
                        <button
                          onClick={() => setActiveAtividadeTab('whatsapp')}
                          className={`px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium flex items-center gap-1 md:gap-2 rounded-md transition-colors whitespace-nowrap ${activeAtividadeTab === 'whatsapp' ? 'text-white' : 'bg-gray-100 text-muted-foreground hover:bg-gray-200'
                            }`}
                          style={activeAtividadeTab === 'whatsapp' ? { backgroundColor: '#22C55E' } : {}}
                        >
                          <MessageSquare className="w-3 h-3" />
                          WhatsApp
                        </button>
                        <button
                          onClick={() => setActiveAtividadeTab('proposta')}
                          className={`px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium flex items-center gap-1 md:gap-2 rounded-md transition-colors whitespace-nowrap ${activeAtividadeTab === 'proposta' ? 'text-white' : 'bg-gray-100 text-muted-foreground hover:bg-gray-200'
                            }`}
                          style={activeAtividadeTab === 'proposta' ? { backgroundColor: '#6B7280' } : {}}
                        >
                          <FileText className="w-3 h-3" />
                          Proposta
                        </button>
                        <button
                          onClick={() => setActiveAtividadeTab('reuniao')}
                          className={`px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium flex items-center gap-1 md:gap-2 rounded-md transition-colors whitespace-nowrap ${activeAtividadeTab === 'reuniao' ? 'text-white' : 'bg-gray-100 text-muted-foreground hover:bg-gray-200'
                            }`}
                          style={activeAtividadeTab === 'reuniao' ? { backgroundColor: '#F97316' } : {}}
                        >
                          <Users className="w-3 h-3" />
                          Reunião
                        </button>
                        <button
                          onClick={() => setActiveAtividadeTab('visita')}
                          className={`px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium flex items-center gap-1 md:gap-2 rounded-md transition-colors whitespace-nowrap ${activeAtividadeTab === 'visita' ? 'text-white' : 'bg-gray-100 text-muted-foreground hover:bg-gray-200'
                            }`}
                          style={activeAtividadeTab === 'visita' ? { backgroundColor: '#000000' } : {}}
                        >
                          <MapPin className="w-3 h-3" />
                          Visita
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="dataInicio" className="text-xs mb-1 block">Data Início</Label>
                            <Input
                              id="dataInicio"
                              type="datetime-local"
                              value={atividadeForm.dataInicial}
                              onChange={(e) => setAtividadeForm({ ...atividadeForm, dataInicial: e.target.value })}
                              disabled={isSavingAtividade || isLeadPerdido}
                            />
                          </div>
                          <div>
                            <Label htmlFor="dataFim" className="text-xs mb-1 block">Data Fim</Label>
                            <Input
                              id="dataFim"
                              type="datetime-local"
                              value={atividadeForm.dataFinal}
                              onChange={(e) => setAtividadeForm({ ...atividadeForm, dataFinal: e.target.value })}
                              disabled={isSavingAtividade || isLeadPerdido}
                            />
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="titulo" className="text-xs mb-1 block">Título</Label>
                          <Input
                            id="titulo"
                            placeholder="Título resumido da atividade"
                            value={atividadeForm.titulo || ''}
                            onChange={(e) => setAtividadeForm({ ...atividadeForm, titulo: e.target.value })}
                            disabled={isSavingAtividade || isLeadPerdido}
                          />
                        </div>
                        <Textarea
                          placeholder="O que foi feito e qual o próximo passo?"
                          value={atividadeForm.descricao}
                          onChange={(e) => setAtividadeForm({ ...atividadeForm, descricao: e.target.value })}
                          rows={3}
                          className="resize-none"
                          disabled={isSavingAtividade || isLeadPerdido}
                        />
                        <div className="flex justify-end">
                          <Button onClick={handleCriarAtividade} size="sm" disabled={isSavingAtividade || isLeadPerdido}>
                            {isSavingAtividade ? (
                              <>
                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                                Salvando...
                              </>
                            ) : (
                              'Salvar atividade'
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>

                  </TabsContent>

                  <TabsContent value="valor" className="space-y-4 mt-0">
                    {/* Valor do Lead - Destaque */}
                    <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg p-6 text-center border border-primary/20">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <DollarSign className="w-5 h-5 text-primary" />
                        <span className="text-xs font-medium text-primary uppercase tracking-wide">Valor do Negócio</span>
                      </div>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={formData.VALOR ? formatCurrency(formData.VALOR) : ''}
                        onChange={(e) => {
                          const valor = e.target.value.replace(/[^\d,]/g, '').replace(',', '.')
                          setFormData({ ...formData, VALOR: parseFloat(valor) || 0 })
                        }}
                        placeholder="R$ 0,00"
                        className="text-3xl font-bold text-foreground text-center border-none bg-transparent focus-visible:ring-0"
                        disabled={isLeadPerdido}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Produtos e serviços</p>
                    </div>

                    {/* Lista de Produtos */}
                    <div className="bg-white rounded-lg shadow-sm border p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-foreground">Produtos vinculados</h3>
                        <Button
                          onClick={() => setShowAdicionarProdutoModal(true)}
                          size="sm"
                          className="h-8 text-xs bg-primary/10 hover:bg-primary/20 text-primary"
                          disabled={isLeadPerdido}
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Adicionar
                        </Button>
                      </div>
                      {isLoadingProdutos ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : produtosLead.length > 0 ? (
                        <div className="space-y-2">
                          {produtosLead.map((produto, index) => (
                            <div key={produto.CODITEM || index} className="bg-gray-50 rounded-lg border p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{produto.DESCRPROD}</p>
                                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                    <span>Qtd: {produto.QUANTIDADE}</span>
                                    <span>×</span>
                                    <span>{formatCurrency(produto.VLRUNIT)}</span>
                                  </div>
                                  <p className="text-sm font-semibold text-foreground mt-1">{formatCurrency(produto.VLRTOTAL)}</p>
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleEditarProduto(produto)}
                                    className="w-8 h-8 flex items-center justify-center rounded-md text-blue-600 hover:bg-blue-50 transition-colors"
                                    disabled={isLeadPerdido}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleRemoverProduto(produto.CODITEM)}
                                    className="w-8 h-8 flex items-center justify-center rounded-md text-red-600 hover:bg-red-50 transition-colors"
                                    disabled={isLeadPerdido}
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 px-4 bg-gray-50 rounded-lg border border-dashed">
                          <p className="text-sm text-muted-foreground">Nenhum produto vinculado</p>
                          <p className="text-xs text-muted-foreground mt-1">Clique em Adicionar para começar</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="dados" className="space-y-4 mt-0">
                    {/* Dados Principais */}
                    <div className="bg-white rounded-lg shadow-sm border p-4 space-y-4">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" />
                        Dados do Negócio
                      </h3>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground uppercase block mb-2">Responsável</label>
                          <div className="flex items-center gap-3 bg-gray-50 rounded-lg border p-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                              {(currentUser?.name || 'U')[0].toUpperCase()}
                            </div>
                            <span className="text-sm font-medium">{currentUser?.name || 'Usuário Atual'}</span>
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-medium text-muted-foreground uppercase block mb-2">Data de início</label>
                          <div className="flex items-center gap-2 bg-gray-50 rounded-lg border p-3">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm">Hoje</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="dataFimDesktop" className="text-xs font-medium text-muted-foreground uppercase block mb-2">Data de conclusão</Label>
                        <Input
                          id="dataFimDesktop"
                          type="date"
                          value={formData.DATA_VENCIMENTO || ''}
                          onChange={(e) => setFormData({ ...formData, DATA_VENCIMENTO: e.target.value })}
                          className="text-sm"
                          disabled={isLeadPerdido}
                        />
                      </div>

                      <div>
                        <Label htmlFor="descricaoDesktop" className="text-xs font-medium text-muted-foreground uppercase block mb-2">Descrição</Label>
                        <Textarea
                          id="descricaoDesktop"
                          value={formData.DESCRICAO}
                          onChange={(e) => setFormData({ ...formData, DESCRICAO: e.target.value })}
                          placeholder="Adicionar descrição"
                          className="text-sm min-h-[100px]"
                          disabled={isLeadPerdido}
                        />
                      </div>

                      {/* Metadados */}
                      <div className="pt-4 border-t space-y-3">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Informações do Sistema</p>
                        <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                          <div>
                            <p className="text-[10px] uppercase mb-1">Cadastrado por</p>
                            <p className="text-foreground/70">{currentUser?.name || 'Usuário Atual'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase mb-1">Data cadastro</p>
                            <p className="text-foreground/70">{lead?.DTCAD ? formatDate(lead.DTCAD) : '-'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase mb-1">Última atualização</p>
                            <p className="text-foreground/70">{lead?.DTATU ? formatDate(lead.DTATU) : '-'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Botões de ação */}
                      <div className="flex gap-2 pt-4">
                        <Button variant="outline" onClick={handleClose} className="flex-1" disabled={isSaving}>
                          {lead.STATUS_LEAD === 'GANHO' || lead.STATUS_LEAD === 'PERDIDO' ? 'Fechar' : 'Cancelar'}
                        </Button>
                        <Button onClick={handleSubmit} className="flex-1 bg-primary hover:bg-primary/90" disabled={isSaving || isLeadPerdido}>
                          {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                        </Button>
                      </div>
                    </div>

                    {/* Dados do Contato */}
                    <div className="bg-white rounded-lg shadow-sm border p-4">
                      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <User className="w-4 h-4 text-primary" />
                        Dados do Contato
                      </h3>

                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="parceiroDesktop" className="text-xs">Parceiro</Label>
                          <div className="relative">
                            <Input
                              id="parceiroDesktop"
                              type="text"
                              placeholder="Digite para buscar parceiro..."
                              value={partnerSearch}
                              onChange={(e) => {
                                setPartnerSearch(e.target.value)
                                handlePartnerSearch(e.target.value)
                              }}
                              disabled={isLeadPerdido}
                              className="h-9 text-sm"
                            />
                            {partnerSearch.length >= 2 && !formData.CODPARC && (
                              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                                {isLoadingPartners ? (
                                  <div className="p-3 text-sm text-center text-muted-foreground">Carregando...</div>
                                ) : parceiros.length === 0 ? (
                                  <div className="p-3 text-sm text-center text-muted-foreground">Nenhum parceiro encontrado</div>
                                ) : (
                                  parceiros.map((partner) => (
                                    <div
                                      key={partner.CODPARC}
                                      onClick={() => selecionarParceiro(partner.CODPARC, partner.NOMEPARC)}
                                      className="p-2 hover:bg-gray-100 cursor-pointer text-sm border-b last:border-b-0"
                                    >
                                      <div className="font-medium">{partner.NOMEPARC}</div>
                                      <div className="text-xs text-muted-foreground">{partner.CGC_CPF}</div>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                          {formData.CODPARC && parceiroSelecionado && (
                            <div className="text-xs text-muted-foreground mt-1 break-words">
                              Selecionado: {parceiroSelecionado.NOMEPARC}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>

          {/* Botões de ação - Mobile (fixos no rodapé) */}
          {!lead && (
            <div className="md:hidden border-t bg-white p-3 flex gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1"
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                className="flex-1 bg-primary hover:bg-primary/90"
                disabled={isSaving}
              >
                {isSaving ? "Criando..." : "Criar Lead"}
              </Button>
            </div>
          )}
        </div>

        {/* Modal de Edição de Produto */}
        <Dialog open={showModalEdicaoProduto} onOpenChange={setShowModalEdicaoProduto}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Produto</DialogTitle>
            </DialogHeader>
            {produtoSelecionadoEdicao && (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">{produtoSelecionadoEdicao.DESCRPROD}</Label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Quantidade</Label>
                    <Input
                      type="number"
                      value={produtoEditForm.quantidade}
                      onChange={(e) => setProdutoEditForm({ ...produtoEditForm, quantidade: Number(e.target.value) })}
                      disabled={isLeadPerdido}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Valor Unit.</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={produtoEditForm.vlrunit}
                      onChange={(e) => setProdutoEditForm({ ...produtoEditForm, vlrunit: Number(e.target.value) })}
                      disabled={isLeadPerdido}
                    />
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded border">
                  <div className="text-sm font-medium text-muted-foreground">Total</div>
                  <div className="text-xl font-bold text-green-700">
                    {formatCurrency(produtoEditForm.quantidade * produtoEditForm.vlrunit)}
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowModalEdicaoProduto(false)
                      setProdutoSelecionadoEdicao(null)
                      setProdutoEditForm({ quantidade: 0, vlrunit: 0 })
                    }}
                    disabled={isSaving || isLeadPerdido}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={handleSalvarEdicaoProduto} disabled={isSaving || isLeadPerdido}>
                    {isSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Salvando...
                      </>
                    ) : (
                      'Salvar'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal de Adicionar Produto - Usando ProdutoSelectorModal */}
        <ProdutoSelectorModal
          isOpen={showAdicionarProdutoModal}
          onClose={() => setShowAdicionarProdutoModal(false)}
          onConfirm={async (produto: any, preco: number, quantidade: number) => {
            if (!lead) return

            setIsSaving(true)
            setLoadingMessage("Adicionando produto...")

            try {
              const vlrtotal = preco * quantidade
              const payload = {
                CODLEAD: String(lead.CODLEAD),
                CODPROD: produto.CODPROD,
                DESCRPROD: produto.DESCRPROD,
                QUANTIDADE: quantidade,
                VLRUNIT: preco,
                VLRTOTAL: vlrtotal
              }

              const response = await fetch('/api/leads/produtos/adicionar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              })

              if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.error || 'Erro ao adicionar produto')
              }

              const resultado = await response.json()

              // Atualizar valor local IMEDIATAMENTE
              if (resultado.novoValorTotal !== undefined) {
                setFormData(prev => ({
                  ...prev,
                  VALOR: resultado.novoValorTotal
                }))
              }

              toast({
                title: "Sucesso",
                description: "Produto adicionado com sucesso",
              })

              setShowAdicionarProdutoModal(false)

              // Recarregar produtos
              await loadProdutosLead(lead.CODLEAD)

              // Notificar parent para atualizar kanban IMEDIATAMENTE
              if (onLeadUpdated) {
                onLeadUpdated()
              }

              // Recarregar lista completa
              await onSave()
            } catch (error: any) {
              toast({
                title: "Erro",
                description: error.message,
                variant: "destructive",
              })
            } finally {
              setIsSaving(false)
              setLoadingMessage("")
            }
          }}
          titulo="Adicionar Produto ao Negócio"
        />

        {/* Modal de Editar Título */}
        <Dialog open={showEditarTituloModal} onOpenChange={setShowEditarTituloModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Título do Lead</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Título Atual</Label>
                <div className="p-3 bg-gray-50 rounded border">
                  <p className="text-sm font-medium">{formData.NOME}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Novo Título *</Label>
                <Input
                  value={novoTitulo}
                  onChange={(e) => setNovoTitulo(e.target.value)}
                  placeholder="Digite o novo título"
                  disabled={isLeadPerdido}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowEditarTituloModal(false)
                    setNovoTitulo("")
                  }}
                  disabled={isSaving || isLeadPerdido}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={async () => {
                    if (!lead || !novoTitulo.trim()) {
                      toast({
                        title: "Atenção",
                        description: "Informe o novo título",
                        variant: "destructive",
                      })
                      return
                    }

                    setIsSaving(true)
                    setLoadingMessage("Atualizando título...")

                    try {
                      const response = await fetch('/api/leads/salvar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          CODLEAD: lead.CODLEAD,
                          NOME: novoTitulo,
                          DESCRICAO: formData.DESCRICAO,
                          VALOR: formData.VALOR,
                          CODESTAGIO: formData.CODESTAGIO,
                          CODFUNIL: formData.CODFUNIL,
                          DATA_VENCIMENTO: formData.DATA_VENCIMENTO,
                          TIPO_TAG: formData.TIPO_TAG,
                          COR_TAG: formData.COR_TAG,
                          CODPARC: formData.CODPARC
                        })
                      })

                      if (!response.ok) throw new Error('Erro ao atualizar título')

                      toast({
                        title: "Sucesso",
                        description: "Título atualizado com sucesso!",
                      })

                      setFormData({ ...formData, NOME: novoTitulo })
                      setShowEditarTituloModal(false)
                      setNovoTitulo("")
                      onSave()

                    } catch (error: any) {
                      toast({
                        title: "Erro",
                        description: error.message,
                        variant: "destructive",
                      })
                    } finally {
                      setIsSaving(false)
                      setLoadingMessage("")
                    }
                  }}
                  disabled={isSaving || isLeadPerdido}
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar Título'
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de Lead Perdido */}
        <Dialog open={mostrarDialogoPerda} onOpenChange={setMostrarDialogoPerda}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Marcar Lead como Perdido</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Tem certeza que deseja marcar este lead como perdido? Esta ação não pode ser desfeita. Por favor, informe o motivo.
              </p>
              <div className="space-y-2">
                <Label className="text-sm">Motivo da Perda</Label>
                <Textarea
                  value={motivoPerda}
                  onChange={(e) => setMotivoPerda(e.target.value)}
                  placeholder="Ex: Concorrente ofereceu preço melhor, cliente não respondeu, etc."
                  className="text-sm min-h-[80px]"
                  disabled={isConfirmingPerdido}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setMostrarDialogoPerda(false)
                    setMotivoPerda("")
                  }}
                  disabled={isConfirmingPerdido}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={confirmarPerdido}
                  className="bg-red-600 hover:bg-red-700"
                  disabled={isConfirmingPerdido || !motivoPerda.trim()}
                >
                  {isConfirmingPerdido ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Processando...
                    </>
                  ) : (
                    'Confirmar Perda'
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de Pedido de Venda - Lead Ganho */}
        <Dialog open={mostrarPedidoVenda} onOpenChange={async (open) => {
          // Não permitir fechar durante salvamento
          if (!open && !salvandoPedido) {
            // Recarregar dados do lead antes de fechar
            if (lead) {
              try {
                console.log('🔄 Recarregando produtos do lead ao fechar modal de pedido...')
                await loadProdutosLead(lead.CODLEAD)
                await onSave()
              } catch (error) {
                console.error('❌ Erro ao recarregar dados:', error)
              }
            }
            setMostrarPedidoVenda(false)
            setSalvandoPedido(false)
            setSalvarPedidoFn(null)
            setDadosPedidoVenda(null)
          }
        }}>
          <DialogContent className="max-w-full w-full h-full md:max-w-[95vw] md:h-[95vh] p-0 m-0 md:m-4 flex flex-col overflow-hidden" showCloseButton={false}>
            {lead && dadosPedidoVenda && (
              <>
                {/* Conteúdo do Pedido - Header já está dentro do PedidoVendaFromLead */}
                <div className="flex-1 overflow-hidden">
                  <PedidoVendaFromLead
                    dadosIniciais={dadosPedidoVenda}
                    onSuccess={handlePedidoSucesso}
                    onCancel={() => {
                      setMostrarPedidoVenda(false)
                      setSalvandoPedido(false)
                      setSalvarPedidoFn(null)
                    }}
                    onSalvarPedido={(fn) => setSalvarPedidoFn(() => fn)}
                    isLeadVinculado={true}
                  />
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal de Carrinho do Pedido - Para visualizar itens do pedido */}
        <Dialog open={showCarrinhoModalPedido} onOpenChange={setShowCarrinhoModalPedido}>
          <DialogContent className="max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>Itens do Pedido</DialogTitle>
              <DialogDescription>Revise os itens antes de prosseguir.</DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-auto p-4 -mx-4">
              {dadosPedidoVenda?.itens && dadosPedidoVenda.itens.length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Produto</th>
                      <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Qtd</th>
                      <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Unit.</th>
                      <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                      <th scope="col" className="relative px-3 py-3">
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {dadosPedidoVenda.itens.map((item: any, index: number) => (
                      <tr key={item.CODPROD || index}>
                        <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{item.DESCRPROD}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-center text-sm text-gray-500">{item.QTDNEG}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium text-gray-900">{formatCurrency(item.VLRUNIT)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-bold text-green-600">{formatCurrency(item.VLRTOTAL)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => {
                              // Remover item do carrinho
                              const novosItens = dadosPedidoVenda.itens.filter((_, i) => i !== index)
                              setDadosPedidoVenda({ ...dadosPedidoVenda, itens: novosItens })
                              toast({ title: "Item removido", description: `${item.DESCRPROD} foi removido.` })
                            }}
                            className="text-red-500 hover:text-red-700 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-10 text-muted-foreground">Nenhum item no pedido.</div>
              )}
            </div>
            <DialogFooter className="flex-shrink-0 pt-3 border-t">
              <Button variant="outline" onClick={() => setShowCarrinhoModalPedido(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        {/* Modal de Confirmação de Exclusão */}
        <Dialog open={mostrarConfirmacaoExclusao} onOpenChange={setMostrarConfirmacaoExclusao}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Confirmar Exclusão</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Tem certeza que deseja excluir este lead? Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setMostrarConfirmacaoExclusao(false)}
                  disabled={isSaving}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirmarExclusao}
                  variant="destructive"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Excluindo...
                    </>
                  ) : (
                    'Excluir Lead'
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de Status (Ganho/Perdido) - Botões Separados para Ganho/Perdido */}
        <Dialog open={mostrarDialogoStatus} onOpenChange={setMostrarDialogoStatus}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Marcar Lead como Ganho</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Ao marcar como ganho, você será direcionado para a criação de um Pedido de Venda. Certifique-se de ter adicionado os produtos.
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setMostrarDialogoStatus(false)}
                  disabled={isSaving}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => {
                    setMostrarDialogoStatus(false)
                    handleStatusChange('GANHO')
                  }}
                  className="bg-green-600 hover:bg-green-700"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Processando...
                    </>
                  ) : (
                    'Prosseguir para Pedido'
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
