/**
 * ==========================================================================
 * WEB SERIAL TERMINAL - CORE SCRIPT (v2.0 Pro)
 * Full-featured browser serial terminal & telemetry plotter using Web Serial API.
 * ==========================================================================
 */

// Pre-computed lookup tables for high-throughput byte conversions (0x00 to 0xFF)
const HEX_LOOKUP = new Array(256);
const BINARY_LOOKUP = new Array(256);
const ASCII_LOOKUP = new Array(256);

for (let i = 0; i < 256; i++) {
    HEX_LOOKUP[i] = i.toString(16).padStart(2, '0').toUpperCase();
    BINARY_LOOKUP[i] = i.toString(2).padStart(8, '0');
    ASCII_LOOKUP[i] = (i >= 32 && i <= 126) ? String.fromCharCode(i) : '.';
}

// Global Multi-Device State Engine
const appState = {
    devices: [],
    activeDeviceId: 1,
    nextDeviceId: 1,
    pwaPrompt: null,
    highlightRules: [
        { pattern: 'ERROR|FAIL|FATAL|EXCEPTION', styleClass: 'rule-error', enabled: true },
        { pattern: 'WARN|WARNING|CAUTION', styleClass: 'rule-warn', enabled: true },
        { pattern: 'SUCCESS|OK|CONNECTED', styleClass: 'rule-success', enabled: true },
        { pattern: 'INFO|SYSTEM', styleClass: 'rule-info', enabled: true }
    ],
    customMacros: [
        { label: 'AT', cmd: 'AT' },
        { label: 'AT+GMR', cmd: 'AT+GMR' },
        { label: 'RESET', cmd: 'RESET' },
        { label: 'STATUS', cmd: 'STATUS' },
        { label: 'HELP', cmd: 'HELP' }
    ],
    dbPersistEnabled: true,
    savedDeviceDefaults: {}
};

/**
 * Factory function to create a new Device State instance.
 */
function createDeviceState(id, name) {
    const defaults = appState.savedDeviceDefaults || {};
    return {
        id,
        name,
        port: null,
        reader: null,
        writer: null,
        writeQueue: Promise.resolve(),
        isConnected: false,
        isReading: false,
        autoScroll: defaults.autoScroll !== undefined ? defaults.autoScroll : true,
        showTimestamps: defaults.showTimestamps !== undefined ? defaults.showTimestamps : true,
        isPaused: false,
        displayMode: defaults.displayMode || 'text',
        lineEnding: defaults.lineEnding || 'both',
        inputMode: 'line',
        baudRate: defaults.baudRate !== undefined ? defaults.baudRate : 9600,
        customBaud: defaults.customBaud || '',
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none',
        bufferLimit: defaults.bufferLimit !== undefined ? defaults.bufferLimit : 1000,
        resetProfile: defaults.resetProfile || 'esp32',
        rxBytes: 0,
        txBytes: 0,
        commandHistory: [],
        historyIndex: -1,
        dtrState: true,
        rtsState: true,
        logEntries: [],
        filteredEntriesCache: null,
        lastSearchQuery: '',
        partialLineBuffer: '',
        partialByteBuffer: [],
        plotterChannels: {},
        isFileTransferring: false,
        fileTransferCancel: false
    };
}

// Get active device state helper
function getActiveState() {
    return appState.devices.find(d => d.id === appState.activeDeviceId) || appState.devices[0];
}

// DOM Elements Reference Cache
const elements = {
    unsupportedBanner: document.getElementById('unsupported-banner'),
    unsupportedMessage: document.getElementById('unsupported-message'),
    deviceTabsBar: document.getElementById('device-tabs-bar'),
    tabsContainer: document.getElementById('tabs-container'),
    btnAddTab: document.getElementById('btn-add-tab'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    rxLed: document.getElementById('rx-led'),
    txLed: document.getElementById('tx-led'),
    btnPwaInstall: document.getElementById('btn-pwa-install'),
    btnConnect: document.getElementById('btn-connect'),
    btnDisconnect: document.getElementById('btn-disconnect'),
    baudRateSelect: document.getElementById('baud-rate'),
    customBaudContainer: document.getElementById('custom-baud-container'),
    customBaudInput: document.getElementById('custom-baud-input'),
    btnToggleSettings: document.getElementById('btn-toggle-settings'),
    settingsDrawer: document.getElementById('settings-drawer'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    displayModeSelect: document.getElementById('display-mode'),
    themeSelect: document.getElementById('theme-select'),
    dataBitsSelect: document.getElementById('data-bits'),
    stopBitsSelect: document.getElementById('stop-bits'),
    paritySelect: document.getElementById('parity'),
    flowControlSelect: document.getElementById('flow-control'),
    bufferLimitSelect: document.getElementById('buffer-limit'),
    resetProfileSelect: document.getElementById('reset-profile'),
    chkDbPersist: document.getElementById('chk-db-persist'),
    btnToggleDtr: document.getElementById('btn-toggle-dtr'),
    btnToggleRts: document.getElementById('btn-toggle-rts'),
    chkAutoscroll: document.getElementById('chk-autoscroll'),
    chkTimestamps: document.getElementById('chk-timestamps'),
    chkPause: document.getElementById('chk-pause'),
    btnRules: document.getElementById('btn-rules'),
    btnSendFile: document.getElementById('btn-send-file'),
    searchInput: document.getElementById('search-input'),
    searchCount: document.getElementById('search-count'),
    btnSearchClear: document.getElementById('btn-search-clear'),
    btnClear: document.getElementById('btn-clear'),
    btnCopy: document.getElementById('btn-copy'),
    btnExportMenu: document.getElementById('btn-export-menu'),
    exportDropdownMenu: document.getElementById('export-dropdown-menu'),
    btnExportTxt: document.getElementById('btn-export-txt'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    btnExportNdjson: document.getElementById('btn-export-ndjson'),
    btnClearDb: document.getElementById('btn-clear-db'),
    terminalScreen: document.getElementById('terminal-screen'),
    terminalOutput: document.getElementById('terminal-output'),
    virtualContent: document.getElementById('virtual-content'),
    terminalWelcome: document.getElementById('terminal-welcome'),
    btnWelcomeConnect: document.getElementById('btn-welcome-connect'),
    plotterContainer: document.getElementById('plotter-container'),
    plotterCanvas: document.getElementById('plotter-canvas'),
    plotterStats: document.getElementById('plotter-stats'),
    plotterLegend: document.getElementById('plotter-legend'),
    btnClearPlotter: document.getElementById('btn-clear-plotter'),
    macroButtons: document.getElementById('macro-buttons'),
    btnManageMacros: document.getElementById('btn-manage-macros'),
    btnAddMacro: document.getElementById('btn-add-macro'),
    terminalInput: document.getElementById('terminal-input'),
    inputPrompt: document.getElementById('input-prompt'),
    inputModeSelect: document.getElementById('input-mode'),
    lineEndingSelect: document.getElementById('line-ending'),
    btnSend: document.getElementById('btn-send'),
    valDevice: document.getElementById('val-device'),
    valBaud: document.getElementById('val-baud'),
    valRx: document.getElementById('val-rx'),
    valTx: document.getElementById('val-tx'),
    btnResetCounters: document.getElementById('btn-reset-counters'),
    toastContainer: document.getElementById('toast-container'),

    // Modals
    modalSendFile: document.getElementById('modal-send-file'),
    btnCloseSendFile: document.getElementById('btn-close-send-file'),
    fileInputField: document.getElementById('file-input-field'),
    fileChunkSize: document.getElementById('file-chunk-size'),
    filePacketDelay: document.getElementById('file-packet-delay'),
    fileProgressContainer: document.getElementById('file-progress-container'),
    fileProgressFill: document.getElementById('file-progress-fill'),
    fileProgressText: document.getElementById('file-progress-text'),
    btnCancelFile: document.getElementById('btn-cancel-file'),
    btnStartFileTransfer: document.getElementById('btn-start-file-transfer'),

    modalHighlightRules: document.getElementById('modal-highlight-rules'),
    btnCloseRules: document.getElementById('btn-close-rules'),
    rulesList: document.getElementById('rules-list'),
    rulePatternInput: document.getElementById('rule-pattern-input'),
    ruleStyleSelect: document.getElementById('rule-style-select'),
    btnAddRule: document.getElementById('btn-add-rule'),
    btnSaveRules: document.getElementById('btn-save-rules'),

    modalMacroManager: document.getElementById('modal-macro-manager'),
    btnCloseMacros: document.getElementById('btn-close-macros'),
    macroPresetSelect: document.getElementById('macro-preset-select'),
    macrosEditList: document.getElementById('macros-edit-list'),
    macroLabelInput: document.getElementById('macro-label-input'),
    macroCmdInput: document.getElementById('macro-cmd-input'),
    btnSaveNewMacro: document.getElementById('btn-save-new-macro'),
    btnCloseMacroModal: document.getElementById('btn-close-macro-modal')
};

// UTF-8 Text Decoder / Encoder instances
const textDecoder = new TextDecoder('utf-8');
const textEncoder = new TextEncoder();

/**
 * INDEXEDDB DATABASE HELPER (Persistence across page refreshes)
 */
const DB_NAME = 'WebSerialTerminalDB';
const DB_VERSION = 1;
const STORE_LOGS = 'logEntries';

let cachedDBPromise = null;

function openDatabase() {
    if (!cachedDBPromise) {
        cachedDBPromise = new Promise((resolve) => {
            if (!window.indexedDB) {
                resolve(null);
                return;
            }
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_LOGS)) {
                    const store = db.createObjectStore(STORE_LOGS, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('deviceId', 'deviceId', { unique: false });
                }
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => {
                cachedDBPromise = null;
                resolve(null);
            };
        });
    }
    return cachedDBPromise;
}

async function saveLogToDB(deviceId, entry) {
    if (!appState.dbPersistEnabled) return;
    try {
        const db = await openDatabase();
        if (!db) return;
        const tx = db.transaction(STORE_LOGS, 'readwrite');
        tx.objectStore(STORE_LOGS).add({ deviceId, ...entry });
    } catch (e) {}
}

async function pruneLogsInDB(deviceId, limit) {
    if (!appState.dbPersistEnabled || limit <= 0) return;
    try {
        const db = await openDatabase();
        if (!db) return;
        const tx = db.transaction(STORE_LOGS, 'readwrite');
        const store = tx.objectStore(STORE_LOGS);
        const index = store.index('deviceId');
        const request = index.getAllKeys(deviceId);
        request.onsuccess = () => {
            const keys = request.result;
            if (keys && keys.length > limit) {
                const keysToDelete = keys.slice(0, keys.length - limit);
                keysToDelete.forEach(k => store.delete(k));
            }
        };
    } catch (e) {}
}

async function loadLogsFromDB(deviceId) {
    try {
        const db = await openDatabase();
        if (!db) return [];
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_LOGS, 'readonly');
            const store = tx.objectStore(STORE_LOGS);
            const index = store.index('deviceId');
            const request = index.getAll(deviceId);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => resolve([]);
        });
    } catch (e) {
        return [];
    }
}

async function clearLogsFromDB(deviceId) {
    try {
        const db = await openDatabase();
        if (!db) return;
        const tx = db.transaction(STORE_LOGS, 'readwrite');
        const store = tx.objectStore(STORE_LOGS);
        const index = store.index('deviceId');
        const request = index.openCursor(IDBKeyRange.only(deviceId));
        request.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
    } catch (e) {}
}

/**
 * INITIALIZE APPLICATION
 */
async function initializeUI() {
    // Check Web Serial support & secure context
    if (!('serial' in navigator)) {
        elements.unsupportedBanner.classList.remove('hidden');
        if (elements.unsupportedMessage) {
            if (!window.isSecureContext) {
                elements.unsupportedMessage.innerHTML = "<strong>Secure Context Required:</strong> Web Serial API needs HTTPS or http://localhost. If you're using python -m http.server, restart it with --bind 127.0.0.1 and open http://localhost:PORT — not a raw IP or [::] link.";
            } else {
                elements.unsupportedMessage.innerHTML = "<strong>Web Serial API Not Supported:</strong> Your browser does not support Web Serial. Please use Chrome, Edge, or another Chromium-based browser.";
            }
        }
    }

    // Load persistent preferences and rules
    loadPreferences();

    // Create initial device tab
    addNewDeviceTab('Device 1');

    // Register PWA Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => {
            console.warn('Service worker registration failed:', err);
        });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        appState.pwaPrompt = e;
        elements.btnPwaInstall.classList.remove('hidden');
    });

    elements.btnPwaInstall.addEventListener('click', async () => {
        if (appState.pwaPrompt) {
            appState.pwaPrompt.prompt();
            const choice = await appState.pwaPrompt.userChoice;
            if (choice.outcome === 'accepted') {
                showToast('Web Serial Terminal installed successfully!', 'success');
            }
            appState.pwaPrompt = null;
            elements.btnPwaInstall.classList.add('hidden');
        }
    });

    setupEventListeners();
    renderMacroButtons();
    updateUIForActiveDevice();

    // Disconnect listener
    if ('serial' in navigator) {
        navigator.serial.addEventListener('disconnect', (event) => {
            const dev = appState.devices.find(d => d.port === event.target);
            if (dev) {
                handleUnexpectedDisconnectForDevice(dev);
            }
        });
    }
}

/**
 * MULTI-DEVICE TAB MANAGEMENT
 */
function addNewDeviceTab(customName) {
    const id = appState.nextDeviceId++;
    const name = customName || `Device ${id}`;
    const newDevice = createDeviceState(id, name);
    appState.devices.push(newDevice);

    renderTabsBar();
    switchDeviceTab(id);

    // Load persistent DB history for this device
    loadLogsFromDB(id).then(storedEntries => {
        if (storedEntries && storedEntries.length > 0) {
            newDevice.logEntries = storedEntries.map(e => ({ timestamp: e.timestamp, type: e.type, message: e.message }));
            if (appState.activeDeviceId === id) {
                scheduleVirtualRender();
            }
        }
    });
}

function switchDeviceTab(id) {
    appState.activeDeviceId = id;
    renderTabsBar();
    updateUIForActiveDevice();
}

async function closeDeviceTab(id, e) {
    if (e) e.stopPropagation();
    if (appState.devices.length <= 1) {
        showToast('At least one device tab must remain open.', 'info');
        return;
    }

    const dev = appState.devices.find(d => d.id === id);
    if (dev && dev.isConnected) {
        await disconnectSerialForDevice(dev);
    }

    appState.devices = appState.devices.filter(d => d.id !== id);
    if (appState.activeDeviceId === id) {
        appState.activeDeviceId = appState.devices[0].id;
    }
    renderTabsBar();
    updateUIForActiveDevice();
}

function renderTabsBar() {
    elements.tabsContainer.innerHTML = '';
    appState.devices.forEach(dev => {
        const tabElem = document.createElement('div');
        tabElem.className = `device-tab ${dev.id === appState.activeDeviceId ? 'active' : ''} ${dev.isConnected ? 'connected' : ''}`;
        tabElem.innerHTML = `
            <span class="tab-status-dot"></span>
            <span>${dev.name}</span>
            <span class="tab-close" title="Close Tab">&times;</span>
        `;
        tabElem.addEventListener('click', () => switchDeviceTab(dev.id));
        tabElem.querySelector('.tab-close').addEventListener('click', (e) => closeDeviceTab(dev.id, e));
        elements.tabsContainer.appendChild(tabElem);
    });
}

/**
 * Synchronize UI components with current active device state.
 */
function updateUIForActiveDevice() {
    const dev = getActiveState();

    // Connection Buttons
    if (dev.isConnected) {
        elements.btnConnect.classList.add('hidden');
        elements.btnDisconnect.classList.remove('hidden');
        updateStatus('Connected', 'connected');
    } else {
        elements.btnConnect.classList.remove('hidden');
        elements.btnDisconnect.classList.add('hidden');
        updateStatus('Disconnected', 'disconnected');
    }

    // Config dropdowns
    elements.baudRateSelect.value = dev.baudRate.toString();
    elements.dataBitsSelect.value = dev.dataBits.toString();
    elements.stopBitsSelect.value = dev.stopBits.toString();
    elements.paritySelect.value = dev.parity;
    elements.flowControlSelect.value = dev.flowControl;
    elements.displayModeSelect.value = dev.displayMode;
    elements.lineEndingSelect.value = dev.lineEnding;
    elements.inputModeSelect.value = dev.inputMode;
    elements.bufferLimitSelect.value = dev.bufferLimit.toString();
    elements.resetProfileSelect.value = dev.resetProfile;
    elements.chkAutoscroll.checked = dev.autoScroll;
    elements.chkTimestamps.checked = dev.showTimestamps;
    elements.chkPause.checked = dev.isPaused;

    elements.btnToggleDtr.classList.toggle('active', dev.dtrState);
    elements.btnToggleDtr.textContent = `DTR: ${dev.dtrState ? 'ON' : 'OFF'}`;
    elements.btnToggleRts.classList.toggle('active', dev.rtsState);
    elements.btnToggleRts.textContent = `RTS: ${dev.rtsState ? 'ON' : 'OFF'}`;

    // Display views (Terminal vs Live Plotter)
    if (dev.displayMode === 'plotter') {
        elements.terminalScreen.classList.add('hidden');
        elements.plotterContainer.classList.remove('hidden');
        renderPlotterCanvas();
    } else {
        elements.terminalScreen.classList.remove('hidden');
        elements.plotterContainer.classList.add('hidden');
        scheduleVirtualRender();
    }

    updateFooterStats();
}

/**
 * CONTROL SIGNALS (DTR & RTS) TOGGLE
 */
async function toggleDTR() {
    const dev = getActiveState();
    dev.dtrState = !dev.dtrState;
    elements.btnToggleDtr.classList.toggle('active', dev.dtrState);
    elements.btnToggleDtr.textContent = `DTR: ${dev.dtrState ? 'ON' : 'OFF'}`;
    savePreferences();

    if (dev.isConnected && dev.port) {
        try {
            await dev.port.setSignals({ dataTerminalReady: dev.dtrState });
            showToast(`DTR signal set to ${dev.dtrState ? 'HIGH' : 'LOW'}`, 'info');
        } catch (err) {
            showToast('Failed to set DTR signal: ' + err.message, 'error');
        }
    }
}

async function toggleRTS() {
    const dev = getActiveState();
    dev.rtsState = !dev.rtsState;
    elements.btnToggleRts.classList.toggle('active', dev.rtsState);
    elements.btnToggleRts.textContent = `RTS: ${dev.rtsState ? 'ON' : 'OFF'}`;
    savePreferences();

    if (dev.isConnected && dev.port) {
        try {
            await dev.port.setSignals({ requestToSend: dev.rtsState });
            showToast(`RTS signal set to ${dev.rtsState ? 'HIGH' : 'LOW'}`, 'info');
        } catch (err) {
            showToast('Failed to set RTS signal: ' + err.message, 'error');
        }
    }
}

/**
 * SET UP DOM EVENT LISTENERS
 */
function setupEventListeners() {
    if (elements.btnWelcomeConnect) {
        elements.btnWelcomeConnect.addEventListener('click', () => connectSerial());
    }

    elements.btnAddTab.addEventListener('click', () => addNewDeviceTab());
    elements.btnConnect.addEventListener('click', () => connectSerial());
    elements.btnDisconnect.addEventListener('click', () => disconnectSerial());
    elements.baudRateSelect.addEventListener('change', handleBaudRateChange);

    elements.btnToggleSettings.addEventListener('click', () => elements.settingsDrawer.classList.toggle('hidden'));
    elements.btnCloseSettings.addEventListener('click', () => elements.settingsDrawer.classList.add('hidden'));

    elements.btnToggleDtr.addEventListener('click', toggleDTR);
    elements.btnToggleRts.addEventListener('click', toggleRTS);

    elements.dataBitsSelect.addEventListener('change', (e) => { getActiveState().dataBits = parseInt(e.target.value, 10); savePreferences(); });
    elements.stopBitsSelect.addEventListener('change', (e) => { getActiveState().stopBits = parseInt(e.target.value, 10); savePreferences(); });
    elements.paritySelect.addEventListener('change', (e) => { getActiveState().parity = e.target.value; savePreferences(); });
    elements.flowControlSelect.addEventListener('change', (e) => { getActiveState().flowControl = e.target.value; savePreferences(); });

    elements.displayModeSelect.addEventListener('change', (e) => {
        const dev = getActiveState();
        dev.displayMode = e.target.value;
        dev.partialLineBuffer = '';
        dev.partialByteBuffer = [];
        updateUIForActiveDevice();
        savePreferences();
    });

    elements.themeSelect.addEventListener('change', (e) => {
        document.body.className = e.target.value;
        savePreferences();
    });

    elements.lineEndingSelect.addEventListener('change', (e) => {
        getActiveState().lineEnding = e.target.value;
        savePreferences();
    });

    elements.inputModeSelect.addEventListener('change', (e) => {
        const dev = getActiveState();
        dev.inputMode = e.target.value;
        if (dev.inputMode === 'raw') {
            elements.inputPrompt.textContent = '[RAW]>';
            elements.terminalInput.placeholder = 'Raw Mode: Press keys directly to transmit...';
        } else {
            elements.inputPrompt.textContent = '>';
            elements.terminalInput.placeholder = 'Type command... (Enter: Send, Ctrl+C: Interrupt, Ctrl+L: Clear)';
        }
        savePreferences();
    });

    elements.bufferLimitSelect.addEventListener('change', (e) => {
        const dev = getActiveState();
        dev.bufferLimit = parseInt(e.target.value, 10);
        enforceBufferLimit();
        scheduleVirtualRender();
        savePreferences();
    });

    elements.resetProfileSelect.addEventListener('change', (e) => {
        getActiveState().resetProfile = e.target.value;
        savePreferences();
    });

    elements.chkDbPersist.addEventListener('change', (e) => {
        appState.dbPersistEnabled = e.target.checked;
        savePreferences();
    });

    elements.chkAutoscroll.addEventListener('change', () => {
        getActiveState().autoScroll = elements.chkAutoscroll.checked;
        savePreferences();
    });

    elements.chkTimestamps.addEventListener('change', () => {
        getActiveState().showTimestamps = elements.chkTimestamps.checked;
        scheduleVirtualRender();
        savePreferences();
    });

    elements.chkPause.addEventListener('change', (e) => {
        getActiveState().isPaused = e.target.checked;
    });

    elements.btnClear.addEventListener('click', clearTerminal);
    elements.btnCopy.addEventListener('click', copyLog);

    // Export Dropdown
    elements.btnExportMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.exportDropdownMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => elements.exportDropdownMenu.classList.add('hidden'));

    elements.btnExportTxt.addEventListener('click', () => exportLog('txt'));
    elements.btnExportCsv.addEventListener('click', () => exportLog('csv'));
    elements.btnExportNdjson.addEventListener('click', () => exportLog('ndjson'));
    elements.btnClearDb.addEventListener('click', clearDatabaseHistory);

    // Search Box
    elements.searchInput.addEventListener('input', handleSearch);
    elements.btnSearchClear.addEventListener('click', clearSearch);

    // Terminal Input
    elements.btnSend.addEventListener('click', sendTerminalInput);
    elements.terminalInput.addEventListener('keydown', handleInputKeydown);

    if (elements.terminalScreen) {
        elements.terminalScreen.addEventListener('scroll', () => scheduleVirtualRender(false));
        elements.terminalScreen.addEventListener('click', () => elements.terminalInput.focus());
    }

    // Telemetry Plotter
    elements.btnClearPlotter.addEventListener('click', clearPlotterData);

    // Macros
    elements.macroButtons.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-macro')) {
            const cmd = e.target.getAttribute('data-cmd');
            writeSerialData(cmd);
        }
    });

    elements.btnAddMacro.addEventListener('click', () => openMacroModal());
    elements.btnManageMacros.addEventListener('click', () => openMacroModal());

    // Tools & Modals
    elements.btnRules.addEventListener('click', openRulesModal);
    elements.btnCloseRules.addEventListener('click', () => elements.modalHighlightRules.classList.add('hidden'));
    elements.btnSaveRules.addEventListener('click', () => elements.modalHighlightRules.classList.add('hidden'));
    elements.btnAddRule.addEventListener('click', addNewHighlightRule);

    elements.btnSendFile.addEventListener('click', () => elements.modalSendFile.classList.remove('hidden'));
    elements.btnCloseSendFile.addEventListener('click', () => elements.modalSendFile.classList.add('hidden'));
    elements.btnCancelFile.addEventListener('click', cancelFileTransfer);
    elements.btnStartFileTransfer.addEventListener('click', startFileTransfer);

    elements.btnCloseMacros.addEventListener('click', () => elements.modalMacroManager.classList.add('hidden'));
    elements.btnCloseMacroModal.addEventListener('click', () => elements.modalMacroManager.classList.add('hidden'));
    elements.macroPresetSelect.addEventListener('change', loadMacroPresetProfile);
    elements.btnSaveNewMacro.addEventListener('click', addNewMacroFromModal);

    document.addEventListener('keydown', handleGlobalShortcuts);
}

/**
 * BAUD RATE MANAGEMENT
 */
function handleBaudRateChange() {
    const dev = getActiveState();
    if (elements.baudRateSelect.value === 'custom') {
        elements.customBaudContainer.classList.remove('hidden');
        elements.customBaudInput.focus();
    } else {
        elements.customBaudContainer.classList.add('hidden');
    }
    dev.baudRate = getSelectedBaudRate();
    savePreferences();
    updateFooterStats();
}

function getSelectedBaudRate() {
    if (elements.baudRateSelect.value === 'custom') {
        const val = parseInt(elements.customBaudInput.value, 10);
        return isNaN(val) || val <= 0 ? 9600 : val;
    }
    return parseInt(elements.baudRateSelect.value, 10);
}

/**
 * SERIAL CONNECTION LOGIC (Web Serial API)
 */
async function connectSerial() {
    const dev = getActiveState();
    if (!('serial' in navigator)) {
        showToast('Web Serial API is not supported in your browser.', 'error');
        return;
    }

    try {
        updateStatus('Connecting...', 'connecting');
        dev.port = await navigator.serial.requestPort();

        const baudRate = getSelectedBaudRate();
        const dataBits = parseInt(elements.dataBitsSelect.value, 10);
        const stopBits = parseInt(elements.stopBitsSelect.value, 10);
        const parity = elements.paritySelect.value;
        const flowControl = elements.flowControlSelect.value;

        dev.baudRate = baudRate;
        dev.dataBits = dataBits;
        dev.stopBits = stopBits;
        dev.parity = parity;
        dev.flowControl = flowControl;

        await dev.port.open({ baudRate, dataBits, stopBits, parity, flowControl });

        dev.isConnected = true;
        renderTabsBar();
        updateUIForActiveDevice();

        let info = {};
        try {
            if (dev.port && typeof dev.port.getInfo === 'function') {
                info = dev.port.getInfo() || {};
            }
        } catch (e) {}

        const deviceName = (info && info.usbVendorId) ? `USB VID:0x${info.usbVendorId.toString(16)}` : `Port (${dev.name})`;
        dev.name = deviceName;
        elements.valDevice.textContent = deviceName;
        renderTabsBar();
        updateFooterStats();

        appendTerminal(`[SYSTEM] Connected to ${deviceName} at ${baudRate} baud (${dataBits}${parity[0].toUpperCase()}${stopBits}).`, 'system');
        showToast(`Connected ${dev.name} at ${baudRate} baud`, 'success');

        try {
            await dev.port.setSignals({ dataTerminalReady: dev.dtrState, requestToSend: dev.rtsState });
        } catch (err) {}

        readSerialDataForDevice(dev);

    } catch (error) {
        handleErrors(error, 'Connection Failed');
    }
}

async function disconnectSerial() {
    const dev = getActiveState();
    await disconnectSerialForDevice(dev);
}

async function disconnectSerialForDevice(dev) {
    if (!dev || !dev.port) return;

    try {
        dev.isConnected = false;
        dev.partialLineBuffer = '';
        dev.partialByteBuffer = [];

        if (dev.reader) {
            try { await dev.reader.cancel(); } catch (e) {}
            dev.reader = null;
        }

        if (dev.port) {
            await dev.port.close();
            dev.port = null;
        }

        renderTabsBar();
        if (dev.id === appState.activeDeviceId) {
            updateStatus('Disconnected', 'disconnected');
            elements.valDevice.textContent = 'None';
            appendTerminal('[SYSTEM] Serial port disconnected cleanly.', 'system');
            showToast('Serial device disconnected', 'info');
        }
    } catch (error) {
        handleErrors(error, 'Disconnect Error');
    }
}

async function readSerialDataForDevice(dev) {
    dev.isReading = true;

    while (dev.port && dev.port.readable && dev.isConnected) {
        try {
            dev.reader = dev.port.readable.getReader();
            while (dev.isConnected) {
                const { value, done } = await dev.reader.read();
                if (done) break;

                if (value && value.length > 0) {
                    if (dev.id === appState.activeDeviceId) {
                        triggerLED(elements.rxLed);
                    }
                    dev.rxBytes += value.length;
                    if (dev.id === appState.activeDeviceId) {
                        updateFooterStats();
                    }
                    processIncomingBytesForDevice(dev, value);
                }
            }
        } catch (error) {
            if (dev.isConnected) {
                handleErrors(error, 'Stream Read Error');
            }
            break;
        } finally {
            if (dev.reader) {
                try { dev.reader.releaseLock(); } catch (e) {}
                dev.reader = null;
            }
        }
    }

    dev.isReading = false;
}

/**
 * PROCESS INCOMING BYTES
 */
function processIncomingBytesForDevice(dev, bytes) {
    if (dev.isPaused) return;

    if (dev.displayMode === 'text' || dev.displayMode === 'plotter') {
        const textChunk = textDecoder.decode(bytes, { stream: true });
        dev.partialLineBuffer += textChunk;

        const lines = dev.partialLineBuffer.split(/\r?\n/);
        dev.partialLineBuffer = lines.pop();

        for (const line of lines) {
            appendTerminalForDevice(dev, line, 'rx');
            if (dev.displayMode === 'plotter') {
                parseTelemetryDataForDevice(dev, line);
            }
        }
    } else {
        for (let i = 0; i < bytes.length; i++) {
            dev.partialByteBuffer.push(bytes[i]);
        }

        while (dev.partialByteBuffer.length > 0) {
            const newlineIndex = dev.partialByteBuffer.indexOf(10);
            let lineBytes = null;

            if (newlineIndex !== -1) {
                lineBytes = dev.partialByteBuffer.splice(0, newlineIndex + 1);
            } else if (dev.partialByteBuffer.length >= 16) {
                lineBytes = dev.partialByteBuffer.splice(0, 16);
            } else {
                break;
            }

            if (lineBytes && lineBytes.length > 0) {
                formatAndAppendByteLineForDevice(dev, lineBytes);
            }
        }
    }
}

function formatAndAppendByteLineForDevice(dev, lineBytes) {
    const len = lineBytes.length;
    if (len === 0) return;

    let str = '';
    if (dev.displayMode === 'hex') {
        for (let i = 0; i < len; i++) {
            str += (i > 0 ? ' ' : '') + HEX_LOOKUP[lineBytes[i]];
        }
    } else if (dev.displayMode === 'ascii') {
        for (let i = 0; i < len; i++) {
            str += ASCII_LOOKUP[lineBytes[i]];
        }
    } else if (dev.displayMode === 'binary') {
        for (let i = 0; i < len; i++) {
            str += (i > 0 ? ' ' : '') + BINARY_LOOKUP[lineBytes[i]];
        }
    }

    appendTerminalForDevice(dev, str, 'rx');
}

/**
 * WRITE QUEUE & SERIAL DATA TRANSMISSION
 */
function enqueueWriteForDevice(dev, writeTask) {
    dev.writeQueue = dev.writeQueue.then(writeTask).catch(err => {
        console.error('[Write Queue Error]:', err);
    });
    return dev.writeQueue;
}

function writeSerialData(commandText) {
    const dev = getActiveState();
    let formattedCommand = commandText;
    switch (dev.lineEnding) {
        case 'both': formattedCommand += '\r\n'; break;
        case 'lf': formattedCommand += '\n'; break;
        case 'cr': formattedCommand += '\r'; break;
        case 'none': default: break;
    }

    return enqueueWriteForDevice(dev, async () => {
        if (!dev.isConnected || !dev.port || !dev.port.writable) {
            showToast('Cannot send: Serial device is not connected.', 'error');
            return;
        }

        let writer = null;
        try {
            writer = dev.port.writable.getWriter();
            dev.writer = writer;
            const dataBytes = textEncoder.encode(formattedCommand);

            await writer.write(dataBytes);

            if (dev.id === appState.activeDeviceId) triggerLED(elements.txLed);
            dev.txBytes += dataBytes.length;
            if (dev.id === appState.activeDeviceId) updateFooterStats();

            appendTerminalForDevice(dev, `> ${commandText}`, 'tx');
        } catch (error) {
            handleErrors(error, 'Write Error');
        } finally {
            if (writer) {
                try { writer.releaseLock(); } catch (e) {}
            }
            if (dev.writer === writer) dev.writer = null;
        }
    });
}

function writeRawData(data) {
    const dev = getActiveState();
    return enqueueWriteForDevice(dev, async () => {
        if (!dev.isConnected || !dev.port || !dev.port.writable) {
            showToast('Serial device is not connected.', 'error');
            return;
        }

        let writer = null;
        try {
            writer = dev.port.writable.getWriter();
            dev.writer = writer;
            let dataBytes;

            if (typeof data === 'string') {
                dataBytes = textEncoder.encode(data);
            } else if (data instanceof Uint8Array) {
                dataBytes = data;
            } else if (typeof data === 'number') {
                dataBytes = new Uint8Array([data]);
            }

            await writer.write(dataBytes);

            if (dev.id === appState.activeDeviceId) triggerLED(elements.txLed);
            dev.txBytes += dataBytes.length;
            if (dev.id === appState.activeDeviceId) updateFooterStats();
        } catch (error) {
            console.warn('Raw Write Error:', error);
        } finally {
            if (writer) {
                try { writer.releaseLock(); } catch (e) {}
            }
            if (dev.writer === writer) dev.writer = null;
        }
    });
}

/**
 * HARDWARE RESET PROFILES (ESP32, ESP32-S3, Arduino, Generic)
 */
async function triggerHardwareReset() {
    const dev = getActiveState();
    if (!dev.isConnected || !dev.port) {
        showToast('Cannot reset: Serial port is not connected.', 'error');
        return;
    }

    const profile = dev.resetProfile;
    appendTerminal(`[SYSTEM] Triggering Hardware Reset Profile: ${profile.toUpperCase()}`, 'system');

    try {
        if (profile === 'esp32') {
            // Standard ESP32 Auto-Reset (DTR=LOW, RTS=HIGH -> EN/BOOT sequence)
            await dev.port.setSignals({ dataTerminalReady: false, requestToSend: true });
            await new Promise(r => setTimeout(r, 100));
            await dev.port.setSignals({ dataTerminalReady: true, requestToSend: false });
            await new Promise(r => setTimeout(r, 50));
            await dev.port.setSignals({ dataTerminalReady: false, requestToSend: false });
        } else if (profile === 'esp32s3') {
            // ESP32-S3 / C3 Native USB CDC Reset sequence (Best-Effort).
            // Note: Real esptool.py native USB CDC resets on S3/C3 dev boards also use
            // a 1200-baud touch trick to force bootloader mode if DTR/RTS signals alone
            // are not wired or supported by board hardware.
            await dev.port.setSignals({ dataTerminalReady: false, requestToSend: false });
            await new Promise(r => setTimeout(r, 100));
            await dev.port.setSignals({ dataTerminalReady: true, requestToSend: false });
            await new Promise(r => setTimeout(r, 100));
            await dev.port.setSignals({ dataTerminalReady: false, requestToSend: true });
        } else if (profile === 'arduino') {
            // Arduino DTR Pulse (ATmega328P / 32u4 hardware reset)
            await dev.port.setSignals({ dataTerminalReady: false });
            await new Promise(r => setTimeout(r, 100));
            await dev.port.setSignals({ dataTerminalReady: true });
        } else {
            // Generic 150ms DTR/RTS pulse
            await dev.port.setSignals({ dataTerminalReady: !dev.dtrState, requestToSend: !dev.rtsState });
            await new Promise(r => setTimeout(r, 150));
            await dev.port.setSignals({ dataTerminalReady: dev.dtrState, requestToSend: dev.rtsState });
        }
        showToast(`Hardware reset pulse sent (${profile})`, 'info');
    } catch (e) {
        showToast('Hardware reset failed: ' + e.message, 'error');
    }
}

/**
 * VIRTUALIZED LOG RENDERING & RENDER BATCHING
 */
const ROW_HEIGHT = 22;
const OVERSCAN = 10;
let renderFramePending = false;
let autoScrollPending = false;

function scheduleVirtualRender(shouldAutoScroll = false) {
    if (shouldAutoScroll) autoScrollPending = true;
    if (!renderFramePending) {
        renderFramePending = true;
        requestAnimationFrame(renderVirtualList);
    }
}

function renderVirtualList() {
    renderFramePending = false;
    const dev = getActiveState();
    if (!elements.terminalOutput || !elements.virtualContent || !elements.terminalScreen) return;

    const activeQuery = elements.searchInput ? elements.searchInput.value.trim().toLowerCase() : '';
    let entries = dev.logEntries;

    if (activeQuery) {
        if (!dev.filteredEntriesCache || dev.lastSearchQuery !== activeQuery) {
            dev.lastSearchQuery = activeQuery;
            dev.filteredEntriesCache = dev.logEntries.filter(entry => 
                entry.message.toLowerCase().includes(activeQuery)
            );
        }
        entries = dev.filteredEntriesCache;
        if (elements.searchCount) {
            elements.searchCount.textContent = `${entries.length} matches`;
        }
    } else {
        dev.filteredEntriesCache = null;
        dev.lastSearchQuery = '';
    }

    const totalLines = entries.length;
    elements.terminalOutput.style.height = `${totalLines * ROW_HEIGHT}px`;

    if (autoScrollPending) {
        autoScrollPending = false;
        if (dev.autoScroll && !dev.isPaused) {
            elements.terminalScreen.scrollTop = elements.terminalScreen.scrollHeight;
        }
    }

    if (totalLines === 0) {
        elements.virtualContent.innerHTML = '';
        if (elements.terminalWelcome) elements.terminalWelcome.classList.remove('hidden');
        return;
    } else {
        if (elements.terminalWelcome) elements.terminalWelcome.classList.add('hidden');
    }

    const containerScrollTop = Math.max(0, elements.terminalScreen.scrollTop - elements.terminalOutput.offsetTop);
    const viewportHeight = elements.terminalScreen.clientHeight;

    const startIndex = Math.max(0, Math.floor(containerScrollTop / ROW_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(totalLines - 1, Math.ceil((containerScrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);

    elements.virtualContent.style.transform = `translateY(${startIndex * ROW_HEIGHT}px)`;

    const fragment = document.createDocumentFragment();
    const regex = activeQuery ? new RegExp(`(${escapeRegExp(activeQuery)})`, 'gi') : null;

    // Compile active highlight rules safely
    const activeRules = [];
    for (const r of appState.highlightRules) {
        if (r.enabled && r.pattern) {
            try {
                activeRules.push({
                    regex: new RegExp(r.pattern, 'i'),
                    styleClass: r.styleClass
                });
            } catch (e) {}
        }
    }

    for (let i = startIndex; i <= endIndex; i++) {
        const entry = entries[i];
        const lineElem = document.createElement('div');
        
        let ruleClass = '';
        for (const rule of activeRules) {
            if (rule.regex.test(entry.message)) {
                ruleClass = rule.styleClass;
                break;
            }
        }

        lineElem.className = `log-line log-${entry.type} ${ruleClass}`;

        if (dev.showTimestamps) {
            const timeSpan = document.createElement('span');
            timeSpan.className = 'log-timestamp';
            timeSpan.textContent = `[${entry.timestamp}]`;
            lineElem.appendChild(timeSpan);
        }

        const contentSpan = document.createElement('span');
        contentSpan.className = 'log-content';

        if (regex) {
            const parts = entry.message.split(regex);
            const html = parts.map((part, pIdx) => {
                const escaped = escapeHTML(part);
                return pIdx % 2 === 1 ? `<mark class="highlight">${escaped}</mark>` : escaped;
            }).join('');
            contentSpan.innerHTML = html;
        } else {
            contentSpan.textContent = entry.message;
        }

        lineElem.appendChild(contentSpan);
        fragment.appendChild(lineElem);
    }

    elements.virtualContent.replaceChildren(fragment);
}

function appendTerminal(message, type = 'rx') {
    const dev = getActiveState();
    appendTerminalForDevice(dev, message, type);
}

function appendTerminalForDevice(dev, message, type = 'rx') {
    const timestamp = getCurrentTimestamp();
    const entry = { timestamp, type, message };

    dev.logEntries.push(entry);
    saveLogToDB(dev.id, entry);

    if (dev.lastSearchQuery) {
        if (message.toLowerCase().includes(dev.lastSearchQuery)) {
            if (!dev.filteredEntriesCache) dev.filteredEntriesCache = [];
            dev.filteredEntriesCache.push(entry);
        }
    }

    enforceBufferLimitForDevice(dev);

    if (dev.id === appState.activeDeviceId) {
        scheduleVirtualRender(true);
    }
}

function enforceBufferLimit() {
    enforceBufferLimitForDevice(getActiveState());
}

function enforceBufferLimitForDevice(dev) {
    if (dev.bufferLimit <= 0) return;

    if (dev.logEntries.length > dev.bufferLimit) {
        dev.logEntries = dev.logEntries.slice(-dev.bufferLimit);
        if (dev.filteredEntriesCache) {
            dev.filteredEntriesCache = null;
        }

        const now = Date.now();
        if (!dev.lastDBPruneTime || (now - dev.lastDBPruneTime) > 3000) {
            dev.lastDBPruneTime = now;
            pruneLogsInDB(dev.id, dev.bufferLimit);
        }
    }
}

function clearTerminal() {
    const dev = getActiveState();
    dev.logEntries = [];
    dev.filteredEntriesCache = null;
    dev.lastSearchQuery = '';
    dev.partialLineBuffer = '';
    dev.partialByteBuffer = [];
    dev.plotterChannels = {};
    clearLogsFromDB(dev.id);
    clearSearch();
    scheduleVirtualRender();
    if (dev.displayMode === 'plotter') {
        renderPlotterCanvas();
    }
    showToast('Terminal log & DB cleared', 'info');
}

/**
 * LIVE TELEMETRY SERIAL PLOTTER ENGINE
 */
const NEON_COLORS = ['#00ff66', '#00e5ff', '#ffb000', '#ff0055', '#b873ff', '#ffcc00', '#33ff88'];

function addTelemetryValue(dev, channelName, val) {
    if (!dev.plotterChannels[channelName]) {
        dev.plotterChannels[channelName] = {
            color: NEON_COLORS[Object.keys(dev.plotterChannels).length % NEON_COLORS.length],
            data: []
        };
    }
    dev.plotterChannels[channelName].data.push(val);
    if (dev.plotterChannels[channelName].data.length > 300) {
        dev.plotterChannels[channelName].data.shift();
    }
}

function parseTelemetryDataForDevice(dev, line) {
    // 1. Check for Key-Value headers with single or multi-value numeric lists
    // Examples: "ACCEL: 1.2, 4.5, 9.8", "temp=24.5 hum=60"
    const kvGroupRegex = /([a-zA-Z0-9_\-]+)\s*[:=]\s*(-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?)*)/g;
    let match;
    let parsedAnyKV = false;

    while ((match = kvGroupRegex.exec(line)) !== null) {
        const key = match[1].trim();
        const numSequence = match[2];
        const nums = numSequence.match(/-?\d+(?:\.\d+)?/g);

        if (nums && nums.length > 0) {
            parsedAnyKV = true;
            if (nums.length === 1) {
                const val = parseFloat(nums[0]);
                if (!isNaN(val)) addTelemetryValue(dev, key, val);
            } else {
                nums.forEach((nStr, idx) => {
                    const val = parseFloat(nStr);
                    if (!isNaN(val)) addTelemetryValue(dev, `${key}_${idx + 1}`, val);
                });
            }
        }
    }

    // 2. Fallback to positional numbering if no key-value headers were found
    if (!parsedAnyKV) {
        const matches = line.match(/-?\d+(?:\.\d+)?/g);
        if (matches) {
            matches.forEach((m, idx) => {
                const val = parseFloat(m);
                if (!isNaN(val)) {
                    addTelemetryValue(dev, `Channel ${idx + 1}`, val);
                }
            });
        }
    }

    if (dev.id === appState.activeDeviceId && dev.displayMode === 'plotter') {
        requestAnimationFrame(renderPlotterCanvas);
    }
}

function renderPlotterCanvas() {
    const dev = getActiveState();
    const canvas = elements.plotterCanvas;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const channelNames = Object.keys(dev.plotterChannels);
    if (channelNames.length === 0) {
        ctx.fillStyle = '#6e7681';
        ctx.font = '14px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Waiting for numeric telemetry data stream...', width / 2, height / 2);
        elements.plotterLegend.innerHTML = '';
        return;
    }

    const padding = 30;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Draw Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
        const y = padding + (chartHeight / 5) * i;
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
    }
    ctx.stroke();

    // Render Data Lines with Per-Channel Auto-Scaling for high dynamic contrast
    channelNames.forEach(name => {
        const ch = dev.plotterChannels[name];
        if (ch.hidden) return;

        const data = ch.data;
        if (data.length < 2) return;

        let chMin = Math.min(...data);
        let chMax = Math.max(...data);
        if (chMin === chMax) { chMin -= 1; chMax += 1; }

        ctx.strokeStyle = ch.color;
        ctx.lineWidth = 2;
        ctx.beginPath();

        const stepX = chartWidth / (300 - 1);
        const startOffset = 300 - data.length;

        data.forEach((val, idx) => {
            const x = padding + (startOffset + idx) * stepX;
            const y = padding + chartHeight - ((val - chMin) / (chMax - chMin)) * chartHeight;
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });

        ctx.stroke();
    });

    // Update Interactive Legend (click item to isolate / toggle channel)
    elements.plotterLegend.innerHTML = '';
    channelNames.forEach(name => {
        const ch = dev.plotterChannels[name];
        const lastVal = ch.data.length > 0 ? ch.data[ch.data.length - 1] : 0;
        const legendItem = document.createElement('div');
        legendItem.className = `legend-item ${ch.hidden ? 'legend-disabled' : ''}`;
        legendItem.style.cursor = 'pointer';
        legendItem.style.opacity = ch.hidden ? '0.4' : '1';
        legendItem.style.textDecoration = ch.hidden ? 'line-through' : 'none';
        legendItem.title = 'Click to toggle channel visibility';
        legendItem.innerHTML = `
            <span class="legend-color-box" style="background-color: ${ch.color};"></span>
            <span>${name}: <strong>${lastVal}</strong></span>
        `;
        legendItem.addEventListener('click', () => {
            ch.hidden = !ch.hidden;
            renderPlotterCanvas();
        });
        elements.plotterLegend.appendChild(legendItem);
    });
}

function clearPlotterData() {
    const dev = getActiveState();
    dev.plotterChannels = {};
    renderPlotterCanvas();
    showToast('Telemetry plotter data cleared', 'info');
}

/**
 * EXPORT OPTIONS (TXT, CSV, NDJSON)
 */
function exportLog(format = 'txt') {
    const dev = getActiveState();
    const entries = dev.filteredEntriesCache || dev.logEntries;

    if (entries.length === 0) {
        showToast('Terminal log is empty.', 'info');
        return;
    }

    let fileContent = '';
    let fileName = `serial_log_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    let mimeType = 'text/plain;charset=utf-8';

    if (format === 'csv') {
        mimeType = 'text/csv;charset=utf-8';
        fileName += '.csv';
        fileContent = 'Timestamp,Direction,Message\r\n';
        entries.forEach(e => {
            const escapedMsg = `"${e.message.replace(/"/g, '""')}"`;
            fileContent += `"${e.timestamp}","${e.type}",${escapedMsg}\r\n`;
        });
    } else if (format === 'ndjson') {
        mimeType = 'application/x-ndjson;charset=utf-8';
        fileName += '.json';
        fileContent = entries.map(e => JSON.stringify({ timestamp: e.timestamp, direction: e.type, message: e.message })).join('\n');
    } else {
        fileName += '.txt';
        fileContent = entries.map(e => `[${e.timestamp}] ${e.message}`).join('\r\n');
    }

    const blob = new Blob([fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Exported log as ${format.toUpperCase()}`, 'success');
}

async function clearDatabaseHistory() {
    const dev = getActiveState();
    await clearLogsFromDB(dev.id);
    dev.logEntries = [];
    dev.filteredEntriesCache = null;
    scheduleVirtualRender();
    showToast('Database log history deleted', 'info');
}

/**
 * BINARY FILE TRANSFER FEATURE
 */
async function startFileTransfer() {
    const dev = getActiveState();
    const file = elements.fileInputField.files[0];
    if (!file) {
        showToast('Please select a file to send.', 'error');
        return;
    }
    if (!dev.isConnected) {
        showToast('Serial device is not connected.', 'error');
        return;
    }

    const chunkSize = parseInt(elements.fileChunkSize.value, 10) || 128;
    const packetDelay = parseInt(elements.filePacketDelay.value, 10) || 20;

    dev.isFileTransferring = true;
    dev.fileTransferCancel = false;

    elements.fileProgressContainer.classList.remove('hidden');
    elements.btnStartFileTransfer.disabled = true;

    try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const totalBytes = bytes.length;
        let offset = 0;

        appendTerminal(`[SYSTEM] Starting file transfer "${file.name}" (${formatBytes(totalBytes)}, Chunk: ${chunkSize}B, Delay: ${packetDelay}ms)`, 'system');

        while (offset < totalBytes && !dev.fileTransferCancel && dev.isConnected) {
            const chunk = bytes.subarray(offset, offset + chunkSize);
            await writeRawData(chunk);

            offset += chunk.length;
            const pct = Math.floor((offset / totalBytes) * 100);
            elements.fileProgressFill.style.width = `${pct}%`;
            elements.fileProgressText.textContent = `${pct}% (${offset} / ${totalBytes} bytes)`;

            if (packetDelay > 0) {
                await new Promise(r => setTimeout(r, packetDelay));
            }
        }

        if (dev.fileTransferCancel) {
            appendTerminal('[ERROR] File transfer cancelled by user.', 'error');
            showToast('File transfer cancelled.', 'info');
        } else {
            appendTerminal(`[SYSTEM] File transfer "${file.name}" complete!`, 'system');
            showToast(`File "${file.name}" sent successfully!`, 'success');
        }
    } catch (err) {
        handleErrors(err, 'File Transfer Error');
    } finally {
        dev.isFileTransferring = false;
        elements.btnStartFileTransfer.disabled = false;
        elements.fileProgressContainer.classList.add('hidden');
        elements.modalSendFile.classList.add('hidden');
    }
}

function cancelFileTransfer() {
    const dev = getActiveState();
    if (dev.isFileTransferring) {
        dev.fileTransferCancel = true;
    }
    elements.modalSendFile.classList.add('hidden');
}

/**
 * REGEX HIGHLIGHTING RULES MANAGEMENT
 */
function openRulesModal() {
    renderRulesList();
    elements.modalHighlightRules.classList.remove('hidden');
}

function renderRulesList() {
    elements.rulesList.innerHTML = '';
    appState.highlightRules.forEach((rule, idx) => {
        const row = document.createElement('div');
        row.className = 'rule-item-row';
        const safePattern = escapeHTML(rule.pattern);
        row.innerHTML = `
            <div>
                <input type="checkbox" ${rule.enabled ? 'checked' : ''} id="rule-chk-${idx}">
                <span class="${rule.styleClass}" style="margin-left:6px; font-weight:bold;">${safePattern}</span>
            </div>
            <button class="btn-icon" id="btn-del-rule-${idx}" title="Delete Rule">&times;</button>
        `;
        elements.rulesList.appendChild(row);

        row.querySelector(`#rule-chk-${idx}`).addEventListener('change', (e) => {
            appState.highlightRules[idx].enabled = e.target.checked;
            savePreferences();
            scheduleVirtualRender();
        });

        row.querySelector(`#btn-del-rule-${idx}`).addEventListener('click', () => {
            appState.highlightRules.splice(idx, 1);
            savePreferences();
            renderRulesList();
            scheduleVirtualRender();
        });
    });
}

function addNewHighlightRule() {
    const pattern = elements.rulePatternInput.value.trim();
    if (!pattern) return;
    const styleClass = elements.ruleStyleSelect.value;
    appState.highlightRules.push({ pattern, styleClass, enabled: true });
    elements.rulePatternInput.value = '';
    savePreferences();
    renderRulesList();
    scheduleVirtualRender();
}

/**
 * PERSISTENT CUSTOM MACROS & PRESET PROFILES
 */
function openMacroModal() {
    renderMacrosEditList();
    elements.modalMacroManager.classList.remove('hidden');
}

function renderMacroButtons() {
    elements.macroButtons.innerHTML = '';
    appState.customMacros.forEach(m => {
        const btn = document.createElement('button');
        btn.className = 'btn-macro';
        btn.setAttribute('data-cmd', m.cmd);
        btn.textContent = m.label;
        elements.macroButtons.appendChild(btn);
    });
}

function renderMacrosEditList() {
    elements.macrosEditList.innerHTML = '';
    appState.customMacros.forEach((m, idx) => {
        const row = document.createElement('div');
        row.className = 'macro-item-row';
        const safeLabel = escapeHTML(m.label);
        const safeCmd = escapeHTML(m.cmd);
        row.innerHTML = `
            <span><strong>${safeLabel}</strong>: <code>${safeCmd}</code></span>
            <button class="btn-icon" id="btn-del-macro-${idx}">&times;</button>
        `;
        elements.macrosEditList.appendChild(row);
        row.querySelector(`#btn-del-macro-${idx}`).addEventListener('click', () => {
            appState.customMacros.splice(idx, 1);
            savePreferences();
            renderMacrosEditList();
            renderMacroButtons();
        });
    });
}

function addNewMacroFromModal() {
    const label = elements.macroLabelInput.value.trim();
    const cmd = elements.macroCmdInput.value.trim();
    if (!label || !cmd) return;
    appState.customMacros.push({ label, cmd });
    elements.macroLabelInput.value = '';
    elements.macroCmdInput.value = '';
    savePreferences();
    renderMacrosEditList();
    renderMacroButtons();
}

function loadMacroPresetProfile() {
    const val = elements.macroPresetSelect.value;
    if (val === 'esp32') {
        appState.customMacros = [
            { label: 'AT', cmd: 'AT' },
            { label: 'AT+GMR', cmd: 'AT+GMR' },
            { label: 'WiFi Scan', cmd: 'AT+CWLAP' },
            { label: 'AP Info', cmd: 'AT+CWJAP?' },
            { label: 'IP Query', cmd: 'AT+CIFSR' }
        ];
    } else if (val === 'gps') {
        appState.customMacros = [
            { label: 'Poll GGA', cmd: '$PUBX,00*33' },
            { label: 'Poll RMC', cmd: '$EIGPQ,RMC*3A' },
            { label: 'Hot Reset', cmd: '$PMTK101*32' },
            { label: 'Baud 115k', cmd: '$PMTK251,115200*1F' }
        ];
    } else if (val === 'grbl') {
        appState.customMacros = [
            { label: 'Status ?', cmd: '?' },
            { label: 'Home $H', cmd: '$H' },
            { label: 'Unlock $X', cmd: '$X' },
            { label: 'Settings $$', cmd: '$$' },
            { label: 'Reset 0x18', cmd: '\x18' }
        ];
    }
    savePreferences();
    renderMacrosEditList();
    renderMacroButtons();
}

/**
 * UTILITY HELPERS & INPUT KEYDOWN
 */
function sendTerminalInput() {
    const dev = getActiveState();
    const text = elements.terminalInput.value;
    const trimmed = text.trim();

    if (text) {
        dev.commandHistory.push(text);
        dev.historyIndex = dev.commandHistory.length;
    }

    elements.terminalInput.value = '';
    if (!trimmed && dev.lineEnding === 'none' && dev.inputMode === 'line') return;

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (cmd === 'clear' || cmd === 'cls') {
        clearTerminal();
        return;
    } else if (cmd === 'help') {
        appendTerminal('> help', 'tx');
        showTerminalHelp();
        return;
    } else if (cmd === 'history') {
        appendTerminal('> history', 'tx');
        showCommandHistory();
        return;
    } else if (cmd === 'reset' || cmd === 'reboot') {
        appendTerminal(`> ${trimmed}`, 'tx');
        triggerHardwareReset();
        return;
    } else if (cmd === 'baud' && parts[1]) {
        appendTerminal(`> ${trimmed}`, 'tx');
        const newBaud = parseInt(parts[1], 10);
        if (!isNaN(newBaud) && newBaud > 0) {
            dev.baudRate = newBaud;
            elements.baudRateSelect.value = newBaud.toString();
            updateFooterStats();
            appendTerminal(`[SYSTEM] Baud rate updated to ${newBaud} 8N1.`, 'system');
        }
        return;
    }

    writeSerialData(text);
}

function handleInputKeydown(e) {
    const dev = getActiveState();
    if (dev.inputMode === 'raw') {
        e.preventDefault();
        if (e.key === 'Enter') writeRawData('\r\n');
        else if (e.key === 'Backspace') writeRawData('\x08');
        else if (e.key === 'Tab') writeRawData('\x09');
        else if (e.key === 'Escape') writeRawData('\x1b');
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
            writeRawData('\x03');
            appendTerminal('> ^C', 'tx');
        } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            writeRawData(e.key);
        }
        return;
    }

    if (e.key === 'Enter') {
        e.preventDefault();
        sendTerminalInput();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (dev.commandHistory.length > 0 && dev.historyIndex > 0) {
            dev.historyIndex--;
            elements.terminalInput.value = dev.commandHistory[dev.historyIndex];
        }
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (dev.historyIndex < dev.commandHistory.length - 1) {
            dev.historyIndex++;
            elements.terminalInput.value = dev.commandHistory[dev.historyIndex];
        } else {
            dev.historyIndex = dev.commandHistory.length;
            elements.terminalInput.value = '';
        }
    } else if (e.ctrlKey || e.metaKey) {
        if (e.key === 'c' || e.key === 'C') {
            const input = elements.terminalInput;
            if ((input.selectionStart || 0) === (input.selectionEnd || 0) && window.getSelection().toString() === '') {
                e.preventDefault();
                if (dev.isConnected) {
                    writeRawData('\x03');
                    appendTerminal('> ^C', 'tx');
                }
            }
        } else if (e.key === 'l' || e.key === 'L') {
            e.preventDefault();
            clearTerminal();
        }
    }
}

function handleGlobalShortcuts(e) {
    if (e.key === 'Escape') {
        const visibleModal = document.querySelector('.modal-overlay:not(.hidden)');
        if (visibleModal) {
            e.preventDefault();
            visibleModal.classList.add('hidden');
            const dev = getActiveState();
            if (dev.isFileTransferring) dev.fileTransferCancel = true;
        }
        return;
    }

    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'l' || e.key === 'L') {
            e.preventDefault();
            clearTerminal();
        } else if (e.key === 'f' || e.key === 'F') {
            e.preventDefault();
            elements.searchInput.focus();
        }
    }
}

function copyLog() {
    const dev = getActiveState();
    const entries = dev.filteredEntriesCache || dev.logEntries;
    if (entries.length === 0) {
        showToast('Terminal log is empty.', 'info');
        return;
    }
    const logText = entries.map(e => `[${e.timestamp}] ${e.message}`).join('\n');
    navigator.clipboard.writeText(logText).then(() => {
        showToast('Terminal log copied to clipboard!', 'success');
    });
}

function handleSearch() {
    const dev = getActiveState();
    const query = elements.searchInput.value.trim().toLowerCase();
    if (!query) {
        clearSearch();
        return;
    }
    elements.btnSearchClear.classList.remove('hidden');
    dev.lastSearchQuery = query;
    dev.filteredEntriesCache = dev.logEntries.filter(entry => 
        entry.message.toLowerCase().includes(query)
    );
    scheduleVirtualRender();
}

function clearSearch() {
    const dev = getActiveState();
    elements.searchInput.value = '';
    if (elements.searchCount) elements.searchCount.textContent = '';
    elements.btnSearchClear.classList.add('hidden');
    dev.lastSearchQuery = '';
    dev.filteredEntriesCache = null;
    scheduleVirtualRender();
}

function showTerminalHelp() {
    const helpLines = [
        "==========================================================================",
        "[SYSTEM] WEB SERIAL TERMINAL PRO v2.0 - FEATURES & CHEAT SHEET",
        "==========================================================================",
        "[PLOTTER] Live Telemetry Plotter: Select 'Telemetry Plotter' under Format",
        "[FILE] File Transfer: Send binary firmware/blobs in chunked packets",
        "[RULES] Highlighting Rules: Define custom regex log colorizing rules",
        "[RESET] Hardware Resets: ESP32, ESP32-S3, Arduino, Generic reset sequences",
        "[STORAGE] IndexedDB & Export: Auto-saves history; exports TXT, CSV, NDJSON",
        "=========================================================================="
    ];
    helpLines.forEach(line => appendTerminal(line, 'system'));
}

function showCommandHistory() {
    const dev = getActiveState();
    if (dev.commandHistory.length === 0) {
        appendTerminal('[SYSTEM] Command history is currently empty.', 'system');
        return;
    }
    appendTerminal('--- COMMAND HISTORY ---', 'system');
    dev.commandHistory.forEach((cmd, idx) => appendTerminal(`  ${idx + 1}  ${cmd}`, 'system'));
}

function handleUnexpectedDisconnectForDevice(dev) {
    dev.isConnected = false;
    dev.port = null;
    dev.reader = null;
    dev.writer = null;

    renderTabsBar();
    if (dev.id === appState.activeDeviceId) {
        updateStatus('Disconnected unexpectedly', 'error');
        elements.valDevice.textContent = 'None';
        appendTerminal('[ERROR] Serial cable disconnected unexpectedly!', 'error');
        showToast('Device unplugged / disconnected unexpectedly!', 'error');
    }
}

function updateStatus(text, stateClass) {
    elements.statusText.textContent = text;
    elements.statusDot.className = `status-dot ${stateClass}`;
}

function updateFooterStats() {
    const dev = getActiveState();
    elements.valBaud.textContent = `${dev.baudRate} 8N1`;
    elements.valRx.textContent = formatBytes(dev.rxBytes);
    elements.valTx.textContent = formatBytes(dev.txBytes);
}

function triggerLED(ledElem) {
    if (!ledElem) return;
    ledElem.classList.add('active');
    setTimeout(() => ledElem.classList.remove('active'), 120);
}

function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getCurrentTimestamp() {
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
}

/**
 * LOCAL STORAGE PREFERENCES & RULES PERSISTENCE
 */
function savePreferences() {
    const dev = getActiveState();
    const prefs = {
        baudRate: dev.baudRate,
        customBaud: dev.customBaud,
        displayMode: dev.displayMode,
        theme: elements.themeSelect.value,
        lineEnding: dev.lineEnding,
        bufferLimit: dev.bufferLimit,
        resetProfile: dev.resetProfile,
        autoScroll: dev.autoScroll,
        showTimestamps: dev.showTimestamps,
        dbPersistEnabled: appState.dbPersistEnabled
    };
    try {
        localStorage.setItem('web_serial_terminal_prefs', JSON.stringify(prefs));
        localStorage.setItem('web_serial_terminal_rules', JSON.stringify(appState.highlightRules));
        localStorage.setItem('web_serial_terminal_macros', JSON.stringify(appState.customMacros));
    } catch (e) {}
}

function loadPreferences() {
    try {
        const savedPrefs = localStorage.getItem('web_serial_terminal_prefs');
        if (savedPrefs) {
            const prefs = JSON.parse(savedPrefs);
            if (prefs.theme) {
                elements.themeSelect.value = prefs.theme;
                document.body.className = prefs.theme;
            }
            if (prefs.dbPersistEnabled !== undefined) {
                appState.dbPersistEnabled = prefs.dbPersistEnabled;
                elements.chkDbPersist.checked = prefs.dbPersistEnabled;
            }
            appState.savedDeviceDefaults = {
                baudRate: prefs.baudRate !== undefined ? prefs.baudRate : 9600,
                customBaud: prefs.customBaud || '',
                displayMode: prefs.displayMode || 'text',
                lineEnding: prefs.lineEnding || 'both',
                bufferLimit: prefs.bufferLimit !== undefined ? prefs.bufferLimit : 1000,
                resetProfile: prefs.resetProfile || 'esp32',
                autoScroll: prefs.autoScroll !== undefined ? prefs.autoScroll : true,
                showTimestamps: prefs.showTimestamps !== undefined ? prefs.showTimestamps : true
            };
        }

        const savedRules = localStorage.getItem('web_serial_terminal_rules');
        if (savedRules) {
            appState.highlightRules = JSON.parse(savedRules);
        }

        const savedMacros = localStorage.getItem('web_serial_terminal_macros');
        if (savedMacros) {
            appState.customMacros = JSON.parse(savedMacros);
        }
    } catch (e) {}
}

function handleErrors(error, context = 'Error') {
    console.error(`[WebSerial Error - ${context}]:`, error);
    let userMessage = error.message || 'An unexpected serial error occurred.';
    if (error.name === 'NotFoundError') userMessage = 'No serial device was selected.';
    else if (error.name === 'SecurityError' || error.name === 'NotAllowedError') userMessage = 'Permission denied.';
    else if (error.name === 'InvalidStateError') userMessage = 'Port is already open / busy.';

    updateStatus('Error', 'error');
    appendTerminal(`[ERROR] ${context}: ${userMessage}`, 'error');
    showToast(`${context}: ${userMessage}`, 'error');
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 3200);
}

// Launch application on DOM Content Loaded
document.addEventListener('DOMContentLoaded', initializeUI);
