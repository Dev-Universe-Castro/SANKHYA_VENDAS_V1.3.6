import { NextRequest, NextResponse } from 'next/server';
import { sankhyaDynamicAPI } from '@/lib/sankhya-dynamic-api';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const codProd = searchParams.get('codProd');

        if (!codProd) {
            return new NextResponse('codigoProduto não fornecido', { status: 400 });
        }

        const cookieStore = cookies();
        const userCookie = cookieStore.get('user');

        if (!userCookie) {
            return new NextResponse('Usuário não autenticado', { status: 401 });
        }

        const user = JSON.parse(decodeURIComponent(userCookie.value));
        // Normalização flexível do ID da empresa
        const idEmpresa = user.ID_EMPRESA || user.id_empresa || user.IdEmpresa;

        if (!idEmpresa) {
            console.error(`❌ [IMAGEM] Empresa não identificada no cookie para o usuário ${user.id || user.NOME}`);
            return new NextResponse('Empresa não identificada', { status: 400 });
        }

        try {
            // 1ª Tentativa: dbimage (Formato mais eficiente e nativo para streaming)
            const endpoint = `/gateway/v1/mge/Produto@IMAGEM@CODPROD=${codProd}.dbimage`;
            console.log(`🖼️ [IMAGEM] [1] Tentando dbimage para produto ${codProd} (Empresa: ${idEmpresa})`);

            const imageBuffer = await sankhyaDynamicAPI.fazerRequisicao(Number(idEmpresa), endpoint, 'GET');

            // Validação de bytes mágicos e tamanho mínimo (reduzido para 100 bytes)
            const isImage = imageBuffer && imageBuffer.length > 100 && (
                (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) || // JPEG
                (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) || // PNG
                (imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49) || // GIF
                (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49) || // WEBP (RIFF)
                (imageBuffer[0] === 0x42 && imageBuffer[1] === 0x4D)    // BMP
            );

            if (!isImage) {
                console.warn(`⚠️ [IMAGEM] Retorno do dbimage não é imagem válida ou é muito pequeno (${imageBuffer?.length} bytes). Iniciando fallbacks...`);
                throw new Error('FallbackRequired');
            }

            console.log(`✅ [IMAGEM] Sucesso via dbimage: ${codProd} (${imageBuffer.length} bytes)`);
            return new NextResponse(imageBuffer, {
                headers: {
                    'Content-Type': 'image/jpeg',
                    'Cache-Control': 'public, max-age=86400',
                },
            });
        } catch (error: any) {
            console.log(`🔍 [IMAGEM] [2] Iniciando fallbacks CRUD para produto ${codProd}...`);
            
            // Lista de entidades para tentar buscar via LoadRecords (Base64)
            // Tentamos 'Produto' (campo IMAGEM) e 'ProdutoImagem' (tabela TGFPIV)
            const entidadesBusca = ['Produto', 'ProdutoImagem'];
            
            for (const rootEntity of entidadesBusca) {
                try {
                    console.log(`🔍 [IMAGEM] Tentando entidade CRUD: ${rootEntity} para produto ${codProd}`);
                    const loadRecordsEndpoint = `/gateway/v1/mge/service.sbr?serviceName=CRUDServiceProvider.loadRecords&outputType=json`;
                    
                    const payload = {
                        serviceName: "CRUDServiceProvider.loadRecords",
                        requestBody: {
                            dataSet: {
                                rootEntity,
                                includePresentationFields: "N",
                                offsetPage: "0",
                                criteria: {
                                    expression: {
                                        $: `CODPROD = ${codProd}`
                                    }
                                },
                                entity: {
                                    fieldset: {
                                        list: "IMAGEM"
                                    }
                                }
                            }
                        }
                    };

                    const loadResponse = await sankhyaDynamicAPI.fazerRequisicao(Number(idEmpresa), loadRecordsEndpoint, 'POST', payload);
                    const entity = loadResponse?.responseBody?.entities?.entity?.[0];

                    if (entity?.IMAGEM?.$) {
                        const base64Str = entity.IMAGEM.$;
                        const buffer = Buffer.from(base64Str, 'base64');
                        
                        // Validar o buffer decodificado
                        const isValid = buffer && buffer.length > 50 && (
                            (buffer[0] === 0xFF && buffer[1] === 0xD8) || // JPEG
                            (buffer[0] === 0x89 && buffer[1] === 0x50) || // PNG
                            (buffer[0] === 0x42 && buffer[1] === 0x4D)    // BMP
                        );

                        if (isValid) {
                            console.log(`✅ [IMAGEM] Sucesso via LoadRecords (${rootEntity}): ${codProd} (${buffer.length} bytes)`);
                            return new NextResponse(buffer, {
                                headers: {
                                    'Content-Type': 'image/jpeg',
                                    'Cache-Control': 'public, max-age=86400',
                                },
                            });
                        }
                    }
                } catch (entityError) {
                    // Silencioso por entidade, tenta a próxima
                    console.warn(`❌ [IMAGEM] Falha na entidade ${rootEntity}:`, entityError instanceof Error ? entityError.message : 'Erro desconhecido');
                }
            }

            console.error(`❌ [IMAGEM] Todas as tentativas falharam para o produto ${codProd}`);
            return new NextResponse('Imagem não encontrada em nenhuma entidade', { status: 404 });
        }
    } catch (error: any) {
        console.error('❌ [IMAGEM] Erro crítico na API de imagem:', error);
        return new NextResponse('Erro interno ao processar imagem', { status: 500 });
    }
}
