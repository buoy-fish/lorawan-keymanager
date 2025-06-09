# LoRaWAN keyManager Service

A web-based service for migrating LoRaWAN devices between ChirpStack instances, specifically designed for migrating from standard ChirpStack to helium-chirpstack-community implementations.

## 🚀 Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Service**
   ```bash
   npm start
   # or
   node server.js
   ```

3. **Open Web Interface**
   ```
   http://localhost:3000
   ```

4. **Run Setup Wizard**
   - Click the "Setup" button in the navigation bar
   - Follow the 4-step configuration process

## 📋 Prerequisites

- Node.js (v14 or higher)
- Access to both source and target ChirpStack instances
- API keys for both LNS systems
- Network connectivity to both systems

## ⚙️ Configuration

### Setup Wizard (Recommended)

The built-in setup wizard will guide you through configuration:

1. **Welcome** - Overview of the process
2. **Source LNS** - Configure your existing ChirpStack
3. **Target LNS** - Configure your new ChirpStack (e.g., helium-chirpstack-community)
4. **Test & Complete** - Verify connections and save configuration

### Manual Configuration

If you prefer manual setup, configure these environment variables or database settings:

- **Source LNS URL** - Your existing ChirpStack gRPC endpoint
- **Target LNS URL** - Your new ChirpStack endpoint  
- **API Keys** - Authentication tokens for both systems
- **Tenant IDs** - UUID identifiers for your tenants

## 🔧 Critical Technical Details

### URL Formatting ⚠️

**This is crucial for proper operation:**

- **gRPC API URLs**: Use HTTP format without protocol prefix
  - ✅ Correct: `20.121.50.53:8080`
  - ❌ Wrong: `https://old.console.buoy.fish:443`
  - ❌ Wrong: `http://20.121.50.53:8080`

- **Web UI URLs**: Use full HTTPS URLs for browser access
  - ✅ Correct: `https://console.buoy.fish`

### LoRaWAN AppKey Storage 🔑

**Important**: AppKey storage varies by LoRaWAN version:

- **LoRaWAN 1.0.x** (most common): AppKey stored in `nwkKey` field
- **LoRaWAN 1.1.x**: AppKey stored in `appKey` field

The keyManager automatically handles both formats, but this is important to understand when troubleshooting or making manual API calls.

### helium-chirpstack-community Specifics

When working with helium-chirpstack-community implementations:

- Device keys prefer `POST` over `PUT` operations
- Small timing delays may be required between device creation and key setting
- Some standard ChirpStack endpoints may have different behaviors

## 🎯 Usage

### Bulk Migration

1. Navigate to the web interface
2. Select source application from dropdown
3. Choose target application and device profile
4. Review device list and select devices to migrate
5. Click "Migrate Selected Devices"
6. Monitor progress in real-time logs

### Single Device Migration

1. Go to the device details page
2. Click "Migrate Device"
3. Select target application and device profile
4. Review and confirm migration

### Migration Results

The service will automatically:
- ✅ Create/update device metadata
- ✅ Set AppKeys using correct LoRaWAN version fields
- ✅ Provide detailed migration notes
- ⚠️ Flag devices requiring manual intervention

## 📊 Features

- **Web-based interface** - No command-line knowledge required
- **Bulk migration** - Migrate entire applications at once
- **Real-time progress** - Live updates during migration
- **Automatic AppKey handling** - Correctly maps keys for different LoRaWAN versions
- **Detailed logging** - Track every step of the migration process
- **Error recovery** - Graceful handling of partial failures
- **Migration history** - Track all previous migrations

## 🔍 API Endpoints

- `GET /api/health` - Service health check
- `GET /api/applications` - List available applications
- `GET /api/devices` - List all devices
- `POST /api/devices/migrate/batch` - Bulk device migration
- `POST /api/applications/:id/migrate` - Migrate entire application
- `GET /api/migrations` - Migration history

## 🛠️ Troubleshooting

### Common Issues

**Connection Failed**
- Verify URL formatting (no `http://` prefix for gRPC)
- Check API keys are valid and have sufficient permissions
- Ensure network connectivity to both LNS instances

**AppKey Not Set**
- Most devices use LoRaWAN 1.0.x (AppKey in `nwkKey` field)
- Check migration notes for manual steps
- Verify device exists in target LNS before key setting

**404 Errors on Device Keys**
- helium-chirpstack-community may have timing requirements
- Service automatically retries with different methods
- Manual key setting via web UI may be required

### Debug Mode

Enable verbose logging by setting:
```javascript
process.env.DEBUG = 'true'
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Browser   │────│  keyManager      │────│  Target LNS     │
│                 │    │  Service         │    │ (helium-chirp-  │
└─────────────────┘    │                  │    │  stack-         │
                       │  ┌─────────────┐ │    │  community)     │
┌─────────────────┐    │  │  SQLite DB  │ │    └─────────────────┘
│   Source LNS    │────│  │             │ │
│ (ChirpStack)    │    │  └─────────────┘ │
└─────────────────┘    └──────────────────┘
```

## 📈 Migration Flow

1. **Discovery** - Fetch devices from source LNS
2. **Validation** - Check device data and requirements  
3. **Creation** - Create/update devices in target LNS
4. **Key Transfer** - Set AppKeys using correct LoRaWAN fields
5. **Verification** - Confirm successful migration
6. **Reporting** - Generate detailed migration notes

## 🔒 Security Notes

- API keys are stored securely in local SQLite database
- No sensitive data is transmitted to external services
- All connections use proper authentication headers
- Database is local to your server instance

## 🤝 Contributing

This service was developed to solve real-world LoRaWAN migration challenges. Key learnings:

- **URL formatting matters** - gRPC vs web endpoints require different formats
- **LoRaWAN version compatibility** - AppKey field mapping is critical
- **Implementation differences** - Each ChirpStack variant has quirks
- **User experience** - Migration should be simple despite technical complexity

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review server logs for detailed error information
3. Verify your configuration matches the technical requirements
4. Test connections using the built-in health checks

## 📄 License

[Add your license information here]

---

**Built with ❤️ for the LoRaWAN community** 