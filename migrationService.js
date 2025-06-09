const ChirpStackClient = require('./chirpstackClient');
const config = require('./config');

class MigrationService {
  constructor(database, runtimeConfig = null) {
    this.db = database;
    const configToUse = runtimeConfig || config;
    this.oldLNS = new ChirpStackClient(configToUse.oldLNS);
    this.newLNS = new ChirpStackClient(configToUse.newLNS);
    this.config = configToUse;
  }

  // Test connections to both LNS systems
  async testConnections() {
    const [oldTest, newTest] = await Promise.allSettled([
      this.oldLNS.testConnection(),
      this.newLNS.testConnection()
    ]);

    return {
      oldLNS: {
        name: this.config.oldLNS.name,
        status: oldTest.status === 'fulfilled' ? oldTest.value : { success: false, error: oldTest.reason.message }
      },
      newLNS: {
        name: this.config.newLNS.name,
        status: newTest.status === 'fulfilled' ? newTest.value : { success: false, error: newTest.reason.message }
      }
    };
  }

  // Discover and sync all devices from old LNS to local database
  async discoverDevices() {
    try {
      console.log('Discovering devices from old LNS...');
      const devices = await this.oldLNS.getAllDevicesForAllApplications();
      
      console.log(`Found ${devices.length} devices. Syncing to local database...`);
      
      const results = {
        total: devices.length,
        synced: 0,
        errors: []
      };

      for (const device of devices) {
        try {
          // Get complete device information including keys
          const completeInfo = await this.oldLNS.getCompleteDeviceInfo(device.devEUI);
          
          // Save device to local database
          await this.db.saveDevice({
            devEUI: device.devEUI,
            appEUI: completeInfo.keys?.appEUI || device.appEUI,
            appKey: completeInfo.keys?.appKey || device.appKey,
            name: device.name,
            description: device.description,
            deviceProfileId: device.deviceProfileId,
            applicationId: device.applicationId
          });

          // Save session keys if available
          if (completeInfo.activation) {
            await this.db.saveSessionKeys({
              devEUI: device.devEUI,
              devAddr: completeInfo.activation.devAddr,
              nwkSKey: completeInfo.activation.nwkSKey,
              appSKey: completeInfo.activation.appSKey,
              fCntUp: completeInfo.activation.fCntUp || 0,
              fCntDown: completeInfo.activation.fCntDown || 0
            });
          }

          // Save device profile if available and not already saved
          if (completeInfo.deviceProfile) {
            const existingProfile = await this.db.getDeviceProfile(completeInfo.deviceProfile.id);
            if (!existingProfile) {
              await this.db.saveDeviceProfile({
                profileId: completeInfo.deviceProfile.id,
                name: completeInfo.deviceProfile.name,
                region: completeInfo.deviceProfile.region,
                macVersion: completeInfo.deviceProfile.macVersion,
                regParamsRevision: completeInfo.deviceProfile.regParamsRevision,
                adrAlgorithmId: completeInfo.deviceProfile.adrAlgorithmId,
                payloadCodec: completeInfo.deviceProfile.payloadCodec,
                payloadEncoderScript: completeInfo.deviceProfile.payloadEncoderScript,
                payloadDecoderScript: completeInfo.deviceProfile.payloadDecoderScript,
                flushQueueOnActivate: completeInfo.deviceProfile.flushQueueOnActivate,
                uplinkInterval: completeInfo.deviceProfile.uplinkInterval,
                deviceStatusReqInterval: completeInfo.deviceProfile.deviceStatusReqInterval,
                supportsOtaa: completeInfo.deviceProfile.supportsOtaa,
                supportsClassB: completeInfo.deviceProfile.supportsClassB,
                supportsClassC: completeInfo.deviceProfile.supportsClassC,
                classBTimeout: completeInfo.deviceProfile.classBTimeout,
                classCTimeout: completeInfo.deviceProfile.classCTimeout
              });
            }
          }

          results.synced++;
          console.log(`Synced device: ${device.devEUI} (${device.name})`);
          
        } catch (error) {
          console.error(`Error syncing device ${device.devEUI}:`, error.message);
          results.errors.push({
            devEUI: device.devEUI,
            error: error.message
          });
        }
      }

      console.log(`Discovery complete. Synced ${results.synced}/${results.total} devices.`);
      return results;
      
    } catch (error) {
      console.error('Error during device discovery:', error);
      throw error;
    }
  }

  // Migrate a single device with options
  async migrateDevice(devEUI, options = {}) {
    const startTime = Date.now();
          console.log(`📱 Migrating device: ${devEUI}`);
    
    try {
      // Get device from local database
      const localDevice = await this.db.getDevice(devEUI);
      if (!localDevice) {
        throw new Error(`Device ${devEUI} not found in local database`);
      }

      // Check if AppKey needs manual handling
      const hasRealAppKey = localDevice.appKey && localDevice.appKey !== '00000000000000000000000000000000';
      const needsManualAppKey = !hasRealAppKey;

      // Prepare target device data
      const targetDevice = {
        devEUI: devEUI,  // Use uppercase EUI to match ChirpStackClient expectations
        devEui: devEUI,  // Also include lowercase for compatibility
        name: localDevice.name,
        description: localDevice.description,
        applicationId: options.targetApplicationId,
        deviceProfileId: options.targetDeviceProfileId,
        skipFcntCheck: options.skipFcntCheck !== undefined ? options.skipFcntCheck : true, // Default to true for backward compatibility
        isDisabled: false
      };

      // Create or update device in target LNS
      let deviceExists = false;
      try {
        await this.newLNS.createDevice(targetDevice);
        console.log(`✅ Created device ${devEUI} in target LNS`);
      } catch (error) {
        if (error.message && (error.message.includes('duplicate') || error.message.includes('already exists') || error.response?.data?.message?.includes('duplicate'))) {
          deviceExists = true;
          try {
            await this.newLNS.updateDevice(devEUI, targetDevice);
            console.log(`✅ Updated existing device ${devEUI} in target LNS`);
          } catch (updateError) {
            console.log(`⚠️  Could not update existing device ${devEUI}: ${updateError.message}`);
            // Continue anyway, device might still be usable
          }
        } else {
          throw error;
        }
      }

      let migrationNotes = [];
      let requiresManualSteps = false;

      // Handle AppKey - set it automatically using correct LoRaWAN version field
      if (needsManualAppKey) {
        console.log(`Device has no AppKey in local database - manual AppKey setup required`);
        migrationNotes.push(`⚠️  MANUAL ACTION REQUIRED: Set AppKey in new LNS web interface`);
        migrationNotes.push(`1. Go to: ${this.newLNS.baseUrl}/tenants/${this.newLNS.tenantId}/devices/${devEUI}`);
        migrationNotes.push(`2. Navigate to Keys tab`);
        migrationNotes.push(`3. Copy AppKey from old LNS: ${this.oldLNS.baseUrl}/tenants/${this.oldLNS.tenantId}/devices/${devEUI}`);
        migrationNotes.push(`4. Paste AppKey into new LNS and save`);
        requiresManualSteps = true;
      } else {
        // Set AppKey automatically - use correct field for LoRaWAN version
        try {
          const keysData = {
            appEUI: localDevice.appEUI || '0000000000000000', // Use stored appEUI or default
            appKey: localDevice.appKey
          };
          
          // Brief delay to ensure device is fully committed before setting keys
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Try createDeviceKeys for all cases - helium-chirpstack-community might prefer this
          try {
            await this.newLNS.createDeviceKeys(devEUI, keysData);
            console.log(`🔑 Set AppKey for device ${devEUI}`);
          } catch (createError) {
            await this.newLNS.updateDeviceKeys(devEUI, keysData);
            console.log(`🔑 Updated AppKey for device ${devEUI}`);
          }
          
          migrationNotes.push(`✅ AppKey set automatically: ${localDevice.appKey}`);
          migrationNotes.push(`📋 Device ready for activation`);
        } catch (keyError) {
          console.error(`❌ Failed to set AppKey for device ${devEUI}:`, keyError.message);
          migrationNotes.push(`⚠️  MANUAL ACTION REQUIRED: Failed to set AppKey automatically`);
          migrationNotes.push(`1. Go to: ${this.newLNS.baseUrl}/tenants/${this.newLNS.tenantId}/devices/${devEUI}`);
          migrationNotes.push(`2. Navigate to Keys tab`);
          migrationNotes.push(`3. Set AppKey: ${localDevice.appKey}`);
          migrationNotes.push(`4. Set JoinEUI: ${localDevice.appEUI || '0000000000000000'}`);
          migrationNotes.push(`5. Error: ${keyError.message}`);
          requiresManualSteps = true;
        }
      }

      // Skip session key activation for helium-chirpstack (not supported)
      if (this.newLNS.isHeliumChirpstack) {
        console.log(`Skipping session key activation (not supported by helium-chirpstack-community)`);
        migrationNotes.push(`ℹ️  Session key activation skipped (not supported by helium-chirpstack)`);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Record migration in database
      const migrationData = {
        devEUI,
        sourceLNS: this.oldLNS.name,
        targetLNS: this.newLNS.name,
        status: requiresManualSteps ? 'requires_manual_steps' : 'completed',
        migration_options: JSON.stringify({
          targetApplicationId: options.targetApplicationId,
          targetDeviceProfileId: options.targetDeviceProfileId,
          notes: migrationNotes,
          duration
        })
      };

      const migrationRecord = await this.db.saveMigrationRecord(migrationData);
      if (requiresManualSteps) {
        await this.db.updateMigrationStatus(migrationRecord.id, 'requires_manual_steps');
      } else {
        await this.db.updateMigrationStatus(migrationRecord.id, 'completed', null, new Date().toISOString());
      }

      console.log(`✅ Migration completed: ${devEUI}`);
      
      return {
        success: true,
        devEUI,
        status: requiresManualSteps ? 'requires_manual_steps' : 'completed',
        duration,
        notes: migrationNotes,
        requiresManualSteps,
        migrationId: migrationRecord.id
      };

    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.error(`Migration failed for device ${devEUI}:`, error.message);
      
      // Record failed migration
      const migrationData = {
        devEUI,
        sourceLNS: this.oldLNS.name,
        targetLNS: this.newLNS.name,
        status: 'failed',
        migration_options: JSON.stringify({
          targetApplicationId: options.targetApplicationId,
          targetDeviceProfileId: options.targetDeviceProfileId,
          duration,
          error: error.message
        })
      };

      const migrationRecord = await this.db.saveMigrationRecord(migrationData);
      await this.db.updateMigrationStatus(migrationRecord.id, 'failed', error.message);

      throw new Error(`Migration failed for device ${devEUI}: ${error.message}`);
    }
  }

  // Migrate multiple devices in batches
  async migrateDevices(devEUIs, options = {}) {
    const batchSize = options.batchSize || config.migration.defaultBatchSize;
    const results = {
      total: devEUIs.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    console.log(`Starting batch migration of ${devEUIs.length} devices...`);

    for (let i = 0; i < devEUIs.length; i += batchSize) {
      const batch = devEUIs.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} devices)...`);

      const batchPromises = batch.map(async (devEUI) => {
        try {
          await this.migrateDevice(devEUI, options);
          results.successful++;
          return { devEUI, success: true };
        } catch (error) {
          results.failed++;
          results.errors.push({ devEUI, error: error.message });
          return { devEUI, success: false, error: error.message };
        }
      });

      await Promise.all(batchPromises);
      
      // Small delay between batches to avoid overwhelming the APIs
      if (i + batchSize < devEUIs.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`Batch migration complete. ${results.successful} successful, ${results.failed} failed.`);
    return results;
  }

  // Get migration status and history
  async getMigrationHistory(devEUI = null) {
    return this.db.getMigrationHistory(devEUI);
  }

  // Get available applications from both LNS systems
  async getAvailableApplications() {
    try {
      const [oldApps, newApps] = await Promise.allSettled([
        this.oldLNS.getApplications(),
        this.newLNS.getApplications()
      ]);

      return {
        oldLNS: {
          name: config.oldLNS.name,
          applications: oldApps.status === 'fulfilled' ? oldApps.value : [],
          error: oldApps.status === 'rejected' ? oldApps.reason.message : null
        },
        newLNS: {
          name: config.newLNS.name,
          applications: newApps.status === 'fulfilled' ? newApps.value : [],
          error: newApps.status === 'rejected' ? newApps.reason.message : null
        }
      };
    } catch (error) {
      console.error('Error fetching applications:', error);
      throw error;
    }
  }

  // Get available device profiles from both LNS systems
  async getAvailableDeviceProfiles() {
    try {
      const [oldProfiles, newProfiles] = await Promise.allSettled([
        this.oldLNS.getDeviceProfiles(),
        this.newLNS.getDeviceProfiles()
      ]);

      return {
        oldLNS: {
          name: config.oldLNS.name,
          profiles: oldProfiles.status === 'fulfilled' ? oldProfiles.value : [],
          error: oldProfiles.status === 'rejected' ? oldProfiles.reason.message : null
        },
        newLNS: {
          name: config.newLNS.name,
          profiles: newProfiles.status === 'fulfilled' ? newProfiles.value : [],
          error: newProfiles.status === 'rejected' ? newProfiles.reason.message : null
        }
      };
    } catch (error) {
      console.error('Error fetching device profiles:', error);
      throw error;
    }
  }

  // Get devices for a specific application from old LNS
  async getDevicesForApplication(applicationId) {
    try {
      console.log(`Fetching devices for application ${applicationId} from old LNS...`);
      const devices = await this.oldLNS.getDevices(applicationId);
      
      // Get full device details including local database info
      const enrichedDevices = await Promise.all(
        devices.map(async (device) => {
          try {
            const localDevice = await this.db.getDevice(device.devEui);
            return {
              ...device,
              hasLocalData: !!localDevice,
              hasAppKey: localDevice && localDevice.appKey && localDevice.appKey !== '00000000000000000000000000000000',
              migrationHistory: localDevice ? await this.db.getMigrationHistory(device.devEui) : []
            };
          } catch (error) {
            console.warn(`Could not enrich device ${device.devEui}:`, error.message);
            return {
              ...device,
              hasLocalData: false,
              hasAppKey: false,
              migrationHistory: []
            };
          }
        })
      );

      console.log(`Found ${enrichedDevices.length} devices in application ${applicationId}`);
      return {
        applicationId,
        devices: enrichedDevices,
        total: enrichedDevices.length
      };
    } catch (error) {
      console.error(`Error fetching devices for application ${applicationId}:`, error);
      throw error;
    }
  }

  // Migrate all devices from a source application to target application
  async migrateApplicationDevices(sourceApplicationId, targetApplicationId, targetDeviceProfileId, options = {}) {
    try {
      console.log(`Starting application migration from ${sourceApplicationId} to ${targetApplicationId}`);
      
      // Get all devices from the source application
      const applicationDevices = await this.getDevicesForApplication(sourceApplicationId);
      const devEUIs = applicationDevices.devices.map(device => device.devEui);
      
      if (devEUIs.length === 0) {
        return {
          success: true,
          message: `No devices found in source application ${sourceApplicationId}`,
          total: 0,
          successful: 0,
          failed: 0,
          results: []
        };
      }

      console.log(`Found ${devEUIs.length} devices to migrate from application ${sourceApplicationId}`);
      
      // Prepare migration options
      const migrationOptions = {
        targetApplicationId,
        targetDeviceProfileId,
        ...options,
        batchSize: options.batchSize || config.migration.defaultBatchSize
      };

      // Use existing batch migration functionality
      const results = await this.migrateDevices(devEUIs, migrationOptions);
      
      console.log(`Application migration completed. ${results.successful} successful, ${results.failed} failed.`);
      
      return {
        success: true,
        sourceApplicationId,
        targetApplicationId,
        targetDeviceProfileId,
        ...results,
        devices: applicationDevices.devices
      };
    } catch (error) {
      console.error(`Error during application migration:`, error);
      throw error;
    }
  }
}

module.exports = MigrationService; 