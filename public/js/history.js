const historyList = document.getElementById('historyList');
const historyEmpty = document.getElementById('historyEmpty');
const PAGE_SIZE = 20;
let allEvents = [];
let currentPage = 1;

const historyActions = document.createElement('div');
historyActions.className = 'history-actions';

const clearButton = document.createElement('button');
clearButton.className = 'btn btn-secondary btn-small';
clearButton.textContent = 'Delete History';
historyActions.appendChild(clearButton);

const footer = document.createElement('div');
footer.className = 'history-footer';

const countText = document.createElement('span');
countText.className = 'muted small-text';

const pagerControls = document.createElement('div');
pagerControls.className = 'pager-controls';

const prevButton = document.createElement('button');
prevButton.className = 'btn btn-secondary btn-small';
prevButton.textContent = '←';

const nextButton = document.createElement('button');
nextButton.className = 'btn btn-secondary btn-small';
nextButton.textContent = '→';

pagerControls.appendChild(prevButton);
pagerControls.appendChild(nextButton);
footer.appendChild(countText);
footer.appendChild(pagerControls);

if (historyList && historyList.parentElement) {
  historyList.parentElement.insertBefore(historyActions, historyList);
  historyList.parentElement.appendChild(footer);
}

function toLocalDate(isoTime) {
  return new Date(isoTime).toLocaleString();
}

function renderHistory(items) {
  allEvents = Array.isArray(items) ? items : [];

  const total = allEvents.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const visibleItems = allEvents.slice(startIndex, startIndex + PAGE_SIZE);

  historyList.innerHTML = '';

  if (!visibleItems.length && total === 0) {
    historyEmpty.hidden = false;
  } else {
    historyEmpty.hidden = true;
  }

  for (const event of visibleItems) {
    const li = document.createElement('li');

    const action = document.createElement('span');
    action.className = `event-badge ${event.status === 'ARMED' ? 'armed' : 'disarmed'}`;
    action.textContent = event.action === 'ARM_SYSTEM' ? 'System Armed' : 'System Disarmed';

    const date = document.createElement('span');
    date.className = 'muted';
    date.textContent = toLocalDate(event.timestamp);

    li.appendChild(action);
    li.appendChild(date);
    historyList.appendChild(li);
  }

  const startDisplay = total === 0 ? 0 : startIndex + 1;
  const endDisplay = total === 0 ? 0 : startIndex + visibleItems.length;
  countText.textContent = `Showing ${startDisplay}-${endDisplay} of ${total}`;

  prevButton.disabled = currentPage <= 1 || total === 0;
  nextButton.disabled = currentPage >= totalPages || total === 0;
}

async function loadHistory() {
  const response = await fetch('/api/history');
  if (!response.ok) {
    throw new Error('Failed to load history.');
  }

  const data = await response.json();
  renderHistory(data);
}

async function clearHistory() {
  const confirmed = window.confirm('Clear all history events?');
  if (!confirmed) return;

  clearButton.disabled = true;
  clearButton.textContent = 'Clearing...';

  try {
    const response = await fetch('/api/history', { method: 'DELETE' });
    if (!response.ok) {
      throw new Error('Failed to clear history.');
    }

    currentPage = 1;
    renderHistory([]);
    historyEmpty.hidden = false;
    historyEmpty.textContent = 'History cleared.';
  } catch (err) {
    historyEmpty.hidden = false;
    historyEmpty.textContent = err.message;
  } finally {
    clearButton.disabled = false;
    clearButton.textContent = 'Clear History';
  }
}

clearButton.addEventListener('click', () => {
  clearHistory();
});

prevButton.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage -= 1;
    renderHistory(allEvents);
  }
});

nextButton.addEventListener('click', () => {
  const totalPages = Math.max(1, Math.ceil(allEvents.length / PAGE_SIZE));
  if (currentPage < totalPages) {
    currentPage += 1;
    renderHistory(allEvents);
  }
});

loadHistory().catch((err) => {
  historyEmpty.hidden = false;
  historyEmpty.textContent = err.message;
});
