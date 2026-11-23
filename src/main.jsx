import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import AuthPage from './AuthPage.jsx';
import './style.css';

const authModes = { '/login': 'login', '/register': 'signup', '/forgot-password': 'forgot' };
const path = window.location.pathname.replace(/\/+$/, '') || '/';

createRoot(document.getElementById('root')).render(
  authModes[path] ? <AuthPage initialMode={authModes[path]} /> : <App />
);
