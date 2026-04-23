import { oracleService } from './oracle-db'

export interface TipoPedido {
  CODTIPOPEDIDO?: number
  ID_EMPRESA: number
  CODUSUARIO_CRIADOR: number
  NOME: string
  DESCRICAO?: string
  CODTIPOPER: number
  MODELO_NOTA: number
  TIPMOV: string
  CODTIPVENDA: number
  CODLOCAL?: number
  COR?: string
  ATIVO?: string
  DATA_CRIACAO?: Date
  DATA_ATUALIZACAO?: Date
}

export const tiposPedidoService = {
  // Listar tipos de pedido por empresa
  async listarPorEmpresa(idEmpresa: number): Promise<TipoPedido[]> {
    const sql = `
      SELECT 
        CODTIPOPEDIDO,
        ID_EMPRESA,
        CODUSUARIO_CRIADOR,
        NOME,
        DESCRICAO,
        CODTIPOPER,
        MODELO_NOTA,
        TIPMOV,
        CODTIPVENDA,
        CODLOCAL,
        COR,
        ATIVO,
        DATA_CRIACAO,
        DATA_ATUALIZACAO
      FROM AD_TIPOSPEDIDO
      WHERE ID_EMPRESA = :idEmpresa
        AND ATIVO = 'S'
      ORDER BY NOME
    `

    return await oracleService.executeQuery(sql, { idEmpresa })
  },

  // Buscar tipo de pedido por código
  async buscarPorCodigo(codTipoPedido: number, idEmpresa: number): Promise<TipoPedido | null> {
    const sql = `
      SELECT 
        CODTIPOPEDIDO,
        ID_EMPRESA,
        CODUSUARIO_CRIADOR,
        NOME,
        DESCRICAO,
        CODTIPOPER,
        MODELO_NOTA,
        TIPMOV,
        CODTIPVENDA,
        CODLOCAL,
        COR,
        ATIVO,
        DATA_CRIACAO,
        DATA_ATUALIZACAO
      FROM AD_TIPOSPEDIDO
      WHERE CODTIPOPEDIDO = :codTipoPedido
        AND ID_EMPRESA = :idEmpresa
        AND ATIVO = 'S'
    `

    const resultado = await oracleService.executeQuery(sql, { codTipoPedido, idEmpresa })
    return resultado.length > 0 ? resultado[0] : null
  },

  // Criar novo tipo de pedido
  async criar(tipoPedido: TipoPedido): Promise<number> {
    const sql = `
      INSERT INTO AD_TIPOSPEDIDO (
        ID_EMPRESA,
        CODUSUARIO_CRIADOR,
        NOME,
        DESCRICAO,
        CODTIPOPER,
        MODELO_NOTA,
        TIPMOV,
        CODTIPVENDA,
        CODLOCAL,
        COR,
        ATIVO
      ) VALUES (
        :idEmpresa,
        :codUsuarioCriador,
        :nome,
        :descricao,
        :codTipOper,
        :modeloNota,
        :tipMov,
        :codTipVenda,
        :codLocal,
        :cor,
        'S'
      ) RETURNING CODTIPOPEDIDO INTO :codTipoPedido
    `

    const binds = {
      idEmpresa: tipoPedido.ID_EMPRESA,
      codUsuarioCriador: tipoPedido.CODUSUARIO_CRIADOR,
      nome: tipoPedido.NOME,
      descricao: tipoPedido.DESCRICAO || null,
      codTipOper: tipoPedido.CODTIPOPER,
      modeloNota: tipoPedido.MODELO_NOTA,
      tipMov: tipoPedido.TIPMOV,
      codTipVenda: tipoPedido.CODTIPVENDA,
      codLocal: tipoPedido.CODLOCAL || null,
      cor: tipoPedido.COR || '#3b82f6',
      codTipoPedido: { dir: oracleService.BIND_OUT, type: oracleService.NUMBER }
    }

    const resultado = await oracleService.executeQuery(sql, binds)
    return resultado.outBinds?.codTipoPedido?.[0] || 0
  },

  // Atualizar tipo de pedido
  async atualizar(codTipoPedido: number, tipoPedido: Partial<TipoPedido>, idEmpresa: number): Promise<boolean> {
    const campos = []
    const binds: any = { codTipoPedido, idEmpresa }

    if (tipoPedido.NOME !== undefined) {
      campos.push('NOME = :nome')
      binds.nome = tipoPedido.NOME
    }
    if (tipoPedido.DESCRICAO !== undefined) {
      campos.push('DESCRICAO = :descricao')
      binds.descricao = tipoPedido.DESCRICAO || null
    }
    if (tipoPedido.CODTIPOPER !== undefined) {
      campos.push('CODTIPOPER = :codTipOper')
      binds.codTipOper = tipoPedido.CODTIPOPER
    }
    if (tipoPedido.MODELO_NOTA !== undefined) {
      campos.push('MODELO_NOTA = :modeloNota')
      binds.modeloNota = tipoPedido.MODELO_NOTA
    }
    if (tipoPedido.TIPMOV !== undefined) {
      campos.push('TIPMOV = :tipMov')
      binds.tipMov = tipoPedido.TIPMOV
    }
    if (tipoPedido.CODTIPVENDA !== undefined) {
      campos.push('CODTIPVENDA = :codTipVenda')
      binds.codTipVenda = tipoPedido.CODTIPVENDA
    }
    if (tipoPedido.CODLOCAL !== undefined) {
      campos.push('CODLOCAL = :codLocal')
      binds.codLocal = tipoPedido.CODLOCAL || null
    }
    if (tipoPedido.COR !== undefined) {
      campos.push('COR = :cor')
      binds.cor = tipoPedido.COR
    }

    if (campos.length === 0) {
      console.log('⚠️ Nenhum campo para atualizar')
      return false
    }

    campos.push('DATA_ATUALIZACAO = SYSDATE')

    const sql = `
      UPDATE AD_TIPOSPEDIDO
      SET ${campos.join(', ')}
      WHERE CODTIPOPEDIDO = :codTipoPedido
        AND ID_EMPRESA = :idEmpresa
        AND ATIVO = 'S'
    `

    console.log('📝 SQL de atualização:', sql)
    console.log('📝 Binds:', binds)

    const resultado = await oracleService.executeQuery(sql, binds)
    console.log('✅ Linhas afetadas:', resultado.rowsAffected)
    
    return (resultado.rowsAffected || 0) > 0
  },

  // Desativar tipo de pedido
  async desativar(codTipoPedido: number, idEmpresa: number): Promise<boolean> {
    const sql = `
      UPDATE AD_TIPOSPEDIDO
      SET ATIVO = 'N'
      WHERE CODTIPOPEDIDO = :codTipoPedido
        AND ID_EMPRESA = :idEmpresa
    `

    const resultado = await oracleService.executeQuery(sql, { codTipoPedido, idEmpresa })
    return resultado.rowsAffected > 0
  },

  // Reativar tipo de pedido
  async reativar(codTipoPedido: number, idEmpresa: number): Promise<boolean> {
    const sql = `
      UPDATE AD_TIPOSPEDIDO
      SET ATIVO = 'S'
      WHERE CODTIPOPEDIDO = :codTipoPedido
        AND ID_EMPRESA = :idEmpresa
    `

    const resultado = await oracleService.executeQuery(sql, { codTipoPedido, idEmpresa })
    return resultado.rowsAffected > 0
  }
}