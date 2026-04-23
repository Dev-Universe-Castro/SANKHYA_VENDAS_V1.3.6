import { NextResponse } from 'next/server';
import { oracleAuthService } from '@/lib/oracle-auth-service';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json(
                { error: 'ID do usuário é obrigatório.' },
                { status: 400 }
            );
        }

        console.log(`🗑️ Inativando usuário ID: ${id}`);
        // Usamos 'bloqueado' como status de inatividade conforme padrão do OracleAuthService
        await oracleAuthService.updateUserStatus(Number(id), 'bloqueado');

        return NextResponse.json({ success: true, message: 'Usuário inativado com sucesso!' });
    } catch (error: any) {
        console.error('❌ Erro ao inativar usuário:', error);
        return NextResponse.json(
            { error: 'Erro ao inativar usuário no servidor.' },
            { status: 500 }
        );
    }
}
