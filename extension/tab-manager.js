// Tab management for NC eCourts - handles new tab navigation
console.log('NC eCourts Tab Manager Loaded');

// ========== TAB MANAGEMENT ==========
let resultsTabId = null;
let currentDetailTabId = null;

// Store the results tab when we're on it
function markResultsTab() {
  chrome.runtime.sendMessage({
    action: 'markResultsTab',
    tabId: 'current'
  });
}

// Process case in new tab approach
async function processNextCaseNewTab() {
  if (!isProcessing || currentProcessingIndex >= qualifiedCases.length) {
    log('INFO', 'Auto-processing complete');
    isProcessing = false;
    updateUI();
    return;
  }
  
  const currentCase = qualifiedCases[currentProcessingIndex];
  log('INFO', `Processing case ${currentProcessingIndex + 1}/${qualifiedCases.length}: ${currentCase.caseNumber}`);
  
  updateCaseList();
  
  // Human-like delay before clicking
  const readingTime = getRandomDelay(DELAYS.MIN_READING, DELAYS.MAX_READING);
  log('DEBUG', `Reading delay: ${readingTime}ms`);
  
  setTimeout(() => {
    simulateMouseMovement();
    
    setTimeout(() => {
      log('INFO', `Opening case ${currentCase.caseNumber} in new tab`);
      
      // Store state before opening new tab
      chrome.storage.local.set({
        autoProcessState: {
          qualifiedCases: qualifiedCases,
          currentIndex: currentProcessingIndex,
          isProcessing: true,
          resultsTabUrl: window.location.href
        }
      }, () => {
        // Click the link - it will open in a new tab
        if (currentCase.element) {
          currentCase.element.click();
          log('DEBUG', 'Clicked case link - should open in new tab');
        } else {
          log('ERROR', 'No element to click');
          currentProcessingIndex++;
          processNextCaseNewTab();
        }
      });
    }, getRandomDelay(DELAYS.MIN_BEFORE_CLICK, DELAYS.MAX_BEFORE_CLICK));
  }, readingTime);
}

// Handle being on a detail page (in new tab)
async function handleDetailPageInNewTab() {
  log('INFO', 'Processing detail page in new tab');
  
  // Extract the data
  const details = extractCaseDetails();
  
  // Send to native helper for saving
  chrome.runtime.sendMessage({
    action: 'sendToNative',
    data: {
      action: 'saveCase',
      caseNumber: details.caseNumber,
      details: details
    }
  });
  
  // Process documents with delays
  if (details.documents.length > 0) {
    log('INFO', `Downloading ${details.documents.length} documents...`);
    
    for (let i = 0; i < details.documents.length; i++) {
      const doc = details.documents[i];
      log('INFO', `Downloading document ${i + 1}/${details.documents.length}: ${doc.name}`);
      
      // Send document for download
      chrome.runtime.sendMessage({
        action: 'sendToNative',
        data: {
          action: 'downloadDocument',
          caseNumber: details.caseNumber,
          document: doc,
          index: i,
          total: details.documents.length
        }
      });
      
      // Human-like delay between downloads
      if (i < details.documents.length - 1) {
        const delay = getRandomDelay(DELAYS.MIN_BETWEEN_PDFS, DELAYS.MAX_BETWEEN_PDFS);
        log('DEBUG', `Waiting ${delay}ms before next document...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // Wait a bit before closing tab
  const finalDelay = getRandomDelay(DELAYS.MIN_BETWEEN_CASES, DELAYS.MAX_BETWEEN_CASES);
  log('INFO', `Waiting ${finalDelay}ms before closing tab and continuing...`);
  await new Promise(resolve => setTimeout(resolve, finalDelay));
  
  // Update state for next case
  chrome.storage.local.get('autoProcessState', (result) => {
    if (result.autoProcessState) {
      const state = result.autoProcessState;
      const nextIndex = state.currentIndex + 1;
      
      if (nextIndex < state.qualifiedCases.length) {
        // Update state for next case
        chrome.storage.local.set({
          autoProcessState: {
            ...state,
            currentIndex: nextIndex
          }
        }, () => {
          // Close this tab and go back to results
          log('INFO', 'Closing detail tab and returning to results');
          chrome.runtime.sendMessage({
            action: 'closeCurrentTabAndFocusResults'
          });
        });
      } else {
        // All done
        chrome.storage.local.remove('autoProcessState');
        log('INFO', 'All cases processed!');
        
        // Close this tab
        chrome.runtime.sendMessage({
          action: 'closeCurrentTab'
        });
      }
    }
  });
}

// Export functions
window.processNextCaseNewTab = processNextCaseNewTab;
window.handleDetailPageInNewTab = handleDetailPageInNewTab;
window.markResultsTab = markResultsTab;