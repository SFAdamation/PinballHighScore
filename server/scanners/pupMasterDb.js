const fs = require('fs');

// PinUP Popper's PUPMaster.db schema has shifted across versions (Access-era .mdb
// exports vs. the newer SQLite PUPMaster.db). Rather than hardcode column names we
// might get wrong, we introspect the schema at runtime and pick sensible columns.

const NAME_COLUMN_CANDIDATES = ['GameDisplay', 'GameName', 'DisplayName', 'Name', 'TableName'];
const FILE_COLUMN_CANDIDATES = ['GameFileName', 'FileName', 'GameFile', 'TableFileName', 'Game'];
const SYSTEM_COLUMN_CANDIDATES = ['SystemName', 'System', 'Emulator', 'EmulatorName'];

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
 * Reads PUPMaster.db and returns a list of { displayName, fileBaseName } for each
 * table, optionally filtered to a given emulator/system name (e.g. "Visual Pinball X").
 */
function scanPupMasterDb(dbPath, systemFilter) {
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
    const systemCol = pickColumn(columns, SYSTEM_COLUMN_CANDIDATES);

    if (!fileCol) {
      console.warn(
        `[pupMasterDb] Could not identify a filename column in "${tableName}". ` +
        `Found columns: ${columns.join(', ')}`
      );
      return [];
    }

    const rows = db.prepare(`SELECT * FROM ${quoteIdent(tableName)}`).all();

    return rows
      .filter((row) => {
        if (!systemFilter || !systemCol) return true;
        const val = row[systemCol];
        return typeof val === 'string' && val.toLowerCase().includes(systemFilter.toLowerCase());
      })
      .map((row) => {
        const rawFile = row[fileCol];
        const rawName = nameCol ? row[nameCol] : null;
        if (!rawFile) return null;
        const fileBaseName = String(rawFile).replace(/\.(vpx|vpt)$/i, '');
        return {
          displayName: (rawName && String(rawName).trim()) || fileBaseName,
          fileBaseName,
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
