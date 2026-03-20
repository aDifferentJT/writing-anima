/**
 * User Preferences Panel for Multi-Agent System
 * Allows users to customize agent behavior and provide feedback
 */

import React, { useState } from 'react';
import type { SystemMetrics } from '../../types';

interface UserPreferences {
  thoroughness: number;
  speedPriority: number;
  costSensitivity: number;
  preferredAgents: string[];
  blockedAgents: string[];
}

interface UserFeedback {
  overallRating: number;
  speedSatisfaction: number;
  thoroughnessSatisfaction: number;
  mostHelpfulFeatures: string[];
  improvementSuggestions: string;
}

interface AvailableAgent {
  id: string;
  name: string;
  description: string;
}

interface SystemWithPreferences {
  userPreferences?: {
    thoroughness?: number;
    speedPriority?: number;
    costSensitivity?: number;
    preferredAgentTypes?: Iterable<string>;
  };
}

interface PreferencesChangeAction {
  action: string;
  preferences?: UserPreferences;
  overallRating?: number;
  speedSatisfaction?: number;
  thoroughnessSatisfaction?: number;
  mostHelpfulFeatures?: string[];
  improvementSuggestions?: string;
  helpful_insights?: string[];
  unhelpful_insights?: string[];
  preferred_agents?: string[];
  blocked_agents?: string[];
}

interface UserPreferencesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  system?: SystemWithPreferences;
  onPreferencesChange?: (action: PreferencesChangeAction) => void;
  metrics?: SystemMetrics;
}

export const UserPreferencesPanel: React.FC<UserPreferencesPanelProps> = ({
  isOpen,
  onClose,
  system,
  onPreferencesChange,
  metrics
}) => {
  const [preferences, setPreferences] = useState<UserPreferences>({
    thoroughness: 0.7,
    speedPriority: 0.5,
    costSensitivity: 0.5,
    preferredAgents: [],
    blockedAgents: []
  });

  const [feedback, setFeedback] = useState<UserFeedback>({
    overallRating: 4,
    speedSatisfaction: 4,
    thoroughnessSatisfaction: 4,
    mostHelpfulFeatures: [],
    improvementSuggestions: ''
  });

  // Sync preferences from system when panel opens (render-time adjustment)
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen && !prevIsOpen) {
    setPrevIsOpen(true);
    if (system?.userPreferences) {
      setPreferences({
        thoroughness: system.userPreferences.thoroughness || 0.7,
        speedPriority: system.userPreferences.speedPriority || 0.5,
        costSensitivity: system.userPreferences.costSensitivity || 0.5,
        preferredAgents: Array.from(system.userPreferences.preferredAgentTypes || []),
        blockedAgents: []
      });
    }
  } else if (!isOpen && prevIsOpen) {
    setPrevIsOpen(false);
  }

  const handlePreferenceChange = (key: keyof UserPreferences, value: number | string[]): void => {
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);

    // Auto-save preferences
    if (onPreferencesChange) {
      onPreferencesChange({
        action: 'update_preferences',
        preferences: newPreferences
      });
    }
  };

  const handleAgentToggle = (agentId: string, type: 'preferredAgents' | 'blockedAgents'): void => {
    const currentList = preferences[type] || [];
    const isSelected = currentList.includes(agentId);

    const newList = isSelected
      ? currentList.filter((id: string) => id !== agentId)
      : [...currentList, agentId];

    handlePreferenceChange(type, newList);
  };

  const handleFeedbackSubmit = (): void => {
    if (onPreferencesChange) {
      onPreferencesChange({
        action: 'submit_feedback',
        ...feedback,
        helpful_insights: [],
        unhelpful_insights: [],
        preferred_agents: preferences.preferredAgents,
        blocked_agents: preferences.blockedAgents
      });
    }

    // Reset feedback form
    setFeedback({
      overallRating: 4,
      speedSatisfaction: 4,
      thoroughnessSatisfaction: 4,
      mostHelpfulFeatures: [],
      improvementSuggestions: ''
    });
  };

  const availableAgents: AvailableAgent[] = [
    { id: 'logical_fallacy_detector', name: 'Logical Fallacy Detector', description: 'Finds logical errors in arguments' },
    { id: 'clarity_style_agent', name: 'Clarity & Style Agent', description: 'Improves grammar and readability' },
    { id: 'quick_fact_checker', name: 'Quick Fact Checker', description: 'Flags questionable claims' },
    { id: 'evidence_quality_agent', name: 'Evidence Quality Agent', description: 'Evaluates source credibility' },
    { id: 'contextual_research_critic', name: 'Contextual Research Critic', description: 'Finds counter-arguments' },
    { id: 'deep_fact_verification_agent', name: 'Deep Fact Verification', description: 'Comprehensive fact checking' }
  ];

  const helpfulFeatures: string[] = [
    'Real-time feedback',
    'Progressive enhancement',
    'Logical fallacy detection',
    'Style improvements',
    'Fact checking',
    'Source credibility',
    'Counter-arguments',
    'Research insights'
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">System Preferences</h2>
            <p className="text-sm text-gray-600 mt-1">Customize your multi-agent writing assistant</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-8">

          {/* Analysis Preferences */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Analysis Preferences</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Thoroughness */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Thoroughness
                  <span className="text-xs text-gray-500 ml-2">
                    ({Math.round(preferences.thoroughness * 100)}%)
                  </span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={preferences.thoroughness}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePreferenceChange('thoroughness', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Quick</span>
                  <span>Thorough</span>
                </div>
              </div>

              {/* Speed Priority */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Speed Priority
                  <span className="text-xs text-gray-500 ml-2">
                    ({Math.round(preferences.speedPriority * 100)}%)
                  </span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={preferences.speedPriority}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePreferenceChange('speedPriority', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Quality</span>
                  <span>Speed</span>
                </div>
              </div>

              {/* Cost Sensitivity */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Cost Sensitivity
                  <span className="text-xs text-gray-500 ml-2">
                    ({Math.round(preferences.costSensitivity * 100)}%)
                  </span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={preferences.costSensitivity}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePreferenceChange('costSensitivity', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Cost-friendly</span>
                  <span>Premium</span>
                </div>
              </div>

            </div>
          </div>

          {/* Agent Preferences */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Agent Preferences</h3>
            <p className="text-sm text-gray-600 mb-4">
              Customize which agents to prioritize or disable for your workflow.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableAgents.map((agent: AvailableAgent) => (
                <div key={agent.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                  <div className="flex items-start space-x-3">
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-gray-900">{agent.name}</h4>
                      <p className="text-xs text-gray-500 mt-1">{agent.description}</p>
                    </div>
                    <div className="flex flex-col space-y-2">
                      <button
                        onClick={() => handleAgentToggle(agent.id, 'preferredAgents')}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          preferences.preferredAgents.includes(agent.id)
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {preferences.preferredAgents.includes(agent.id) ? '★ Preferred' : 'Prefer'}
                      </button>
                      <button
                        onClick={() => handleAgentToggle(agent.id, 'blockedAgents')}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          preferences.blockedAgents.includes(agent.id)
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {preferences.blockedAgents.includes(agent.id) ? '✕ Blocked' : 'Block'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* System Performance */}
          {metrics && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">System Performance</h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 rounded-lg p-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {Math.round((metrics.orchestrator?.successRate || 0) * 100)}%
                  </div>
                  <div className="text-xs text-gray-600">Success Rate</div>
                </div>

                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {Math.round(metrics.orchestrator?.avgDecisionTime || 0)}ms
                  </div>
                  <div className="text-xs text-gray-600">Avg Response</div>
                </div>

                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {metrics.orchestrator?.registeredAgents || 0}
                  </div>
                  <div className="text-xs text-gray-600">Active Agents</div>
                </div>

                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {Math.round((metrics.progressiveEnhancement?.enhancementSuccessRate || 0) * 100)}%
                  </div>
                  <div className="text-xs text-gray-600">Enhancement Rate</div>
                </div>
              </div>
            </div>
          )}

          {/* Feedback Section */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Provide Feedback</h3>

            <div className="space-y-6">

              {/* Rating Sliders */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Overall Rating ({feedback.overallRating}/5)
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    value={feedback.overallRating}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFeedback(prev => ({ ...prev, overallRating: parseInt(e.target.value) }))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Speed Satisfaction ({feedback.speedSatisfaction}/5)
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    value={feedback.speedSatisfaction}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFeedback(prev => ({ ...prev, speedSatisfaction: parseInt(e.target.value) }))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Thoroughness Satisfaction ({feedback.thoroughnessSatisfaction}/5)
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    value={feedback.thoroughnessSatisfaction}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFeedback(prev => ({ ...prev, thoroughnessSatisfaction: parseInt(e.target.value) }))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

              </div>

              {/* Most Helpful Features */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Most Helpful Features (select all that apply)
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {helpfulFeatures.map((feature: string) => (
                    <label key={feature} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={feedback.mostHelpfulFeatures.includes(feature)}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const newFeatures = e.target.checked
                            ? [...feedback.mostHelpfulFeatures, feature]
                            : feedback.mostHelpfulFeatures.filter((f: string) => f !== feature);
                          setFeedback(prev => ({ ...prev, mostHelpfulFeatures: newFeatures }));
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{feature}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Improvement Suggestions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Suggestions for Improvement
                </label>
                <textarea
                  value={feedback.improvementSuggestions}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFeedback(prev => ({ ...prev, improvementSuggestions: e.target.value }))}
                  placeholder="What could we improve? What features would you like to see?"
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Submit Button */}
              <button
                onClick={handleFeedbackSubmit}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium"
              >
                Submit Feedback
              </button>

            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            Changes are saved automatically
          </div>
          <button
            onClick={onClose}
            className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};

export default UserPreferencesPanel;
