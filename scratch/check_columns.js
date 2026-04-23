const oracledb = require('oracledb');
require('dotenv').config({ path: 'config.env.local' });

async function checkColumns() {
  let connection;
  try {
    connection = await oracledb.getConnection({
      user: process.env.ORACLE_USER || 'SYSTEM',
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECT_STRING
    });

    const tables = ['AS_ENDERECOS', 'AS_PARCEIROS', 'AS_FINANCEIRO', 'AS_EXCECAO_PRECO', 'AS_PRODUTOS'];
    
    for (const table of tables) {
      console.log(`\n--- Colunas de ${table} ---`);
      const result = await connection.execute(
        `SELECT column_name, data_type FROM all_tab_columns WHERE table_name = :tableName AND owner = 'SYSTEM'`,
        { tableName: table }
      );
      result.rows.forEach(row => {
        console.log(`${row[0]} (${row[1]})`);
      });
    }
  } catch (err) {
    console.error(err);
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

checkColumns();
