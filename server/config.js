const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const EXAMPLE_PATH = path.join(__dirname, '..', 'config.example.json');

function loadConfig() {
  const source = fs.existsSync(CONFIG_PATH) ? CONFIG_PATH : EXAMPLE_PATH;
  if (!fs.existsSync(CONFIG_PATH)) {
    console.warn(
      `[config] No config.json found — falling back to config.example.json defaults.\n` +
      `[config] Copy config.example.json to config.json and edit it to match your cabinet's real paths.`
    );
  }
  const raw = fs.readFileSync(source, 'utf8');
  const config = JSON.parse(raw);

  // Basic sanity checks so misconfiguration fails loudly instead of silently showing nothing.
  const checks = [
    ['pupMasterDbPath', config.pupMasterDbPath],
    ...Object.entries(config.mediaDirs || {}).map(([k, v]) => [`mediaDirs.${k}`, v]),
  ];
  for (const [label, p] of checks) {
    if (p && !fs.existsSync(p)) {
      console.warn(`[config] WARNING: ${label} does not exist on disk: ${p}`);
    }
  }
  if (Array.isArray(config.highscoreTextDirs)) {
    const anyExists = config.highscoreTextDirs.some((d) => fs.existsSync(d));
    if (!anyExists) {
      console.warn(`[config] WARNING: none of the configured highscoreTextDirs exist yet.`);
    }
  }

  return config;
}

module.exports = { loadConfig, CONFIG_PATH };
