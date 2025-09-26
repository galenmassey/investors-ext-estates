// Logger utility for debugging
export class Logger {
  constructor(prefix = 'Extension') {
    this.prefix = prefix;
    this.enabled = true;
  }
  
  log(...args) {
    if (this.enabled) {
      console.log(`[${this.prefix}]`, ...args);
    }
  }
  
  error(...args) {
    console.error(`[${this.prefix}] ERROR:`, ...args);
  }
  
  warn(...args) {
    console.warn(`[${this.prefix}] WARN:`, ...args);
  }
  
  debug(...args) {
    if (this.enabled) {
      console.debug(`[${this.prefix}] DEBUG:`, ...args);
    }
  }
  
  group(label) {
    if (this.enabled) {
      console.group(`[${this.prefix}] ${label}`);
    }
  }
  
  groupEnd() {
    if (this.enabled) {
      console.groupEnd();
    }
  }
  
  table(data) {
    if (this.enabled) {
      console.table(data);
    }
  }
}

// Create default logger instance
export const logger = new Logger('Investors');
