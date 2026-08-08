const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Some PINemHi builds ("LeaderBoard" editions, roughly 2024+) dropped the
// classic behavior of writing a hi/<rom>.txt file per table — they only print
// scores to stdout (for an in-game popup) and optionally submit them online.
// Cabinets running one of those builds never get local .txt files written at
// all, no matter how the ROM monitor / frontend hooks are configured.
//
// Rather than depend on that, we invoke PINemHi ourselves for each known ROM
// and capture its stdout directly — it's the same human-readable format the
// classic file-writing versions used, so highscoreText.js's parser reads it
// unmodified. This runs once per rescan (see scanner.js), which is cheap for
// a cabinet's table count.

function refreshHighscoresViaPinemhi(pinemhiExePath, roms, outputDir) {
  if (!pinemhiExePath || !fs.existsSync(pinemhiExePath)) return;
  if (!outputDir) return;

  const uniqueRoms = [...new Set((roms || []).filter(Boolean))];
  if (uniqueRoms.length === 0) return;

  fs.mkdirSync(outputDir, { recursive: true });
  const exeDir = path.dirname(pinemhiExePath);

  for (const rom of uniqueRoms) {
    try {
      const output = execFileSync(pinemhiExePath, [rom], {
        cwd: exeDir,
        timeout: 5000,
        encoding: 'utf8',
        windowsHide: true,
      });
      // Empty output means PINemHi has no data for this ROM (unsupported,
      // never played, etc.) — leave any existing file alone rather than
      // overwrite it with nothing.
      if (output && output.trim().length > 0) {
        fs.writeFileSync(path.join(outputDir, `${rom}.txt`), output, 'utf8');
      }
    } catch (err) {
      console.warn(`[pinemhiRefresh] Failed to read scores for ROM "${rom}": ${err.message}`);
    }
  }
}

module.exports = { refreshHighscoresViaPinemhi };
