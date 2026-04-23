// app/api/sankhya/politicas/preferencia-tipo-negociacao/route.ts
import { NextResponse } from 'next/server';
import { verificarPreferenciaTipoNegociacaoAtiva } from '@/lib/politicas-comerciais-service';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const codEmpQuery = searchParams.get('codEmp');

    let idEmpresa: number | undefined = undefined;

    if (codEmpQuery && !isNaN(Number(codEmpQuery))) {
      idEmpresa = Number(codEmpQuery);
    } else {
      // Tentar obter da sessão
      const cookieStore = cookies();
      const userCookie = cookieStore.get('user');
      if (userCookie) {
        try {
          const userData = JSON.parse(userCookie.value);
          idEmpresa = userData.ID_EMPRESA;
        } catch (e) {
          console.error('Erro ao fazer parse do cookie de usuário');
        }
      }
    }

    const ativa = await verificarPreferenciaTipoNegociacaoAtiva(idEmpresa);

    // Retorna HTTP com tempo curto de cache para não sobrecarregar
    return NextResponse.json({ ativa }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
      }
    });

  } catch (error) {
    console.error('Erro na API de verificação de preferência:', error);
    return NextResponse.json(
      { error: 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
