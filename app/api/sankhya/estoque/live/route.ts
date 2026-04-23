import { NextRequest, NextResponse } from 'next/server';
import { sankhyaDynamicAPI } from '@/lib/sankhya-dynamic-api';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const codProd = searchParams.get('codProd');

        if (!codProd) {
            return NextResponse.json({ error: 'codigoProduto não fornecido' }, { status: 400 });
        }

        const cookieStore = cookies();
        const userCookie = cookieStore.get('user');

        if (!userCookie) {
            return NextResponse.json({ error: 'Usuário não autenticado' }, { status: 401 });
        }

        const user = JSON.parse(decodeURIComponent(userCookie.value));
        const idEmpresa = user.ID_EMPRESA || user.id_empresa;

        if (!idEmpresa) {
            return NextResponse.json({ error: 'Empresa não identificada' }, { status: 400 });
        }

        // 1. Buscar a UNIDADE do produto no Banco Oracle para garantir a unidade correta
        const { oracleService } = await import('@/lib/oracle-db');
        const sqlProduto = `SELECT UNIDADE FROM AS_PRODUTOS WHERE CODPROD = :codProd AND ID_SISTEMA = :idEmpresa AND SANKHYA_ATUAL = 'S'`;
        const produtoInfo = await oracleService.executeOne(sqlProduto, { codProd, idEmpresa });
        const unidade = produtoInfo?.UNIDADE || 'UN';

        // 2. Buscar o estoque live via Endpoint REST
        const endpoint = `/v1/estoque/produtos/${codProd}`;
        const data = await sankhyaDynamicAPI.fazerRequisicao(Number(idEmpresa), endpoint, 'GET');

        // Retornar os dados cruzados
        return NextResponse.json({
            ...data,
            unidade // Unidade oficial do produto resgatada do banco
        });
    } catch (error: any) {
        console.error('Erro ao buscar estoque live:', error);
        return NextResponse.json({ error: 'Erro ao buscar estoque na API', details: error.message }, { status: 500 });
    }
}
