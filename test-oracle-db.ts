import oracledb from 'oracledb';

async function testOracle() {
  const connString = "(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=144.22.186.233)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=pdb1)))"; // Need to check lib/oracle-db.ts for connection string
  // Let me just import oracle-db
}
