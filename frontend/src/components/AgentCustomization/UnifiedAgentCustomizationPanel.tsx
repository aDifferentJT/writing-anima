/**
 * Unified Agent Customization Panel - Simplified
 * Single interface for managing user agents and templates
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Copy, Power, Settings,
  AlertCircle, CheckCircle,
  Layout, Edit3, X, Download, Upload
} from 'lucide-react';
import userAgentService from '../../services/userAgentService';
import type { UserAgent, AgentConfig } from '../../types';
import type { AgentTemplate } from '../../services/userAgentService';

interface UnifiedAgentCustomizationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAgentsUpdated: () => void;
}

export const UnifiedAgentCustomizationPanel: React.FC<UnifiedAgentCustomizationPanelProps> = ({
  isOpen,
  onClose,
  onAgentsUpdated
}) => {
  const [agents, setAgents] = useState<UserAgent[]>([]);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<UserAgent | null>(null);
  const [showTemplates, setShowTemplates] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editForm, setEditForm] = useState<AgentConfig>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const userAgents = userAgentService.getAllAgents();
      const availableTemplates = userAgentService.getTemplates();

      setAgents(userAgents);
      setTemplates(availableTemplates);

      // Auto-select first agent if none selected
      if (!selectedAgent && userAgents.length > 0) {
        setSelectedAgent(userAgents[0]);
      }

    } catch (err) {
      console.error('Failed to load agents:', err);
      setError('Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, [selectedAgent]);

  // Load data
  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  const handleCreateAgent = (templateId: string | null = null): void => {
    if (templateId) {
      // Create from template
      const template = templates.find(t => t.id === templateId);
      setEditForm({
        name: template!.name,
        description: template!.description,
        category: template!.category,
        icon: template!.icon,
        defaultTier: template!.defaultTier,
        capabilities: template!.capabilities,
        responseFormat: template!.responseFormat,
        prompt: template!.basePrompt,
        enabled: true,
        templateId: templateId
      });
    } else {
      // Create from scratch
      setEditForm({
        name: 'New Agent',
        description: 'Custom analysis agent',
        category: 'custom',
        icon: '🤖',
        defaultTier: 'fast',
        capabilities: [],
        responseFormat: 'general_analysis',
        prompt: `You are an AI analysis assistant. Analyze the text and provide insights about its effectiveness, clarity, or other relevant aspects.`,
        enabled: true
      });
    }

    setIsEditing(true);
    setSelectedAgent(null);
    setShowTemplates(false);
  };

  const handleSaveAgent = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      if (selectedAgent) {
        // Update existing agent
        await userAgentService.updateAgent(selectedAgent.id, editForm);
        setSuccess('Agent updated successfully');
      } else {
        // Create new agent
        const newAgent = await userAgentService.createAgent(editForm);
        setSelectedAgent(newAgent);
        setSuccess('Agent created successfully');
      }

      setIsEditing(false);
      await loadData();

      // Notify parent about agent changes
      onAgentsUpdated();

    } catch (err) {
      console.error('Failed to save agent:', err);
      setError('Failed to save agent: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAgent = async (agentId: string): Promise<void> => {
    // Create custom confirmation dialog to bypass blocked browser popups
    const confirmed = await new Promise<boolean>((resolve) => {
      const dialog = document.createElement('div');
      dialog.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
      dialog.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-sm mx-4">
          <h3 class="text-lg font-semibold mb-4">Delete Agent</h3>
          <p class="text-base-content/70 mb-6">Are you sure you want to delete this agent? This action cannot be undone.</p>
          <div class="flex justify-end gap-3">
            <button id="cancel-delete" class="px-4 py-2 text-base-content/70 hover:text-base-content">Cancel</button>
            <button id="confirm-delete" class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);

      (dialog.querySelector('#cancel-delete') as HTMLElement).onclick = () => {
        document.body.removeChild(dialog);
        resolve(false);
      };

      (dialog.querySelector('#confirm-delete') as HTMLElement).onclick = () => {
        document.body.removeChild(dialog);
        resolve(true);
      };

      // Close on background click
      dialog.onclick = (e: MouseEvent) => {
        if (e.target === dialog) {
          document.body.removeChild(dialog);
          resolve(false);
        }
      };
    });

    if (!confirmed) return;

    try {
      setLoading(true);
      console.log('[UnifiedAgentPanel] Deleting agent:', agentId);
      const result = await userAgentService.deleteAgent(agentId);
      console.log('[UnifiedAgentPanel] Delete result:', result);

      if (selectedAgent && selectedAgent.id === agentId) {
        setSelectedAgent(null);
      }

      await loadData();
      setSuccess('Agent deleted successfully');

      onAgentsUpdated();

    } catch (err) {
      console.error('Failed to delete agent:', err);
      setError('Failed to delete agent: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAgent = async (agentId: string, enabled: boolean): Promise<void> => {
    try {
      await userAgentService.toggleAgent(agentId, enabled);
      await loadData();

      // Update selected agent if it's the one being toggled
      if (selectedAgent && selectedAgent.id === agentId) {
        setSelectedAgent({ ...selectedAgent, enabled });
      }

      onAgentsUpdated();

    } catch (err) {
      console.error('Failed to toggle agent:', err);
      setError('Failed to toggle agent');
    }
  };

  const handleCloneAgent = async (agentId: string): Promise<void> => {
    try {
      const clonedAgent = await userAgentService.cloneAgent(agentId);
      setSelectedAgent(clonedAgent);
      await loadData();
      setSuccess('Agent cloned successfully');

      onAgentsUpdated();
    } catch (err) {
      console.error('Failed to clone agent:', err);
      setError('Failed to clone agent');
    }
  };

  const handleExportAgent = async (agentId: string): Promise<void> => {
    try {
      const exportData = userAgentService.exportAgent(agentId);
      const agent = agents.find(a => a.id === agentId);

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${agent?.name?.replace(/[^a-z0-9]/gi, '_') || 'agent'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess('Agent exported successfully');
    } catch (err) {
      console.error('Failed to export agent:', err);
      setError('Failed to export agent');
    }
  };

  const handleExportAllAgents = async (): Promise<void> => {
    try {
      const exportData = userAgentService.exportAllAgents();

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `all-agents-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess(`Exported ${exportData.totalAgents} agents successfully`);
    } catch (err) {
      console.error('Failed to export all agents:', err);
      setError('Failed to export agents');
    }
  };

  const handleImportAgent = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const config = JSON.parse(text);

      // Check if it's a bulk export (multiple agents) or single agent
      if (config.agents && Array.isArray(config.agents)) {
        // Bulk import
        const results = await userAgentService.importMultipleAgents(config);
        await loadData();

        let message = `Imported ${results.imported.length} agent(s) successfully`;
        if (results.errors.length > 0) {
          message += `. ${results.errors.length} failed: ${results.errors.map((e: { agentName: string; error: string }) => e.agentName).join(', ')}`;
        }
        setSuccess(message);

        // Select first imported agent
        if (results.imported.length > 0) {
          setSelectedAgent(results.imported[0]);
        }
      } else {
        // Single agent import
        const importedAgent = await userAgentService.importAgent(config);
        setSelectedAgent(importedAgent);
        await loadData();
        setSuccess(`Agent "${importedAgent.name}" imported successfully`);
      }

      onAgentsUpdated();
    } catch (err) {
      console.error('Failed to import agent(s):', err);
      setError((err as Error).message || 'Failed to import agent(s). Please check the file format.');
    }

    // Reset file input
    event.target.value = '';
  };

  const handleEditAgent = (agent: UserAgent): void => {
    setSelectedAgent(agent);
    setEditForm({
      name: agent.name,
      description: agent.description,
      category: agent.category,
      icon: agent.icon,
      defaultTier: agent.defaultTier,
      capabilities: agent.capabilities || [],
      responseFormat: agent.responseFormat,
      prompt: agent.prompt,
      enabled: agent.enabled
    });
    setIsEditing(true);
    setShowTemplates(false);
  };

  const getTierBadgeColor = (tier: string): string => {
    const colors: Record<string, string> = {
      fast: 'bg-base-200 text-gray-700',
      standard: 'bg-base-200 text-gray-700',
      premium: 'bg-base-200 text-gray-700'
    };
    return colors[tier] || 'bg-base-200 text-gray-700';
  };

  // Clear messages after 5 seconds
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  const content = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-base-300">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-base-content">Agent Management</h2>
            <p className="text-sm text-base-content/70 mt-1">
              Create and manage your analysis agents
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-base-content/40 hover:text-base-content transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Error/Success Messages */}
      {(error || success) && (
        <div className="mx-6 mt-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {success}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Agent List */}
        <div className="w-1/3 border-r border-base-300 flex flex-col">
          {/* Action Buttons */}
          <div className="p-4 border-b border-base-300 space-y-2">
            <button
              onClick={() => handleCreateAgent()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 btn btn-primary rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Create New Agent
            </button>
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
            >
              <Layout className="w-4 h-4" />
              {showTemplates ? 'Hide Templates' : 'Use Template'}
            </button>
            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={handleImportAgent}
                className="hidden"
                id="import-agent-input"
              />
              <button
                onClick={() => document.getElementById('import-agent-input')!.click()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
              >
                <Upload className="w-4 h-4" />
                Import Agents
              </button>
            </div>
            <button
              onClick={handleExportAllAgents}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
              disabled={agents.length === 0}
            >
              <Download className="w-4 h-4" />
              Export All ({agents.length})
            </button>
          </div>

          {/* Templates Section */}
          {showTemplates && (
            <div className="border-b border-base-300">
              <div className="p-3 bg-green-50">
                <h3 className="font-medium text-green-900 text-sm">Available Templates</h3>
                <p className="text-xs text-green-700 mt-1">Click to create agent from template</p>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {templates.map(template => (
                  <div
                    key={template.id}
                    className="p-3 cursor-pointer hover:bg-green-50 border-b border-green-100"
                    onClick={() => handleCreateAgent(template.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{template.icon}</span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-base-content text-sm truncate">{template.name}</h4>
                        <p className="text-xs text-base-content/70 mt-1 line-clamp-2">{template.description}</p>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${getTierBadgeColor(template.defaultTier)}`}>
                          {template.defaultTier}
                        </span>
                      </div>
                      <Plus className="w-4 h-4 text-green-600" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User Agents List */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 bg-primary/10 border-b border-primary/20">
              <h3 className="font-medium text-primary text-sm">My Agents ({agents.length})</h3>
            </div>

            {agents.length === 0 ? (
              <div className="p-8 text-center text-base-content/50">
                <Settings className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No agents created yet</p>
                <p className="text-xs">Create your first agent</p>
              </div>
            ) : (
              <div className="divide-y divide-base-300">
                {agents.map(agent => (
                  <div
                    key={agent.id}
                    className={`p-4 cursor-pointer hover:bg-base-200 ${
                      selectedAgent?.id === agent.id ? 'bg-primary/10 border-r-2 border-primary' : ''
                    }`}
                    onClick={() => {
                      setSelectedAgent(agent);
                      setShowTemplates(false);
                      setIsEditing(false);
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{agent.icon}</span>
                          <h4 className="font-medium text-base-content text-sm">{agent.name}</h4>
                          <button
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              handleToggleAgent(agent.id, !agent.enabled);
                            }}
                            className={`flex items-center justify-center w-5 h-5 rounded-full transition-colors ${
                              agent.enabled
                                ? 'bg-green-500 hover:bg-green-600 text-white'
                                : 'bg-base-300 hover:bg-base-300 text-base-content/70'
                            }`}
                            title={agent.enabled ? 'Disable agent' : 'Enable agent'}
                          >
                            <Power className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-xs text-base-content/70 mt-1 line-clamp-2">{agent.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTierBadgeColor(agent.defaultTier)}`}>
                            {agent.defaultTier}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            agent.enabled ? 'bg-base-200 text-gray-700' : 'bg-gray-200 text-base-content/70'
                          }`}>
                            {agent.enabled ? 'Active' : 'Inactive'}
                          </span>
                          <span className="text-xs text-base-content/50">
                            {agent.usageCount || 0} uses
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 ml-2">
                        <button
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            handleEditAgent(agent);
                          }}
                          className="p-1 text-base-content/40 hover:text-primary text-sm"
                          title="Edit"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            handleCloneAgent(agent.id);
                          }}
                          className="p-1 text-base-content/40 hover:text-base-content text-sm"
                          title="Clone"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            handleExportAgent(agent.id);
                          }}
                          className="p-1 text-base-content/40 hover:text-primary text-sm"
                          title="Export Agent"
                        >
                          <Download className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            handleDeleteAgent(agent.id);
                          }}
                          className="p-1 text-base-content/40 hover:text-red-600 text-sm"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Agent Editor/Details */}
        <div className="flex-1 flex flex-col">
          {isEditing ? (
            <>
              {/* Edit Header */}
              <div className="p-6 border-b border-base-300">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-base-content">
                    {selectedAgent ? 'Edit Agent' : 'Create Agent'}
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setEditForm({});
                      }}
                      className="px-3 py-1 text-base-content/70 hover:text-base-content text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveAgent}
                      disabled={loading}
                      className="px-4 py-2 btn btn-primary rounded-lg disabled:cursor-not-allowed"
                    >
                      {loading ? 'Saving...' : 'Save Agent'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Edit Form */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                      <input
                        type="text"
                        value={editForm.name || ''}
                        onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                        className="input input-bordered w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Icon</label>
                      <input
                        type="text"
                        value={editForm.icon || ''}
                        onChange={(e) => setEditForm({...editForm, icon: e.target.value})}
                        className="input input-bordered w-full"
                        placeholder="🤖"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <input
                      type="text"
                      value={editForm.description || ''}
                      onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                      className="input input-bordered w-full"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                      <select
                        value={editForm.category || ''}
                        onChange={(e) => setEditForm({...editForm, category: e.target.value})}
                        className="input input-bordered w-full"
                      >
                        <option value="custom">Custom</option>
                        <option value="writing">Writing</option>
                        <option value="logic">Logic</option>
                        <option value="research">Research</option>
                        <option value="strategy">Strategy</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Default Tier</label>
                      <select
                        value={editForm.defaultTier || ''}
                        onChange={(e) => setEditForm({...editForm, defaultTier: e.target.value})}
                        className="input input-bordered w-full"
                      >
                        <option value="fast">Fast (GPT-4o-mini)</option>
                        <option value="standard">Standard (GPT-4o)</option>
                        <option value="premium">Premium (GPT-4)</option>
                      </select>
                    </div>
                  </div>

                  {/* Prompt Editor - The Main Feature */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Agent Prompt
                      <span className="text-xs text-base-content/50 ml-2">
                        <br></br>• Give your agent clear instructions on how to support your writing. Try to give the agent a singular and well-defined set of instructions.
                        <br></br>• Your agent will automatically be aware of your current writing sample and your writing aims.
                        <br></br>• We will automatically format and parse your feedback.
                      </span>
                    </label>
                    <textarea
                      value={editForm.prompt || ''}
                      onChange={(e) => setEditForm({...editForm, prompt: e.target.value})}
                      rows={25}
                      className="input input-bordered w-full font-mono text-sm"
                      placeholder="Enter your agent prompt here..."
                    />
                  </div>
                </div>
              </div>
            </>
          ) : selectedAgent ? (
            <>
              {/* Agent Details Header */}
              <div className="p-6 border-b border-base-300">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-base-content flex items-center gap-2">
                      <span className="text-xl">{selectedAgent.icon}</span>
                      {selectedAgent.name}
                    </h3>
                    <p className="text-sm text-base-content/70 mt-1">{selectedAgent.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTierBadgeColor(selectedAgent.defaultTier)}`}>
                        {selectedAgent.defaultTier}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        selectedAgent.enabled ? 'bg-base-200 text-gray-700' : 'bg-gray-200 text-base-content/70'
                      }`}>
                        {selectedAgent.enabled ? 'Active' : 'Inactive'}
                      </span>
                      <span className="text-xs text-base-content/50">
                        {selectedAgent.usageCount || 0} uses
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleEditAgent(selectedAgent)}
                    className="flex items-center gap-2 px-3 py-2 text-primary hover:bg-primary/10 rounded-lg text-sm font-medium"
                  >
                    <Edit3 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
              </div>

              {/* Agent Details */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-base-content mb-2">Current Prompt</h4>
                    <pre className="bg-base-200 p-4 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                      {selectedAgent.prompt}
                    </pre>
                  </div>

                  {selectedAgent.templateOrigin && (
                    <div>
                      <h4 className="font-medium text-base-content mb-2">Template Origin</h4>
                      <p className="text-sm text-base-content/70">
                        Created from template: {selectedAgent.templateOrigin}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">Category:</span>
                      <span className="ml-2 capitalize">{selectedAgent.category}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Response Format:</span>
                      <span className="ml-2">{selectedAgent.responseFormat}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Created:</span>
                      <span className="ml-2">{new Date(selectedAgent.created).toLocaleDateString()}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Last Modified:</span>
                      <span className="ml-2">{new Date(selectedAgent.lastModified).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-base-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Settings className="w-8 h-8 text-base-content/40" />
                </div>
                <h3 className="text-lg font-semibold text-base-content mb-2">Agent Management</h3>
                <p className="text-base-content/70 mb-6">
                  Create agents from scratch or use our templates to get started quickly.
                  Each agent can be customized with its own prompt and settings.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => handleCreateAgent()}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 btn btn-primary rounded-lg"
                  >
                    <Plus className="w-4 h-4" />
                    Create New Agent
                  </button>
                  <button
                    onClick={() => setShowTemplates(!showTemplates)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
                  >
                    <Layout className="w-4 h-4" />
                    Browse Templates
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return isOpen ? (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-base-100 rounded-lg shadow-xl w-full max-w-7xl h-full max-h-[90vh] flex flex-col">
        {content}
      </div>
    </div>
  ) : null;
};

export default UnifiedAgentCustomizationPanel;
