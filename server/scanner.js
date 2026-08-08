const { scanPupMasterDb } = require('./scanners/pupMasterDb');
const { findAndParseHighscores } = require('./scanners/highscoreText');
const { resolveBackground, resolveWheel } = require('./scanners/media');
const { refreshHighscoresViaPinemhi } = require('./scanners/pinemhiRefresh');
const { resolveRomFromVpxFile } = require('./scanners/romFromVpxFile');

/**
 * Runs a full scan and returns the list of games with their scores + media,
 * ready to hand to the frontend. This is the single source of truth the API
 * and the watcher both call into.
 */
function runFullScan(config) {
  const games = scanPupMasterDb(config.pupMasterDbPath, config.system, {
    enabled: !!config.onlyFavoritesMostPlayedRecentlyPlayed,
    mostPlayedCount: config.mostPlayedCount,
    recentPlayedDays: config.recentPlayedDays,
  });

  // Popper's own ROM field is sometimes never filled in — fall back to
  // reading the ROM straight out of each table's .vpx script when that's
  // the case, rather than silently having no scores for that table.
  if (config.vpxTablesDir) {
    for (const game of games) {
      if (!game.rom) {
        game.rom = resolveRomFromVpxFile(config.vpxTablesDir, game.fileBaseName, config.vpinmameNvramDir);
      }
    }
  }

  if (config.pinemhiExePath) {
    refreshHighscoresViaPinemhi(
      config.pinemhiExePath,
      games.map((g) => g.rom),
      (config.highscoreTextDirs || [])[0]
    );
  }

  const results = games.map((game) => {
    const { scores, fileModifiedAt } = findAndParseHighscores(
      game.fileBaseName,
      config.highscoreTextDirs,
      config.maxScoresPerGame,
      game.rom
    );
    const background = resolveBackground(game.fileBaseName, config.mediaDirs, config.backgroundPriority);
    const wheel = resolveWheel(game.fileBaseName, config.mediaDirs);

    return {
      id: slugify(game.fileBaseName),
      displayName: game.displayName,
      fileBaseName: game.fileBaseName,
      scores,
      scoresApproximateDate: scores.length > 0 && scores.every((s) => !s.date) ? fileModifiedAt : null,
      hasBackground: !!background,
      backgroundType: background ? background.type : null,
      hasWheel: !!wheel,
    };
  });

  const filtered = config.onlyTablesWithScores
    ? results.filter((g) => g.scores.length > 0)
    : results;

  return {
    scannedAt: new Date().toISOString(),
    games: filtered,
    // Keep the full unfiltered list + raw media paths available internally for
    // the /media route to resolve files by id without re-scanning the disk.
    _internal: buildInternalIndex(games, config),
  };
}

function buildInternalIndex(games, config) {
  const index = new Map();
  for (const game of games) {
    const background = resolveBackground(game.fileBaseName, config.mediaDirs, config.backgroundPriority);
    const wheel = resolveWheel(game.fileBaseName, config.mediaDirs);
    index.set(slugify(game.fileBaseName), { background, wheel });
  }
  return index;
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

module.exports = { runFullScan, slugify };
