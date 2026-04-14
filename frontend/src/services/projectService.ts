import type { Project, EnrichedFeedbackItem } from '../types';
import type { ProjectSettings } from '../apiTypes';

const API_URL: string = import.meta.env.VITE_API_URL || window.location.origin;

interface ProjectUpdates {
  title?: string;
  description?: string;
  content?: string;
  feedback?: EnrichedFeedbackItem[];
  writing_criteria?: { criteria: string[] } | null;
  settings?: ProjectSettings;
  is_archived?: boolean;
}

/**
 * Service for managing user writing projects via the backend API
 */
class ProjectService {
  /**
   * Create a new writing project
   */
  async createProject(): Promise<Project> {
    try {
      const response = await fetch(`${API_URL}/api/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to create project");
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating project:', error);
      throw error;
    }
  }

  /**
   * Get all projects for a user
   */
  async getProjects(): Promise<Project[]> {
    try {
      const response = await fetch(`${API_URL}/api/projects`);

      if (!response.ok) {
        throw new Error("Failed to fetch projects");
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching user projects:', error);
      throw error;
    }
  }

  /**
   * Get a specific project by ID
   */
  async getProject(projectId: string): Promise<Project> {
    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}`);

      if (!response.ok) {
        throw new Error("Failed to fetch project");
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching project:', error);
      throw error;
    }
  }

  /**
   * Update a project
   */
  async updateProject(projectId: string, updates: ProjectUpdates): Promise<Project> {
    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error("Failed to update project");
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating project:', error);
      throw error;
    }
  }

  /**
   * Delete a project (archive it)
   */
  async deleteProject(projectId: string): Promise<void> {
    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete project");
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      throw error;
    }
  }

  /**
   * Permanently delete a project
   */
  async permanentlyDeleteProject(projectId: string): Promise<void> {
    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/permanent`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to permanently delete project");
      }
    } catch (error) {
      console.error('Error permanently deleting project:', error);
      throw error;
    }
  }

  /**
   * Update writing criteria for a project
   */
  async updateWritingCriteria(projectId: string, writing_criteria: { criteria: string[] }): Promise<Project> {
    return this.updateProject(projectId, { writing_criteria });
  }

  /**
   * Duplicate a project
   */
  async duplicateProject(projectId: string): Promise<Project> {
    try {
      const originalProject = await this.getProject(projectId);
      const newProject = await this.createProject();

      return await this.updateProject(newProject.id, {
        title: `${originalProject.title} (Copy)`,
        description: originalProject.description,
        content: originalProject.content,
        feedback: [],
        settings: originalProject.settings,
      });
    } catch (error) {
      console.error('Error duplicating project:', error);
      throw error;
    }
  }
}

// Export singleton instance
const projectService = new ProjectService();
export default projectService;
