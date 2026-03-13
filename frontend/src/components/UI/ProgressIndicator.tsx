/**
 * Progress Indicator for Multi-Agent Analysis
 * Shows real-time progress through fast -> research -> enhancement phases
 */

import React from 'react';
import type { ProgressData } from '../../types';

interface StageInfo {
  key: string;
  label: string;
}

interface ProgressIndicatorProps {
  loading: boolean;
  isEnhancing: boolean;
  progress?: ProgressData | null;
  fastComplete: boolean;
  enhancedComplete: boolean;
  stage?: string;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  loading,
  isEnhancing,
  progress,
  fastComplete,
  enhancedComplete,
  stage = 'initializing'
}) => {
  if (!loading && !isEnhancing) return null;

  const getStageIcon = (stageName: string, isActive: boolean, isComplete: boolean): React.ReactElement => {
    const baseClasses = "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-300";

    if (isComplete) {
      return (
        <div className={`${baseClasses} bg-green-500 text-white`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    }

    if (isActive) {
      return (
        <div className={`${baseClasses} bg-blue-500 text-white animate-spin`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
      );
    }

    return (
      <div className={`${baseClasses} bg-gray-200 text-gray-500`}>
        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
      </div>
    );
  };

  const getStageLabel = (stageName: string): string => {
    const labels: Record<string, string> = {
      'initializing': 'Starting',
      'fast_phase': 'Quick Analysis',
      'fast_complete': 'Fast Complete',
      'research_phase': 'Deep Research',
      'enhancing': 'Enhancing',
      'enhanced': 'Enhanced',
      'complete': 'Complete'
    };
    return labels[stageName] || stageName;
  };

  const stages: StageInfo[] = [
    { key: 'fast_phase', label: 'Fast Analysis' },
    { key: 'research_phase', label: 'Research' },
    { key: 'enhancing', label: 'Enhancement' }
  ];

  const getCurrentStageIndex = (): number => {
    switch (stage) {
      case 'initializing':
      case 'fast_phase':
      case 'fast_streaming':
        return 0;
      case 'research_phase':
      case 'research_streaming':
        return 1;
      case 'enhancing':
      case 'enhanced':
      case 'complete':
        return 2;
      default:
        return 0;
    }
  };

  const currentStageIndex: number = getCurrentStageIndex();

  return (
    <div className="flex items-center space-x-4 bg-white rounded-lg p-3 border border-gray-200 shadow-sm">

      {/* Stage Progress */}
      <div className="flex items-center space-x-3">
        {stages.map((stageInfo: StageInfo, index: number) => {
          const isActive: boolean = index === currentStageIndex && (loading || isEnhancing);
          const isComplete: boolean = index < currentStageIndex || (index === 0 && fastComplete) || (index === 2 && enhancedComplete);

          return (
            <div key={stageInfo.key} className="flex items-center">
              {/* Stage Icon */}
              {getStageIcon(stageInfo.key, isActive, isComplete)}

              {/* Stage Label */}
              <span className={`ml-2 text-sm font-medium transition-colors duration-300 ${
                isActive ? 'text-blue-600' :
                isComplete ? 'text-green-600' :
                'text-gray-500'
              }`}>
                {stageInfo.label}
              </span>

              {/* Connector */}
              {index < stages.length - 1 && (
                <div className={`w-8 h-0.5 mx-3 transition-colors duration-300 ${
                  index < currentStageIndex ? 'bg-green-500' : 'bg-gray-200'
                }`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Current Activity */}
      <div className="border-l border-gray-200 pl-4">
        <div className="flex items-center space-x-2">
          {(loading || isEnhancing) && (
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          )}
          <span className="text-sm text-gray-600">
            {getStageLabel(stage)}
            {progress?.agentId && (
              <span className="ml-1 text-gray-400">
                ({progress.agentId.replace(/_/g, ' ')})
              </span>
            )}
          </span>
        </div>

        {/* Progress Details */}
        {progress && (
          <div className="mt-1 text-xs text-gray-500">
            {progress.type === 'fast_insight' && "Getting immediate feedback..."}
            {progress.type === 'research_insight' && "Researching in depth..."}
            {progress.stage === 'fast_streaming' && "Streaming fast analysis..."}
            {progress.stage === 'research_streaming' && "Streaming research results..."}
          </div>
        )}
      </div>

      {/* Enhancement Indicator */}
      {isEnhancing && (
        <div className="border-l border-gray-200 pl-4">
          <div className="flex items-center space-x-2">
            <div className="relative">
              <div className="w-4 h-4 border-2 border-blue-200 rounded-full animate-spin">
                <div className="absolute top-0 left-0 w-2 h-2 bg-blue-500 rounded-full" />
              </div>
            </div>
            <span className="text-sm text-blue-600 font-medium">
              Enhancing with research...
            </span>
          </div>
        </div>
      )}

    </div>
  );
};

export default ProgressIndicator;
