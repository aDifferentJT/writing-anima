import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import Settings from './components/Settings/Settings';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <Settings />
  </React.StrictMode>
);
