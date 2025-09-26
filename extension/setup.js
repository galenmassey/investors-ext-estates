// Setup page JavaScript
document.addEventListener('DOMContentLoaded', () => {
    // Get extension ID
    const extensionId = chrome.runtime.id;
    document.getElementById('extension-id').textContent = extensionId;
    
    // Test native connection
    document.getElementById('test-native').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'connectNative' }, response => {
            const status = document.getElementById('native-status');
            const results = document.getElementById('test-results');
            
            if (response && response.connected) {
                status.textContent = 'Connected';
                status.className = 'success';
                results.innerHTML = '<div class="success">✓ Native helper connected successfully!</div>';
            } else {
                status.textContent = 'Not connected';
                status.className = 'error';
                results.innerHTML = '<div class="error">✗ Failed to connect. Check installation steps.</div>';
            }
        });
    });
    
    // Test save function
    document.getElementById('test-save').addEventListener('click', () => {
        const results = document.getElementById('test-results');
        results.innerHTML = '<div class="warning">Testing save function...</div>';
        
        chrome.runtime.sendMessage({
            action: 'sendToNative',
            data: { action: 'testMode' }
        }, response => {
            if (response && (response.sent || response.queued)) {
                results.innerHTML = '<div class="success">✓ Test case saved! Check Estate File Downloads\\TEST-CASE-001</div>';
            } else {
                results.innerHTML = '<div class="error">✗ Failed to send test data</div>';
            }
        });
    });
    
    // Load checkbox states from storage
    chrome.storage.local.get(['setupChecklist'], (result) => {
        if (result.setupChecklist) {
            Object.keys(result.setupChecklist).forEach(key => {
                const checkbox = document.getElementById(key);
                if (checkbox) checkbox.checked = result.setupChecklist[key];
            });
        }
    });
    
    // Save checkbox states
    document.querySelectorAll('.checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            chrome.storage.local.get(['setupChecklist'], (result) => {
                const checklist = result.setupChecklist || {};
                checklist[checkbox.id] = checkbox.checked;
                chrome.storage.local.set({ setupChecklist: checklist });
            });
        });
    });
});