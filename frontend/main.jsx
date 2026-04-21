import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
 
const path = window.location.pathname;
const page = path === '/history' ? 'history' : path === '/password' ? 'password' : 'control';
const rootElement = document.getElementById('root');
const root = createRoot(rootElement);
 
root.render(
  <React.StrictMode>
    <App page={page} />
  </React.StrictMode>
);
