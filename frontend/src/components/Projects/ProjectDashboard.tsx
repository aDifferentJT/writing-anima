import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  FileText,
  Trash2,
  Copy,
} from 'lucide-react';
import projectService from '../../services/projectService';
import type { Project } from '../../types';

interface ProjectDashboardProps {
  onSelectProject: (project: Project) => void;
  onCreateProject: (project: Project) => void;
}

const ProjectDashboard: React.FC<ProjectDashboardProps> = ({ onSelectProject, onCreateProject }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('lastAccessed'); // 'lastAccessed', 'created', 'title'

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
      const newProject: Project = await projectService.createProject();

      setProjects(prev => [newProject, ...prev]);
      onCreateProject(newProject);
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
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

  const handleDuplicateProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      const duplicatedProject: Project = await projectService.duplicateProject(projectId);
      setProjects(prev => [duplicatedProject, ...prev]);
    } catch (error) {
      console.error('Error duplicating project:', error);
    }
  };

  const formatDate = (date: string | Date | undefined): string => {
    if (!date) return 'Unknown';

    const dateObj = date instanceof Date ? date : new Date(date);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - dateObj.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    if (diffInMinutes < 10080) return `${Math.floor(diffInMinutes / 1440)}d ago`;

    return dateObj.toLocaleDateString();
  };

  const filteredAndSortedProjects = projects
    .filter(project =>
      project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (project.description || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'created':
          return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
        case 'lastAccessed':
        default:
          return new Date(b.last_accessed_at || '').getTime() - new Date(a.last_accessed_at || '').getTime();
      }
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-base-200">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-base-content/70">Loading your projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200">
      <div className="mx-auto px-2 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-base-content">Projects</h1>
              <p className="text-xs text-base-content/40 mt-0.5 mono">
                {projects.length} total
              </p>
            </div>

            <button
              onClick={handleCreateProject}
              className="btn btn-primary btn-sm flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              New
            </button>
          </div>

          {/* Search and Controls */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-base-content/40 w-3.5 h-3.5" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                className="input input-bordered input-sm w-full pl-8 pr-3"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSortBy(e.target.value)}
              className="select select-bordered select-sm"
            >
              <option value="lastAccessed">Recent</option>
              <option value="created">Created</option>
              <option value="title">Title</option>
            </select>
          </div>
        </div>

        {/* Projects Grid/List */}
        {filteredAndSortedProjects.length === 0 ? (
          <div className="card bg-base-100 border border-base-300 p-12 text-center">
            <FileText className="w-8 h-8 text-base-300 mx-auto mb-3 opacity-40" />
            <h3 className="text-sm font-semibold text-base-content mb-1">
              {searchTerm ? 'No matches' : 'No projects'}
            </h3>
            <p className="text-xs text-base-content/40 mb-4">
              {searchTerm
                ? 'Try different search terms'
                : 'Create your first project'}
            </p>
            {!searchTerm && (
              <button
                onClick={handleCreateProject}
                className="btn btn-primary btn-sm text-xs"
              >
                Create Project
              </button>
            )}
          </div>
        ) : (
          <div className="card bg-base-100 border border-base-300 overflow-hidden">
            <table className="w-full">
              <thead className="bg-base-200 border-b border-base-300">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-base-content/50 uppercase tracking-wide">
                    Project
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-base-content/50 uppercase tracking-wide">
                    Description
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-base-content/50 uppercase tracking-wide">
                    Modified
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-base-content/50 uppercase tracking-wide">
                    Size
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-base-content/50 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-300">
                {filteredAndSortedProjects.map((project) => (
                  <tr
                    key={project.id}
                    onClick={() => onSelectProject(project)}
                    className="hover:bg-base-200 cursor-pointer transition-colors group"
                  >
                    <td className="px-3 py-2.5">
                      <div className="text-sm font-medium text-base-content group-hover:text-primary transition-colors">
                        {project.title}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs text-base-content/70 max-w-md truncate">
                        {project.description || '\u2014'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs text-base-content/50 mono">
                        {formatDate(project.last_accessed_at)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs text-base-content/50 mono">
                        {(project.content?.length || 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e: React.MouseEvent) => handleDuplicateProject(project.id, e)}
                          className="p-1 text-base-content/40 hover:text-primary hover:bg-primary/10 rounded transition-colors"
                          title="Duplicate"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e: React.MouseEvent) => handleDeleteProject(project.id, e)}
                          className="p-1 text-base-content/40 hover:text-error hover:bg-error/10 rounded transition-colors"
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
