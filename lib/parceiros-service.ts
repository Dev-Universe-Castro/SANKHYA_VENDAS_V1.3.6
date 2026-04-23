import { oracleService } from './oracle-db';

export const parceirosService = {
  /**
   * Busca parceiros por códigos específicos
   */
  async buscarParceirosPorCodigos(codigos: number[]): Promise<any[]> {
    if (!codigos || codigos.length === 0) {
      return [];
    }

    try {
      console.log(`🔍 Buscando ${codigos.length} parceiros do Oracle...`);

      // Criar placeholders para a query IN
      const placeholders = codigos.map((_, i) => `:cod${i}`).join(',');

      // Criar objeto de binds
      const binds: any = {};
      codigos.forEach((cod, i) => {
        binds[`cod${i}`] = cod;
      });

      const sql = `
        SELECT 
          CODPARC,
          NOMEPARC,
          RAZAOSOCIAL,
          CGC_CPF,
          IDENTINSCESTAD,
          TIPPESSOA,
          CLIENTE,
          ATIVO,
          CEP,
          CODEND,
          NUMEND,
          COMPLEMENTO,
          CODBAI,
          CODCID,
          CODVEND,
          LATITUDE,
          LONGITUDE,
          CODTAB,
          ENDERECO,
          NOMEBAI,
          NOMECID,
          UF
        FROM AS_PARCEIROS
        WHERE CODPARC IN (${placeholders})
          AND SANKHYA_ATUAL = 'S'
          AND CLIENTE = 'S'
      `;

      const parceiros = await oracleService.executeQuery(sql, binds);

      console.log(`✅ ${parceiros.length} parceiros encontrados`);

      return parceiros;
    } catch (error: any) {
      console.error('❌ Erro ao buscar parceiros por códigos:', error);
      return [];
    }
  },

  /**
   * Busca um parceiro específico por código
   */
  async buscarParceiroPorCodigo(codParc: number, idEmpresa: number): Promise<any | null> {
    try {
      const sql = `
        SELECT 
          CODPARC,
          NOMEPARC,
          RAZAOSOCIAL,
          CGC_CPF,
          IDENTINSCESTAD,
          TIPPESSOA,
          CLIENTE,
          ATIVO,
          CEP,
          CODEND,
          NUMEND,
          COMPLEMENTO,
          CODBAI,
          CODCID,
          CODVEND,
          LATITUDE,
          LONGITUDE,
          CODTAB,
          ENDERECO,
          NOMEBAI,
          NOMECID,
          UF
        FROM AS_PARCEIROS
        WHERE CODPARC = :codParc
          AND ID_SISTEMA = :idEmpresa
          AND SANKHYA_ATUAL = 'S'
          AND CLIENTE = 'S'
      `;

      const result = await oracleService.executeOne(sql, { codParc, idEmpresa });
      return result;
    } catch (error: any) {
      console.error('❌ Erro ao buscar parceiro por código:', error);
      return null;
    }
  },

  /**
   * Busca as empresas vinculadas a um parceiro de acordo com a tabela AS_PARCEIRO_EMPRES_GRUPO_ICMS
   */
  async buscarEmpresasPorParceiro(codParc: number): Promise<any[]> {
    try {
      const sql = `
        SELECT DISTINCT e.CODEMP, e.NOMEFANTASIA
        FROM AS_PARCEIRO_EMPRES_GRUPO_ICMS p
        JOIN AS_EMPRESAS e ON p.CODEMP = e.CODEMP
        WHERE p.CODPARC = :codParc
        ORDER BY e.CODEMP
      `;

      const empresas = await oracleService.executeQuery(sql, { codParc });
      return empresas;
    } catch (error: any) {
      console.error('❌ Erro ao buscar empresas vinculadas ao parceiro:', error);
      return [];
    }
  }
};