const fs = require('fs');

// PinUP Popper's PUPMaster.db schema has shifted across versions (Access-era .mdb
// exports vs. the newer SQLite PUPMaster.db). Rather than hardcode column names we
// might get wrong, we introspect the schema at runtime and pick sensible columns.

const NAME_COLUMN_CANDIDATES = ['GameDisplay', 'GameName', 'DisplayName', 'Name', 'TableName'];
const FILE_COLUMN_CANDIDATES = ['GameFileName', 'FileName', 'GameFile', 'TableFileName', 'Game'];
// Direct system-name columns, used as a fallback for schema versions that don't
// split system into a separate Emulators table (see resolveSystemNames below).
const SYSTEM_COLUMN_CANDIDATES = ['SystemName', 'System', 'Emulator', 'EmulatorName'];
const ID_COLUMN_CANDIDATES = ['GameID', 'GameId', 'ID', 'Id'];
const EMU_ID_COLUMN_CANDIDATES = ['EMUID', 'EmuID', 'EmulatorID'];
const ROM_COLUMN_CANDIDATES = ['ROM', 'RomName', 'Rom'];

const DEFAULT_MOST_PLAYED_COUNT = 15;
const DEFAULT_RECENT_PLAYED_DAYS = 180;

function pickColumn(columns, candidates) {
  const lower = columns.map((c) => c.toLowerCase());
  for (const cand of candidates) {
    const idx = lower.indexOf(cand.toLowerCase());
    if (idx !== -1) return columns[idx];
  }
  return null;
}

function findGamesTable(db) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name);

  // Prefer a table literally called "Games"; otherwise anything containing "game".
  const exact = tables.find((t) => t.toLowerCase() === 'games');
  if (exact) return exact;
  const fuzzy = tables.find((t) => t.toLowerCase().includes('game'));
  return fuzzy || null;
}

/**
 * Newer PUPMaster/PUPDatabase schemas don't put the system name directly on the
 * Games row — instead Games.EMUID points at a separate Emulators table
 * (EMUID -> EmuName, e.g. 1 -> "Visual Pinball X", 4 -> "Future Pinball"). This
 * reads that table if present; callers fall back to SYSTEM_COLUMN_CANDIDATES
 * (a direct column on Games) for older schemas that don't have Emulators.
 */
function resolveEmulatorNamesById(db) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name);
  const emuTable = tables.find((t) => t.toLowerCase() === 'emulators');
  if (!emuTable) return null;

  const columns = db.prepare(`PRAGMA table_info(${quoteIdent(emuTable)})`).all().map((c) => c.name);
  const idCol = pickColumn(columns, EMU_ID_COLUMN_CANDIDATES);
  const nameCol = pickColumn(columns, ['EmuName', 'Name', 'Description']);
  if (!idCol || !nameCol) return null;

  const rows = db.prepare(`SELECT ${quoteIdent(idCol)} AS id, ${quoteIdent(nameCol)} AS name FROM ${quoteIdent(emuTable)}`).all();
  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * Reads per-game play stats (GamesStats.LastPlayed / NumberPlays) and favorite
 * flags (PlayListDetails.isFav) if those tables exist in this schema version.
 * Used to approximate Popper's built-in "Favorites" / "Most Played" /
 * "Recently Played" home-screen lists, since Popper computes those in its UI
 * rather than storing them as fixed playlist rows in the database.
 */
function resolvePlaylistStats(db) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name);

  const statsByGameId = new Map();
  const statsTable = tables.find((t) => t.toLowerCase() === 'gamesstats');
  if (statsTable) {
    for (const row of db.prepare(`SELECT GameID, LastPlayed, NumberPlays FROM ${quoteIdent(statsTable)}`).all()) {
      statsByGameId.set(row.GameID, { lastPlayed: row.LastPlayed, numberPlays: row.NumberPlays || 0 });
    }
  }

  const favoriteGameIds = new Set();
  const detailsTable = tables.find((t) => t.toLowerCase() === 'playlistdetails');
  if (detailsTable) {
    for (const row of db.prepare(`SELECT GameID FROM ${quoteIdent(detailsTable)} WHERE isFav = 1`).all()) {
      favoriteGameIds.add(row.GameID);
    }
  }

  return { statsByGameId, favoriteGameIds };
}

/**
 * Reads PUPMaster.db and returns a list of { displayName, fileBaseName } for each
 * table, optionally filtered to a given emulator/system name (e.g. "Visual Pinball X")
 * and to only games in Popper's Favorites / Most Played / Recently Played lists.
 *
 * playlistFilter: { enabled, mostPlayedCount = 15, recentPlayedDays = 180 }
 */
function scanPupMasterDb(dbPath, systemFilter, playlistFilter = {}) {
  if (!dbPath || !fs.existsSync(dbPath)) {
    console.warn(`[pupMasterDb] Database not found at ${dbPath}`);
    return [];
  }

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (err) {
    console.error('[pupMasterDb] better-sqlite3 is not installed. Run `npm install`.');
    return [];
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const tableName = findGamesTable(db);
    if (!tableName) {
      console.warn('[pupMasterDb] Could not find a "Games" table in PUPMaster.db.');
      return [];
    }

    const columns = db.prepare(`PRAGMA table_info(${quoteIdent(tableName)})`).all().map((c) => c.name);
    const nameCol = pickColumn(columns, NAME_COLUMN_CANDIDATES);
    const fileCol = pickColumn(columns, FILE_COLUMN_CANDIDATES);
    const idCol = pickColumn(columns, ID_COLUMN_CANDIDATES);
    const emuIdCol = pickColumn(columns, EMU_ID_COLUMN_CANDIDATES);
    const romCol = pickColumn(columns, ROM_COLUMN_CANDIDATES);
    // Direct system-name column on Games, used only as a fallback when this
    // schema has no separate Emulators table to join against.
    const systemCol = pickColumn(columns, SYSTEM_COLUMN_CANDIDATES);
    const emulatorNamesById = resolveEmulatorNamesById(db);

    if (!fileCol) {
      console.warn(
        `[pupMasterDb] Could not identify a filename column in "${tableName}". ` +
        `Found columns: ${columns.join(', ')}`
      );
      return [];
    }
    if (systemFilter && !emulatorNamesById && !systemCol) {
      console.warn(
        `[pupMasterDb] WARNING: system filter "${systemFilter}" is set, but neither an ` +
        `Emulators table nor a direct system column was found — every table will be ` +
        `included regardless of system.`
      );
    }

    const { statsByGameId, favoriteGameIds } = resolvePlaylistStats(db);
    const mostPlayedCount = playlistFilter.mostPlayedCount ?? DEFAULT_MOST_PLAYED_COUNT;
    const recentPlayedDays = playlistFilter.recentPlayedDays ?? DEFAULT_RECENT_PLAYED_DAYS;
    const recentCutoffMs = Date.now() - recentPlayedDays * 24 * 60 * 60 * 1000;
    const mostPlayedGameIds = new Set(
      [...statsByGameId.entries()]
        .filter(([, s]) => s.numberPlays > 0)
        .sort((a, b) => b[1].numberPlays - a[1].numberPlays)
        .slice(0, mostPlayedCount)
        .map(([gameId]) => gameId)
    );
    if (playlistFilter.enabled && statsByGameId.size === 0 && favoriteGameIds.size === 0) {
      console.warn(
        `[pupMasterDb] WARNING: playlistFilter is enabled, but no GamesStats/PlayListDetails ` +
        `data was found in this database — every table will be excluded.`
      );
    }

    const rows = db.prepare(`SELECT * FROM ${quoteIdent(tableName)}`).all();

    return rows
      .filter((row) => {
        if (!systemFilter) return true;
        const emuName = emuIdCol && emulatorNamesById ? emulatorNamesById.get(row[emuIdCol]) : null;
        if (emuName) return emuName.toLowerCase() === systemFilter.toLowerCase();
        if (!systemCol) return true;
        const val = row[systemCol];
        return typeof val === 'string' && val.toLowerCase().includes(systemFilter.toLowerCase());
      })
      .filter((row) => {
        if (!playlistFilter.enabled) return true;
        const gameId = idCol ? row[idCol] : null;
        if (gameId == null) return true; // can't match against stats without an id; don't hide the table
        if (favoriteGameIds.has(gameId)) return true;
        if (mostPlayedGameIds.has(gameId)) return true;
        const stats = statsByGameId.get(gameId);
        if (stats && stats.lastPlayed && new Date(stats.lastPlayed).getTime() >= recentCutoffMs) return true;
        return false;
      })
      .map((row) => {
        const rawFile = row[fileCol];
        const rawName = nameCol ? row[nameCol] : null;
        const rawRom = romCol ? row[romCol] : null;
        if (!rawFile) return null;
        const fileBaseName = String(rawFile).replace(/\.(vpx|vpt)$/i, '');
        return {
          displayName: (rawName && String(rawName).trim()) || fileBaseName,
          fileBaseName,
          rom: (rawRom && String(rawRom).trim()) || null,
        };
      })
      .filter(Boolean);
  } finally {
    db.close();
  }
}

function quoteIdent(name) {
  return '"' + name.replace(/"/g, '""') + '"';
}

module.exports = { scanPupMasterDb };
