import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';

const page = window.location.pathname === '/history' ? 'history' : 'control';
const rootElement = document.getElementById('root');
const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App page={page} />
  </React.StrictMode>
);
