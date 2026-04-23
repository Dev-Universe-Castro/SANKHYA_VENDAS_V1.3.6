import { oracleService } from '../lib/oracle-db';

async function debugParceiros() {
  try {
    const idEmpresa = 1; // Ajustar se necessário
    console.log(`🔍 Debugging parceiros para empresa ${idEmpresa}...`);

    const qTotal = `SELECT count(*) as total FROM AS_PARCEIROS WHERE ID_SISTEMA = :idEmpresa`;
    const rTotal = await oracleService.executeOne<any>(qTotal, { idEmpresa });
    console.log(`Total em AS_PARCEIROS: ${rTotal.TOTAL}`);

    const qSankhya = `SELECT count(*) as total FROM AS_PARCEIROS WHERE ID_SISTEMA = :idEmpresa AND SANKHYA_ATUAL = 'S'`;
    const rSankhya = await oracleService.executeOne<any>(qSankhya, { idEmpresa });
    console.log(`Total com SANKHYA_ATUAL='S': ${rSankhya.TOTAL}`);

    const qCliente = `SELECT count(*) as total FROM AS_PARCEIROS WHERE ID_SISTEMA = :idEmpresa AND SANKHYA_ATUAL = 'S' AND CLIENTE = 'S'`;
    const rCliente = await oracleService.executeOne<any>(qCliente, { idEmpresa });
    console.log(`Total com CLIENTE='S': ${rCliente.TOTAL}`);

    const qVendedores = `SELECT CODVEND, count(*) as total FROM AS_PARCEIROS WHERE ID_SISTEMA = :idEmpresa AND SANKHYA_ATUAL = 'S' AND CLIENTE = 'S' GROUP BY CODVEND ORDER BY total DESC`;
    const rVendedores = await oracleService.executeQuery<any>(qVendedores, { idEmpresa });
    console.log(`Distribuição por Vendedor (Top 5):`, rVendedores.slice(0, 5));

  } catch (error) {
    console.error('❌ Erro no debug:', error);
  } finally {
    process.exit(0);
  }
}

debugParceiros();
