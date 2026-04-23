// app/api/sankhya/parceiros/complemento/route.ts
import { NextResponse } from 'next/server';
import { oracleService } from '@/lib/oracle-db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const codParcStr = searchParams.get('codParc');

    if (!codParcStr) {
      return NextResponse.json({ error: 'Parâmetro codParc é obrigatório' }, { status: 400 });
    }

    const codParc = parseInt(codParcStr, 10);
    if (isNaN(codParc)) {
      return NextResponse.json({ error: 'Parâmetro codParc inválido' }, { status: 400 });
    }

    const sql = `
      SELECT 
        ID_SISTEMA,
        CODPARC,
        SUGTIPNEGSAID
      FROM AS_COMPLEMENTO_PARC
      WHERE CODPARC = :codParc
        AND SANKHYA_ATUAL = 'S'
    `;

    const result = await oracleService.executeQuery(sql, { codParc });

    if (result && result.length > 0) {
      return NextResponse.json({ complemento: result[0] });
    } else {
      return NextResponse.json({ complemento: null }); // Não tem
    }

  } catch (error) {
    console.error('Erro na chamada da API de complemento do parceiro:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar o complemento do parceiro' },
      { status: 500 }
    );
  }
}
