// Values the app adds to the browser window, and constants injected at build time.
declare global {
  interface Window {
    DP_BUILD?: string;          // build stamp set by boot.js
  }
}
export {};
