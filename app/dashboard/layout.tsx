
"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { authService } from "@/lib/auth-service"
import { PedidoSyncService } from "@/lib/pedido-sync"
import { OfflineDataService } from "@/lib/offline-data-service"
import { prefetchLoginData } from "@/lib/prefetch-login-service"
import { toast } from "sonner"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [loading, setLoading] = useState(typeof window !== 'undefined' ? !localStorage.getItem("currentUser") : true)
  const [authenticated, setAuthenticated] = useState(typeof window !== 'undefined' ? !!localStorage.getItem("currentUser") : false)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Verificar usuário no localStorage (offline-first)
        const userLocal = localStorage.getItem("currentUser")

        if (userLocal) {
          setAuthenticated(true)
          console.log('✅ Usuário autenticado (localStorage)')
        } else {
          // Tentar pegar do cookie
          const user = authService.getCurrentUser()

          if (user) {
            // Salvar no localStorage para persistência offline
            localStorage.setItem("currentUser", JSON.stringify(user))
            setAuthenticated(true)
            console.log('✅ Usuário autenticado (cookie)')
          } else {
            console.log('❌ Usuário não autenticado')
            router.push("/")
            return
          }
        }

        // Processar fila de pedidos pendentes (se online)
        if (navigator.onLine) {
          PedidoSyncService.triggerBackgroundSync()

          PedidoSyncService.getPendentesCount().then(count => {
            if (count > 0) {
              console.log(`📋 ${count} pedidos pendentes na fila offline`)
            }
          })

          // VALIDAR SAÚDE DOS DADOS (Solicitado pelo usuário)
          // Se o usuário está autenticado mas a base IndexedDB está vazia (ex: limpa pelo browser)
          // Disparamos o prefetch silencioso para recompor a base.
          OfflineDataService.isDataHealthy().then(isHealthy => {
            if (!isHealthy) {
              console.warn('⚠️ [HEALTH] Base de dados incompleta detectada. Iniciando recuperação automática...')
              
              const recoveryToast = toast.loading("Recuperando configurações...", {
                description: "Isso acontece apenas uma vez ou após limpeza do navegador.",
                duration: 10000
              })

              prefetchLoginData()
                .then(() => {
                  toast.success("Dados recuperados!", { id: recoveryToast })
                  console.log('✅ [HEALTH] Base de dados recuperada com sucesso via Prefetch.')
                })
                .catch(err => {
                  toast.error("Erro ao recuperar dados. Tente sincronizar manualmente.", { id: recoveryToast })
                  console.error('❌ [HEALTH] Falha na recuperação automática:', err)
                })
            }
          })
        }
      } catch (error) {
        console.error('Erro ao verificar autenticação:', error)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router, pathname])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Carregando...</p>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return null
  }

  return <>{children}</>
}
