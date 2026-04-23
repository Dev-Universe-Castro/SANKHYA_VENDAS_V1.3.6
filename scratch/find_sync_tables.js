const oracledb = require('oracledb');
require('dotenv').config({ path: 'config.env.local' });

async function findSyncTables() {
  let connection;
  try {
    connection = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECT_STRING
    });

    const result = await connection.execute(
      `SELECT table_name FROM all_tab_columns WHERE column_name = 'DT_ULT_CARGA' AND owner = 'SYSTEM' AND table_name LIKE 'AS_%'`
    );
    
    console.log('Tabelas que suportam DT_ULT_CARGA:');
    result.rows.forEach(row => console.log(row[0]));

    const result2 = await connection.execute(
      `SELECT table_name FROM all_tab_columns WHERE column_name = 'DTALTER' AND owner = 'SYSTEM' AND table_name LIKE 'AS_%'`
    );
    console.log('\nTabelas que suportam DTALTER:');
    result2.rows.forEach(row => console.log(row[0]));

  } catch (err) {
    console.error(err);
  } finally {
    if (connection) await connection.close();
  }
}

findSyncTables();
