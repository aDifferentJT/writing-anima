import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Pen, Target, Home } from 'lucide-react';
import ProjectDashboard from './components/Projects/ProjectDashboard';
import PurposeStep from './components/PurposeStep/PurposeStep';
import WritingInterface from './components/WritingInterface';
import projectService from './services/projectService';
import type { Project, EnrichedFeedbackItem, Purpose } from './types';

type AppMode = 'purpose' | 'writing';

interface NavigationProps {
  currentMode: AppMode;
  currentProject: Project | null;
  setCurrentMode: (mode: AppMode) => void;
  onBackToDashboard: () => void;
}

function Navigation({
  currentMode,
  currentProject,
  setCurrentMode,
  onBackToDashboard,
}: NavigationProps): React.ReactElement {
  const handleBackToDashboard = (): void => {
    onBackToDashboard();
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
          {currentProject && (
            <>
              <span className="text-base-content/40 text-xs">/</span>
              <span className="text-base-content text-sm font-medium truncate max-w-xs">{currentProject.title}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {currentProject && (
            <>
              <button
                onClick={() => setCurrentMode('purpose')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  currentMode === 'purpose'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-base-content/70 hover:text-base-content hover:bg-base-200'
                }`}
              >
                <Target className="w-3 h-3" />
                <span>Purpose</span>
              </button>

              <button
                onClick={() => setCurrentMode('writing')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  currentMode === 'writing'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-base-content/70 hover:text-base-content hover:bg-base-200'
                }`}
                disabled={currentProject.purpose.topic == ''}
              >
                <Pen className="w-3 h-3" />
                <span>Editor</span>
              </button>

            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface AppContentProps {
  currentProject: Project;
  setCurrentProject: React.Dispatch<React.SetStateAction<Project | null>>;
  isProjectSwitching: boolean;
  setIsProjectSwitching: (isProjectSwitching: boolean) => void;
}

function AppContent({
  currentProject,
  setCurrentProject,
  isProjectSwitching,
  setIsProjectSwitching,
}: AppContentProps): React.ReactElement {
  const [currentMode, setCurrentMode] = useState<AppMode>(currentProject.purpose.topic == '' ? 'purpose' : 'writing');
  const lastSavedContentRef = useRef<string>(currentProject.content ?? '');
  const currentProjectRef = useRef(currentProject);
  useEffect(() => {
    currentProjectRef.current = currentProject;
  }, [currentProject]);

  // Auto-save project content
  useEffect(() => {
    if (isProjectSwitching) return;

    const autoSaveInterval = setInterval(async () => {
      const project = currentProjectRef.current;
      const currentContent = project.content ?? '';
      if (currentContent === lastSavedContentRef.current) return;
      lastSavedContentRef.current = currentContent;
      try {
        await projectService.updateProject(project.id, { content: currentContent });
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 1000);

    return () => clearInterval(autoSaveInterval);
  }, [isProjectSwitching]);

  const handleBackToDashboard = useCallback(async (): Promise<void> => {
    setIsProjectSwitching(true);

    try {
      await projectService.updateProject(currentProject.id, {
        title: currentProject.purpose.topic.substring(0, 50) || currentProject.title,
      });
    } catch (error) {
      console.error('Failed to save project:', error);
    }

    setCurrentProject(null);
    setTimeout(() => setIsProjectSwitching(false), 100);
  }, [currentProject, setCurrentProject, setIsProjectSwitching]);

  const handlePurposeSubmit = async (purpose: Purpose): Promise<void> => {
    // Update current project with purpose
    await projectService.updateProject(currentProject.id, {
      purpose: purpose,
      // Generate title from purpose (handle both string and object formats)
      title: purpose.topic.substring(0, 50) || 'Untitled Project',
    });

    setCurrentMode('writing');
  };

  const handleBackToHome = (): void => {
    setCurrentMode('purpose');
  };

  const handleFeedbackGenerated = useCallback((newFeedback: EnrichedFeedbackItem[]): void => {
    setCurrentProject(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        feedback: [
          ...(prev.feedback ?? []),
          ...newFeedback,
        ],
      };
    });
  }, [setCurrentProject]);

  return (
    <div className="h-screen bg-base-200">
      <Navigation
        currentMode={currentMode}
        currentProject={currentProject}
        setCurrentMode={setCurrentMode}
        onBackToDashboard={handleBackToDashboard}
      />

      <div className={currentProject !== null ? 'h-[calc(100vh-80px)]' : 'h-screen'}>
        {currentMode === 'purpose' ? (
          <PurposeStep
            purpose={currentProject.purpose}
            setPurpose={(purpose) => setCurrentProject({ ...currentProject, purpose })}
            onSubmit={handlePurposeSubmit}
          />
        ) : currentMode === 'writing' ? (
          <WritingInterface
            feedback={currentProject.feedback}
            setFeedback={(feedback) => setCurrentProject({ ...currentProject, feedback })}
            onBackToPurpose={handleBackToHome}
            project={currentProject}
            setProject={setCurrentProject}
            writing_criteria={currentProject.writing_criteria}
            onFeedbackGenerated={handleFeedbackGenerated}
          />
        ) : null}
      </div>
    </div>
  );
}

function App(): React.ReactElement {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isProjectSwitching, setIsProjectSwitching] = useState<boolean>(false);

  const handleSelectProject = async (project: Project): Promise<void> => {
    setIsProjectSwitching(true);
    setCurrentProject(project);
    setTimeout(() => setIsProjectSwitching(false), 100);
  };

  const handleCreateProject = (project: Project): void => {
    setIsProjectSwitching(true);
    setCurrentProject(project);
    setTimeout(() => setIsProjectSwitching(false), 100);
  };

  if (currentProject == null) {
     return (
       <div className="h-screen bg-base-200">
         <div className='h-screen'>
           <ProjectDashboard
             onSelectProject={handleSelectProject}
             onCreateProject={handleCreateProject}
           />
         </div>
       </div>
     );
   } else {
     return (
       <AppContent
         currentProject={currentProject}
         setCurrentProject={setCurrentProject}
         isProjectSwitching={isProjectSwitching}
         setIsProjectSwitching={setIsProjectSwitching}
       />
     );
   }
}

export default App;
