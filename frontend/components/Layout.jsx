import React from 'react';

export function Layout({ page, children }) {
  return (
    <>
      <div className="bg-glow"></div>

      <header className="topbar container">
        <h1>Sentinel Home Defense</h1>
        <nav>
          <a className={page === 'control' ? 'active' : ''} href="/">
            Control
          </a>
          <a className={page === 'history' ? 'active' : ''} href="/history">
            History
          </a>
        </nav>
      </header>

      <main className="container">{children}</main>
    </>
  );
}
