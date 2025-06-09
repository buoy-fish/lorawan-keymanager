// Example configuration file for keyManager
// Copy this to config.js and fill in your actual values

module.exports = {
  app: {
    port: 3000
  },
  
  // Old/Source LNS Configuration (ChirpStack)
  oldLNS: {
    name: 'Source LNS',
    baseUrl: 'your-old-lns-host:port',  // e.g., '20.121.50.53:8080'
    apiKey: 'your-old-lns-api-key',
    tenantId: 'your-tenant-id',
    tenantName: 'your-tenant-name',
    lorawanVersion: '1.0.3',
    isHeliumChirpStack: false  // Set to true if using Helium's ChirpStack
  },
  
  // New/Target LNS Configuration
  newLNS: {
    name: 'Target LNS',  
    baseUrl: 'your-new-lns-host',  // e.g., 'console.buoy.fish:443'
    apiKey: 'your-new-lns-api-key',
    tenantId: 'your-new-tenant-id',
    tenantName: 'your-new-tenant-name',
    isHeliumChirpStack: true  // Set to true if target is Helium's ChirpStack
  },
  
  // Migration settings
  migration: {
    batchSize: 10,
    retryAttempts: 3,
    retryDelay: 2000,
    preserveDeviceNames: true,
    validateAppKeys: true
  }
}; 