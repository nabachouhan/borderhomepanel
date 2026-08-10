import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const poolUser = new Pool({
    user: process.env.db_user,
    host: process.env.db_host,
    database:process.env.db_for_user,
    password: process.env.db_pw,
    port: process.env.db_port
});


const administrativepl = new Pool({
    user: process.env.db_user,
    host: process.env.db_host,
    database:process.env.administratives_db,
    password: process.env.db_pw,
    port: process.env.db_port
});

// 👉 Theme-based pool map
const themeDatabases = {
  administratives: process.env.administratives_db,
  aoi: process.env.aoi_db,
  lulc: process.env.lulc_db,
  lulcchange: process.env.lulcchange_db,
  hotspots: process.env.hotspots_db,
};

const poolMap = {};
for (const [theme, dbName] of Object.entries(themeDatabases)) {
  poolMap[theme] = new Pool({
    user: process.env.db_user,
    host: process.env.host,
    database: dbName,
    password: process.env.db_pw,
    port: process.env.db_port
  });
}

// 👉 Function to get theme-based pool
function getPoolByTheme(theme) {
  const pool = poolMap[theme.toLowerCase()];
  if (!pool) throw new Error(`No theme database pool found for: ${theme}`);
  return pool;
}
  

export { poolUser, administrativepl, getPoolByTheme };


console.log("connected")