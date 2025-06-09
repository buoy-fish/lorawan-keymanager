const sqlite3 = require('sqlite3').verbose();
const config = require('./config');

class Database {
  constructor() {
    this.db = null;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(config.app.dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    const tables = [
      // Devices table - stores device information and keys
      `CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        devEUI TEXT UNIQUE NOT NULL,
        appEUI TEXT,
        appKey TEXT,
        name TEXT,
        description TEXT,
        deviceProfileId TEXT,
        applicationId TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Session keys table - stores session-specific keys
      `CREATE TABLE IF NOT EXISTS session_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        devEUI TEXT NOT NULL,
        devAddr TEXT,
        nwkSKey TEXT,
        appSKey TEXT,
        fCntUp INTEGER DEFAULT 0,
        fCntDown INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (devEUI) REFERENCES devices (devEUI)
      )`,

      // Device profiles table - stores device profile configurations
      `CREATE TABLE IF NOT EXISTS device_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profileId TEXT UNIQUE NOT NULL,
        name TEXT,
        region TEXT,
        macVersion TEXT,
        regParamsRevision TEXT,
        adrAlgorithmId TEXT,
        payloadCodec TEXT,
        payloadEncoderScript TEXT,
        payloadDecoderScript TEXT,
        flushQueueOnActivate BOOLEAN DEFAULT false,
        uplinkInterval INTEGER,
        deviceStatusReqInterval INTEGER,
        supportsOtaa BOOLEAN DEFAULT true,
        supportsClassB BOOLEAN DEFAULT false,
        supportsClassC BOOLEAN DEFAULT false,
        classBTimeout INTEGER,
        classCTimeout INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Applications table - stores application information
      `CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        applicationId TEXT UNIQUE NOT NULL,
        name TEXT,
        description TEXT,
        serviceProfileId TEXT,
        payloadCodec TEXT,
        payloadEncoderScript TEXT,
        payloadDecoderScript TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Migration history table - tracks migration operations
      `CREATE TABLE IF NOT EXISTS migration_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        devEUI TEXT NOT NULL,
        sourceLNS TEXT NOT NULL,
        targetLNS TEXT NOT NULL,
        status TEXT NOT NULL, -- 'pending', 'in_progress', 'completed', 'failed'
        error_message TEXT,
        migration_options TEXT, -- JSON string of migration options
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (devEUI) REFERENCES devices (devEUI)
      )`,

      // Service configuration table - stores LNS and migration settings
      `CREATE TABLE IF NOT EXISTS service_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_key TEXT UNIQUE NOT NULL,
        config_value TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const table of tables) {
      await this.run(table);
    }
    console.log('Database tables created/verified');
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Device management methods
  async saveDevice(device) {
    const sql = `
      INSERT OR REPLACE INTO devices 
      (devEUI, appEUI, appKey, name, description, deviceProfileId, applicationId, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    return this.run(sql, [
      device.devEUI,
      device.appEUI,
      device.appKey,
      device.name,
      device.description,
      device.deviceProfileId,
      device.applicationId
    ]);
  }

  async getDevice(devEUI) {
    return this.get('SELECT * FROM devices WHERE devEUI = ?', [devEUI]);
  }

  async getAllDevices() {
    return this.all('SELECT * FROM devices ORDER BY name, devEUI');
  }

  async saveSessionKeys(sessionData) {
    const sql = `
      INSERT OR REPLACE INTO session_keys 
      (devEUI, devAddr, nwkSKey, appSKey, fCntUp, fCntDown)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    return this.run(sql, [
      sessionData.devEUI,
      sessionData.devAddr,
      sessionData.nwkSKey,
      sessionData.appSKey,
      sessionData.fCntUp || 0,
      sessionData.fCntDown || 0
    ]);
  }

  async getSessionKeys(devEUI) {
    return this.get('SELECT * FROM session_keys WHERE devEUI = ? ORDER BY created_at DESC LIMIT 1', [devEUI]);
  }

  // Device profile management
  async saveDeviceProfile(profile) {
    const sql = `
      INSERT OR REPLACE INTO device_profiles 
      (profileId, name, region, macVersion, regParamsRevision, adrAlgorithmId, 
       payloadCodec, payloadEncoderScript, payloadDecoderScript, flushQueueOnActivate,
       uplinkInterval, deviceStatusReqInterval, supportsOtaa, supportsClassB, supportsClassC,
       classBTimeout, classCTimeout)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    return this.run(sql, [
      profile.profileId,
      profile.name,
      profile.region,
      profile.macVersion,
      profile.regParamsRevision,
      profile.adrAlgorithmId,
      profile.payloadCodec,
      profile.payloadEncoderScript,
      profile.payloadDecoderScript,
      profile.flushQueueOnActivate,
      profile.uplinkInterval,
      profile.deviceStatusReqInterval,
      profile.supportsOtaa,
      profile.supportsClassB,
      profile.supportsClassC,
      profile.classBTimeout,
      profile.classCTimeout
    ]);
  }

  async getDeviceProfile(profileId) {
    return this.get('SELECT * FROM device_profiles WHERE profileId = ?', [profileId]);
  }

  // Migration history
  async saveMigrationRecord(record) {
    const sql = `
      INSERT INTO migration_history 
      (devEUI, sourceLNS, targetLNS, status, migration_options, error_message)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    return this.run(sql, [
      record.devEUI,
      record.sourceLNS,
      record.targetLNS,
      record.status,
      record.migration_options || JSON.stringify({}),
      record.error_message
    ]);
  }

  async updateMigrationStatus(id, status, error = null, completedAt = null) {
    const sql = `
      UPDATE migration_history 
      SET status = ?, error_message = ?, completed_at = ?
      WHERE id = ?
    `;
    return this.run(sql, [status, error, completedAt || new Date().toISOString(), id]);
  }

  async getMigrationHistory(devEUI = null) {
    if (devEUI) {
      return this.all('SELECT * FROM migration_history WHERE devEUI = ? ORDER BY started_at DESC', [devEUI]);
    }
    return this.all('SELECT * FROM migration_history ORDER BY started_at DESC LIMIT 100');
  }

  // Configuration management methods
  async saveConfig(key, value, description = null) {
    const sql = `
      INSERT OR REPLACE INTO service_config 
      (config_key, config_value, description, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `;
    return this.run(sql, [key, JSON.stringify(value), description]);
  }

  async getConfig(key) {
    const row = await this.get('SELECT config_value FROM service_config WHERE config_key = ?', [key]);
    return row ? JSON.parse(row.config_value) : null;
  }

  async getAllConfig() {
    const rows = await this.all('SELECT config_key, config_value, description FROM service_config ORDER BY config_key');
    const config = {};
    rows.forEach(row => {
      config[row.config_key] = JSON.parse(row.config_value);
    });
    return config;
  }

  async isServiceConfigured() {
    const sourceLNS = await this.getConfig('sourceLNS');
    const targetLNS = await this.getConfig('targetLNS');
    return !!(sourceLNS && targetLNS);
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = Database; 