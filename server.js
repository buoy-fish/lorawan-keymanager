const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const Database = require('./database');
const MigrationService = require('./migrationService');
const config = require('./config');

const app = express();
const port = config.app.port;

// Initialize database and migration service
let db;
let migrationService;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-hashes'",
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com"
      ],
      scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com"
      ],
      fontSrc: [
        "'self'",
        "https://cdn.jsdelivr.net"
      ],
      imgSrc: ["'self'", "data:"],
    },
  },
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime()
  });
});

// Setup wizard endpoints
app.get('/api/setup/status', async (req, res) => {
  try {
    const isConfigured = await db.isServiceConfigured();
    res.json({ isConfigured });
  } catch (error) {
    console.error('Error checking setup status:', error);
    res.status(500).json({ error: 'Failed to check setup status' });
  }
});

app.post('/api/setup/test-source', async (req, res) => {
  try {
    const { url, apiKey, name, tenantId, tenantName } = req.body;
    
    console.log('Test-source request received:', { 
      url, 
      apiKey: apiKey ? 'PRESENT' : 'MISSING', 
      name, 
      tenantId: tenantId || 'NOT PROVIDED',
      tenantName: tenantName || 'NOT PROVIDED'
    });
    
    if (!url || !apiKey) {
      return res.json({ 
        success: false, 
        error: 'URL and API key are required' 
      });
    }
    
    // Create temporary ChirpStack client for testing
    const tempClient = {
      name: name || 'Source LNS',
      baseUrl: url,
      apiKey: apiKey,
      tenantId: tenantId || null,
      tenantName: tenantName || null,
      isHeliumChirpStack: false // Source is always standard ChirpStack
    };
    
    const ChirpStackClient = require('./chirpstackClient');
    const testClient = new ChirpStackClient(tempClient);
    
    // If tenant ID is provided, test with tenant, otherwise basic connection
    const result = tenantId 
      ? await testClient.testConnectionWithTenant(tenantId)
      : await testClient.testConnection();
    
    res.json(result);
  } catch (error) {
    console.error('Source LNS test failed:', error);
    res.json({ 
      success: false, 
      error: error.message || 'Connection failed'
    });
  }
});

app.post('/api/setup/test-target', async (req, res) => {
  try {
    const { url, apiKey, name, type, tenantId, tenantName } = req.body;
    
    console.log('Test-target request received:', { 
      url, 
      apiKey: apiKey ? 'PRESENT' : 'MISSING', 
      name, 
      type,
      tenantId: tenantId || 'NOT PROVIDED',
      tenantName: tenantName || 'NOT PROVIDED'
    });
    
    if (!url || !apiKey) {
      return res.json({ 
        success: false, 
        error: 'URL and API key are required' 
      });
    }
    
    // Create temporary ChirpStack client for testing
    const tempClient = {
      name: name || 'Target LNS',
      baseUrl: url,
      apiKey: apiKey,
      tenantId: tenantId || null,
      tenantName: tenantName || null,
      isHeliumChirpStack: type === 'helium'
    };
    
    const ChirpStackClient = require('./chirpstackClient');
    const testClient = new ChirpStackClient(tempClient);
    
    // If tenant ID is provided, test with tenant, otherwise basic connection
    const result = tenantId 
      ? await testClient.testConnectionWithTenant(tenantId)
      : await testClient.testConnection();
    
    res.json(result);
  } catch (error) {
    console.error('Target LNS test failed:', error);
    res.json({ 
      success: false, 
      error: error.message || 'Connection failed'
    });
  }
});

// Get available tenants from source LNS
app.post('/api/setup/get-source-tenants', async (req, res) => {
  try {
    const { url, apiKey, name } = req.body;
    
    if (!url || !apiKey) {
      return res.json({ 
        success: false, 
        error: 'URL and API key are required' 
      });
    }
    
    // Create temporary ChirpStack client for tenant discovery
    const tempClient = {
      name: name || 'Source LNS',
      baseUrl: url,
      apiKey: apiKey,
      tenantId: null, // Not needed for tenant discovery
      tenantName: null,
      isHeliumChirpStack: !url.includes('8080') // Heuristic: assume port 8080 = standard ChirpStack
    };
    
    const ChirpStackClient = require('./chirpstackClient');
    const testClient = new ChirpStackClient(tempClient);
    
    const tenants = await testClient.getTenants();
    
    res.json({ 
      success: true, 
      tenants: tenants.map(t => ({ id: t.id, name: t.name }))
    });
  } catch (error) {
    console.error('Error fetching source tenants:', error);
    res.json({ 
      success: false, 
      error: error.message || 'Failed to fetch tenants'
    });
  }
});

// Get available tenants from target LNS
app.post('/api/setup/get-target-tenants', async (req, res) => {
  try {
    const { url, apiKey, name, type } = req.body;
    
    if (!url || !apiKey) {
      return res.json({ 
        success: false, 
        error: 'URL and API key are required' 
      });
    }
    
    // Create temporary ChirpStack client for tenant discovery
    const tempClient = {
      name: name || 'Target LNS',
      baseUrl: url,
      apiKey: apiKey,
      tenantId: null, // Not needed for tenant discovery
      tenantName: null,
      isHeliumChirpStack: type === 'helium'
    };
    
    const ChirpStackClient = require('./chirpstackClient');
    const testClient = new ChirpStackClient(tempClient);
    
    const tenants = await testClient.getTenants();
    
    res.json({ 
      success: true, 
      tenants: tenants.map(t => ({ id: t.id, name: t.name }))
    });
  } catch (error) {
    console.error('Error fetching target tenants:', error);
    res.json({ 
      success: false, 
      error: error.message || 'Failed to fetch tenants'
    });
  }
});

// Final validation with selected tenant
app.post('/api/setup/validate-with-tenant', async (req, res) => {
  try {
    const { url, apiKey, name, tenantId, type } = req.body;
    
    if (!url || !apiKey || !tenantId) {
      return res.json({ 
        success: false, 
        error: 'URL, API key, and tenant ID are required' 
      });
    }
    
    // Create temporary ChirpStack client for validation
    const tempClient = {
      name: name || 'LNS',
      baseUrl: url,
      apiKey: apiKey,
      tenantId: tenantId,
      tenantName: null,
      isHeliumChirpStack: type === 'helium'
    };
    
    const ChirpStackClient = require('./chirpstackClient');
    const testClient = new ChirpStackClient(tempClient);
    
    const result = await testClient.testConnectionWithTenant(tenantId);
    
    res.json(result);
  } catch (error) {
    console.error('Error validating with tenant:', error);
    res.json({ 
      success: false, 
      error: error.message || 'Validation failed'
    });
  }
});

app.post('/api/setup/complete', async (req, res) => {
  try {
    const { sourceLNS, targetLNS } = req.body;
    
    // Save configuration to database
    await db.saveConfig('sourceLNS', sourceLNS, 'Source ChirpStack LNS configuration');
    await db.saveConfig('targetLNS', targetLNS, 'Target ChirpStack LNS configuration');
    
    console.log('Setup completed successfully');
    res.json({ success: true });
  } catch (error) {
    console.error('Error completing setup:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// Test LNS connections
app.get('/api/connections/test', async (req, res) => {
  try {
    const results = await migrationService.testConnections();
    res.json(results);
  } catch (error) {
    console.error('Error testing connections:', error);
    res.status(500).json({ error: error.message });
  }
});

// Device discovery and sync
app.post('/api/devices/discover', async (req, res) => {
  try {
    console.log('Starting device discovery...');
    const results = await migrationService.discoverDevices();
    res.json(results);
  } catch (error) {
    console.error('Error during device discovery:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all devices from local database
app.get('/api/devices', async (req, res) => {
  try {
    const devices = await db.getAllDevices();
    res.json(devices);
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific device details
app.get('/api/devices/:devEUI', async (req, res) => {
  try {
    const { devEUI } = req.params;
    const device = await db.getDevice(devEUI);
    
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Also get session keys and migration history
    const [sessionKeys, migrationHistory] = await Promise.all([
      db.getSessionKeys(devEUI),
      db.getMigrationHistory(devEUI)
    ]);

    res.json({
      device,
      sessionKeys,
      migrationHistory
    });
  } catch (error) {
    console.error('Error fetching device details:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test AppKey extraction for a specific device
app.get('/api/devices/:devEUI/test-appkey', async (req, res) => {
  try {
    const { devEUI } = req.params;
    const result = await migrationService.testAppKeyExtraction(devEUI);
    res.json(result);
  } catch (error) {
    console.error('Error testing AppKey extraction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Migrate single device
app.post('/api/devices/:devEUI/migrate', async (req, res) => {
  try {
    const { devEUI } = req.params;
    const options = req.body;

    console.log(`Received migration request for ${devEUI} with options:`, options);

    const result = await migrationService.migrateDevice(devEUI, options);
    res.json(result);
  } catch (error) {
    console.error('Error migrating device:', error);
    res.status(500).json({ error: error.message });
  }
});

// Migrate multiple devices
app.post('/api/devices/migrate/batch', async (req, res) => {
  try {
    const { devEUIs, options } = req.body;

    if (!devEUIs || !Array.isArray(devEUIs) || devEUIs.length === 0) {
      return res.status(400).json({ error: 'devEUIs array is required' });
    }

    console.log(`Received batch migration request for ${devEUIs.length} devices`);

    const results = await migrationService.migrateDevices(devEUIs, options || {});
    res.json(results);
  } catch (error) {
    console.error('Error during batch migration:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get migration history
app.get('/api/migrations', async (req, res) => {
  try {
    const { devEUI } = req.query;
    const history = await migrationService.getMigrationHistory(devEUI);
    res.json(history);
  } catch (error) {
    console.error('Error fetching migration history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get available applications from both LNS systems
app.get('/api/applications', async (req, res) => {
  try {
    const applications = await migrationService.getAvailableApplications();
    res.json(applications);
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get devices for a specific application from old LNS
app.get('/api/applications/:applicationId/devices', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const devices = await migrationService.getDevicesForApplication(applicationId);
    res.json(devices);
  } catch (error) {
    console.error('Error fetching application devices:', error);
    res.status(500).json({ error: error.message });
  }
});

// Migrate all devices from a source application to target application
app.post('/api/applications/:applicationId/migrate', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { targetApplicationId, targetDeviceProfileId, options = {} } = req.body;

    if (!targetApplicationId || !targetDeviceProfileId) {
      return res.status(400).json({ 
        error: 'targetApplicationId and targetDeviceProfileId are required' 
      });
    }

    console.log(`Received bulk migration request for application ${applicationId}`);
    console.log(`Target: Application ${targetApplicationId}, Device Profile ${targetDeviceProfileId}`);

    const result = await migrationService.migrateApplicationDevices(
      applicationId, 
      targetApplicationId, 
      targetDeviceProfileId, 
      options
    );
    res.json(result);
  } catch (error) {
    console.error('Error during application migration:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get available device profiles from both LNS systems
app.get('/api/device-profiles', async (req, res) => {
  try {
    const profiles = await migrationService.getAvailableDeviceProfiles();
    res.json(profiles);
  } catch (error) {
    console.error('Error fetching device profiles:', error);
    res.status(500).json({ error: error.message });
  }
});

// Configuration endpoint
app.get('/api/config', (req, res) => {
  res.json({
    oldLNS: {
      name: config.oldLNS?.name || 'Source LNS',
      // Don't expose API keys in response
    },
    newLNS: {
      name: config.newLNS?.name || 'Target LNS',
    },
    migration: config.migration
  });
});

// Export backup data endpoint
app.get('/api/export', async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Get all data from database
    const devices = await db.getAllDevices();
    const migrations = await db.getMigrationHistory();
    
    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        version: '1.0.0',
        source: 'keyManager-backup',
        deviceCount: devices.length,
        migrationCount: migrations.length
      },
      devices: devices,
      migrations: migrations
    };

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="keyManager_backup_${timestamp}.json"`);
      res.json(exportData);
    } else if (format === 'csv') {
      // Convert devices to CSV format
      const csv = [
        // CSV Header
        'DevEUI,Name,AppEUI,AppKey,Description,LastSeen,Application,DeviceProfile',
        // CSV Data
        ...devices.map(device => [
          device.devEUI || '',
          `"${(device.name || '').replace(/"/g, '""')}"`,
          device.appEUI || '',
          device.appKey || '',
          `"${(device.description || '').replace(/"/g, '""')}"`,
          device.lastSeen || '',
          device.applicationId || '',
          device.deviceProfileId || ''
        ].join(','))
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="keyManager_devices_${timestamp}.csv"`);
      res.send(csv);
    } else {
      res.status(400).json({ error: 'Invalid format. Use json or csv' });
    }
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Initialize and start server
async function initialize() {
  try {
    console.log('Initializing keyManager service...');
    
    // Initialize database
    db = new Database();
    await db.initialize();
    console.log('Database initialized');

    // Check if service is configured via database
    const isConfigured = await db.isServiceConfigured();
    let runtimeConfig = config; // Default to config.js
    
    if (isConfigured) {
      // Load configuration from database
      const sourceLNS = await db.getConfig('sourceLNS');
      const targetLNS = await db.getConfig('targetLNS');
      
      runtimeConfig = {
        app: config.app, // Keep app config from config.js
        oldLNS: {
          name: sourceLNS.name,
          baseUrl: sourceLNS.url,
          apiKey: sourceLNS.apiKey,
          tenantId: sourceLNS.tenantId,
          tenantName: sourceLNS.tenantName,
          lorawanVersion: sourceLNS.lorawanVersion,
          isHeliumChirpStack: sourceLNS.isHeliumChirpStack || false
        },
        newLNS: {
          name: targetLNS.name,
          baseUrl: targetLNS.url,
          apiKey: targetLNS.apiKey,
          tenantId: targetLNS.tenantId,
          tenantName: targetLNS.tenantName,
          isHeliumChirpStack: targetLNS.type === 'helium'
        },
        migration: config.migration // Keep migration defaults from config.js
      };
      
      console.log('Using database configuration');
    } else {
      console.log('Using config.js configuration (setup wizard will be shown)');
    }

    // Initialize migration service with runtime configuration
    migrationService = new MigrationService(db, runtimeConfig);
    console.log('Migration service initialized');

    // Start server
    app.listen(port, () => {
      console.log(`\n🚀 keyManager service running on port ${port}`);
      console.log(`📊 Web interface: http://localhost:${port}`);
      console.log(`🔗 API base URL: http://localhost:${port}/api`);
      console.log(`\nAvailable endpoints:`);
      console.log(`  GET  /api/health                    - Health check`);
      console.log(`  GET  /api/setup/status              - Check setup status`);
      console.log(`  POST /api/setup/test-source         - Test source LNS connection`);
      console.log(`  POST /api/setup/test-target         - Test target LNS connection`);
      console.log(`  POST /api/setup/complete            - Complete setup wizard`);
      console.log(`  GET  /api/connections/test          - Test LNS connections`);
      console.log(`  POST /api/devices/discover          - Discover devices from old LNS`);
      console.log(`  GET  /api/devices                   - List all devices`);
      console.log(`  GET  /api/devices/:devEUI           - Get device details`);
      console.log(`  GET  /api/devices/:devEUI/test-appkey - Test AppKey extraction`);
      console.log(`  POST /api/devices/:devEUI/migrate   - Migrate single device`);
      console.log(`  POST /api/devices/migrate/batch     - Migrate multiple devices`);
      console.log(`  GET  /api/migrations                - Get migration history`);
      console.log(`  GET  /api/applications              - Get available applications`);
      console.log(`  GET  /api/applications/:id/devices  - Get devices for application`);
      console.log(`  POST /api/applications/:id/migrate  - Migrate all devices in application`);
      console.log(`  GET  /api/device-profiles           - Get available device profiles`);
      console.log(`  GET  /api/config                    - Get configuration`);
      
      // Test connections after server starts (don't block startup)
      setTimeout(async () => {
        try {
          console.log('Testing LNS connections...');
          await migrationService.testConnections();
        } catch (error) {
          console.error('Warning: Initial connection test failed:', error.message);
        }
      }, 1000);
    });

  } catch (error) {
    console.error('Failed to initialize keyManager service:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  if (db) {
    await db.close();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down keyManager service...');
  if (db) {
    await db.close();
  }
  process.exit(0);
});

// Start the application
initialize().catch(error => {
  console.error('Fatal error during initialization:', error);
  process.exit(1);
});
