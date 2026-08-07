const fs = require('fs');
const path = require('path');

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];
const VIDEO_EXTS = ['.mp4', '.webm'];

/**
 * Finds the best background media file for a table within a single media
 * directory (e.g. Backglass), matching by file base name. Prefers still images
 * over video for a background (video is returned too, in case the frontend
 * wants to use it).
 */
function findMediaInDir(dir, fileBaseName) {
  if (!dir || !fs.existsSync(dir)) return null;
  const lowerTarget = fileBaseName.toLowerCase();
  const entries = fs.readdirSync(dir);

  const candidates = entries.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    if (![...IMAGE_EXTS, ...VIDEO_EXTS].includes(ext)) return false;
    const base = path.basename(f, ext).toLowerCase();
    return base === lowerTarget || base.startsWith(lowerTarget);
  });
  if (candidates.length === 0) return null;

  const image = candidates.find((f) => IMAGE_EXTS.includes(path.extname(f).toLowerCase()));
  const chosen = image || candidates[0];
  const ext = path.extname(chosen).toLowerCase();

  return {
    absolutePath: path.join(dir, chosen),
    type: IMAGE_EXTS.includes(ext) ? 'image' : 'video',
  };
}

/**
 * Resolves background media for a table across the configured mediaDirs, in
 * priority order (e.g. ["backglass", "loading", "table"]).
 */
function resolveBackground(fileBaseName, mediaDirs, priority) {
  for (const key of priority || Object.keys(mediaDirs || {})) {
    const found = findMediaInDir(mediaDirs[key], fileBaseName);
    if (found) return { ...found, source: key };
  }
  return null;
}

function resolveWheel(fileBaseName, mediaDirs) {
  return findMediaInDir(mediaDirs.wheel, fileBaseName);
}

module.exports = { resolveBackground, resolveWheel, findMediaInDir };
