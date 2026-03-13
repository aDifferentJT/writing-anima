import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Project, FeedbackItem, Purpose } from '../types';

const API_URL: string = process.env.REACT_APP_API_URL || "http://localhost:8000";

interface ProjectUpdates {
  title?: string;
  purpose?: Purpose | null;
  content?: string;
  feedback?: FeedbackItem[];
  writingCriteria?: { criteria: string[] } | null;
  settings?: Record<string, unknown>;
  isArchived?: boolean;
}

/**
 * Service for managing user writing projects in Firestore
 */
class ProjectService {
  private unsubscribers: Map<string, () => void>;

  constructor() {
    this.unsubscribers = new Map(); // Track real-time listeners
  }

  /**
   * Create a new writing project
   */
  async createProject(): Promise<Project> {
    try {
      const response = await fetch(`${API_URL}/api/projects/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to create persona");
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
      const response = await fetch(`${API_URL}/api/projects/list`);

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
      const response = await fetch(`${API_URL}/api/projects/get?project_id=${projectId}`);

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
      const response = await fetch(`${API_URL}/api/projects/update?project_id=${projectId}`);

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
      const docRef = doc(db, 'projects', projectId);

      await updateDoc(docRef, {
        isArchived: true,
        updatedAt: serverTimestamp()
      });
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
      const docRef = doc(db, 'projects', projectId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error permanently deleting project:', error);
      throw error;
    }
  }

  /**
   * Update writing criteria for a project
   */
  async updateWritingCriteria(projectId: string, writingCriteria: { criteria: string[] }): Promise<Project> {
    try {
      const response = await fetch(`${API_URL}/api/projects/update?project_id=${projectId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ writingCriteria }),
      });

      if (!response.ok) {
        throw new Error("Failed to update writing criteria");
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating writing criteria:', error);
      throw error;
    }
  }

  /**
   * Duplicate a project
   */
  async duplicateProject(projectId: string): Promise<Project> {
    try {
      const originalProject = await this.getProject(projectId);

      const duplicatedProject: ProjectUpdates = {
        title: `${originalProject.title} (Copy)`,
        purpose: originalProject.purpose,
        content: originalProject.content,
        feedback: [], // Reset feedback for new project
        settings: originalProject.settings
      };

      return await this.createProject();
    } catch (error) {
      console.error('Error duplicating project:', error);
      throw error;
    }
  }
}

// Export singleton instance
const projectService = new ProjectService();
export default projectService;
