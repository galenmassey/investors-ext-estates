// Background service worker for Estates Auto-Processor V3.0
// Handles native messaging with local file helper

console.log('Estates Auto-Processor V3.0 - Background service initialized');

let nativePort = null;
let messageQueue = [];
let isPortConnected = false;

// Connect to native helper
function connectNativeHost() {
    console.log('Attempting to connect to native helper...');
    
    try {
        nativePort = chrome.runtime.connectNative('com.investors.estate_helper');
        
        nativePort.onMessage.addListener((message) => {
            console.log('Received from native helper:', message);
            
            // Handle different message types
            if (message.type === 'ready' || message.type === 'pong') {
                isPortConnected = true;
                console.log('Native helper is ready');
                processMessageQueue();
            }
            
            // Forward message to content script
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        source: 'native',
                        data: message
                    });
                }
            });
        });
        
        nativePort.onDisconnect.addListener(() => {
            console.log('Native helper disconnected');
            isPortConnected = false;
            nativePort = null;
            
            if (chrome.runtime.lastError) {
                console.error('Native host error:', chrome.runtime.lastError.message);
            }
        });
        
        // Send ping to check connection
        setTimeout(() => {
            if (nativePort) {
                nativePort.postMessage({ action: 'ping' });
            }
        }, 100);
        
    } catch (error) {
        console.error('Failed to connect to native helper:', error);
        isPortConnected = false;
    }
}

// Process queued messages
function processMessageQueue() {
    while (messageQueue.length > 0 && isPortConnected && nativePort) {
        const message = messageQueue.shift();
        nativePort.postMessage(message);
    }
}

// Send message to native helper
function sendToNativeHelper(message) {
    if (!nativePort) {
        connectNativeHost();
    }
    
    if (isPortConnected && nativePort) {
        nativePort.postMessage(message);
    } else {
        // Queue message for when connection is established
        messageQueue.push(message);
        console.log('Queued message for native helper:', message);
    }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received from content:', request);
    
    if (request.action === 'checkNativeHelper') {
        // Check if native helper is available
        if (!nativePort) {
            connectNativeHost();
        }
        sendResponse({ connected: isPortConnected });
        return true;
    }
    
    if (request.action === 'sendToNative') {
        // Forward message to native helper
        sendToNativeHelper(request.data);
        sendResponse({ queued: true });
        return true;
    }
    
    if (request.action === 'processCase') {
        // Process a complete case
        const { caseNumber, details, documents } = request;
        
        // Create case folder
        sendToNativeHelper({
            action: 'createCaseFolder',
            caseNumber: caseNumber
        });
        
        // Save case details
        setTimeout(() => {
            sendToNativeHelper({
                action: 'saveDetails',
                caseNumber: caseNumber,
                details: details
            });
        }, 500);
        
        // Save full text
        setTimeout(() => {
            sendToNativeHelper({
                action: 'saveText',
                caseNumber: caseNumber,
                filename: 'full_page_text.txt',
                content: details.extractedText || ''
            });
        }, 1000);
        
        // Download documents (oldest first)
        if (documents && documents.length > 0) {
            documents.forEach((doc, index) => {
                setTimeout(() => {
                    sendToNativeHelper({
                        action: 'downloadFile',
                        caseNumber: caseNumber,
                        url: doc.url,
                        filename: doc.name || `document_${index + 1}.pdf`,
                        index: index + 1
                    });
                }, 1500 + (index * 1000)); // Stagger downloads
            });
        }
        
        sendResponse({ processing: true, documentCount: documents.length });
        return true;
    }
});

// Initialize connection on startup
chrome.runtime.onStartup.addListener(() => {
    connectNativeHost();
});

// Also connect when extension is installed/updated
chrome.runtime.onInstalled.addListener(() => {
    connectNativeHost();
});

// Try to connect immediately
connectNativeHost();

// === [INVESTORS guard] prevent duplicate listener registration ===
(() => {
  const G = globalThis;
  G.__INV_LISTENERS__ = G.__INV_LISTENERS__ || {};

  if (!G.__INV_LISTENERS__.onMessage) {
    const safeHandler = (msg, sender, sendResponse) => {
      try {
        const done = (payload) => {
          try { sendResponse(payload); } catch (e) {}
        };
        // Keep/port your actual message handling into here later if needed.
        done({ ok: true, echo: !!msg });
      } catch (e) {
        try { sendResponse({ ok: false, error: e?.message || String(e) }); } catch {}
      }
      return false;
    };

    if (!chrome.runtime.onMessage.hasListeners?.()) {
      chrome.runtime.onMessage.addListener(safeHandler);
    }
    G.__INV_LISTENERS__.onMessage = true;
    console.log("[Investors][Estates] background onMessage listener set");
  }
})();