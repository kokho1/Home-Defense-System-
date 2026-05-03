import React from 'react';
import { Layout } from './components/Layout.jsx';
import { ControlPage } from './components/ControlPage.jsx';
import { HistoryPage } from './components/HistoryPage.jsx';
import { PasswordPage } from './components/Passwordpage.jsx';
import { FacesPage } from './components/FacesPage.jsx';

export function App({ page }) {
  return (
    <Layout page={page}>
      {page === 'history'  ? <HistoryPage />  :
       page === 'password' ? <PasswordPage /> :
       page === 'faces'    ? <FacesPage />    :
       <ControlPage />}
    </Layout>
  );
}
