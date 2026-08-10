import { poolUser } from "./connection.js";

async function createTables() {
  try {
    await poolUser.query(`
      
      CREATE TABLE IF NOT EXISTS admins (
        sn SERIAL PRIMARY KEY,
        full_name VARCHAR(100),
        email VARCHAR(100),
        organization VARCHAR(100),
        designation VARCHAR(100),
        admin_id VARCHAR(100) NOT NULL,
        password VARCHAR(200) NOT NULL,
        admin_role VARCHAR(7) NOT NULL DEFAULT 'admin'
      );

      CREATE TABLE IF NOT EXISTS catalog (
        sn SERIAL PRIMARY KEY,
        file_name VARCHAR(100) UNIQUE NOT NULL,
        title VARCHAR(100),
        spatial_coverage VARCHAR(100),
        file_type VARCHAR(15) NOT NULL,
        theme VARCHAR(30) NOT NULL,
        srid VARCHAR(10) NOT NULL,
        Publisher VARCHAR(30),
        Language VARCHAR(10),
        public_access_level VARCHAR(20),
        citation TEXT ,
        source_date TIMESTAMP ,
        group_visibility TEXT ,
        data_abstract TEXT ,
        area_of_interest VARCHAR(20),
        metadata_date TIMESTAMP,
        data_quality TEXT,
        projection VARCHAR(20),
        scale VARCHAR(15),
        visibility BOOLEAN NOT NULL,
        is_published BOOLEAN NOT NULL,
        edit_mode BOOLEAN  NOT NULL DEFAULT true,
        year_category TEXT
      ); 


      CREATE TABLE IF NOT EXISTS emailotp (
        sn SERIAL PRIMARY KEY,
        email  VARCHAR(100) NOT NULL,
        otp VARCHAR(10) NOT NULL,
        time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ); 

    `);
    console.log('Tables created successfully.');
  } catch (error) {
    console.error('Error creating tables:', error);
  }
}

createTables();
