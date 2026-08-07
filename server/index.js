const path = require('path');
const express = require('express');
const { loadConfig } = require('./config');
const { Store } = require('./store');

const config = loadConfig();
const store = new Store(config);
store.start();

const app = express();

app.get('/api/meta', (req, res) => {
  res.json({
    secondsPerGame: config.secondsPerGame || 10,
    scannedAt: store.data.scannedAt,
    gameCount: store.getGames().length,
  });
});

app.get('/api/games', (req, res) => {
  res.json(store.getGames());
});

app.get('/media/:id/:kind', (req, res) => {
  const { id, kind } = req.params;
  const entry = store.getInternal(id);
  const asset = entry ? entry[kind] : null; // kind: "background" | "wheel"
  if (!asset) return res.status(404).send('Not found');
  res.sendFile(asset.absolutePath);
});

app.use(express.static(path.join(__dirname, '..', 'public')));

const port = config.port || 8080;
app.listen(port, () => {
  console.log(`Pinball high scores running at http://localhost:${port}`);
  console.log(`On the TV, browse to http://<this-PC's-LAN-IP>:${port}`);
});

process.on('SIGINT', () => {
  store.stop();
  process.exit(0);
});
