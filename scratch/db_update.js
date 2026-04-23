const oracledb = require('oracledb');
(async () => {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: 'SYSTEM',
      password: 'Castro135!',
      connectString: 'crescimentoerp.nuvemdatacom.com.br:9568/FREEPDB1'
    });
    console.log('🚀 Iniciando alterações no banco...');

    try {
      await conn.execute(`
        CREATE TABLE AS_LOCAIS_ESTOQUE (
          ID_SISTEMA NUMBER(10,0),
          CODLOCAL NUMBER(10,0),
          DESCRLOCAL VARCHAR2(255),
          ATIVO CHAR(1),
          SANKHYA_ATUAL CHAR(1),
          DT_ULT_CARGA TIMESTAMP(6),
          DT_CRIACAO TIMESTAMP(6),
          CONSTRAINT PK_AS_LOCAIS_ESTOQUE PRIMARY KEY (ID_SISTEMA, CODLOCAL)
        )
      `);
      console.log('✅ Tabela AS_LOCAIS_ESTOQUE criada');
    } catch (e) {
      if (e.errorNum === 955) console.log('⚠️ Tabela AS_LOCAIS_ESTOQUE já existe');
      else throw e;
    }

    try {
      await conn.execute("ALTER TABLE AD_TIPOSPEDIDO ADD CODLOCAL NUMBER(10,0)");
      console.log('✅ Coluna CODLOCAL adicionada em AD_TIPOSPEDIDO');
    } catch (e) {
      if (e.errorNum === 1430) console.log('⚠️ Coluna CODLOCAL já existe em AD_TIPOSPEDIDO');
      else throw e;
    }

    await conn.commit();
    console.log('🏁 Alterações concluídas');
  } catch (e) {
    console.error('❌ Erro:', e);
  } finally {
    if (conn) await conn.close();
  }
})();
