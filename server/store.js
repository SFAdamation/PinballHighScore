const chokidar = require('chokidar');
const { runFullScan } = require('./scanner');

/**
 * Holds the latest scan result in memory and keeps it fresh via a periodic
 * rescan plus a debounced file watcher (so a new high score shows up quickly
 * without waiting for the full interval).
 */
class Store {
  constructor(config) {
    this.config = config;
    this.data = { scannedAt: null, games: [], _internal: new Map() };
    this._watcher = null;
    this._debounceTimer = null;
  }

  rescan() {
    try {
      this.data = runFullScan(this.config);
      console.log(`[store] Scanned: ${this.data.games.length} table(s) with scores at ${this.data.scannedAt}`);
    } catch (err) {
      console.error(`[store] Scan failed: ${err.message}`);
    }
    return this.data;
  }

  getGames() {
    return this.data.games;
  }

  getInternal(id) {
    return this.data._internal.get(id);
  }

  start() {
    this.rescan();

    const intervalMs = Math.max(10, this.config.rescanIntervalSeconds || 60) * 1000;
    this._interval = setInterval(() => this.rescan(), intervalMs);

    const watchPaths = [
      this.config.pupMasterDbPath,
      ...(this.config.highscoreTextDirs || []),
      ...Object.values(this.config.mediaDirs || {}),
    ].filter(Boolean);

    this._watcher = chokidar.watch(watchPaths, {
      ignoreInitial: true,
      depth: 0,
      awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 300 },
    });

    const debouncedRescan = () => {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this.rescan(), 1000);
    };

    this._watcher.on('add', debouncedRescan);
    this._watcher.on('change', debouncedRescan);
    this._watcher.on('unlink', debouncedRescan);
    this._watcher.on('error', (err) => console.warn(`[store] Watcher error: ${err.message}`));
  }

  stop() {
    clearInterval(this._interval);
    clearTimeout(this._debounceTimer);
    if (this._watcher) this._watcher.close();
  }
}

module.exports = { Store };
