const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

let systemState = {
  armed: false,
  updatedAt: new Date().toISOString(),
};

let eventSequence = 0;

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(HISTORY_FILE);
  } catch {
    await fs.writeFile(HISTORY_FILE, '[]', 'utf8');
  }

  try {
    await fs.access(STATE_FILE);
  } catch {
    await fs.writeFile(
      STATE_FILE,
      JSON.stringify(systemState, null, 2),
      'utf8'
    );
  }
}

async function readJsonFile(filePath, fallbackValue) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return fallbackValue;
  }
}

async function readHistory() {
  await ensureDataFiles();
  const parsed = await readJsonFile(HISTORY_FILE, []);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((event) => event && typeof event.timestamp === 'string')
    .sort((left, right) => {
      const timeDelta = new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime();
      if (timeDelta !== 0) {
        return timeDelta;
      }

      return (right.id || 0) - (left.id || 0);
    });
}

async function writeHistory(history) {
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

async function readState() {
  await ensureDataFiles();
  const parsed = await readJsonFile(STATE_FILE, systemState);
  if (typeof parsed?.armed === 'boolean' && typeof parsed?.updatedAt === 'string') {
    return parsed;
  }

  return systemState;
}

async function writeState(state) {
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

async function setSystemState(armed) {
  if (systemState.armed === armed) {
    return false;
  }

  systemState = {
    armed,
    updatedAt: new Date().toISOString(),
  };

  await writeState(systemState);
  return true;
}

async function addHistoryEvent(action) {
  const history = await readHistory();
  const event = {
    id: Date.now() + eventSequence,
    action,
    status: systemState.armed ? 'ARMED' : 'DISARMED',
    timestamp: new Date().toISOString(),
  };

  eventSequence += 1;

  const cappedHistory = [event, ...history].slice(0, 200);
  await writeHistory(cappedHistory);

  return event;
}

async function clearHistory() {
  await writeHistory([]);
}

app.get('/api/status', (req, res) => {
  res.json(systemState);
});

app.get('/api/history', async (req, res) => {
  const history = await readHistory();
  res.json(history);
});

app.post('/api/arm', async (req, res) => {
  const changed = await setSystemState(true);

  if (!changed) {
    return res.json({ ok: true, state: systemState, event: null, changed: false });
  }

  const event = await addHistoryEvent('ARM_SYSTEM');
  res.json({ ok: true, state: systemState, event, changed: true });
});

app.post('/api/disarm', async (req, res) => {
  const changed = await setSystemState(false);

  if (!changed) {
    return res.json({ ok: true, state: systemState, event: null, changed: false });
  }

  const event = await addHistoryEvent('DISARM_SYSTEM');
  res.json({ ok: true, state: systemState, event, changed: true });
});

app.delete('/api/history', async (req, res) => {
  await clearHistory();
  res.json({ ok: true });
});

function renderAppShell(pageTitle) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${pageTitle}</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="/js/app.js"></script>
  </body>
</html>`;
}

app.get('/', (req, res) => {
  res.type('html').send(renderAppShell('Sentinel Home Defense'));
});

app.get('/history', (req, res) => {
  res.type('html').send(renderAppShell('Sentinel Home Defense - History'));
});

async function startServer() {
  systemState = await readState();

  app.listen(PORT, () => {
    console.log(`Home Defense site is running at http://localhost:${PORT}`);
  });
}

startServer();
