// Guards for safe execution
export class Guards {
  // Check if we're on the correct domain
  static isValidDomain() {
    const validDomains = [
      'portal-nc.tylertech.cloud',
      'tylertech.cloud'
    ];
    
    const hostname = window.location.hostname;
    return validDomains.some(domain => hostname.includes(domain));
  }
  
  // Safe element query
  static querySelector(selector, parent = document) {
    try {
      return parent.querySelector(selector);
    } catch (e) {
      console.error('Query selector error:', e);
      return null;
    }
  }
  
  // Safe element query all
  static querySelectorAll(selector, parent = document) {
    try {
      return Array.from(parent.querySelectorAll(selector));
    } catch (e) {
      console.error('Query selector all error:', e);
      return [];
    }
  }
  
  // Wait for element to appear
  static async waitForElement(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
      
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }
  
  // Safe text extraction
  static extractText(element) {
    if (!element) return '';
    try {
      return element.textContent.trim();
    } catch (e) {
      return '';
    }
  }
  
  // Safe attribute extraction
  static getAttribute(element, attribute) {
    if (!element) return null;
    try {
      return element.getAttribute(attribute);
    } catch (e) {
      return null;
    }
  }
}

export default Guards;

export function withLastError(promiseLike) {
  // Wrap a chrome.* promise (or thenable) and swallow runtime.lastError into a structured object.
  return Promise.resolve(promiseLike)
    .then((res) => ({ ok: true, res }))
    .catch((err) => {
      const msg = (chrome.runtime && chrome.runtime.lastError && chrome.runtime.lastError.message) || (err && err.message) || String(err);
      return { ok: false, error: msg };
    });
}
