import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  FileText, 
  Clock, 
  Edit3, 
  Trash2, 
  Copy,
  ArrowRight,
  Filter
} from 'lucide-react';
import projectService from '../../services/projectService';

const ProjectDashboard = ({ onSelectProject, onCreateProject }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'grid' or 'list'
  const [sortBy, setSortBy] = useState('lastAccessed'); // 'lastAccessed', 'created', 'title'

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setProjects(await projectService.getProjects());
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    try {
      const newProject = await projectService.createProject();
      
      setProjects(prev => [newProject, ...prev]);
      onCreateProject?.(newProject);
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };

  const handleDeleteProject = async (projectId, e) => {
    e.stopPropagation();
    
    if (window.confirm('Are you sure you want to delete this project?')) {
      try {
        await projectService.deleteProject(projectId);
        setProjects(prev => prev.filter(p => p.id !== projectId));
      } catch (error) {
        console.error('Error deleting project:', error);
      }
    }
  };

  const handleDuplicateProject = async (projectId, e) => {
    e.stopPropagation();
    
    try {
      const duplicatedProject = await projectService.duplicateProject(projectId);
      setProjects(prev => [duplicatedProject, ...prev]);
    } catch (error) {
      console.error('Error duplicating project:', error);
    }
  };

  const formatDate = (date) => {
    if (!date) return 'Unknown';
    
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    if (diffInMinutes < 10080) return `${Math.floor(diffInMinutes / 1440)}d ago`;
    
    return date.toLocaleDateString();
  };

  const formatPurpose = (purpose) => {
    if (!purpose) return 'No purpose defined';
    
    if (typeof purpose === 'object' && purpose !== null) {
      const parts = [];
      if (purpose.topic) parts.push(purpose.topic);
      if (purpose.context) parts.push(`(${purpose.context})`);
      return parts.join(' ') || 'No purpose defined';
    }
    
    return purpose;
  };

  const getPurposeSearchText = (purpose) => {
    if (!purpose) return '';
    
    if (typeof purpose === 'object' && purpose !== null) {
      return `${purpose.topic || ''} ${purpose.context || ''}`.toLowerCase();
    }
    
    return purpose.toLowerCase();
  };

  const filteredAndSortedProjects = projects
    .filter(project => 
      project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getPurposeSearchText(project.purpose).includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'created':
          return new Date(b.createdAt) - new Date(a.createdAt);
        case 'lastAccessed':
        default:
          return new Date(b.lastAccessedAt) - new Date(a.lastAccessedAt);
      }
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-obsidian-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-obsidian-accent-primary mx-auto mb-4"></div>
          <p className="text-obsidian-text-secondary">Loading your projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-obsidian-bg">
      <div className="mx-auto px-2 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-obsidian-text-primary">Projects</h1>
              <p className="text-xs text-obsidian-text-muted mt-0.5 mono">
                {projects.length} total
              </p>
            </div>

            <button
              onClick={handleCreateProject}
              className="obsidian-button-primary flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              New
            </button>
          </div>

          {/* Search and Controls */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-obsidian-text-muted w-3.5 h-3.5" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="obsidian-input w-full pl-8 pr-3"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="obsidian-input"
            >
              <option value="lastAccessed">Recent</option>
              <option value="created">Created</option>
              <option value="title">Title</option>
            </select>
          </div>
        </div>

        {/* Projects Grid/List */}
        {filteredAndSortedProjects.length === 0 ? (
          <div className="obsidian-panel p-12 text-center">
            <FileText className="w-8 h-8 text-obsidian-border mx-auto mb-3 opacity-40" />
            <h3 className="text-sm font-semibold text-obsidian-text-primary mb-1">
              {searchTerm ? 'No matches' : 'No projects'}
            </h3>
            <p className="text-xs text-obsidian-text-muted mb-4">
              {searchTerm
                ? 'Try different search terms'
                : 'Create your first project'}
            </p>
            {!searchTerm && (
              <button
                onClick={handleCreateProject}
                className="obsidian-button-primary text-xs"
              >
                Create Project
              </button>
            )}
          </div>
        ) : (
          <div className="obsidian-panel overflow-hidden">
            <table className="w-full">
              <thead className="bg-obsidian-bg border-b border-obsidian-border">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-obsidian-text-tertiary uppercase tracking-wide">
                    Project
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-obsidian-text-tertiary uppercase tracking-wide">
                    Purpose
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-obsidian-text-tertiary uppercase tracking-wide">
                    Modified
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-obsidian-text-tertiary uppercase tracking-wide">
                    Size
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-obsidian-text-tertiary uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-obsidian-border">
                {filteredAndSortedProjects.map((project) => (
                  <tr
                    key={project.id}
                    onClick={() => onSelectProject(project)}
                    className="hover:bg-obsidian-bg cursor-pointer transition-colors group"
                  >
                    <td className="px-3 py-2.5">
                      <div className="text-sm font-medium text-obsidian-text-primary group-hover:text-obsidian-accent-primary transition-colors">
                        {project.title}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs text-obsidian-text-secondary max-w-md truncate">
                        {formatPurpose(project.purpose) || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs text-obsidian-text-tertiary mono">
                        {formatDate(project.lastAccessedAt)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs text-obsidian-text-tertiary mono">
                        {(project.content?.length || 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleDuplicateProject(project.id, e)}
                          className="p-1 text-obsidian-text-muted hover:text-obsidian-accent-primary hover:bg-obsidian-accent-pale rounded transition-colors"
                          title="Duplicate"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteProject(project.id, e)}
                          className="p-1 text-obsidian-text-muted hover:text-red-600 hover:bg-red-50/50 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectDashboard;
