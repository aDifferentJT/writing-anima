import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import ProjectDashboard from './components/Projects/ProjectDashboard';

const root = ReactDOM.createRoot(document.getElementById('root')!);

function Index() {
  const handleSelectProject = (project: { id: string }) => {
    window.location.href = `/project?id=${project.id}`;
  };

  const handleCreateProject = (project: { id: string }) => {
    window.location.href = `/project/settings?id=${project.id}`;
  };

  return (
    <div className="h-screen bg-base-200">
      <div className="h-screen">
        <ProjectDashboard onSelectProject={handleSelectProject} onCreateProject={handleCreateProject} />
      </div>
    </div>
  );
}

root.render(
  <React.StrictMode>
    <Index />
  </React.StrictMode>
);
