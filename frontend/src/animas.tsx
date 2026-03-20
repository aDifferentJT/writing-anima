import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import AnimaManager from './components/AnimaManager/AnimaManager';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <AnimaManager />
  </React.StrictMode>
);
