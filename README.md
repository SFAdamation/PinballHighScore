# Pinball High Scores — Attract Display

A local web app that reads high scores off your Visual Pinball X / PinUP Popper
cabinet and cycles through them full-screen, using each table's own artwork as
the background — meant to be left open in a browser on a TV.

It runs as a small Node.js server **on the cabinet PC itself**, and any device
on your LAN (including the TV) opens a browser to it.

```
Cabinet PC ── runs this server ──> LAN ──> TV browser opens http://<cab-ip>:8080
```

## How it finds your data

PinUP Popper's file layout varies a bit by version, so nothing here is
hardcoded to a single install — it's all driven by `config.json`:

- **Game list + artwork filenames** — read from PinUP Popper's `PUPMaster.db`
  (SQLite). The scanner inspects the schema at runtime rather than assuming
  exact column names, since those differ across Popper versions.
- **High scores** — read from the `.txt` files PINemHi / Popper generate per
  table (score + initials). The parser is deliberately forgiving since these
  files aren't a standardized format.
- **Background images** — matched by filename from Popper's `POPMedia`
  folders (Backglass → Loading → Table, in that priority order, first one
  found wins).

### ⚠️ About the "date" of each score

Most arcade ROMs (and VPinMAME's nvram) were never designed to store a date —
only score and initials. So:

- If a table's highscore file happens to include a date, it's shown per-score.
- Otherwise, the display shows "*last updated*" using the high score file's
  last-modified timestamp instead — labeled as such, not presented as if it
  were the real score date. This is the honest limit of the underlying data,
  not something this app can invent around.

## Setup

### 1. Copy this project onto the cabinet PC

This was built on a different machine than your cab, so it needs to move
over. Copy the whole `pinball-highscores` folder to the cab — a
machine-neutral location works best, e.g.:

```
C:\PinballHighScores
```

(Avoid putting it under a specific user's profile folder like
`C:\Users\<name>\...` if the cab logs in as a different Windows account than
whoever sets this up — `C:\PinballHighScores` avoids that entirely.)

You don't need to copy `node_modules` — reinstall fresh on the cab (see next
step) so native modules match that machine.

### 2. Install Node.js on the cab (if not already there)

Download the LTS installer from https://nodejs.org and install it. Then, in
that folder:

```powershell
npm install
```

### 3. Find your real paths

Run the discovery helper **on the cab**:

```powershell
powershell -ExecutionPolicy Bypass -File discover-paths.ps1
```

It searches for `PUPMaster.db`, the `POPMedia` folders, and any
`HighScores` folders, and prints a sample of a real high score file so you
can see its format.

### 4. Configure

Copy `config.example.json` to `config.json` and edit the paths to match what
`discover-paths.ps1` printed. Key fields:

| Field | What it is |
|---|---|
| `pupMasterDbPath` | Full path to `PUPMaster.db` |
| `system` | Filter to one emulator/system name, e.g. `"Visual Pinball X"` |
| `highscoreTextDirs` | One or more folders to search for `<table>.txt` high score files |
| `mediaDirs` | Folders for backglass/table/loading/wheel images |
| `secondsPerGame` | How long each game's screen is shown before rotating |
| `onlyTablesWithScores` | Hide tables that have no parsed scores yet |

The server logs a warning at startup for any path in `config.json` that
doesn't exist, so you'll know quickly if something's off.

### 5. Run it

```powershell
npm start
```

or just double-click `start.bat`. You should see:

```
Pinball high scores running at http://localhost:8080
On the TV, browse to http://<this-PC's-LAN-IP>:8080
```

Find the cab's LAN IP with `ipconfig` if you don't already know it.

### 6. Keep it running automatically

So it survives reboots without you manually starting it:

1. Open **Task Scheduler** → Create Task.
2. Trigger: "At log on".
3. Action: Start a program → `C:\PinballHighScores\start.bat`.
4. Under Settings, uncheck anything that stops it after a few minutes.

### 7. Point the TV at it

On the TV (or a Fire TV Stick / Chromecast with a browser, Roku browser app,
etc.), open:

```
http://<cab-ip>:8080
```

For a clean look, use whatever "kiosk mode" / fullscreen the TV's browser
offers so there's no address bar. The page auto-cycles games on its own —
nothing else to click.

## Live updates

- Data is rescanned every `rescanIntervalSeconds` (default 60s), **and**
  immediately whenever a watched file changes (a new high score, a new table
  added in Popper) — so new scores show up without restarting the server.
- The browser polls for fresh data every 30s without interrupting whatever
  game is currently on screen.

## Project structure

```
server/
  index.js            Express app + routes
  config.js            Loads config.json (falls back to config.example.json)
  store.js             In-memory cache, rescan interval, file watcher
  scanner.js            Ties the scanners together into one result
  scanners/
    pupMasterDb.js       Reads the Popper SQLite database
    highscoreText.js      Parses PINemHi-style .txt high score files
    media.js               Resolves background/wheel image files
public/
  index.html, styles.css, app.js    The TV-facing display
config.example.json    Template — copy to config.json and edit
discover-paths.ps1     Run on the cab to find your real paths
start.bat               Double-click to launch
```

## Troubleshooting

- **"No high scores found yet"** on screen → check the server console for
  `[config] WARNING` lines; a path is likely wrong. Also confirm
  `onlyTablesWithScores` isn't hiding everything because no `.txt` files were
  matched — `discover-paths.ps1` prints a sample file's contents so you can
  sanity-check the parser is finding lines it recognizes.
- **No background image for a game** → its filename in `POPMedia` doesn't
  match the table's filename closely enough; the display still shows scores,
  just without art for that one table.
- **Scores look wrong / missing entries** → the `.txt` format for that
  particular table doesn't match the parser's patterns
  (`server/scanners/highscoreText.js`). Share a sample file and it can be
  extended.
