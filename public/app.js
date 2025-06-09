// Global state
let devices = [];
let filteredDevices = [];
const selectedDevices = new Set();
let migrationInProgress = false;

// Global variables
let currentStep = 1;
let sourceTestPassed = false;
let targetTestPassed = false;

// API base URL
const API_BASE = '/api';

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('LoRa Key Manager initialized');
    
    // Load initial data
    checkConnections();
    loadDevices();
    loadApplications();
    loadDeviceProfiles();
    loadMigrationHistory();
    
    // Check if setup is needed
    checkSetupStatus();
});

// Function to open setup modal manually
// eslint-disable-next-line no-unused-vars
function openSetupModal() {
    // Reset setup state
    currentStep = 1;
    sourceTestPassed = false;
    targetTestPassed = false;
    
    // Show the modal
    const setupModal = new bootstrap.Modal(document.getElementById('setupModal'));
    setupModal.show();
    
    // Reset to first step
    updateSetupSteps();
    updateSetupButtons();
}

// Update setup step indicators
function updateSetupSteps() {
    const steps = document.querySelectorAll('.setup-step');
    steps.forEach((step, index) => {
        const stepNumber = index + 1;
        step.classList.remove('active', 'completed');
        
        if (stepNumber < currentStep) {
            step.classList.add('completed');
        } else if (stepNumber === currentStep) {
            step.classList.add('active');
        }
    });
}

// Utility functions
function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alertContainer');
    const alertId = 'alert-' + Date.now();
    
    const alertHtml = `
        <div class="alert alert-${type} alert-dismissible fade show" id="${alertId}" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    alertContainer.insertAdjacentHTML('beforeend', alertHtml);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        const alert = document.getElementById(alertId);
        if (alert) {
            const bsAlert = new bootstrap.Alert(alert);
            bsAlert.close();
        }
    }, 5000);
}

function formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
}

function formatDevEUI(devEUI) {
    if (!devEUI) return '';
    return devEUI.toUpperCase().replace(/(.{2})/g, '$1:').slice(0, -1);
}

function isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}

// API functions
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`API call failed: ${endpoint}`, error);
        throw error;
    }
}

// Connection testing
async function checkConnections() {
    try {
        const results = await apiCall('/connections/test');
        
        // Update old LNS status
        const oldStatus = document.getElementById('oldLNSStatus');
        const oldIndicator = oldStatus.querySelector('.status-indicator');
        if (results.oldLNS.status.success) {
            oldIndicator.className = 'status-indicator status-connected';
            oldStatus.innerHTML = `<span class="status-indicator status-connected"></span>${results.oldLNS.name} - Connected`;
        } else {
            oldIndicator.className = 'status-indicator status-disconnected';
            oldStatus.innerHTML = `<span class="status-indicator status-disconnected"></span>${results.oldLNS.name} - ${results.oldLNS.status.error}`;
        }
        
        // Update new LNS status
        const newStatus = document.getElementById('newLNSStatus');
        const newIndicator = newStatus.querySelector('.status-indicator');
        if (results.newLNS.status.success) {
            newIndicator.className = 'status-indicator status-connected';
            newStatus.innerHTML = `<span class="status-indicator status-connected"></span>${results.newLNS.name} - Connected`;
        } else {
            newIndicator.className = 'status-indicator status-disconnected';
            newStatus.innerHTML = `<span class="status-indicator status-disconnected"></span>${results.newLNS.name} - ${results.newLNS.status.error}`;
        }
        
        // Update navbar status
        const connectionStatus = document.getElementById('connectionStatus');
        const bothConnected = results.oldLNS.status.success && results.newLNS.status.success;
        connectionStatus.textContent = bothConnected ? 'All systems connected' : 'Connection issues detected';
        
    } catch (error) {
        console.error('Error checking connections:', error);
        showAlert('Failed to check LNS connections: ' + error.message, 'danger');
    }
}

// Device management
async function loadDevices() {
    try {
        devices = await apiCall('/devices');
        filteredDevices = [...devices]; // Initialize filtered devices
        renderDevices();
        updateDeviceCount();
    } catch (error) {
        console.error('Error loading devices:', error);
        showAlert('Failed to load devices: ' + error.message, 'danger');
    }
}

function renderDevices() {
    const deviceTableBody = document.getElementById('deviceTableBody');
    
    if (filteredDevices.length === 0) {
        if (devices.length === 0) {
            deviceTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted py-5">
                        <i class="bi bi-devices display-4"></i>
                        <br><br>No devices found. Click "Discover Devices" to sync from your old LNS.
                    </td>
                </tr>
            `;
        } else {
            deviceTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted py-3">
                        <i class="bi bi-search"></i> No devices match your search criteria.
                    </td>
                </tr>
            `;
        }
        return;
    }
    
    const deviceRows = filteredDevices.map(device => {
        const isSelected = selectedDevices.has(device.devEUI);
        return `
            <tr class="device-row ${isSelected ? 'table-primary' : ''}" data-deveui="${device.devEUI}">
                <td>
                    <input type="checkbox" class="form-check-input device-checkbox" 
                           ${isSelected ? 'checked' : ''} 
                           onchange="toggleDeviceSelection('${device.devEUI}')">
                </td>
                <td>
                    <strong>${device.name || 'Unnamed Device'}</strong>
                    ${device.description ? `<br><small class="text-muted">${device.description}</small>` : ''}
                </td>
                <td>
                    <code class="small">${formatDevEUI(device.devEUI)}</code>
                </td>
                <td>
                    <small>${device.applicationId ? device.applicationId.substring(0, 8) + '...' : 'N/A'}</small>
                </td>
                <td>
                    <small>${device.deviceProfileId ? device.deviceProfileId.substring(0, 8) + '...' : 'N/A'}</small>
                </td>
                <td>
                    <small>${formatDate(device.updated_at)}</small>
                </td>
                <td>
                    <span class="badge bg-success">Ready</span>
                </td>
            </tr>
        `;
    }).join('');
    
    deviceTableBody.innerHTML = deviceRows;
    updateSelectAllCheckbox();
}

function toggleDeviceSelection(devEUI) {
    if (migrationInProgress) return;
    
    if (selectedDevices.has(devEUI)) {
        selectedDevices.delete(devEUI);
    } else {
        selectedDevices.add(devEUI);
    }
    
    renderDevices();
    updateMigrateButton();
}

function selectAllDevices() {
    if (migrationInProgress) return;
    
    filteredDevices.forEach(device => selectedDevices.add(device.devEUI));
    renderDevices();
    updateMigrateButton();
}

function clearSelection() {
    if (migrationInProgress) return;
    
    selectedDevices.clear();
    renderDevices();
    updateMigrateButton();
}

function updateMigrateButton() {
    const migrateBtn = document.getElementById('migrateBtn');
    migrateBtn.disabled = selectedDevices.size === 0 || migrationInProgress;
    migrateBtn.textContent = `Migrate Selected (${selectedDevices.size})`;
}

function updateDeviceCount() {
    const deviceCount = document.getElementById('deviceCount');
    if (deviceCount) {
        if (devices.length === 0) {
            deviceCount.textContent = '0 devices';
        } else if (filteredDevices.length === devices.length) {
            deviceCount.textContent = `${devices.length} devices`;
        } else {
            deviceCount.textContent = `${filteredDevices.length} of ${devices.length} devices`;
        }
    }
}

// Search functionality
function filterDevices() {
    const searchTerm = document.getElementById('deviceSearch').value.toLowerCase().trim();
    
    if (!searchTerm) {
        filteredDevices = [...devices];
    } else {
        filteredDevices = devices.filter(device => {
            const name = (device.name || '').toLowerCase();
            const devEUI = (device.devEUI || '').toLowerCase();
            const description = (device.description || '').toLowerCase();
            
            return name.includes(searchTerm) || 
                   devEUI.includes(searchTerm) || 
                   description.includes(searchTerm);
        });
    }
    
    renderDevices();
    updateDeviceCount();
    updateMigrateButton();
}

// Update select all checkbox state
function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const deviceCheckboxes = document.querySelectorAll('.device-checkbox');
    
    if (deviceCheckboxes.length === 0) {
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.checked = false;
        return;
    }
    
    const checkedCount = document.querySelectorAll('.device-checkbox:checked').length;
    
    if (checkedCount === 0) {
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.checked = false;
    } else if (checkedCount === deviceCheckboxes.length) {
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.checked = true;
    } else {
        selectAllCheckbox.indeterminate = true;
        selectAllCheckbox.checked = false;
    }
}

// Toggle select all for visible devices
function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const visibleDevices = filteredDevices.map(d => d.devEUI);
    
    if (selectAllCheckbox.checked) {
        // Select all visible devices
        visibleDevices.forEach(devEUI => selectedDevices.add(devEUI));
    } else {
        // Deselect all visible devices
        visibleDevices.forEach(devEUI => selectedDevices.delete(devEUI));
    }
    
    renderDevices();
    updateMigrateButton();
}

// Device discovery
async function discoverDevices() {
    try {
        showAlert('Starting device discovery from old LNS...', 'info');
        
        const results = await apiCall('/devices/discover', {
            method: 'POST'
        });
        
        showAlert(`Discovery complete! Synced ${results.synced}/${results.total} devices.`, 'success');
        
        if (results.errors.length > 0) {
            console.warn('Discovery errors:', results.errors);
            showAlert(`${results.errors.length} devices had sync errors. Check console for details.`, 'warning');
        }
        
        // Reload devices
        await loadDevices();
        
    } catch (error) {
        console.error('Error during device discovery:', error);
        showAlert('Device discovery failed: ' + error.message, 'danger');
    }
}

// Application and profile loading
async function loadApplications() {
    try {
        const applications = await apiCall('/applications');
        const select = document.getElementById('targetApplication');
        const bulkSelect = document.getElementById('bulkTargetApplication');
        const sourceSelect = document.getElementById('sourceApplication');
        
        // Load target applications (new LNS)
        const targetOptions = '<option value="">Select target application...</option>' +
            (applications.newLNS.applications || []).map(app => 
                `<option value="${app.id}">${app.name} (${app.id})</option>`
            ).join('');
        
        select.innerHTML = targetOptions;
        if (bulkSelect) bulkSelect.innerHTML = targetOptions;
        
        // Load source applications (old LNS)
        const sourceOptions = '<option value="">Select source application...</option>' +
            (applications.oldLNS.applications || []).map(app => 
                `<option value="${app.id}">${app.name} (${app.id})</option>`
            ).join('');
        
        if (sourceSelect) sourceSelect.innerHTML = sourceOptions;
        
        if (applications.newLNS.error) {
            showAlert('Failed to load applications from new LNS: ' + applications.newLNS.error, 'warning');
        }
        
        if (applications.oldLNS.error) {
            showAlert('Failed to load applications from old LNS: ' + applications.oldLNS.error, 'warning');
        }
        
    } catch (error) {
        console.error('Error loading applications:', error);
        showAlert('Failed to load applications: ' + error.message, 'danger');
    }
}

async function loadDeviceProfiles() {
    try {
        const profiles = await apiCall('/device-profiles');
        const select = document.getElementById('targetDeviceProfile');
        const bulkSelect = document.getElementById('bulkTargetDeviceProfile');
        
        const options = '<option value="">Select target device profile...</option>' +
            (profiles.newLNS.profiles || []).map(profile => 
                `<option value="${profile.id}">${profile.name} (${profile.id})</option>`
            ).join('');
        
        select.innerHTML = options;
        if (bulkSelect) bulkSelect.innerHTML = options;
        
        if (profiles.newLNS.error) {
            showAlert('Failed to load device profiles from new LNS: ' + profiles.newLNS.error, 'warning');
        }
        
    } catch (error) {
        console.error('Error loading device profiles:', error);
        showAlert('Failed to load device profiles: ' + error.message, 'danger');
    }
}

// Migration
function getMigrationOptions() {
    return {
        targetApplicationId: document.getElementById('targetApplication').value,
        targetDeviceProfileId: document.getElementById('targetDeviceProfile').value,
        migrateDeviceProfile: document.getElementById('migrateDeviceProfile').checked,
        migrateDecoder: document.getElementById('migrateDecoder').checked,
        migrateSessionKeys: document.getElementById('migrateSessionKeys').checked,
        removeFromOldLNS: document.getElementById('removeFromOldLNS').checked,
        skipFcntCheck: document.getElementById('skipFcntCheck').checked
    };
}

async function migrateSelectedDevices() {
    if (selectedDevices.size === 0) {
        showAlert('Please select at least one device to migrate.', 'warning');
        return;
    }
    
    const options = getMigrationOptions();
    
    if (!options.targetApplicationId) {
        showAlert('Please select a target application.', 'warning');
        return;
    }
    
    // Confirm migration
    const confirmMessage = `Are you sure you want to migrate ${selectedDevices.size} device(s) to the new LNS?`;
    if (!confirm(confirmMessage)) {
        return;
    }
    
    migrationInProgress = true;
    updateMigrateButton();
    
    // Show progress panel
    const progressPanel = document.getElementById('migrationProgress');
    progressPanel.style.display = 'block';
    
    const progressBar = document.getElementById('progressBar');
    const migrationLog = document.getElementById('migrationLog');
    
    // Clear previous log
    migrationLog.innerHTML = '';
    
    function addLogEntry(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `text-${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        migrationLog.appendChild(logEntry);
        migrationLog.scrollTop = migrationLog.scrollHeight;
    }
    
    try {
        addLogEntry(`Starting migration of ${selectedDevices.size} devices...`);
        
        const devEUIArray = Array.from(selectedDevices);
        let completed = 0;
        
        // Migrate devices in batches
        const batchSize = 5;
        for (let i = 0; i < devEUIArray.length; i += batchSize) {
            const batch = devEUIArray.slice(i, i + batchSize);
            
            addLogEntry(`Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} devices)...`);
            
            const batchPromises = batch.map(async (devEUI) => {
                try {
                    await apiCall(`/devices/${devEUI}/migrate`, {
                        method: 'POST',
                        body: JSON.stringify(options)
                    });
                    
                    completed++;
                    const progress = Math.round((completed / devEUIArray.length) * 100);
                    progressBar.style.width = `${progress}%`;
                    progressBar.textContent = `${progress}%`;
                    
                    addLogEntry(`✓ Migrated device: ${devEUI}`, 'success');
                    return { devEUI, success: true };
                    
                } catch (error) {
                    completed++;
                    const progress = Math.round((completed / devEUIArray.length) * 100);
                    progressBar.style.width = `${progress}%`;
                    progressBar.textContent = `${progress}%`;
                    
                    addLogEntry(`✗ Failed to migrate ${devEUI}: ${error.message}`, 'danger');
                    return { devEUI, success: false, error: error.message };
                }
            });
            
            await Promise.all(batchPromises);
            
            // Small delay between batches
            if (i + batchSize < devEUIArray.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        addLogEntry('Migration completed!', 'success');
        showAlert('Migration completed successfully!', 'success');
        
        // Clear selection and reload data
        clearSelection();
        await loadDevices();
        await loadMigrationHistory();
        
    } catch (error) {
        console.error('Migration error:', error);
        addLogEntry(`Migration failed: ${error.message}`, 'danger');
        showAlert('Migration failed: ' + error.message, 'danger');
    } finally {
        migrationInProgress = false;
        updateMigrateButton();
    }
}

// Migration history
async function loadMigrationHistory() {
    try {
        const history = await apiCall('/migrations');
        const tableBody = document.getElementById('migrationHistoryTable');
        
        if (history.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No migration history</td></tr>';
            return;
        }
        
        const rows = history.slice(0, 10).map(record => {
            const statusBadge = {
                'completed': 'success',
                'failed': 'danger',
                'in_progress': 'warning',
                'pending': 'secondary'
            }[record.status] || 'secondary';
            
            return `
                <tr>
                    <td><code>${formatDevEUI(record.devEUI)}</code></td>
                    <td><span class="badge bg-${statusBadge}">${record.status}</span></td>
                    <td>${formatDate(record.started_at)}</td>
                    <td>${formatDate(record.completed_at)}</td>
                    <td>${record.error_message || '-'}</td>
                </tr>
            `;
        }).join('');
        
        tableBody.innerHTML = rows;
        
    } catch (error) {
        console.error('Error loading migration history:', error);
        showAlert('Failed to load migration history: ' + error.message, 'danger');
    }
}

// Statistics
// Bulk migration by application
let applicationDevices = [];

async function loadApplicationDevices() {
    const sourceApplicationId = document.getElementById('sourceApplication').value;
    const previewDiv = document.getElementById('applicationDevicesPreview');
    const countElement = document.getElementById('applicationDeviceCount');
    const detailsElement = document.getElementById('applicationDeviceDetails');
    const migrateBtn = document.getElementById('bulkMigrateBtn');
    
    if (!sourceApplicationId) {
        previewDiv.classList.add('d-none');
        migrateBtn.disabled = true;
        return;
    }
    
    try {
        showAlert('Loading devices for selected application...', 'info');
        
        const response = await apiCall(`/applications/${sourceApplicationId}/devices`);
        applicationDevices = response.devices || [];
        
        countElement.textContent = `${applicationDevices.length} devices found`;
        
        if (applicationDevices.length > 0) {
            const withAppKey = applicationDevices.filter(d => d.hasAppKey).length;
            const migrated = applicationDevices.filter(d => d.migrationHistory && d.migrationHistory.length > 0).length;
            
            detailsElement.innerHTML = `
                ${withAppKey} devices have AppKeys, 
                ${migrated} devices have previous migrations, 
                ${applicationDevices.length - migrated} devices ready for first migration
            `;
            
            previewDiv.classList.remove('d-none');
            updateBulkMigrateButton();
        } else {
            detailsElement.textContent = 'No devices found in this application.';
            previewDiv.classList.remove('d-none');
            migrateBtn.disabled = true;
        }
        
    } catch (error) {
        console.error('Error loading application devices:', error);
        showAlert('Failed to load application devices: ' + error.message, 'danger');
        previewDiv.classList.add('d-none');
        migrateBtn.disabled = true;
    }
}

function updateBulkMigrateButton() {
    const sourceApplicationId = document.getElementById('sourceApplication').value;
    const targetApplicationId = document.getElementById('bulkTargetApplication').value;
    const targetDeviceProfileId = document.getElementById('bulkTargetDeviceProfile').value;
    const migrateBtn = document.getElementById('bulkMigrateBtn');
    
    migrateBtn.disabled = !sourceApplicationId || !targetApplicationId || !targetDeviceProfileId || applicationDevices.length === 0;
}

async function migrateApplicationDevices() {
    const sourceApplicationId = document.getElementById('sourceApplication').value;
    const targetApplicationId = document.getElementById('bulkTargetApplication').value;
    const targetDeviceProfileId = document.getElementById('bulkTargetDeviceProfile').value;
    
    if (!sourceApplicationId || !targetApplicationId || !targetDeviceProfileId) {
        showAlert('Please select source application, target application, and target device profile.', 'warning');
        return;
    }
    
    // Confirm migration
    const confirmMessage = `Are you sure you want to migrate all ${applicationDevices.length} devices from the selected source application to the target application?`;
    if (!confirm(confirmMessage)) {
        return;
    }
    
    const migrateBtn = document.getElementById('bulkMigrateBtn');
    const originalText = migrateBtn.innerHTML;
    
    try {
        migrateBtn.disabled = true;
        migrateBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Migrating...';
        
        showAlert(`Starting bulk migration of ${applicationDevices.length} devices...`, 'info');
        
        const result = await apiCall(`/applications/${sourceApplicationId}/migrate`, {
            method: 'POST',
            body: JSON.stringify({
                targetApplicationId,
                targetDeviceProfileId,
                options: {
                    migrateDeviceProfile: true,
                    migrateDecoder: true,
                    migrateSessionKeys: false,
                    removeFromOldLNS: false,
                    skipFcntCheck: document.getElementById('bulkSkipFcntCheck').checked
                }
            })
        });
        
        if (result.success) {
            showAlert(
                `Bulk migration completed! ${result.successful} successful, ${result.failed} failed out of ${result.total} devices.`,
                result.failed > 0 ? 'warning' : 'success'
            );
            
            if (result.errors && result.errors.length > 0) {
                console.warn('Migration errors:', result.errors);
            }
            
            // Refresh the application devices view
            await loadApplicationDevices();
            
            // Refresh the main device list
            await loadDevices();
        } else {
            showAlert('Bulk migration failed: ' + (result.message || 'Unknown error'), 'danger');
        }
        
    } catch (error) {
        console.error('Error during bulk migration:', error);
        showAlert('Bulk migration failed: ' + error.message, 'danger');
    } finally {
        migrateBtn.disabled = false;
        migrateBtn.innerHTML = originalText;
        updateBulkMigrateButton();
    }
}

// Add event listeners for bulk migration form changes
document.addEventListener('DOMContentLoaded', function() {
    const bulkTargetApp = document.getElementById('bulkTargetApplication');
    const bulkTargetProfile = document.getElementById('bulkTargetDeviceProfile');
    
    if (bulkTargetApp) {
        bulkTargetApp.addEventListener('change', updateBulkMigrateButton);
    }
    if (bulkTargetProfile) {
        bulkTargetProfile.addEventListener('change', updateBulkMigrateButton);
    }
});

// Setup wizard variables and functions
async function checkSetupStatus() {
    try {
        const response = await fetch('/api/setup/status');
        const data = await response.json();
        
        if (!data.isConfigured) {
            // Show setup modal if not configured
            showSetupModal();
            return false;
        }
        return true;
    } catch (error) {
        console.error('Error checking setup status:', error);
        return true; // Assume configured on error
    }
}

// Setup Modal Functions
function showSetupModal() {
    const modal = new bootstrap.Modal(document.getElementById('setupModal'));
    modal.show();
}

function nextStep() {
    if (currentStep < 4) {
        // Validate current step
        if (!validateCurrentStep()) {
            return;
        }
        
        // Hide current step
        document.getElementById(`setupStep${currentStep}`).classList.add('d-none');
        document.querySelector(`.setup-step[data-step="${currentStep}"]`).classList.remove('active');
        document.querySelector(`.setup-step[data-step="${currentStep}"]`).classList.add('completed');
        
        // Show next step
        currentStep++;
        document.getElementById(`setupStep${currentStep}`).classList.remove('d-none');
        document.querySelector(`.setup-step[data-step="${currentStep}"]`).classList.add('active');
        
        updateSetupButtons();
    }
}

function previousStep() {
    if (currentStep > 1) {
        // Hide current step
        document.getElementById(`setupStep${currentStep}`).classList.add('d-none');
        document.querySelector(`.setup-step[data-step="${currentStep}"]`).classList.remove('active');
        
        // Show previous step
        currentStep--;
        document.getElementById(`setupStep${currentStep}`).classList.remove('d-none');
        document.querySelector(`.setup-step[data-step="${currentStep}"]`).classList.remove('completed');
        document.querySelector(`.setup-step[data-step="${currentStep}"]`).classList.add('active');
        
        updateSetupButtons();
    }
}

function updateSetupButtons() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const completeBtn = document.getElementById('completeBtn');
    
    // Show/hide previous button
    if (currentStep === 1) {
        prevBtn.style.display = 'none';
    } else {
        prevBtn.style.display = 'inline-block';
    }
    
    // Show/hide next/complete buttons
    if (currentStep === 4) {
        nextBtn.classList.add('d-none');
        completeBtn.classList.add('d-none');
    } else {
        nextBtn.classList.remove('d-none');
        completeBtn.classList.add('d-none');
        
        // Update next button text for different steps
        nextBtn.innerHTML = 'Next <i class="bi bi-arrow-right"></i>';
    }
}

function validateCurrentStep() {
    // Clear previous validation errors
    clearFieldErrors();
    
    switch (currentStep) {
        case 1:
            return true; // Welcome step, no validation needed
        case 2:
            return validateSourceForm();
        case 3:
            return validateTargetForm();
        case 4:
            return true; // Test & Complete step, handled by its own button
        default:
            return true;
    }
}

function clearFieldErrors() {
    // Remove all error highlights
    document.querySelectorAll('.form-control.is-invalid').forEach(field => {
        field.classList.remove('is-invalid');
    });
    document.querySelectorAll('.invalid-feedback').forEach(feedback => {
        feedback.remove();
    });
}

function highlightField(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.classList.add('is-invalid');
        
        // Add error message
        const feedback = document.createElement('div');
        feedback.className = 'invalid-feedback';
        feedback.textContent = message;
        field.parentNode.appendChild(feedback);
        
        // Focus the first invalid field
        if (document.querySelectorAll('.form-control.is-invalid').length === 1) {
            field.focus();
        }
    }
}

function showModalAlert(message, type = 'warning') {
    const alertContainer = document.querySelector('.modal-body .alert');
    if (alertContainer) {
        alertContainer.remove();
    }
    
    const modalBody = document.querySelector('.modal.show .modal-body');
    if (modalBody) {
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.style.zIndex = '9999';
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        modalBody.insertBefore(alert, modalBody.firstChild);
    }
}

function validateSourceForm() {
    let isValid = true;
    
    const hostname = document.getElementById('sourceHostname').value.trim();
    const apiKey = document.getElementById('sourceApiKey').value.trim();
    const name = document.getElementById('sourceName').value.trim();
    const tenantId = document.getElementById('sourceTenantId').value.trim();
    
    if (!hostname) {
        highlightField('sourceHostname', 'Hostname is required');
        isValid = false;
    }
    
    if (!apiKey) {
        highlightField('sourceApiKey', 'API Key is required');
        isValid = false;
    }
    
    if (!tenantId) {
        highlightField('sourceTenantId', 'Tenant ID is required');
        isValid = false;
    } else if (!isValidUUID(tenantId)) {
        highlightField('sourceTenantId', 'Tenant ID must be a valid UUID');
        isValid = false;
    }
    
    // If name is empty, we'll use a default, but it's not an error
    if (!name) {
        document.getElementById('sourceName').value = 'Old LNS - Origin';
    }
    
    if (!isValid) {
        showModalAlert('Please fill in all required source LNS fields.', 'warning');
    }
    
    return isValid;
}

function validateTargetForm() {
    let isValid = true;
    
    const hostname = document.getElementById('targetHostname').value.trim();
    const apiKey = document.getElementById('targetApiKey').value.trim();
    const name = document.getElementById('targetName').value.trim();
    const tenantId = document.getElementById('targetTenantId').value.trim();
    
    if (!hostname) {
        highlightField('targetHostname', 'Hostname is required');
        isValid = false;
    }
    
    if (!apiKey) {
        highlightField('targetApiKey', 'API Key is required');
        isValid = false;
    }
    
    if (!tenantId) {
        highlightField('targetTenantId', 'Tenant ID is required');
        isValid = false;
    } else if (!isValidUUID(tenantId)) {
        highlightField('targetTenantId', 'Tenant ID must be a valid UUID');
        isValid = false;
    }
    
    // If name is empty, we'll use a default, but it's not an error
    if (!name) {
        document.getElementById('targetName').value = 'New LNS - Destination';
    }
    
    if (!isValid) {
        showModalAlert('Please fill in all required target LNS fields.', 'warning');
    }
    
    return isValid;
}

// URL Building Functions
function updateSourceProtocol() {
    const useSSL = document.getElementById('sourceUseSSL').checked;
    const protocolInput = document.getElementById('sourceProtocol');
    const portInput = document.getElementById('sourcePort');
    const useDefaultPort = document.getElementById('sourceUseDefaultPort');
    
    if (useSSL) {
        protocolInput.value = 'https://';
        if (useDefaultPort.checked) {
            portInput.value = '443';
        }
    } else {
        protocolInput.value = 'http://';
        if (useDefaultPort.checked) {
            portInput.value = '8080';
        }
    }
    updateSourceUrlPreview();
}

function updateSourcePort() {
    const useDefaultPort = document.getElementById('sourceUseDefaultPort').checked;
    const portInput = document.getElementById('sourcePort');
    const useSSL = document.getElementById('sourceUseSSL').checked;
    
    if (useDefaultPort) {
        portInput.value = useSSL ? '443' : '8080';
        portInput.readOnly = true;
        portInput.style.background = '#e9ecef';
    } else {
        portInput.readOnly = false;
        portInput.style.background = 'white';
    }
    updateSourceUrlPreview();
}

function updateTargetProtocol() {
    const useSSL = document.getElementById('targetUseSSL').checked;
    const protocolInput = document.getElementById('targetProtocol');
    const portInput = document.getElementById('targetPort');
    const useDefaultPort = document.getElementById('targetUseDefaultPort');
    
    if (useSSL) {
        protocolInput.value = 'https://';
        if (useDefaultPort.checked) {
            portInput.value = '443';
        }
    } else {
        protocolInput.value = 'http://';
        if (useDefaultPort.checked) {
            portInput.value = '8080';
        }
    }
    updateTargetUrlPreview();
}

function updateTargetPort() {
    const useDefaultPort = document.getElementById('targetUseDefaultPort').checked;
    const portInput = document.getElementById('targetPort');
    const useSSL = document.getElementById('targetUseSSL').checked;
    
    if (useDefaultPort) {
        portInput.value = useSSL ? '443' : '8080';
        portInput.readOnly = true;
        portInput.style.background = '#e9ecef';
    } else {
        portInput.readOnly = false;
        portInput.style.background = 'white';
    }
    updateTargetUrlPreview();
}

function updateSourceUrlPreview() {
    const protocol = document.getElementById('sourceProtocol').value;
    const hostname = document.getElementById('sourceHostname').value;
    const port = document.getElementById('sourcePort').value;
    const preview = document.getElementById('sourceUrlPreview');
    
    if (hostname) {
        preview.textContent = `${protocol}${hostname}:${port}`;
    } else {
        preview.textContent = `${protocol}console.chirpstack.com:${port}`;
    }
}

function updateTargetUrlPreview() {
    const protocol = document.getElementById('targetProtocol').value;
    const hostname = document.getElementById('targetHostname').value;
    const port = document.getElementById('targetPort').value;
    const preview = document.getElementById('targetUrlPreview');
    
    if (hostname) {
        preview.textContent = `${protocol}${hostname}:${port}`;
    } else {
        preview.textContent = `${protocol}console.buoy.fish:${port}`;
    }
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const button = input.nextElementSibling;
    const icon = button.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'bi bi-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'bi bi-eye';
    }
}

// Connection Testing Functions (Removed - now handled by testAndComplete)





function buildSourceUrl() {
    const protocol = document.getElementById('sourceProtocol').value || 'https://';
    const hostname = document.getElementById('sourceHostname').value.trim();
    const port = document.getElementById('sourcePort').value || '443';
    
    if (!hostname) {
        throw new Error('Source hostname is required');
    }
    return `${protocol}${hostname}:${port}`;
}

function buildTargetUrl() {
    const protocol = document.getElementById('targetProtocol').value || 'https://';
    const hostname = document.getElementById('targetHostname').value.trim();
    const port = document.getElementById('targetPort').value || '443';
    
    if (!hostname) {
        throw new Error('Target hostname is required');
    }
    return `${protocol}${hostname}:${port}`;
}

async function testAndComplete() {
    const testBtn = document.getElementById('testCompleteBtn');
    
    testBtn.disabled = true;
    testBtn.innerHTML = '<i class="bi bi-arrow-clockwise fa-spin"></i> Testing Connections...';
    
    try {
        // Validate forms first
        if (!validateSourceForm() || !validateTargetForm()) {
            testBtn.disabled = false;
            testBtn.innerHTML = '<i class="bi bi-shield-check"></i> Test Connections & Complete Setup';
            return;
        }
        
        // Test source connection
        const sourceFinalSpinner = document.getElementById('sourceFinalSpinner');
        const sourceFinalIcon = document.getElementById('sourceFinalIcon');
        const sourceFinalText = document.getElementById('sourceFinalText');
        const sourceFinalResult = document.getElementById('sourceFinalResult');
        
        sourceFinalSpinner.classList.remove('d-none');
        sourceFinalIcon.className = 'bi bi-wifi text-muted me-2';
        sourceFinalText.textContent = 'Testing source connection...';
        sourceFinalResult.classList.add('d-none');
        
        const sourceData = {
            url: buildSourceUrl(),
            apiKey: document.getElementById('sourceApiKey').value.trim(),
            name: document.getElementById('sourceName').value.trim() || 'Source LNS',
            tenantId: document.getElementById('sourceTenantId').value.trim(),
            tenantName: document.getElementById('sourceTenantName').value.trim()
        };
        
        const sourceResponse = await fetch('/api/setup/test-source', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sourceData)
        });
        
        const sourceResult = await sourceResponse.json();
        sourceFinalSpinner.classList.add('d-none');
        
        if (sourceResult.success) {
            sourceFinalIcon.className = 'bi bi-check-circle text-success me-2';
            sourceFinalText.textContent = 'Source connection successful';
            sourceFinalResult.innerHTML = `<small class="text-success">${sourceResult.data?.message || 'Connection successful'}</small>`;
            sourceTestPassed = true;
        } else {
            sourceFinalIcon.className = 'bi bi-x-circle text-danger me-2';
            sourceFinalText.textContent = 'Source connection failed';
            sourceFinalResult.innerHTML = `<small class="text-danger">${sourceResult.error}</small>`;
            sourceTestPassed = false;
        }
        sourceFinalResult.classList.remove('d-none');
        
        // Test target connection
        const targetFinalSpinner = document.getElementById('targetFinalSpinner');
        const targetFinalIcon = document.getElementById('targetFinalIcon');
        const targetFinalText = document.getElementById('targetFinalText');
        const targetFinalResult = document.getElementById('targetFinalResult');
        
        targetFinalSpinner.classList.remove('d-none');
        targetFinalIcon.className = 'bi bi-wifi text-muted me-2';
        targetFinalText.textContent = 'Testing target connection...';
        targetFinalResult.classList.add('d-none');
        
        const targetData = {
            url: buildTargetUrl(),
            apiKey: document.getElementById('targetApiKey').value.trim(),
            name: document.getElementById('targetName').value.trim() || 'Target LNS',
            type: document.getElementById('targetType').value,
            tenantId: document.getElementById('targetTenantId').value.trim(),
            tenantName: document.getElementById('targetTenantName').value.trim()
        };
        
        const targetResponse = await fetch('/api/setup/test-target', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(targetData)
        });
        
        const targetResult = await targetResponse.json();
        targetFinalSpinner.classList.add('d-none');
        
        if (targetResult.success) {
            targetFinalIcon.className = 'bi bi-check-circle text-success me-2';
            targetFinalText.textContent = 'Target connection successful';
            targetFinalResult.innerHTML = `<small class="text-success">${targetResult.data?.message || 'Connection successful'}</small>`;
            targetTestPassed = true;
        } else {
            targetFinalIcon.className = 'bi bi-x-circle text-danger me-2';
            targetFinalText.textContent = 'Target connection failed';
            targetFinalResult.innerHTML = `<small class="text-danger">${targetResult.error}</small>`;
            targetTestPassed = false;
        }
        targetFinalResult.classList.remove('d-none');
        
        // If both tests passed, proceed to complete setup
        if (sourceTestPassed && targetTestPassed) {
            testBtn.innerHTML = '<i class="bi bi-arrow-clockwise fa-spin"></i> Saving Configuration...';
            await completeSetupWithTenants();
        } else {
            testBtn.innerHTML = '<i class="bi bi-shield-check"></i> Test Connections & Complete Setup';
            testBtn.disabled = false;
        }
        
    } catch (error) {
        console.error('Error testing connections:', error);
        showModalAlert('Failed to test connections: ' + error.message, 'danger');
        testBtn.innerHTML = '<i class="bi bi-shield-check"></i> Test Connections & Complete Setup';
        testBtn.disabled = false;
    }
}

async function completeSetupWithTenants() {
    try {
        const sourceLNS = {
            name: document.getElementById('sourceName').value.trim() || 'Old LNS - Origin',
            url: buildSourceUrl(),
            apiKey: document.getElementById('sourceApiKey').value.trim(),
            tenantId: document.getElementById('sourceTenantId').value.trim(),
            tenantName: document.getElementById('sourceTenantName').value.trim(),
            lorawanVersion: document.getElementById('sourceLorawanVersion').value,
            isHeliumChirpStack: false
        };
        
        const targetLNS = {
            name: document.getElementById('targetName').value.trim() || 'New LNS - Destination',
            url: buildTargetUrl(),
            apiKey: document.getElementById('targetApiKey').value.trim(),
            tenantId: document.getElementById('targetTenantId').value.trim(),
            tenantName: document.getElementById('targetTenantName').value.trim(),
            type: document.getElementById('targetType').value,
            isHeliumChirpStack: document.getElementById('targetType').value === 'helium'
        };
        
        const response = await fetch('/api/setup/complete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sourceLNS,
                targetLNS
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Show success UI
            document.getElementById('setupSuccess').classList.remove('d-none');
            document.getElementById('testCompleteBtn').classList.add('d-none');
        } else {
            throw new Error(result.error || 'Failed to save configuration');
        }
        
    } catch (error) {
        console.error('Error completing setup:', error);
        showModalAlert('Failed to complete setup: ' + error.message, 'danger');
        document.getElementById('testCompleteBtn').innerHTML = '<i class="bi bi-shield-check"></i> Test Connections & Complete Setup';
        document.getElementById('testCompleteBtn').disabled = false;
    }
}

async function completeSetup() {
    // Close modal and reload page
    bootstrap.Modal.getInstance(document.getElementById('setupModal')).hide();
    showAlert('Setup completed successfully! The page will reload to apply the new configuration.', 'success');
    setTimeout(() => {
        window.location.reload();
    }, 2000);
}


