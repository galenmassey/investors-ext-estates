// Popup JavaScript for Estates Extension

async function requestOptionalPerms(perms = []) {
  return new Promise((resolve) => {
    chrome.permissions.request({ permissions: perms }, (granted) => {
      const err = chrome.runtime.lastError?.message;
      if (err) console.warn('[Investors][Estates] permissions.request error:', err);
      resolve(!!granted);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
    // Show extension ID
    document.getElementById('ext-id').textContent = chrome.runtime.id;
    
    // Check native connection
    function checkNativeConnection() {
        chrome.runtime.sendMessage({ action: 'checkConnection' }, response => {
            const status = document.getElementById('native-status');
            if (response && response.connected) {
                status.textContent = 'Connected';
                status.className = 'status-value connected';
            } else {
                status.textContent = 'Not configured';
                status.className = 'status-value disconnected';
            }
        });
    }
    
    checkNativeConnection();
    
    // Load case count
    chrome.storage.local.get(['processedCases'], (result) => {
        const count = result.processedCases ? result.processedCases.length : 0;
        document.getElementById('case-count').textContent = count;
    });
    
    // Test button
    document.getElementById('test-btn').addEventListener('click', () => {
        const log = document.getElementById('log');
        log.style.display = 'block';
        log.textContent = 'Running test mode...\n';
        
        chrome.runtime.sendMessage({
            action: 'sendToNative',
            data: { action: 'testMode' }
        }, response => {
            if (response) {
                log.textContent += 'Test complete! Check TEST-CASE-001 folder\n';
            } else {
                log.textContent += 'Native helper not configured for GitHub version\n';
            }
        });
    });
    
    // Setup button
    document.getElementById('setup-btn').addEventListener('click', () => {
        chrome.tabs.create({
            url: 'https://github.com/galenmassey/investors-ext-estates'
        });
    });
    
    // Clear storage button
    document.getElementById('clear-btn').addEventListener('click', () => {
        if (confirm('Clear all stored data?')) {
            chrome.storage.local.clear(() => {
                document.getElementById('case-count').textContent = '0';
                const log = document.getElementById('log');
                log.style.display = 'block';
                log.textContent = 'Storage cleared\n';
            });
        }
    });
});

// Open the extension Options page
document.getElementById('btn-open-options')?.addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options.html'));
  }
});