/**
 * Service for managing feedback history (accepted/rejected insights)
 * This helps agents learn from user preferences over time
 */

import type {
  FeedbackItem,
  FeedbackHistory,
  FeedbackHistoryRecord,
  FeedbackStatistics,
} from '../types';

interface RecentHistoryItem extends FeedbackHistoryRecord {
  action: 'accepted' | 'rejected';
}

class FeedbackHistoryService {
  private history: FeedbackHistory;

  constructor() {
    this.history = this.loadHistory();
  }

  /**
   * Load feedback history from localStorage
   */
  loadHistory(): FeedbackHistory {
    try {
      const stored = localStorage.getItem('feedback_history');
      return stored ? JSON.parse(stored) : { accepted: [], rejected: [] };
    } catch (error) {
      console.error('[FeedbackHistory] Failed to load history:', error);
      return { accepted: [], rejected: [] };
    }
  }

  /**
   * Save feedback history to localStorage
   */
  saveHistory(): void {
    try {
      localStorage.setItem('feedback_history', JSON.stringify(this.history));
    } catch (error) {
      console.error('[FeedbackHistory] Failed to save history:', error);
    }
  }

  /**
   * Record an accepted (resolved) piece of feedback
   */
  recordAccepted(feedback: FeedbackItem): void {
    const record: FeedbackHistoryRecord = {
      id: feedback.id,
      agent: feedback.agent,
      category: feedback.category,
      title: feedback.title,
      feedback: feedback.feedback,
      quote: feedback.position?.text || feedback.quote,
      timestamp: new Date().toISOString(),
      severity: feedback.severity
    };

    this.history.accepted.push(record);

    // Keep only last 100 accepted items to prevent unbounded growth
    if (this.history.accepted.length > 100) {
      this.history.accepted = this.history.accepted.slice(-100);
    }

    this.saveHistory();
    console.log('[FeedbackHistory] Recorded accepted feedback:', record);
  }

  /**
   * Record a rejected (dismissed) piece of feedback
   */
  recordRejected(feedback: FeedbackItem): void {
    const record: FeedbackHistoryRecord = {
      id: feedback.id,
      agent: feedback.agent,
      category: feedback.category,
      title: feedback.title,
      feedback: feedback.feedback,
      quote: feedback.position?.text || feedback.quote,
      timestamp: new Date().toISOString(),
      severity: feedback.severity
    };

    this.history.rejected.push(record);

    // Keep only last 100 rejected items to prevent unbounded growth
    if (this.history.rejected.length > 100) {
      this.history.rejected = this.history.rejected.slice(-100);
    }

    this.saveHistory();
    console.log('[FeedbackHistory] Recorded rejected feedback:', record);
  }

  /**
   * Get feedback history summary for a specific agent/category
   */
  getHistoryForAgent(agentName: string, category: string | null = null): FeedbackHistory {
    const accepted = this.history.accepted.filter(item =>
      item.agent === agentName && (!category || item.category === category)
    );

    const rejected = this.history.rejected.filter(item =>
      item.agent === agentName && (!category || item.category === category)
    );

    return { accepted, rejected };
  }

  /**
   * Get recent feedback history (last N items)
   */
  getRecentHistory(limit: number = 20): RecentHistoryItem[] {
    const allItems: RecentHistoryItem[] = [
      ...this.history.accepted.map(item => ({ ...item, action: 'accepted' as const })),
      ...this.history.rejected.map(item => ({ ...item, action: 'rejected' as const }))
    ];

    // Sort by timestamp descending
    allItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return allItems.slice(0, limit);
  }

  /**
   * Format history for inclusion in agent prompt
   */
  formatHistoryForPrompt(agentName: string | null = null, limit: number = 10): string | null {
    const recentHistory = agentName
      ? this.getHistoryForAgent(agentName)
      : { accepted: this.history.accepted, rejected: this.history.rejected };

    // Get most recent items
    const recentAccepted = recentHistory.accepted.slice(-limit);
    const recentRejected = recentHistory.rejected.slice(-limit);

    if (recentAccepted.length === 0 && recentRejected.length === 0) {
      return null; // No history to include
    }

    let formatted = '\n\n## USER FEEDBACK HISTORY\n';
    formatted += 'Learn from the user\'s previous responses to similar feedback. This helps you provide more relevant insights, but you should still suggest important issues even if similar feedback was previously rejected.\n\n';

    if (recentAccepted.length > 0) {
      formatted += '### Feedback the User Found Helpful (Accepted):\n';
      recentAccepted.forEach((item, index) => {
        formatted += `${index + 1}. [${item.category}] ${item.title}\n`;
        formatted += `   "${item.feedback.substring(0, 150)}${item.feedback.length > 150 ? '...' : ''}"\n`;
        if (item.quote) {
          formatted += `   Quote: "${item.quote.substring(0, 100)}${item.quote.length > 100 ? '...' : ''}"\n`;
        }
        formatted += '\n';
      });
    }

    if (recentRejected.length > 0) {
      formatted += '### Feedback the User Dismissed (Not Helpful):\n';
      recentRejected.forEach((item, index) => {
        formatted += `${index + 1}. [${item.category}] ${item.title}\n`;
        formatted += `   "${item.feedback.substring(0, 150)}${item.feedback.length > 150 ? '...' : ''}"\n`;
        if (item.quote) {
          formatted += `   Quote: "${item.quote.substring(0, 100)}${item.quote.length > 100 ? '...' : ''}"\n`;
        }
        formatted += '\n';
      });
    }

    formatted += '\nRemember: This history is guidance, not a strict filter. If you notice something important, suggest it even if similar feedback was dismissed before. The user\'s needs may have changed, or the specific context may warrant the feedback.\n';

    return formatted;
  }

  /**
   * Clear all history (for testing or user request)
   */
  clearHistory(): void {
    this.history = { accepted: [], rejected: [] };
    this.saveHistory();
    console.log('[FeedbackHistory] Cleared all history');
  }

  /**
   * Get statistics about feedback patterns
   */
  getStatistics(): FeedbackStatistics {
    return {
      totalAccepted: this.history.accepted.length,
      totalRejected: this.history.rejected.length,
      categoryCounts: this.getCategoryCounts(),
      agentCounts: this.getAgentCounts()
    };
  }

  private getCategoryCounts(): { accepted: Record<string, number>; rejected: Record<string, number> } {
    const counts: { accepted: Record<string, number>; rejected: Record<string, number> } = { accepted: {}, rejected: {} };

    this.history.accepted.forEach(item => {
      const key = item.category || 'uncategorized';
      counts.accepted[key] = (counts.accepted[key] || 0) + 1;
    });

    this.history.rejected.forEach(item => {
      const key = item.category || 'uncategorized';
      counts.rejected[key] = (counts.rejected[key] || 0) + 1;
    });

    return counts;
  }

  private getAgentCounts(): { accepted: Record<string, number>; rejected: Record<string, number> } {
    const counts: { accepted: Record<string, number>; rejected: Record<string, number> } = { accepted: {}, rejected: {} };

    this.history.accepted.forEach(item => {
      counts.accepted[item.agent] = (counts.accepted[item.agent] || 0) + 1;
    });

    this.history.rejected.forEach(item => {
      counts.rejected[item.agent] = (counts.rejected[item.agent] || 0) + 1;
    });

    return counts;
  }
}

// Export singleton instance
const feedbackHistoryService = new FeedbackHistoryService();
export default feedbackHistoryService;
