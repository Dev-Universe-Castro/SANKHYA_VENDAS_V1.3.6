const oracledb = require('oracledb');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envLocal = path.resolve(process.cwd(), '.env.local');
const configEnvLocal = path.resolve(process.cwd(), 'config.env.local');

if (fs.existsSync(envLocal)) {
    dotenv.config({ path: envLocal });
}
if (fs.existsSync(configEnvLocal)) {
    dotenv.config({ path: configEnvLocal });
}

async function run() {
    let connection;
    try {
        console.log('Connecting to Oracle...');
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASSWORD,
            connectString: process.env.ORACLE_CONNECT_STRING
        });

        const tables = ['AS_PARCEIROS', 'AS_PRODUTOS', 'AS_BAIRROS', 'AS_CIDADES'];
        
        for (const table of tables) {
            console.log(`\nDescribing columns of ${table}...`);
            const result = await connection.execute(
                `SELECT column_name, data_type 
                 FROM user_tab_cols 
                 WHERE table_name = '${table}'`
            );

            if (result.rows.length === 0) {
                console.log(`Table ${table} not found or no columns found.`);
            } else {
                console.log(`Columns of ${table}:`);
                console.table(result.rows);
            }
        }

    } catch (err) {
        console.error('Error executing query:', err);
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error('Error closing connection:', err);
            }
        }
    }
}

run();
