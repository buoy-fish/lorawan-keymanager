const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

class LNSClient {
  constructor(config) {
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    
    // Extract host and port from baseUrl
    const url = new URL(config.baseUrl);
    this.host = url.hostname;
    this.port = url.port || (url.protocol === 'https:' ? 443 : 80);
    this.target = `${this.host}:${this.port}`;
    
    // Create authentication metadata
    this.metadata = new grpc.Metadata();
    this.metadata.add('authorization', `Bearer ${this.apiKey}`);
    
    // Create gRPC credentials
    this.credentials = url.protocol === 'https:' 
      ? grpc.credentials.createSsl()
      : grpc.credentials.createInsecure();
    
    // We'll initialize services dynamically using reflection
    this.services = {};
    this.initialized = false;
    
    console.log(`Initialized gRPC client for ${this.name} at ${this.target}`);
  }

  // Initialize services using reflection
  async initializeServices() {
    if (this.initialized) return;
    
    try {
      // Create a simple client to test connectivity and list services
      const testClient = new grpc.Client(this.target, this.credentials);
      
      // For now, we'll create clients for known ChirpStack services manually
      // since reflection API in Node.js is complex. We know these work from grpcui.
      
      // Create clients for the main ChirpStack services
      const packageDefinition = protoLoader.loadSync([
        // We'll use a simplified approach by defining the minimal interfaces we need
      ], {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
      });
      
      // For now, let's create a simple HTTP fallback for testing
      // since the reflection approach is complex
      this.initialized = true;
      console.log(`Services initialized for ${this.name}`);
      
    } catch (error) {
      console.error(`Failed to initialize services for ${this.name}:`, error.message);
      throw error;
    }
  }

  // Test connection using a simple gRPC call
  async testConnection() {
    try {
      // Since grpcui works, let's use a simple connectivity test
      return new Promise((resolve) => {
        const client = new grpc.Client(this.target, this.credentials);
        
        // Test the connection state
        client.waitForReady(Date.now() + 5000, (error) => {
          if (error) {
            console.error(`Connection test failed for ${this.name}:`, error.message);
            resolve({ success: false, error: error.message });
          } else {
            console.log(`Connection test succeeded for ${this.name}`);
            resolve({ success: true, data: { message: 'Connected successfully' } });
          }
          client.close();
        });
      });
    } catch (error) {
      console.error(`Connection test failed for ${this.name}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // For now, let's implement simplified versions that return mock data
  // so the service can start while we work on the full gRPC implementation
  
  async getApplications() {
    try {
      await this.initializeServices();
      
      // Return mock data for now - in a real implementation, this would use
      // the ApplicationService.List gRPC call
      console.log(`Getting applications from ${this.name} (mock implementation)`);
      
      return [
        {
          id: '1',
          name: 'Default Application',
          description: 'Default application for testing'
        }
      ];
    } catch (error) {
      console.error(`Error fetching applications from ${this.name}:`, error.message);
      throw error;
    }
  }

  async getApplication(applicationId) {
    try {
      await this.initializeServices();
      
      console.log(`Getting application ${applicationId} from ${this.name} (mock implementation)`);
      
      return {
        id: applicationId,
        name: 'Test Application',
        description: 'Test application'
      };
    } catch (error) {
      console.error(`Error fetching application ${applicationId} from ${this.name}:`, error.message);
      throw error;
    }
  }

  async createApplication(applicationData) {
    try {
      await this.initializeServices();
      
      console.log(`Creating application in ${this.name} (mock implementation):`, applicationData.name);
      
      return {
        id: Math.random().toString(36).substr(2, 9),
        ...applicationData
      };
    } catch (error) {
      console.error(`Error creating application in ${this.name}:`, error.message);
      throw error;
    }
  }

  async getDevices(applicationId, limit = 100, offset = 0) {
    try {
      await this.initializeServices();
      
      console.log(`Getting devices for application ${applicationId} from ${this.name} (mock implementation)`);
      
      // Return mock devices only for the old LNS for testing
      if (this.name === 'old.console.buoy.fish') {
        return [
          {
            devEUI: '70B3D57ED0049D2A',
            name: 'Test Device 1',
            description: 'Mock LoRa device for testing migration',
            applicationId: applicationId,
            deviceProfileId: '1',
            appEUI: '0000000000000001',
            appKey: '11111111111111111111111111111111'
          },
          {
            devEUI: '70B3D57ED0049D2B',
            name: 'Test Device 2', 
            description: 'Another mock device for testing',
            applicationId: applicationId,
            deviceProfileId: '1',
            appEUI: '0000000000000001',
            appKey: '22222222222222222222222222222222'
          },
          {
            devEUI: '70B3D57ED0049D2C',
            name: 'Sensor Device',
            description: 'Mock sensor device',
            applicationId: applicationId,
            deviceProfileId: '1',
            appEUI: '0000000000000001',
            appKey: '33333333333333333333333333333333'
          }
        ];
      }
      
      return [];
    } catch (error) {
      console.error(`Error fetching devices from ${this.name}:`, error.message);
      throw error;
    }
  }

  async getAllDevicesForAllApplications() {
    try {
      const applications = await this.getApplications();
      const allDevices = [];
      
      for (const app of applications) {
        try {
          const devices = await this.getDevices(app.id);
          const devicesWithAppInfo = devices.map(device => ({
            ...device,
            applicationId: app.id,
            applicationName: app.name
          }));
          allDevices.push(...devicesWithAppInfo);
        } catch (error) {
          console.warn(`Could not fetch devices for application ${app.id}:`, error.message);
        }
      }
      
      return allDevices;
    } catch (error) {
      console.error(`Error fetching all devices from ${this.name}:`, error.message);
      throw error;
    }
  }

  async getDevice(devEUI) {
    try {
      await this.initializeServices();
      
      console.log(`Getting device ${devEUI} from ${this.name} (mock implementation)`);
      
      return {
        devEUI: devEUI,
        name: `Device ${devEUI}`,
        description: 'Test device',
        applicationId: '1'
      };
    } catch (error) {
      console.error(`Error fetching device ${devEUI} from ${this.name}:`, error.message);
      throw error;
    }
  }

  async createDevice(deviceData) {
    try {
      await this.initializeServices();
      
      console.log(`Creating device in ${this.name} (mock implementation):`, deviceData.name);
      
      return {
        success: true,
        device: deviceData
      };
    } catch (error) {
      console.error(`Error creating device in ${this.name}:`, error.message);
      throw error;
    }
  }

  async updateDevice(deviceData) {
    try {
      await this.initializeServices();
      
      console.log(`Updating device ${deviceData.devEUI} in ${this.name} (mock implementation)`);
      
      return {
        success: true,
        device: deviceData
      };
    } catch (error) {
      console.error(`Error updating device ${deviceData.devEUI} in ${this.name}:`, error.message);
      throw error;
    }
  }

  async deleteDevice(devEUI) {
    try {
      await this.initializeServices();
      
      console.log(`Deleting device ${devEUI} from ${this.name} (mock implementation)`);
      
      return { success: true };
    } catch (error) {
      console.error(`Error deleting device ${devEUI} from ${this.name}:`, error.message);
      throw error;
    }
  }

  async getDeviceKeys(devEUI) {
    try {
      await this.initializeServices();
      
      console.log(`Getting device keys for ${devEUI} from ${this.name} (mock implementation)`);
      
      // Return specific keys for our mock devices
      const mockKeys = {
        '70B3D57ED0049D2A': {
          devEUI: devEUI,
          appEUI: '0000000000000001', 
          appKey: '11111111111111111111111111111111'
        },
        '70B3D57ED0049D2B': {
          devEUI: devEUI,
          appEUI: '0000000000000001',
          appKey: '22222222222222222222222222222222'
        },
        '70B3D57ED0049D2C': {
          devEUI: devEUI,
          appEUI: '0000000000000001',
          appKey: '33333333333333333333333333333333'
        }
      };
      
      return mockKeys[devEUI] || {
        devEUI: devEUI,
        appEUI: '0000000000000000',
        appKey: '00000000000000000000000000000000'
      };
    } catch (error) {
      console.error(`Error fetching keys for device ${devEUI} from ${this.name}:`, error.message);
      throw error;
    }
  }

  async createDeviceKeys(devEUI, keysData) {
    try {
      await this.initializeServices();
      
      console.log(`Creating device keys for ${devEUI} in ${this.name} (mock implementation)`);
      
      return { success: true };
    } catch (error) {
      console.error(`Error creating keys for device ${devEUI} in ${this.name}:`, error.message);
      throw error;
    }
  }

  async updateDeviceKeys(devEUI, keysData) {
    try {
      await this.initializeServices();
      
      console.log(`Updating device keys for ${devEUI} in ${this.name} (mock implementation)`);
      
      return { success: true };
    } catch (error) {
      console.error(`Error updating keys for device ${devEUI} in ${this.name}:`, error.message);
      throw error;
    }
  }

  async getDeviceActivation(devEUI) {
    try {
      await this.initializeServices();
      
      console.log(`Getting device activation for ${devEUI} from ${this.name} (mock implementation)`);
      
      // Return specific activation data for our mock devices
      const mockActivations = {
        '70B3D57ED0049D2A': {
          devEUI: devEUI,
          devAddr: '26011001',
          nwkSKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          appSKey: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          fCntUp: 42,
          fCntDown: 12
        },
        '70B3D57ED0049D2B': {
          devEUI: devEUI,
          devAddr: '26011002', 
          nwkSKey: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
          appSKey: 'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
          fCntUp: 156,
          fCntDown: 78
        },
        '70B3D57ED0049D2C': {
          devEUI: devEUI,
          devAddr: '26011003',
          nwkSKey: 'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE', 
          appSKey: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
          fCntUp: 234,
          fCntDown: 99
        }
      };
      
      return mockActivations[devEUI] || {
        devEUI: devEUI,
        devAddr: '00000000',
        nwkSKey: '00000000000000000000000000000000',
        appSKey: '00000000000000000000000000000000',
        fCntUp: 0,
        fCntDown: 0
      };
    } catch (error) {
      console.error(`Error fetching activation for device ${devEUI} from ${this.name}:`, error.message);
      throw error;
    }
  }

  async activateDevice(devEUI, activationData) {
    try {
      await this.initializeServices();
      
      console.log(`Activating device ${devEUI} in ${this.name} (mock implementation)`);
      
      return { success: true };
    } catch (error) {
      console.error(`Error activating device ${devEUI} in ${this.name}:`, error.message);
      throw error;
    }
  }

  async getDeviceProfiles() {
    try {
      await this.initializeServices();
      
      console.log(`Getting device profiles from ${this.name} (mock implementation)`);
      
      return [
        {
          id: '1',
          name: 'Default Profile',
          region: 'US915',
          macVersion: '1.0.3',
          supportsOtaa: true
        }
      ];
    } catch (error) {
      console.error(`Error fetching device profiles from ${this.name}:`, error.message);
      throw error;
    }
  }

  async getDeviceProfile(profileId) {
    try {
      await this.initializeServices();
      
      console.log(`Getting device profile ${profileId} from ${this.name} (mock implementation)`);
      
      return {
        id: profileId,
        name: 'Test Profile',
        region: 'US915',
        macVersion: '1.0.3',
        supportsOtaa: true
      };
    } catch (error) {
      console.error(`Error fetching device profile ${profileId} from ${this.name}:`, error.message);
      throw error;
    }
  }

  async createDeviceProfile(profileData) {
    try {
      await this.initializeServices();
      
      console.log(`Creating device profile in ${this.name} (mock implementation):`, profileData.name);
      
      return {
        id: Math.random().toString(36).substr(2, 9),
        ...profileData
      };
    } catch (error) {
      console.error(`Error creating device profile in ${this.name}:`, error.message);
      throw error;
    }
  }

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

      if (result.device && result.device.deviceProfileId) {
        try {
          result.deviceProfile = await this.getDeviceProfile(result.device.deviceProfileId);
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
}

module.exports = LNSClient; 