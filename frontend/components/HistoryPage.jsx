import React, { useEffect, useState } from 'react';

const PAGE_SIZE = 10;

function toLocalDate(isoTime) {
  return new Date(isoTime).toLocaleString();
}

function sortHistory(items) {
  return [...items].sort((left, right) => {
    const timeDelta = new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime();
    if (timeDelta !== 0) {
      return timeDelta;
    }

    return (right.id || 0) - (left.id || 0);
  });
}

export function HistoryPage() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [page, setPage] = useState(1);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    async function loadHistory() {
      const response = await fetch('/api/history');
      if (!response.ok) {
        throw new Error('Failed to load history.');
      }

      const payload = await response.json();
      setEvents(sortHistory(Array.isArray(payload) ? payload : []));
      setPage(1);
      setError('');
      setLoaded(true);
    }

    loadHistory().catch((err) => {
      setError(err.message);
      setLoaded(true);
    });
  }, []);

  async function clearHistory() {
    setClearing(true);
    setError('');
    setInfo('');

    try {
      const response = await fetch('/api/history', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to clear history.');
      }

      setEvents([]);
      setPage(1);
      setInfo('History cleared.');
      setShowDeleteModal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setClearing(false);
      setLoaded(true);
    }
  }

  const totalEvents = events.length;
  const totalPages = Math.max(1, Math.ceil(totalEvents / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const visibleEvents = events.slice(startIndex, startIndex + PAGE_SIZE);
  const startDisplay = totalEvents === 0 ? 0 : startIndex + 1;
  const endDisplay = totalEvents === 0 ? 0 : startIndex + visibleEvents.length;
  const showPager = totalPages > 1;

  return (
    <>
      <section className="card hero">
        <p className="eyebrow">Activity Log</p>
        <h2>Arm / Disarm History</h2>
        <p className="muted">Latest events appear first.</p>
      </section>

      <section className="card">
        <div className="history-actions">
          <button
            className="btn btn-secondary btn-small"
            onClick={() => setShowDeleteModal(true)}
            disabled={clearing || !loaded}
          >
            Delete History
          </button>
        </div>

        {!loaded && <p className="muted">Loading history...</p>}

        {loaded && error && <p className="muted empty-message">{error}</p>}

        {loaded && !error && info && <p className="muted empty-message">{info}</p>}

        {loaded && !error && events.length === 0 && (
          <p className="muted empty-message">
            No events yet. Arm or disarm the system to start tracking activity.
          </p>
        )}

        {loaded && !error && totalEvents > 0 && (
          <ul className="history-list">
            {visibleEvents.map((event) => {
              const armed = event.status === 'ARMED';
              return (
                <li key={event.id}>
                  <span className={`event-badge ${armed ? 'armed' : 'disarmed'}`}>
                    {event.action === 'ARM_SYSTEM'
                      ? 'System Armed'
                      : 'System Disarmed'}
                  </span>
                  <span className="muted">{toLocalDate(event.timestamp)}</span>
                </li>
              );
            })}
          </ul>
        )}

        {loaded && !error && showPager && (
          <div className="history-footer">
            <button
              className="btn btn-secondary btn-small pager-arrow"
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1 || totalEvents === 0}
              aria-label="Previous page"
            >
              ←
            </button>

            <span className="muted small-text pager-count">
              Showing {startDisplay}-{endDisplay} of {totalEvents}
            </span>

            <button
              className="btn btn-secondary btn-small pager-arrow"
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages || totalEvents === 0}
              aria-label="Next page"
            >
              →
            </button>
          </div>
        )}

        {loaded && !error && !showPager && totalEvents > 0 && (
          <div className="history-footer history-footer-single">
            <span className="muted small-text pager-count">
              Showing {startDisplay}-{endDisplay} of {totalEvents}
            </span>
          </div>
        )}
      </section>

      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => !clearing && setShowDeleteModal(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-label="Delete history confirmation" onClick={(event) => event.stopPropagation()}>
            <h3>Delete all history?</h3>
            <p className="muted">This will remove all arm/disarm notifications.</p>

            <div className="modal-actions">
              <button
                className="btn btn-secondary btn-small"
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={clearing}
              >
                Cancel
              </button>
              <button
                className="btn btn-disarm btn-small"
                type="button"
                onClick={clearHistory}
                disabled={clearing}
              >
                {clearing ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
