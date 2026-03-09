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

/**
 * Service for managing user writing projects in Firestore
 */
class ProjectService {
  constructor() {
    this.unsubscribers = new Map(); // Track real-time listeners
  }

  /**
   * Create a new writing project
   */
  async createProject(userId, projectData) {
    try {
      const project = {
        userId,
        title: projectData.title || 'Untitled Project',
        purpose: projectData.purpose || '',
        content: projectData.content || '',
        feedback: projectData.feedback || [],
        writingCriteria: projectData.writingCriteria || null,
        flows: projectData.flows || {
          currentFlow: null, // Current active flow definition
          savedFlows: {}     // Map of flowId -> flow definition
        },
        settings: {
          defaultAIProvider: 'openai',
          autoSaveInterval: 30000,
          enableRealTimeSync: true,
          ...projectData.settings
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastAccessedAt: serverTimestamp(),
        isArchived: false
      };

      const docRef = await addDoc(collection(db, 'projects'), project);
      
      return {
        id: docRef.id,
        ...project,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date()
      };
    } catch (error) {
      console.error('Error creating project:', error);
      throw error;
    }
  }

  /**
   * Get all projects for a user
   */
  async getUserProjects(userId) {
    try {
      // Simplified query without orderBy to avoid index requirement
      const q = query(
        collection(db, 'projects'),
        where('userId', '==', userId),
        where('isArchived', '==', false)
      );

      const querySnapshot = await getDocs(q);
      const projects = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        projects.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          lastAccessedAt: data.lastAccessedAt?.toDate() || new Date()
        });
      });

      // Sort in JavaScript instead of Firestore
      projects.sort((a, b) => new Date(b.lastAccessedAt) - new Date(a.lastAccessedAt));

      return projects;
    } catch (error) {
      console.error('Error fetching user projects:', error);
      throw error;
    }
  }

  /**
   * Get a specific project by ID
   */
  async getProject(projectId) {
    try {
      const docRef = doc(db, 'projects', projectId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('Project not found');
      }

      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        lastAccessedAt: data.lastAccessedAt?.toDate() || new Date()
      };
    } catch (error) {
      console.error('Error fetching project:', error);
      throw error;
    }
  }

  /**
   * Update a project
   */
  async updateProject(projectId, updates) {
    try {
      const docRef = doc(db, 'projects', projectId);
      
      const updateData = {
        ...updates,
        updatedAt: serverTimestamp(),
        lastAccessedAt: serverTimestamp()
      };

      await updateDoc(docRef, updateData);
      
      return await this.getProject(projectId);
    } catch (error) {
      console.error('Error updating project:', error);
      throw error;
    }
  }

  /**
   * Update just the content (for real-time sync)
   */
  async updateContent(projectId, content) {
    try {
      const docRef = doc(db, 'projects', projectId);
      
      await updateDoc(docRef, {
        content,
        updatedAt: serverTimestamp(),
        lastAccessedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating content:', error);
      throw error;
    }
  }

  /**
   * Delete a project (archive it)
   */
  async deleteProject(projectId) {
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
  async permanentlyDeleteProject(projectId) {
    try {
      const docRef = doc(db, 'projects', projectId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error permanently deleting project:', error);
      throw error;
    }
  }

  /**
   * Set up real-time listener for a project
   */
  subscribeToProject(projectId, callback) {
    const docRef = doc(db, 'projects', projectId);
    
    const unsubscribe = onSnapshot(docRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        const project = {
          id: docSnapshot.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          lastAccessedAt: data.lastAccessedAt?.toDate() || new Date()
        };
        callback(project);
      } else {
        callback(null);
      }
    }, (error) => {
      console.error('Error in project subscription:', error);
    });

    // Store unsubscriber for cleanup
    this.unsubscribers.set(projectId, unsubscribe);
    
    return unsubscribe;
  }

  /**
   * Clean up a real-time listener
   */
  unsubscribeFromProject(projectId) {
    const unsubscribe = this.unsubscribers.get(projectId);
    if (unsubscribe) {
      unsubscribe();
      this.unsubscribers.delete(projectId);
    }
  }

  /**
   * Clean up all real-time listeners
   */
  unsubscribeAll() {
    this.unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.unsubscribers.clear();
  }

  /**
   * Duplicate a project
   */
  async duplicateProject(projectId, userId) {
    try {
      const originalProject = await this.getProject(projectId);
      
      const duplicatedProject = {
        title: `${originalProject.title} (Copy)`,
        purpose: originalProject.purpose,
        content: originalProject.content,
        feedback: [], // Reset feedback for new project
        settings: originalProject.settings
      };

      return await this.createProject(userId, duplicatedProject);
    } catch (error) {
      console.error('Error duplicating project:', error);
      throw error;
    }
  }

  /**
   * Update writing criteria for a project
   */
  async updateWritingCriteria(projectId, criteria) {
    try {
      const docRef = doc(db, 'projects', projectId);
      await updateDoc(docRef, {
        writingCriteria: criteria,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating writing criteria:', error);
      throw error;
    }
  }

  /**
   * Update current flow (active flow definition)
   */
  async updateCurrentFlow(projectId, flowDefinition) {
    try {
      const docRef = doc(db, 'projects', projectId);
      await updateDoc(docRef, {
        'flows.currentFlow': flowDefinition,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating current flow:', error);
      throw error;
    }
  }

  /**
   * Save a named flow to the project's flow library
   */
  async saveNamedFlow(projectId, flowId, flowDefinition) {
    try {
      const docRef = doc(db, 'projects', projectId);
      await updateDoc(docRef, {
        [`flows.savedFlows.${flowId}`]: flowDefinition,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error saving named flow:', error);
      throw error;
    }
  }

  /**
   * Delete a saved flow from the project
   */
  async deleteSavedFlow(projectId, flowId) {
    try {
      const project = await this.getProject(projectId);
      const updatedFlows = { ...project.flows };
      if (updatedFlows.savedFlows) {
        delete updatedFlows.savedFlows[flowId];
      }

      const docRef = doc(db, 'projects', projectId);
      await updateDoc(docRef, {
        flows: updatedFlows,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error deleting saved flow:', error);
      throw error;
    }
  }

  /**
   * Get all flows for a project
   */
  async getFlows(projectId) {
    try {
      const project = await this.getProject(projectId);
      return project.flows || { currentFlow: null, savedFlows: {} };
    } catch (error) {
      console.error('Error getting flows:', error);
      throw error;
    }
  }
}

// Export singleton instance
const projectService = new ProjectService();
export default projectService;
