import React, { useState, useEffect, useCallback } from 'react';
import { Pen, Target, Home, User, LogOut, Users } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthModal from './components/Auth/AuthModal';
import ProjectDashboard from './components/Projects/ProjectDashboard';
import PurposeStep from './components/PurposeStep/PurposeStep';
import WritingInterface from './components/WritingInterface';
import PersonaManager from './components/PersonaManager/PersonaManager';
import projectService from './services/projectService';

function AppContent() {
  const { currentUser, logout } = useAuth();
  const [currentMode, setCurrentMode] = useState('dashboard'); // 'dashboard' | 'home' | 'writing' | 'personas'
  const [currentProject, setCurrentProject] = useState(null);
  const [purpose, setPurpose] = useState('');
  const [content, setContent] = useState(''); // Lift content state to App level
  const [feedback, setFeedback] = useState([]); // Lift feedback state to App level
  const [writingCriteria, setWritingCriteria] = useState(null); // Store writing criteria
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');
  const [isMonitoring, setIsMonitoring] = useState(true); // Global monitoring state for agents
  const [isProjectSwitching, setIsProjectSwitching] = useState(false); // Prevent auto-save during project switch

  // Auto-save project content and feedback
  useEffect(() => {
    if (!currentProject || !currentUser || isProjectSwitching) return;

    const autoSaveInterval = setInterval(async () => {
      // Skip auto-save during project switching to prevent race conditions
      if (isProjectSwitching) return;

      const hasContentChanges = content !== currentProject.content;
      const hasFeedbackChanges = JSON.stringify(feedback) !== JSON.stringify(currentProject.feedback || []);
      
      // Check for writing criteria changes
      const hasCriteriaChanges = JSON.stringify(writingCriteria) !== JSON.stringify(currentProject.writingCriteria);
      
      if (hasContentChanges || hasFeedbackChanges || hasCriteriaChanges) {
        try {
          // Save writing criteria if they changed
          if (hasCriteriaChanges) {
            console.log('Auto-saving writing criteria');
            await projectService.updateWritingCriteria(currentProject.id, writingCriteria);
          }
          
          // Then save other project data
          await projectService.updateProject(currentProject.id, {
            content,
            feedback,
            purpose
          });
          
          // Update current project reference to avoid repeated saves
          setCurrentProject(prev => {
            if (!prev) return prev; // Guard against null
            return {
              ...prev,
              content,
              feedback: [...feedback],
              purpose,
              writingCriteria,
            };
          });
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      }
    }, 3000); // Auto-save every 3 seconds

    return () => clearInterval(autoSaveInterval);
  }, [currentProject, currentUser, content, feedback, purpose, writingCriteria, isProjectSwitching]);

  const handleSelectProject = async (project) => {
    try {
      // Safely handle null project
      if (!project) {
        console.error('[App] handleSelectProject called with null project');
        return;
      }

      console.log('[App] Loading project:', project.id);

      // Set flag to prevent auto-save during project switch
      setIsProjectSwitching(true);

      // Clear current state first to prevent race conditions
      setFeedback([]);
      setContent('');
      setPurpose('');
      setWritingCriteria(null);

      // Then load new project data
      setCurrentProject(project);
      setPurpose(project.purpose || '');
      setContent(project.content || '');
      setFeedback(project.feedback || []); // Load saved feedback
      setWritingCriteria(project.writingCriteria || null); // Load saved writing criteria
      
      setCurrentMode(project.purpose ? 'writing' : 'home');
      console.log('Project loaded successfully, mode set to:', project.purpose ? 'writing' : 'home');

      // Clear switching flag after a brief delay to ensure all state updates have propagated
      setTimeout(() => setIsProjectSwitching(false), 100);
    } catch (error) {
      console.error('Error in handleSelectProject:', error);
      // Still try to continue with basic project setup if project exists
      if (project) {
        setCurrentProject(project);
        setPurpose(project.purpose || '');
        setContent(project.content || '');
        setFeedback([]);
        setWritingCriteria(null); // Clear criteria for error state
        setCurrentMode('home');
      }
      // Clear switching flag on error as well
      setIsProjectSwitching(false);
    }
  };

  const handleCreateProject = (project) => {
    if (!project) {
      console.error('[App] handleCreateProject called with null project');
      return;
    }

    // Set flag to prevent auto-save during project creation
    setIsProjectSwitching(true);

    // Clear all state for new project
    setFeedback([]);
    setContent('');
    setPurpose('');
    setWritingCriteria(null);

    setCurrentProject(project);
    setCurrentMode('home');

    // Clear switching flag after state updates
    setTimeout(() => setIsProjectSwitching(false), 100);
  };

  const handlePurposeSubmit = async (purposeText) => {
    setPurpose(purposeText);

    // Generate title from purpose (handle both string and object formats)
    let projectTitle = 'Untitled Project';
    if (typeof purposeText === 'object' && purposeText !== null) {
      projectTitle = purposeText.topic?.substring(0, 50) || 'Untitled Project';
    } else if (typeof purposeText === 'string') {
      projectTitle = purposeText.split('.')[0].substring(0, 50) || 'Untitled Project';
    }

    // Update current project with purpose
    if (currentProject) {
      await projectService.updateProject(currentProject.id, {
        purpose: purposeText,
        title: projectTitle
      });
    }

    setCurrentMode('writing');
  };

  const handleBackToHome = () => {
    setCurrentMode(currentProject ? 'home' : 'dashboard');
  };

  const handleBackToDashboard = async () => {
    // Set flag to prevent auto-save during transition
    setIsProjectSwitching(true);

    // Save current project before going back
    if (currentProject && (content !== currentProject.content || purpose !== currentProject.purpose || JSON.stringify(feedback) !== JSON.stringify(currentProject.feedback || []))) {
      try {
        await projectService.updateProject(currentProject.id, {
          content,
          purpose,
          feedback, // Save current feedback
          title: typeof purpose === 'object' && purpose !== null
            ? (purpose.topic?.substring(0, 50) || currentProject.title)
            : (purpose?.split('.')[0].substring(0, 50) || currentProject.title)
        });
      } catch (error) {
        console.error('Failed to save project:', error);
      }
    }

    setCurrentMode('dashboard');
    setCurrentProject(null);
    setPurpose('');
    setContent('');
    setFeedback([]); // Clear feedback when leaving project
    setWritingCriteria(null); // Clear criteria when leaving project

    // Clear switching flag after state cleared
    setTimeout(() => setIsProjectSwitching(false), 100);
  };

  const handleLogout = async () => {
    try {
      await logout();
      setCurrentMode('dashboard');
      setCurrentProject(null);
      setPurpose('');
      setContent('');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Stable callback for feedback generation
  const handleFeedbackGenerated = useCallback((insights) => {
    const newFeedback = insights.map(insight => ({
      ...insight,
      id: insight.id || `flow-${Date.now()}-${Math.random()}`,
      timestamp: insight.timestamp || new Date().toISOString(),
      status: insight.status || 'active',
      source: 'flow' // Mark as coming from flow execution
    }));

    setFeedback(prev => [...prev, ...newFeedback]);
  }, []);

  // Show auth modal if not logged in
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-obsidian-bg flex items-center justify-center p-2">
        <div className="obsidian-panel p-8 max-w-sm w-full">
          <p className="text-sm text-obsidian-text-secondary mb-6">AI-powered writing feedback and analysis</p>

          <div className="space-y-2">
            <button
              onClick={() => { setAuthModalMode('login'); setAuthModalOpen(true); }}
              className="obsidian-button-primary w-full text-sm"
            >
              Sign In
            </button>
            <button
              onClick={() => { setAuthModalMode('signup'); setAuthModalOpen(true); }}
              className="obsidian-button-secondary w-full text-sm"
            >
              Create Account
            </button>
          </div>
        </div>

        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          initialMode={authModalMode}
        />
      </div>
    );
  }

  const renderNavigation = () => (
    <div className="bg-obsidian-surface border-b border-obsidian-border px-2 py-2">
      <div className="mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handleBackToDashboard}
            className="flex items-center gap-1.5 text-obsidian-text-secondary hover:text-obsidian-text-primary transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            <span className="text-sm font-medium">Projects</span>
          </button>
          {currentProject && (
            <>
              <span className="text-obsidian-text-muted text-xs">/</span>
              <span className="text-obsidian-text-primary text-sm font-medium truncate max-w-xs">{currentProject.title}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {currentProject && (
            <>
              <button
                onClick={() => setCurrentMode('home')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  currentMode === 'home'
                    ? 'bg-obsidian-accent-pale text-obsidian-accent-primary font-medium'
                    : 'text-obsidian-text-secondary hover:text-obsidian-text-primary hover:bg-obsidian-bg'
                }`}
              >
                <Target className="w-3 h-3" />
                <span>Purpose</span>
              </button>

              <button
                onClick={() => {
                  if (!purpose) {
                    setCurrentMode('home');
                  } else {
                    setCurrentMode('writing');
                  }
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  currentMode === 'writing'
                    ? 'bg-obsidian-accent-pale text-obsidian-accent-primary font-medium'
                    : 'text-obsidian-text-secondary hover:text-obsidian-text-primary hover:bg-obsidian-bg'
                }`}
                disabled={!purpose}
              >
                <Pen className="w-3 h-3" />
                <span>Editor</span>
              </button>

              <button
                onClick={() => setCurrentMode('personas')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  currentMode === 'personas'
                    ? 'bg-obsidian-accent-pale text-obsidian-accent-primary font-medium'
                    : 'text-obsidian-text-secondary hover:text-obsidian-text-primary hover:bg-obsidian-bg'
                }`}
              >
                <Users className="w-3 h-3" />
                <span>Animas</span>
              </button>
            </>
          )}

          <div className="h-4 w-px bg-obsidian-border mx-2"></div>

          <div className="flex items-center gap-1.5 text-xs text-obsidian-text-muted">
            <User className="w-3 h-3" />
            <span className="max-w-[120px] truncate">{currentUser.displayName || currentUser.email}</span>
          </div>

          <button
            onClick={handleLogout}
            className="p-1 text-obsidian-text-muted hover:text-obsidian-text-primary hover:bg-obsidian-bg rounded transition-colors ml-1"
            title="Sign out"
          >
            <LogOut className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {currentMode !== 'dashboard' && renderNavigation()}
      
      <div className={currentMode !== 'dashboard' ? 'h-[calc(100vh-80px)]' : 'h-screen'}>
        {currentMode === 'dashboard' ? (
          <ProjectDashboard 
            onSelectProject={handleSelectProject}
            onCreateProject={handleCreateProject}
          />
        ) : currentMode === 'home' ? (
          <PurposeStep
            purpose={purpose}
            setPurpose={setPurpose}
            onSubmit={handlePurposeSubmit}
          />
        ) : currentMode === 'writing' ? (
          <WritingInterface
            purpose={purpose}
            content={content}
            onContentChange={setContent}
            feedback={feedback}
            setFeedback={setFeedback}
            onBackToPurpose={handleBackToHome}
            project={currentProject}
            writingCriteria={writingCriteria}
            isMonitoring={isMonitoring}
            onToggleMonitoring={() => setIsMonitoring(!isMonitoring)}
            onFeedbackGenerated={handleFeedbackGenerated}
          />
        ) : currentMode === 'personas' ? (
          <PersonaManager />
        ) : (
          "Unknown Mode"
        )}
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
