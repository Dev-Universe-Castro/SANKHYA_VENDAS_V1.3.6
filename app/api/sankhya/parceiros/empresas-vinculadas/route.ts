import { NextResponse } from 'next/server';
import { parceirosService } from '@/lib/parceiros-service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const codParc = searchParams.get('codParc');

    if (!codParc) {
      return NextResponse.json({ error: 'codParc é obrigatório', empresas: [] }, { status: 400 });
    }

    const parceiroId = parseInt(codParc, 10);
    
    if (isNaN(parceiroId)) {
       return NextResponse.json({ error: 'codParc inválido', empresas: [] }, { status: 400 });
    }

    const empresas = await parceirosService.buscarEmpresasPorParceiro(parceiroId);

    return NextResponse.json({ empresas });
  } catch (error: any) {
    console.error('❌ Erro na API de empresas vinculadas:', error);
    return NextResponse.json({ error: 'Erro ao buscar empresas vinculadas', empresas: [] }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
