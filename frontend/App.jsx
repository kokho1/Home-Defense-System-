import React from 'react';
import { Layout } from './components/Layout.jsx';
import { ControlPage } from './components/ControlPage.jsx';
import { HistoryPage } from './components/HistoryPage.jsx';

export function App({ page }) {
  return (
    <Layout page={page}>
      {page === 'history' ? <HistoryPage /> : <ControlPage />}
    </Layout>
  );
}
