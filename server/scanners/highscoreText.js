const fs = require('fs');
const path = require('path');

// PINemHi / VPX-native highscore .txt files have no single standard layout — it
// varies by ROM, table script, and PINemHi version. This parser is deliberately
// forgiving: it walks every line, pulls out anything that looks like
// "(rank) INITIALS SCORE" and ignores lines it can't confidently parse (section
// headers like "GRAND CHAMPION", blank lines, etc).
//
// Line shapes this handles, among others:
//   1) ABC   123,456,780
//   2. DEF 98765430
//   BOB       1,234,560,000
//   3   GHI      765432100     04/12/24
// Note: the score group deliberately excludes whitespace as an internal
// separator (only digits/commas/periods) — otherwise it would greedily
// swallow a following field like a date ("987,654,320   04/12/24" must stop
// at the score, not eat the "04" too).
const SCORE_LINE_RE = /^\s*(?:(\d{1,2})[\.\)]?\s+)?([A-Z0-9]{2,5})\s+(\d[\d,.]{1,20}\d|\d{3,})\b(.*)$/;
const DATE_RE = /(\d{4}-\d{2}-\d{2})|(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/;

function parseScoreLine(line, fallbackRank) {
  const match = SCORE_LINE_RE.exec(line.trim());
  if (!match) return null;

  const [, rankStr, initials, scoreRaw, rest] = match;
  const score = Number(scoreRaw.replace(/[^\d]/g, ''));
  if (!Number.isFinite(score) || score <= 0) return null;

  // Filter out obvious false positives, e.g. a lone year or a short number that's
  // actually part of a header, by requiring at least 3 digits.
  if (String(score).length < 3) return null;

  const dateMatch = DATE_RE.exec(rest || '');
  const date = dateMatch ? dateMatch[0] : null;

  return {
    rank: rankStr ? Number(rankStr) : fallbackRank,
    initials: initials.toUpperCase(),
    score,
    date, // null if the source file didn't include one
  };
}

function parseHighscoreFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);

  const scores = [];
  let autoRank = 1;
  for (const line of lines) {
    const parsed = parseScoreLine(line, autoRank);
    if (parsed) {
      scores.push(parsed);
      autoRank += 1;
    }
  }

  const stat = fs.statSync(filePath);
  return { scores, fileModifiedAt: stat.mtime.toISOString() };
}

/**
 * Finds a highscore .txt file for the given table across the configured
 * directories, and parses it. PINemHi (and VPinMAME's nvram) names these
 * files after the ROM, not the VPX table filename, so an exact `<rom>.txt`
 * match is tried first when a ROM is known; fileBaseName fuzzy-matching is
 * the fallback for setups where highscore files are instead named after the
 * table itself.
 */
function findAndParseHighscores(fileBaseName, highscoreTextDirs, maxScores, rom) {
  for (const dir of highscoreTextDirs || []) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir);
    const lowerTarget = fileBaseName.toLowerCase();
    const lowerRom = rom ? rom.toLowerCase() : null;
    const match = entries.find((f) => {
      const base = f.replace(/\.txt$/i, '').toLowerCase();
      return base === lowerRom || base === lowerTarget || base.startsWith(lowerTarget);
    });
    if (!match) continue;

    try {
      const { scores, fileModifiedAt } = parseHighscoreFile(path.join(dir, match));
      return {
        scores: scores.slice(0, maxScores || 5),
        fileModifiedAt,
        sourceFile: path.join(dir, match),
      };
    } catch (err) {
      console.warn(`[highscoreText] Failed to parse ${match}: ${err.message}`);
    }
  }
  return { scores: [], fileModifiedAt: null, sourceFile: null };
}

module.exports = { findAndParseHighscores, parseScoreLine, parseHighscoreFile };
