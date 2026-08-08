const fs = require('fs');
const path = require('path');

// Fallback for cabinets where PinUP Popper's own ROM field was never filled
// in: every VPX table's script declares its ROM near the top (commonly
// `cGameName = "cc_13"` or `Controller.GameName = "cc_13"`), so we can read
// it straight out of the table file itself instead of relying on Popper's
// database. The script text lives inside the .vpx's OLE compound-file
// container, often UTF-16LE encoded — stripping null bytes turns that into
// plain ASCII a simple regex can match without needing a full OLE parser.
const ROM_PATTERNS = [
  /c(?:GameName|ROM)\s*=\s*"([A-Za-z0-9_]+)"/i,
  /Controller\.GameName\s*=\s*"([A-Za-z0-9_]+)"/i,
  /GameName\s*=\s*"([A-Za-z0-9_]+)"/i,
];
const NULL_BYTE_RE = new RegExp(String.fromCharCode(0), 'g');

// .vpx files can be tens of MB and rescans happen every ~60s — cache the
// extracted ROM per file path, invalidated by mtime, so we only read each
// table's bytes once until it's actually changed.
const cache = new Map(); // absolute path -> { mtimeMs, rom }

function extractRomFromBuffer(buf) {
  const text = buf.toString('latin1').replace(NULL_BYTE_RE, '');
  for (const re of ROM_PATTERNS) {
    const match = re.exec(text);
    if (match) return match[1];
  }
  return null;
}

// Some table authors (observed on VPW builds) alias cGameName to a
// PUP-pack-specific identifier with a "PUP" suffix used only for matching
// PUPVideos folder names — the actual VPinMAME ROM/nvram name is the same
// string with that suffix stripped. When we have the real nvram folder to
// check against, prefer whichever form actually has a matching .nv file, so
// this self-corrects instead of guessing blind.
function reconcileWithNvram(rom, nvramDir) {
  if (!rom || !nvramDir) return rom;
  const hasNvram = (name) => fs.existsSync(path.join(nvramDir, `${name}.nv`));
  if (hasNvram(rom)) return rom;
  if (/pup$/i.test(rom)) {
    const stripped = rom.replace(/pup$/i, '');
    if (hasNvram(stripped)) return stripped;
    // Table just hasn't been played yet (no .nv either way) — the stripped
    // form is still the better guess since the PUP suffix is a known alias
    // convention, not a real ROM name.
    return stripped;
  }
  return rom;
}

/**
 * Best-effort: scans a table's .vpx/.vpt file directly for its declared ROM
 * name. Returns null if the file doesn't exist or no pattern matched.
 * If nvramDir is given, reconciles against real .nv filenames on disk (see
 * reconcileWithNvram) to correct for PUP-pack alias suffixes.
 */
function resolveRomFromVpxFile(tablesDir, fileBaseName, nvramDir) {
  if (!tablesDir) return null;
  const filePath = ['.vpx', '.vpt']
    .map((ext) => path.join(tablesDir, fileBaseName + ext))
    .find((p) => fs.existsSync(p));
  if (!filePath) return null;

  const stat = fs.statSync(filePath);
  const cached = cache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.rom;

  let rom = null;
  try {
    rom = reconcileWithNvram(extractRomFromBuffer(fs.readFileSync(filePath)), nvramDir);
  } catch (err) {
    console.warn(`[romFromVpxFile] Failed to read ${filePath}: ${err.message}`);
  }
  cache.set(filePath, { mtimeMs: stat.mtimeMs, rom });
  return rom;
}

module.exports = { resolveRomFromVpxFile };
