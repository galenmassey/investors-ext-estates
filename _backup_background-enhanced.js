// Enhanced background script with detailed native messaging debugging - FIXED V3.2
console.log('[BG] ============================================');
console.log('[BG] NC Estates Auto-Processor V3.2 - Starting');
console.log('[BG] Extension ID:', chrome.runtime.id);
console.log('[BG] ============================================');

let resultsTabId = null;
let detailTabs = [];

// Native messaging setup
const NATIVE_HOST = 'com.investors.estate_helper_enhanced';
let nativePort = null;
let portConnected = false;
let hasPort = false;  // NEW: Track if port exists, even before pong
let messageQueue = [];
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 3;

// Enhanced logging function
function log(level, message, data = null) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const logPrefix = `[${timestamp}] [BG] [${level}]`;
  
  if (data) {
    console.log(logPrefix, message, data);
  } else {
    console.log(logPrefix, message);
  }
  
  // Store logs in chrome.storage for popup access
  chrome.storage.local.get(['logs'], (result) => {
    const logs = result.logs || [];
    logs.push({ timestamp, level, message, data });
    if (logs.length > 100) logs.shift(); // Keep last 100 logs
    chrome.storage.local.set({ logs });
  });
}

// Process queued messages
function processMessageQueue() {
  while (messageQueue.length > 0 && portConnected && nativePort) {
    const msg = messageQueue.shift();
    nativePort.postMessage(msg);
    log('INFO', 'Processed queued message', msg.action);
  }
  if (messageQueue.length > 0) {
    log('WARNING', `Queue has ${messageQueue.length} items - waiting for connection`);
  }
}

// Connect to native helper with detailed error handling
function connectNativeHelper() {
  if (hasPort) {
    log('INFO', 'Port already exists, skipping reconnect');
    return;
  }
  
  connectionAttempts++;
  log('INFO', `Native connection attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS}`);
  log('INFO', `Trying to connect to: ${NATIVE_HOST}`);
  
  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST);
    hasPort = true;  // Port exists now
    log('SUCCESS', 'chrome.runtime.connectNative() called - port created');
    
    // Send immediate test message
    setTimeout(() => {
      if (nativePort) {
        log('INFO', 'Sending test ping to native helper');
        nativePort.postMessage({ type: 'ping', timestamp: Date.now() });
      }
    }, 100);
    
    nativePort.onMessage.addListener((message) => {
      log('SUCCESS', '✓ Native message received', message);
      
      // Set connected on first message
      if (!portConnected) {
        portConnected = true;
        connectionAttempts = 0;
        log('SUCCESS', '✓ Native connection confirmed');
        processMessageQueue();
      }
      
      // Handle different message types
      if (message.type === 'pong') {
        log('SUCCESS', '✓ Native helper is responsive!');
      } else if (message.status === 'ready') {
        log('SUCCESS', '✓ Native helper is ready for case processing');
      } else if (message.success) {
        log('SUCCESS', `✓ Case processed: ${message.message}`);
      }
      
      // Forward to content script
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs && tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'nativeResponse',
            data: message
          }).catch(e => {
            // Ignore if no content script
            if (!e.message.includes('Could not establish connection')) {
              log('DEBUG', 'Tab message error:', e.message);
            }
          });
        }
      });
    });
    
    nativePort.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError;
      portConnected = false;
      hasPort = false;
      nativePort = null;
      
      log('ERROR', '✗ Native helper disconnected');
      
      if (error) {
        log('ERROR', 'Disconnect reason:', error.message);
        
        // Provide specific troubleshooting guidance
        if (error.message.includes('not found') || error.message.includes('No such native messaging host')) {
          log('ERROR', 'DIAGNOSIS: Native manifest not registered properly');
          log('ERROR', 'FIX: Check registry key at:');
          log('ERROR', '  HKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts\\' + NATIVE_HOST);
        } else if (error.message.includes('Forbidden')) {
          log('ERROR', 'DIAGNOSIS: Extension ID mismatch');
          log('ERROR', 'FIX: Update native-manifest.json with correct extension ID:');
          log('ERROR', '  Current Extension ID: ' + chrome.runtime.id);
        }
      }
      
      // Attempt reconnection if under max attempts
      if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
        const delay = 2000 * connectionAttempts;
        log('INFO', `Will retry connection in ${delay/1000} seconds...`);
        setTimeout(connectNativeHelper, delay);
      } else {
        log('ERROR', '✗ Max reconnection attempts reached. Manual intervention required.');
      }
    });
    
  } catch (error) {
    log('ERROR', 'Failed to create native port:', error.toString());
    hasPort = false;
    portConnected = false;
    
    if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
      setTimeout(connectNativeHelper, 2000);
    }
  }
}

// Message handler from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  log('INFO', `Msg from ${sender.tab ? `tab ${sender.tab.id}` : 'popup'}: ${request.action}`);
  
  switch(request.action) {
    case 'checkConnection':
      const status = portConnected ? 'connected' : (hasPort ? 'connecting' : 'disconnected');
      const resp = { 
        connected: portConnected,
        hasPort: hasPort,
        status: status,
        attempts: connectionAttempts,
        host: NATIVE_HOST,
        extensionId: chrome.runtime.id
      };
      
      // If not connected, try to connect
      if (!hasPort && !portConnected) {
        connectNativeHelper();
      }
      
      sendResponse(resp);
      return true;
      
    case 'reconnectNative':
      connectionAttempts = 0;
      hasPort = false;
      portConnected = false;
      if (nativePort) {
        nativePort.disconnect();
        nativePort = null;
      }
      connectNativeHelper();
      sendResponse({ status: 'reconnecting' });
      return true;
      
    case 'getLogs':
      chrome.storage.local.get(['logs'], (result) => {
        sendResponse({ logs: result.logs || [] });
      });
      return true;
      
    case 'sendToNative':
      if (nativePort && portConnected) {
        log('INFO', 'Sending to native helper:', request.data);
        nativePort.postMessage(request.data);
        sendResponse({ status: 'sent', success: true });
      } else {
        log('WARNING', 'Queueing message - native not ready');
        messageQueue.push(request.data);
        sendResponse({ status: 'queued', success: false });
        if (!hasPort) connectNativeHelper();
      }
      return true;
      
    case 'processCase':
      log('INFO', `Processing case: ${request.caseNumber}`);
      
      if (!portConnected) {
        messageQueue.push({
          action: 'processCase',
          caseNumber: request.caseNumber,
          details: request.details,
          documents: request.documents
        });
        if (!hasPort) connectNativeHelper();
        sendResponse({ processing: false, queued: true });
        return true;
      }
      
      // Create folder first
      nativePort.postMessage({
        action: 'createCaseFolder',
        caseNumber: request.caseNumber
      });
      
      // Save details JSON after delay
      setTimeout(() => {
        if (nativePort) {
          nativePort.postMessage({
            action: 'saveDetails',
            caseNumber: request.caseNumber,
            details: JSON.stringify(request.details, null, 2),
            filename: 'case_details.json'
          });
        }
      }, 500);
      
      // Save full page text
      setTimeout(() => {
        if (nativePort) {
          nativePort.postMessage({
            action: 'saveText',
            caseNumber: request.caseNumber,
            filename: 'full_page_text.txt',
            content: request.details?.fullPageText || request.fullText || ''
          });
        }
      }, 1000);
      
      // Save sections as separate text files
      setTimeout(() => {
        if (nativePort && request.details?.sections) {
          const sections = request.details.sections;
          
          // Save parties section
          if (sections.parties && sections.parties.length > 50) {
            nativePort.postMessage({
              action: 'saveText',
              caseNumber: request.caseNumber,
              filename: 'parties.txt',
              content: '=== PARTY INFORMATION ===\n\n' + sections.parties
            });
          }
          
          // Save events section
          if (sections.events && sections.events.length > 50) {
            nativePort.postMessage({
              action: 'saveText',
              caseNumber: request.caseNumber,
              filename: 'events.txt',
              content: '=== CASE EVENTS ===\n\n' + sections.events
            });
          }
          
          // Save text-only events (no documents)
          const textOnlyEvents = request.details.events?.filter(e => !e.hasDocument) || [];
          if (textOnlyEvents.length > 0) {
            const eventsText = textOnlyEvents.map(e => `${e.date}:\n${e.description}\n`).join('\n---\n\n');
            nativePort.postMessage({
              action: 'saveText',
              caseNumber: request.caseNumber,
              filename: 'events_no_documents.txt',
              content: '=== EVENTS WITHOUT DOCUMENTS ===\n\n' + eventsText
            });
          }
        }
      }, 1500);
      
      // Download documents if any
      if (request.documents && request.documents.length > 0) {
        request.documents.forEach((doc, index) => {
          setTimeout(() => {
            if (nativePort) {
              nativePort.postMessage({
                action: 'downloadFile',
                caseNumber: request.caseNumber,
                url: doc.url,
                filename: doc.name || `document_${index + 1}.pdf`,
                context: doc.context || ''
              });
            }
          }, 2000 + (index * 1000));
        });
      }
      
      sendResponse({ 
        processing: true, 
        success: true,
        documents: request.documents?.length || 0,
        events: request.details?.events?.length || 0
      });
      return true;
      
    case 'testMode':
      if (nativePort && portConnected) {
        nativePort.postMessage({ action: 'testMode' });
        sendResponse({ success: true });
      } else {
        messageQueue.push({ action: 'testMode' });
        if (!hasPort) connectNativeHelper();
        sendResponse({ queued: true });
      }
      return true;
      
    case 'openDetailTab':
      if (chrome.tabs) {
        chrome.tabs.create({
          url: request.url,
          active: false
        }, (tab) => {
          detailTabs.push(tab.id);
          log('INFO', `Opened detail tab: ${tab.id}`);
        });
      }
      sendResponse({ status: 'opened' });
      return true;
      
    case 'storeResultsTab':
    case 'markResultsTab':
      resultsTabId = sender.tab?.id;
      log('INFO', `Stored results tab: ${resultsTabId}`);
      sendResponse({ status: 'stored' });
      return true;
      
    case 'closeCurrentTabAndFocusResults':
      if (chrome.tabs) {
        if (resultsTabId) {
          chrome.tabs.update(resultsTabId, { active: true });
        }
        if (sender.tab) {
          chrome.tabs.remove(sender.tab.id);
        }
      }
      sendResponse({ status: 'closed' });
      return true;
      
    default:
      log('WARNING', 'Unknown action:', request.action);
      sendResponse({ status: 'unknown', error: 'Unknown action' });
  }
  
  return true; // Keep message channel open
});

// Tab management
chrome.tabs.onRemoved.addListener((tabId) => {
  if (detailTabs.includes(tabId)) {
    detailTabs = detailTabs.filter(id => id !== tabId);
    log('INFO', `Detail tab closed: ${tabId}`);
  }
  if (tabId === resultsTabId) {
    resultsTabId = null;
    log('INFO', 'Results tab closed');
  }
});

// Initialize native connection on startup
log('INFO', 'Initializing extension...');
log('INFO', 'Extension details:', {
  id: chrome.runtime.id,
  url: chrome.runtime.getURL(''),
  manifest: chrome.runtime.getManifest().version
});

// Wait a moment for everything to initialize
setTimeout(() => {
  log('INFO', 'Starting native helper connection...');
  connectNativeHelper();
}, 1000);

// Periodic connection check
setInterval(() => {
  if (!portConnected && !hasPort && connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
    log('INFO', 'Periodic reconnection attempt');
    connectNativeHelper();
  }
}, 10000);

log('INFO', 'Background script fully loaded');
