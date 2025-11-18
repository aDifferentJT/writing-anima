import React, { useEffect, useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { Home, Target, Pen } from 'lucide-react';
import WritingInterface from './components/WritingInterface';
import projectService from './services/projectService';
import type { Project, EnrichedFeedbackItem } from './types';
import './index.css';

function Navigation({ project }: { project: Project }) {
  const handleBackToDashboard = () => {
    window.location.href = '/';
  };

  const handleSettings = () => {
    window.location.href = `/project/settings?id=${project.id}`;
  };

  return (
    <div className="bg-base-100 border-b border-base-300 px-2 py-2">
      <div className="mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handleBackToDashboard}
            className="flex items-center gap-1.5 text-base-content/70 hover:text-base-content transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            <span className="text-sm font-medium">Projects</span>
          </button>
          <span className="text-base-content/40 text-xs">/</span>
          <span className="text-base-content text-sm font-medium truncate max-w-xs">{project.title}</span>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={handleSettings}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors text-base-content/70 hover:text-base-content hover:bg-base-200"
          >
            <Target className="w-3 h-3" />
            <span>Settings</span>
          </button>

          <button
            disabled
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-primary/10 text-primary font-medium"
          >
            <Pen className="w-3 h-3" />
            <span>Editor</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectPage(): React.ReactElement {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastSavedContentRef = useRef<string>('');
  const currentProjectRef = useRef<Project | null>(null);

  const projectId = new URLSearchParams(window.location.search).get('id') || '';

  useEffect(() => {
    const loadProject = async () => {
      try {
        setIsLoading(true);
        const p = await projectService.getProject(projectId);
        setProject(p);
        lastSavedContentRef.current = p.content ?? '';
        currentProjectRef.current = p;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project');
      } finally {
        setIsLoading(false);
      }
    };

    loadProject();
  }, [projectId]);

  useEffect(() => {
    currentProjectRef.current = project;
  }, [project]);

  // Auto-save project content
  useEffect(() => {
    const autoSaveInterval = setInterval(async () => {
      const p = currentProjectRef.current;
      if (!p) return;
      const currentContent = p.content ?? '';
      if (currentContent === lastSavedContentRef.current) return;
      lastSavedContentRef.current = currentContent;
      try {
        await projectService.updateProject(p.id, { content: currentContent });
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 1000);

    return () => clearInterval(autoSaveInterval);
  }, []);

  const handleFeedbackGenerated = useCallback((newFeedback: EnrichedFeedbackItem[]): void => {
    setProject(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        feedback: [
          ...(prev.feedback ?? []),
          ...newFeedback,
        ],
      };
    });
  }, []);

  const handleBackToSettings = () => {
    window.location.href = `/project/settings?id=${projectId}`;
  };

  if (isLoading) {
    return <div className="h-screen flex items-center justify-center">Loading...</div>;
  }

  if (error || !project) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Error</h1>
          <p className="text-base-content/70">{error || 'Project not found'}</p>
          <button
            onClick={() => (window.location.href = '/')}
            className="btn btn-primary btn-sm mt-4"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-base-200 flex flex-col">
      <Navigation project={project} />
      <div className="flex-1 min-h-0">
        <WritingInterface
          feedback={project.feedback}
          setFeedback={(feedback) => setProject({ ...project, feedback })}
          onBackToSettings={handleBackToSettings}
          project={project}
          setProject={setProject}
          onFeedbackGenerated={handleFeedbackGenerated}
        />
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <ProjectPage />
  </React.StrictMode>
);
