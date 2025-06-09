const { exec } = require('node:child_process');
const util = require('node:util');
const axios = require('axios');

const execAsync = util.promisify(exec);

class ChirpStackClient {
  constructor(config) {
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.tenantId = config.tenantId;
    this.tenantName = config.tenantName;
    this.lorawanVersion = config.lorawanVersion || '1.0.x'; // Default to 1.0.x
    
    // Extract host and port from baseUrl
    const url = new URL(config.baseUrl);
    this.host = url.hostname;
    this.port = url.port || (url.protocol === 'https:' ? 443 : 80);
    this.target = `${this.host}:${this.port}`;
    
    // Detect if this is the custom helium-chirpstack-community implementation
    // Only the new LNS (console.buoy.fish) should be treated as helium-chirpstack
    // The old LNS (old.console.buoy.fish) should use standard ChirpStack gRPC
    this.isHeliumChirpStack = config.isHeliumChirpStack || 
                             this.name === 'console.buoy.fish' || 
                             (this.baseUrl === 'https://console.buoy.fish:443');
    
    console.log(`Initialized ChirpStack client for ${this.name} at ${this.target} (tenant: ${this.tenantName})`);
    if (this.isHeliumChirpStack) {
      console.log(`  Detected custom helium-chirpstack-community implementation`);
    }
  }

  // Helper method to execute grpcurl commands
  async executeGrpcCommand(service, method, data = {}) {
    const headers = `authorization: Bearer ${this.apiKey}`;
    const dataJson = JSON.stringify(data);
    
    // Determine if we should use plaintext or TLS based on the baseUrl
    const isHttps = this.baseUrl.startsWith('https://');
    const plaintextFlag = isHttps ? '' : '-plaintext';
    
    // For helium-chirpstack, we might need different timeout and retry logic
    const timeoutFlag = this.isHeliumChirpStack ? '-max-time 10' : '';
    
    const command = `grpcurl ${plaintextFlag} ${timeoutFlag} -H '${headers}' -d '${dataJson}' ${this.target} ${service}/${method}`;
    
    try {
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr && stderr.trim()) {
        console.error(`gRPC stderr for ${service}/${method}:`, stderr);
      }
      
      if (!stdout || !stdout.trim()) {
        throw new Error('Empty response from gRPC call');
      }
      
      return JSON.parse(stdout);
    } catch (error) {
      console.error(`gRPC call failed: ${service}/${method}`, error.message);
      if (error.stdout) {
        console.error('stdout:', error.stdout);
      }
      if (error.stderr) {
        console.error('stderr:', error.stderr);
      }
      
      // For helium-chirpstack, provide more specific error information
      if (this.isHeliumChirpStack && error.message.includes('PROTOCOL_ERROR')) {
        throw new Error(`Custom helium-chirpstack gRPC connection failed - nginx proxy may not be configured for gRPC. See: https://github.com/disk91/helium-chirpstack-community`);
      }
      
      throw error;
    }
  }

  // Helper method to execute REST API calls for helium-chirpstack-community
  async executeRestApiCall(endpoint, params = {}) {
    // Build query parameters
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value);
      }
    });
    
    const url = `${this.baseUrl}/api/${endpoint}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    
    try {
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000,
        // Allow self-signed certificates
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });
      
      return response.data;
    } catch (error) {
      console.error(`REST API call failed: ${endpoint}`, error.message);
      throw error;
    }
  }

  // Helper method to execute REST API POST calls for helium-chirpstack-community
  async executeRestApiPost(endpoint, data = {}) {
    const url = `${this.baseUrl}/api/${endpoint}`;
    
    try {
      const response = await axios.post(url, data, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000,
        // Allow self-signed certificates
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });
      
      return response.data;
    } catch (error) {
      console.error(`REST API POST failed: ${endpoint}`, error.message);
      if (error.response) {
        console.error('Response data:', error.response.data);
      }
      throw error;
    }
  }

  // Helper method to execute REST API PUT calls for helium-chirpstack-community  
  async executeRestApiPut(endpoint, data = {}) {
    const url = `${this.baseUrl}/api/${endpoint}`;
    
    try {
      const response = await axios.put(url, data, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000,
        // Allow self-signed certificates
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });
      
      return response.data;
    } catch (error) {
      console.error(`REST API PUT failed: ${endpoint}`, error.message);
      if (error.response) {
        console.error('Response data:', error.response.data);
      }
      throw error;
    }
  }

    // Test basic connection to ChirpStack using applications endpoint (which works with API keys)
  async testConnection() {
    try {
      if (this.isHeliumChirpStack) {
        // Use REST API for helium-chirpstack-community - test applications endpoint instead of tenants
        try {
          const result = await this.executeRestApiCall('applications', { 
            tenantId: this.tenantId,
            limit: 1 
          });
          console.log(`Basic connection test succeeded for ${this.name} - found ${result.totalCount} applications`);
          return { 
            success: true, 
            data: { 
              message: `Connected successfully - found ${result.totalCount} applications`, 
              type: 'helium-chirpstack',
              applications: result.totalCount
            } 
          };
        } catch (error) {
          const errorMsg = `Custom helium-chirpstack REST API connection failed. Error: ${error.message}`;
          console.error(`Connection test failed for ${this.name}:`, errorMsg);
          return { success: false, error: errorMsg };
        }
      } else {
        // Standard ChirpStack handling - test applications endpoint via gRPC instead of tenants
        try {
          const result = await this.executeGrpcCommand('api.ApplicationService', 'List', { 
            tenantId: this.tenantId,
            limit: 1 
          });
          console.log(`Basic connection test succeeded for ${this.name} - found ${result.totalCount} applications`);
          return { 
            success: true, 
            data: { 
              message: `Connected successfully - found ${result.totalCount} applications`, 
              type: 'standard-chirpstack',
              applications: result.totalCount
            } 
          };
        } catch (applicationError) {
          let errorMessage = `Cannot connect to gRPC API: ${applicationError.message}`;
          
          // Provide specific guidance based on the error and URL
          if (applicationError.message.includes('PROTOCOL_ERROR') && this.baseUrl.includes('443')) {
            errorMessage += `\n\nHint: For old ChirpStack servers, try:
- URL: http://20.121.50.53:8080 (HTTP on port 8080)
- NOT: https://old.console.buoy.fish:443 (HTTPS on port 443)
The old ChirpStack server likely doesn't support gRPC over TLS.`;
          }
          
          return { success: false, error: errorMessage };
        }
      }
    } catch (error) {
      console.error(`Connection test failed for ${this.name}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Get available tenants for user selection
  async getTenants() {
    try {
      if (this.isHeliumChirpStack) {
        // Use REST API for helium-chirpstack-community
        const result = await this.executeRestApiCall('tenants', { limit: 100 });
        console.log(`Found ${result.totalCount} tenants from ${this.name}`);
        return result.result || [];
      } else {
        // Use gRPC for standard ChirpStack
        const result = await this.executeGrpcCommand('api.TenantService', 'List', { limit: 100 });
        console.log(`Found ${result.totalCount} tenants from ${this.name}`);
        return result.result || [];
      }
    } catch (error) {
      console.error(`Error fetching tenants from ${this.name}:`, error.message);
      throw error;
    }
  }

  // Test connection with specific tenant (final validation)
  async testConnectionWithTenant(tenantId) {
    try {
      if (this.isHeliumChirpStack) {
        // Use REST API for helium-chirpstack-community
        const result = await this.executeRestApiCall('applications', {
          tenantId: tenantId,
          limit: 1
        });
        
        console.log(`Tenant validation succeeded for ${this.name} - found ${result.totalCount} applications`);
        return { 
          success: true, 
          data: { 
            message: 'Connected successfully', 
            applications: result.totalCount 
          } 
        };
      } else {
        // Standard ChirpStack handling
        const result = await this.executeGrpcCommand('api.ApplicationService', 'List', {
          tenantId: tenantId,
          limit: 1
        });
        
        console.log(`Tenant validation succeeded for ${this.name} - found ${result.totalCount} applications`);
        return { 
          success: true, 
          data: { 
            message: 'Connected successfully', 
            applications: result.totalCount 
          } 
        };
      }
    } catch (error) {
      console.error(`Tenant validation failed for ${this.name}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Get all applications
  async getApplications() {
    try {
      let result;
      
      if (this.isHeliumChirpStack) {
        // Use REST API for helium-chirpstack-community
        console.log(`Using REST API for ${this.name} (helium-chirpstack-community)`);
        result = await this.executeRestApiCall('applications', {
          tenantId: this.tenantId,
          limit: 100
        });
      } else {
        // Use gRPC for standard ChirpStack
        result = await this.executeGrpcCommand('api.ApplicationService', 'List', {
          tenantId: this.tenantId,
          limit: 100
        });
      }
      
      console.log(`Found ${result.totalCount} applications from ${this.name}`);
      return result.result || [];
    } catch (error) {
      console.error(`Error fetching applications from ${this.name}:`, error.message);
      throw error;
    }
  }

  // Get specific application
  async getApplication(applicationId) {
    try {
      const result = await this.executeGrpcCommand('api.ApplicationService', 'Get', {
        id: applicationId
      });
      
      return result.application;
    } catch (error) {
      console.error(`Error fetching application ${applicationId} from ${this.name}:`, error.message);
      throw error;
    }
  }

  // Get devices for an application
  async getDevices(applicationId, limit = 100, offset = 0) {
    try {
      const result = await this.executeGrpcCommand('api.DeviceService', 'List', {
        applicationId: applicationId,
        limit: limit,
        offset: offset
      });
      
      console.log(`Found ${result.totalCount} devices in application ${applicationId} from ${this.name}`);
      return result.result || [];
    } catch (error) {
      console.error(`Error fetching devices from ${this.name}:`, error.message);
      throw error;
    }
  }

  // Get all devices from all applications
  async getAllDevicesForAllApplications() {
    try {
      const applications = await this.getApplications();
      const allDevices = [];
      
      for (const app of applications) {
        try {
          console.log(`Fetching devices from application: ${app.name} (${app.id})`);
          const devices = await this.getDevices(app.id);
          
          // Add application info to each device
          const devicesWithAppInfo = devices.map(device => ({
            ...device,
            applicationId: app.id,
            applicationName: app.name,
            // Map ChirpStack fields to our expected format
            devEUI: device.devEui,
            name: device.name,
            description: device.description,
            deviceProfileId: device.deviceProfileId
          }));
          
          allDevices.push(...devicesWithAppInfo);
        } catch (error) {
          console.warn(`Could not fetch devices for application ${app.id}:`, error.message);
        }
      }
      
      console.log(`Total devices found across all applications: ${allDevices.length}`);
      return allDevices;
    } catch (error) {
      console.error(`Error fetching all devices from ${this.name}:`, error.message);
      throw error;
    }
  }

  // Get device details
  async getDevice(devEUI) {
    try {
      const result = await this.executeGrpcCommand('api.DeviceService', 'Get', {
        devEui: devEUI
      });
      
      return {
        ...result.device,
        devEUI: result.device.devEui
      };
    } catch (error) {
      console.error(`Error fetching device ${devEUI} from ${this.name}:`, error.message);
      throw error;
    }
  }

  // Get device keys
  async getDeviceKeys(devEUI) {
    try {
      const result = await this.executeGrpcCommand('api.DeviceService', 'GetKeys', {
        devEui: devEUI
      });
      
      // Handle different LoRaWAN versions for Application Key extraction
      let applicationKey = result.deviceKeys.appKey;
      
      if (this.lorawanVersion === '1.0.x') {
        // For LoRaWAN 1.0.x, prioritize nwkKey over appKey
        if (result.deviceKeys.nwkKey && result.deviceKeys.nwkKey !== '00000000000000000000000000000000') {
          applicationKey = result.deviceKeys.nwkKey;
          console.log(`Using nwkKey as Application Key for device ${devEUI} from ${this.name} (LoRaWAN 1.0.x)`);
        }
      } else if (this.lorawanVersion === '1.1.x') {
        // For LoRaWAN 1.1.x, use appKey field
        if (!applicationKey || applicationKey === '00000000000000000000000000000000') {
          console.log(`Warning: AppKey is empty for device ${devEUI} from ${this.name} (LoRaWAN 1.1.x)`);
        }
      }
      
      // Fallback: if appKey is still empty and we have nwkKey, use it
      if ((!applicationKey || applicationKey === '00000000000000000000000000000000') && 
          result.deviceKeys.nwkKey && result.deviceKeys.nwkKey !== '00000000000000000000000000000000') {
        applicationKey = result.deviceKeys.nwkKey;
        console.log(`Fallback: Using nwkKey as Application Key for device ${devEUI} from ${this.name}`);
      }
      
      return {
        devEUI: devEUI,
        appEUI: result.deviceKeys.joinEui || result.deviceKeys.appEui,
        appKey: applicationKey
      };
    } catch (error) {
      console.error(`Error fetching keys for device ${devEUI} from ${this.name}:`, error.message);
      // Return empty keys if not found
      return {
        devEUI: devEUI,
        appEUI: '0000000000000000',
        appKey: '00000000000000000000000000000000'
      };
    }
  }

  // Get device activation (session keys)
  async getDeviceActivation(devEUI) {
    try {
      const result = await this.executeGrpcCommand('api.DeviceService', 'GetActivation', {
        devEui: devEUI
      });
      
      return {
        devEUI: devEUI,
        devAddr: result.deviceActivation.devAddr,
        nwkSKey: result.deviceActivation.nwkSEncKey,
        appSKey: result.deviceActivation.appSKey,
        fCntUp: result.deviceActivation.fCntUp || 0,
        fCntDown: result.deviceActivation.nFCntDown || 0
      };
    } catch (error) {
      console.error(`Error fetching activation for device ${devEUI} from ${this.name}:`, error.message);
      // Return empty activation if not found
      return {
        devEUI: devEUI,
        devAddr: '00000000',
        nwkSKey: '00000000000000000000000000000000',
        appSKey: '00000000000000000000000000000000',
        fCntUp: 0,
        fCntDown: 0
      };
    }
  }

  // Get device profiles
  async getDeviceProfiles() {
    try {
      let result;
      
      if (this.isHeliumChirpStack) {
        // Use REST API for helium-chirpstack-community
        console.log(`Using REST API for device profiles from ${this.name} (helium-chirpstack-community)`);
        result = await this.executeRestApiCall('device-profiles', {
          tenantId: this.tenantId,
          limit: 100
        });
      } else {
        // Use gRPC for standard ChirpStack
        result = await this.executeGrpcCommand('api.DeviceProfileService', 'List', {
          tenantId: this.tenantId,
          limit: 100
        });
      }
      
      console.log(`Found ${result.totalCount} device profiles from ${this.name}`);
      return result.result || [];
    } catch (error) {
      console.error(`Error fetching device profiles from ${this.name}:`, error.message);
      throw error;
    }
  }

  // Get complete device info
  async getCompleteDeviceInfo(devEUI) {
    try {
      const [device, keys, activation] = await Promise.allSettled([
        this.getDevice(devEUI),
        this.getDeviceKeys(devEUI),
        this.getDeviceActivation(devEUI)
      ]);

      const result = {
        device: device.status === 'fulfilled' ? device.value : null,
        keys: keys.status === 'fulfilled' ? keys.value : null,
        activation: activation.status === 'fulfilled' ? activation.value : null
      };

      // Get device profile if available
      if (result.device && result.device.deviceProfileId) {
        try {
          const profileResult = await this.executeGrpcCommand('api.DeviceProfileService', 'Get', {
            id: result.device.deviceProfileId
          });
          result.deviceProfile = profileResult.deviceProfile;
        } catch (error) {
          console.warn(`Could not fetch device profile for ${devEUI}:`, error.message);
        }
      }

      return result;
    } catch (error) {
      console.error(`Error fetching complete device info for ${devEUI} from ${this.name}:`, error.message);
      throw error;
    }
  }

  // Create device (for migration)
  async createDevice(deviceData) {
    try {
      // Support both devEUI and devEui property names
      const devEUI = deviceData.devEUI || deviceData.devEui;
      
      const device = {
        devEui: devEUI,
        name: deviceData.name,
        description: deviceData.description || '',
        applicationId: deviceData.applicationId,
        deviceProfileId: deviceData.deviceProfileId,
        skipFcntCheck: deviceData.skipFcntCheck !== undefined ? deviceData.skipFcntCheck : true, // Default to true for backward compatibility
        isDisabled: false
      };

      if (this.isHeliumChirpStack) {
        // Use REST API for helium-chirpstack-community
        const result = await this.executeRestApiPost('devices', { device: device });
        return { success: true, device: deviceData };
      } else {
        // Use gRPC for standard ChirpStack
        const result = await this.executeGrpcCommand('api.DeviceService', 'Create', {
          device: device
        });
        console.log(`Created device ${devEUI} in ${this.name}`);
        return { success: true, device: deviceData };
      }
    } catch (error) {
      const devEUI = deviceData.devEUI || deviceData.devEui;
      console.error(`Error creating device ${devEUI} in ${this.name}:`, error.message);
      throw error;
    }
  }

  // Create device keys
  async createDeviceKeys(devEUI, keysData) {
    try {
      // For LoRaWAN 1.0.x, AppKey goes in nwkKey field
      // For LoRaWAN 1.1.x, AppKey goes in appKey field
      const deviceKeys = {
        devEui: devEUI,
        joinEui: keysData.appEUI,
        nwkKey: keysData.appKey,  // LoRaWAN 1.0.x uses nwkKey for AppKey
        appKey: keysData.appKey   // LoRaWAN 1.1.x uses appKey - include both for compatibility
      };

      if (this.isHeliumChirpStack) {
        // Use REST API for helium-chirpstack-community
        const result = await this.executeRestApiPost(`devices/${devEUI}/keys`, { deviceKeys: deviceKeys });
        return { success: true };
      } else {
        // Use gRPC for standard ChirpStack
        const result = await this.executeGrpcCommand('api.DeviceService', 'CreateKeys', {
          deviceKeys: deviceKeys
        });
        console.log(`Created keys for device ${devEUI} in ${this.name}`);
        return { success: true };
      }
    } catch (error) {
      console.error(`Error creating keys for device ${devEUI} in ${this.name}:`, error.message);
      throw error;
    }
  }

  // Update device (for existing devices)
  async updateDevice(devEUI, deviceData) {
    try {
      // Ensure we use the passed devEUI parameter, not from deviceData
      const device = {
        devEui: devEUI,
        name: deviceData.name,
        description: deviceData.description || '',
        applicationId: deviceData.applicationId,
        deviceProfileId: deviceData.deviceProfileId,
        skipFcntCheck: deviceData.skipFcntCheck !== undefined ? deviceData.skipFcntCheck : true, // Default to true for backward compatibility
        isDisabled: false
      };

      if (this.isHeliumChirpStack) {
        // Use REST API for helium-chirpstack-community
        const result = await this.executeRestApiPut(`devices/${devEUI}`, { device: device });
        return { success: true, device: deviceData };
      } else {
        // Use gRPC for standard ChirpStack
        const result = await this.executeGrpcCommand('api.DeviceService', 'Update', {
          device: device
        });
        console.log(`Updated device ${devEUI} in ${this.name}`);
        return { success: true, device: deviceData };
      }
    } catch (error) {
      console.error(`Error updating device ${devEUI} in ${this.name}:`, error.message);
      throw error;
    }
  }

  // Update device keys (for existing devices)
  async updateDeviceKeys(devEUI, keysData) {
    try {
      // For LoRaWAN 1.0.x, AppKey goes in nwkKey field
      // For LoRaWAN 1.1.x, AppKey goes in appKey field
      const deviceKeys = {
        devEui: devEUI,
        joinEui: keysData.appEUI,
        nwkKey: keysData.appKey,  // LoRaWAN 1.0.x uses nwkKey for AppKey
        appKey: keysData.appKey   // LoRaWAN 1.1.x uses appKey - include both for compatibility
      };

      if (this.isHeliumChirpStack) {
        // Use REST API for helium-chirpstack-community
        // Try POST instead of PUT - some implementations expect POST for key updates
        try {
          const result = await this.executeRestApiPut(`devices/${devEUI}/keys`, { deviceKeys: deviceKeys });
          return { success: true };
        } catch (putError) {
          const result = await this.executeRestApiPost(`devices/${devEUI}/keys`, { deviceKeys: deviceKeys });
          return { success: true };
        }
      } else {
        // Use gRPC for standard ChirpStack
        const result = await this.executeGrpcCommand('api.DeviceService', 'UpdateKeys', {
          deviceKeys: deviceKeys
        });
        console.log(`Updated keys for device ${devEUI} in ${this.name}`);
        return { success: true };
      }
    } catch (error) {
      console.error(`Error updating keys for device ${devEUI} in ${this.name}:`, error.message);
      throw error;
    }
  }

  // Activate device with session keys
  async activateDevice(devEUI, activationData) {
    try {
      const deviceActivation = {
        devEui: devEUI,
        devAddr: activationData.devAddr,
        nwkSEncKey: activationData.nwkSKey,
        appSKey: activationData.appSKey,
        fCntUp: activationData.fCntUp || 0,
        nFCntDown: activationData.fCntDown || 0
      };

      if (this.isHeliumChirpStack) {
        // Use REST API for helium-chirpstack-community
        console.log(`Activating device via REST API in ${this.name} (helium-chirpstack-community)`);
        const result = await this.executeRestApiPut(`devices/${devEUI}/activation`, { deviceActivation: deviceActivation });
        console.log(`Activated device ${devEUI} in ${this.name}`);
        return { success: true };
      } else {
        // Use gRPC for standard ChirpStack
        const result = await this.executeGrpcCommand('api.DeviceService', 'Activate', {
          deviceActivation: deviceActivation
        });
        console.log(`Activated device ${devEUI} in ${this.name}`);
        return { success: true };
      }
    } catch (error) {
      console.error(`Error activating device ${devEUI} in ${this.name}:`, error.message);
      throw error;
    }
  }

  // Delete device (for migration cleanup)
  async deleteDevice(devEUI) {
    try {
      if (this.isHeliumChirpStack) {
        // Use REST API for helium-chirpstack-community  
        console.log(`Deleting device via REST API in ${this.name} (helium-chirpstack-community)`);
        const result = await axios.delete(`${this.baseUrl}/api/devices/${devEUI}`, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          httpsAgent: new (require('https').Agent)({
            rejectUnauthorized: false
          })
        });
        console.log(`Deleted device ${devEUI} from ${this.name}`);
        return { success: true };
      } else {
        // Use gRPC for standard ChirpStack
        const result = await this.executeGrpcCommand('api.DeviceService', 'Delete', {
          devEui: devEUI
        });
        console.log(`Deleted device ${devEUI} from ${this.name}`);
        return { success: true };
      }
    } catch (error) {
      console.error(`Error deleting device ${devEUI} from ${this.name}:`, error.message);
      throw error;
    }
  }
}

module.exports = ChirpStackClient; 