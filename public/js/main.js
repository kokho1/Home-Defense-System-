const statusLabel = document.getElementById('statusLabel');
const updatedAt = document.getElementById('updatedAt');
const armBtn = document.getElementById('armBtn');
const disarmBtn = document.getElementById('disarmBtn');

function toLocalDate(isoTime) {
  return new Date(isoTime).toLocaleString();
}

function renderState(state) {
  const isArmed = Boolean(state.armed);
  statusLabel.textContent = isArmed ? 'ARMED' : 'DISARMED';
  statusLabel.classList.remove('armed', 'disarmed');
  statusLabel.classList.add(isArmed ? 'armed' : 'disarmed');
  updatedAt.textContent = `Last updated: ${toLocalDate(state.updatedAt)}`;

  armBtn.disabled = isArmed;
  disarmBtn.disabled = !isArmed;
}

async function getState() {
  const response = await fetch('/api/status');
  if (!response.ok) throw new Error('Failed to fetch system status.');
  return response.json();
}

async function setState(mode) {
  const response = await fetch(`/api/${mode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to ${mode} system.`);
  }

  const payload = await response.json();
  renderState(payload.state);
}

async function initialize() {
  try {
    const state = await getState();
    renderState(state);
  } catch (error) {
    statusLabel.textContent = 'ERROR';
    statusLabel.classList.add('disarmed');
    updatedAt.textContent = error.message;
  }
}

armBtn.addEventListener('click', async () => {
  await setState('arm');
});

disarmBtn.addEventListener('click', async () => {
  await setState('disarm');
});

initialize();
