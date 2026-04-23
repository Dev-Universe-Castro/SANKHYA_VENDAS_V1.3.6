import { NextResponse } from 'next/server';
import { verificarPreferenciaAtiva } from '@/lib/politicas-comerciais-service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const idEmpresaParam = searchParams.get('idEmpresa');
    let idEmpresa = undefined;

    if (idEmpresaParam) {
      idEmpresa = parseInt(idEmpresaParam, 10);
      if (isNaN(idEmpresa)) {
         idEmpresa = undefined;
      }
    }

    const preferenciaAtiva = await verificarPreferenciaAtiva(idEmpresa);

    return NextResponse.json({ ativa: preferenciaAtiva });
  } catch (error: any) {
    console.error('❌ Erro na API de verificação de preferência de empresa:', error);
    return NextResponse.json({ error: 'Erro ao verificar política', ativa: false }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
