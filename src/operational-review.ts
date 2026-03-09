/**
 * ClawText Operational Memory Review Workflow
 * 
 * Interactive review system for candidates:
 * - Approve (mark as reviewed)
 * - Reject (with reason)
 * - Merge (combine with another pattern)
 * - Request more information
 * - Evidence presentation
 */

import { OperationalMemoryManager, OperationalMemory, Status } from './operational.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Review decision
 */
export type ReviewDecision = 'approve' | 'reject' | 'merge' | 'defer';

/**
 * Review result
 */
export interface ReviewResult {
  patternKey: string;
  decision: ReviewDecision;
  previousStatus: Status;
  newStatus: Status;
  reason?: string;
  mergedWith?: string;
  timestamp: string;
}

/**
 * Review log entry
 */
export interface ReviewLog {
  patternKey: string;
  reviewer: string;
  decision: ReviewDecision;
  reason?: string;
  mergedWith?: string;
  timestamp: string;
  notes?: string;
}

/**
 * Operational review manager
 */
export class OperationalReviewManager {
  private memoryManager: OperationalMemoryManager;
  private workspacePath: string;
  private reviewLogPath: string;
  private reviewLog: ReviewLog[];

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.memoryManager = new OperationalMemoryManager(workspacePath);
    this.reviewLogPath = path.join(workspacePath, 'memory', 'operational', 'review-log.json');
    this.reviewLog = [];
    
    this.loadReviewLog();
  }

  /**
   * Load review log from disk
   */
  private loadReviewLog(): void {
    try {
      if (fs.existsSync(this.reviewLogPath)) {
        const data = JSON.parse(fs.readFileSync(this.reviewLogPath, 'utf8'));
        this.reviewLog = Array.isArray(data) ? data : [];
      }
    } catch (error) {
      console.error('[OperationalReview] Failed to load review log:', error);
      this.reviewLog = [];
    }
  }

  /**
   * Save review log to disk
   */
  private saveReviewLog(): void {
    try {
      const logDir = path.dirname(this.reviewLogPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      fs.writeFileSync(this.reviewLogPath, JSON.stringify(this.reviewLog, null, 2) + '\n');
    } catch (error) {
      console.error('[OperationalReview] Failed to save review log:', error);
    }
  }

  /**
   * Get candidates awaiting review
   */
  getCandidates(): OperationalMemory[] {
    return this.memoryManager.getAllByStatus('candidate');
  }

  /**
   * Get pattern details for review
   */
  getReviewDetails(patternKey: string): OperationalMemory | null {
    return this.memoryManager.get(patternKey);
  }

  /**
   * Approve a pattern (mark as reviewed)
   */
  approve(patternKey: string, reviewer: string = 'system', notes?: string): ReviewResult | null {
    const pattern = this.memoryManager.get(patternKey);
    if (!pattern) return null;

    const previousStatus = pattern.status;
    const updated = this.memoryManager.changeStatus(patternKey, 'reviewed');

    if (updated) {
      this.logReview({
        patternKey,
        reviewer,
        decision: 'approve',
        timestamp: new Date().toISOString(),
        notes,
      });

      return {
        patternKey,
        decision: 'approve',
        previousStatus,
        newStatus: 'reviewed',
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Reject a pattern (archive with reason)
   */
  reject(patternKey: string, reason: string, reviewer: string = 'system'): ReviewResult | null {
    const pattern = this.memoryManager.get(patternKey);
    if (!pattern) return null;

    const previousStatus = pattern.status;
    const updated = this.memoryManager.update(patternKey, {
      status: 'archived',
      evidence: [...pattern.evidence, `Rejected: ${reason}`],
    });

    if (updated) {
      this.logReview({
        patternKey,
        reviewer,
        decision: 'reject',
        reason,
        timestamp: new Date().toISOString(),
      });

      return {
        patternKey,
        decision: 'reject',
        previousStatus,
        newStatus: 'archived',
        reason,
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Defer a pattern (keep as candidate for later review)
   */
  defer(patternKey: string, reason: string, reviewer: string = 'system'): ReviewResult | null {
    const pattern = this.memoryManager.get(patternKey);
    if (!pattern) return null;

    this.logReview({
      patternKey,
      reviewer,
      decision: 'defer',
      reason,
      timestamp: new Date().toISOString(),
    });

    // No status change, just log
    return {
      patternKey,
      decision: 'defer',
      previousStatus: pattern.status,
      newStatus: pattern.status,
      reason,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Merge two patterns
   */
  merge(primaryKey: string, duplicateKey: string, reviewer: string = 'system'): ReviewResult | null {
    const primary = this.memoryManager.get(primaryKey);
    const duplicate = this.memoryManager.get(duplicateKey);

    if (!primary || !duplicate) return null;

    // Merge evidence and recurrence
    const mergedEvidence = [
      ...primary.evidence,
      ...duplicate.evidence,
    ].filter((v, i, a) => a.indexOf(v) === i);

    const mergedRecurrence = primary.recurrenceCount + duplicate.recurrenceCount;

    const updated = this.memoryManager.update(primaryKey, {
      recurrenceCount: mergedRecurrence,
      evidence: mergedEvidence,
      status: 'reviewed',
      lastSeenAt: duplicate.lastSeenAt,
    });

    if (updated) {
      // Archive duplicate
      this.memoryManager.changeStatus(duplicateKey, 'archived');

      this.logReview({
        patternKey: primaryKey,
        reviewer,
        decision: 'merge',
        mergedWith: duplicateKey,
        timestamp: new Date().toISOString(),
        notes: `Merged recurrence: ${mergedRecurrence}, Evidence: ${mergedEvidence.length} items`,
      });

      return {
        patternKey: primaryKey,
        decision: 'merge',
        previousStatus: primary.status,
        newStatus: 'reviewed',
        mergedWith: duplicateKey,
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Log a review action
   */
  private logReview(log: ReviewLog): void {
    this.reviewLog.push(log);
    this.saveReviewLog();
  }

  /**
   * Get review statistics
   */
  getReviewStats(): {
    totalReviews: number;
    byDecision: Record<ReviewDecision, number>;
    recentReviews: ReviewLog[];
  } {
    const byDecision: Record<ReviewDecision, number> = {
      approve: 0,
      reject: 0,
      merge: 0,
      defer: 0,
    };

    this.reviewLog.forEach(log => {
      byDecision[log.decision]++;
    });

    return {
      totalReviews: this.reviewLog.length,
      byDecision,
      recentReviews: this.reviewLog.slice(-10),
    };
  }

  /**
   * Get review queue with details
   */
  getReviewQueueWithDetails(): Array<{
    pattern: OperationalMemory;
    issues: string[];
    suggestions: string[];
  }> {
    const candidates = this.getCandidates();
    const queue: Array<{
      pattern: OperationalMemory;
      issues: string[];
      suggestions: string[];
    }> = [];

    for (const pattern of candidates) {
      const issues: string[] = [];
      const suggestions: string[] = [];

      // Check for common issues
      if (pattern.rootCause === 'TBD') {
        issues.push('Root cause not identified');
        suggestions.push('Investigate and document the root cause');
      }

      if (pattern.fix === 'TBD') {
        issues.push('Fix not identified');
        suggestions.push('Document the fix or workaround');
      }

      if (pattern.evidence.length === 0) {
        issues.push('No evidence collected');
        suggestions.push('Add evidence (logs, session IDs, error messages)');
      }

      if (pattern.confidence < 0.7) {
        issues.push(`Low confidence (${pattern.confidence.toFixed(2)})`);
        suggestions.push('Gather more evidence or increase recurrence');
      }

      if (pattern.recurrenceCount === 1) {
        issues.push('Single occurrence');
        suggestions.push('Wait for more occurrences or manually verify');
      }

      queue.push({
        pattern,
        issues,
        suggestions,
      });
    }

    return queue;
  }

  /**
   * Generate review report
   */
  generateReviewReport(): string {
    const stats = this.getReviewStats();
    const queue = this.getReviewQueueWithDetails();

    let report = '📋 Operational Memory Review Report\n';
    report += '='.repeat(60) + '\n\n';

    report += `Total reviews: ${stats.totalReviews}\n`;
    report += `  Approved: ${stats.byDecision.approve}\n`;
    report += `  Rejected: ${stats.byDecision.reject}\n`;
    report += `  Merged: ${stats.byDecision.merge}\n`;
    report += `  Deferred: ${stats.byDecision.defer}\n\n`;

    report += `Candidates awaiting review: ${queue.length}\n\n`;

    if (queue.length > 0) {
      report += 'Review Queue:\n';
      report += '-'.repeat(60) + '\n\n';

      queue.forEach((item, i) => {
        const p = item.pattern;
        report += `${i + 1}. [${p.patternKey}]\n`;
        report += `   Type: ${p.type} | Scope: ${p.scope} | Recurrence: ${p.recurrenceCount}\n`;
        report += `   Confidence: ${(p.confidence * 100).toFixed(0)}%\n`;
        report += `   Summary: ${p.summary}\n`;

        if (item.issues.length > 0) {
          report += `   Issues:\n`;
          item.issues.forEach(issue => report += `     - ${issue}\n`);
        }

        if (item.suggestions.length > 0) {
          report += `   Suggestions:\n`;
          item.suggestions.forEach(suggestion => report += `     - ${suggestion}\n`);
        }

        report += '\n';
      });
    }

    report += '='.repeat(60) + '\n';
    report += 'Actions:\n';
    report += '  npm run operational:review -- approve <patternKey>\n';
    report += '  npm run operational:review -- reject <patternKey> "<reason>"\n';
    report += '  npm run operational:review -- defer <patternKey> "<reason>"\n';
    report += '  npm run operational:merge -- <primary> <duplicate>\n';

    return report;
  }
}

export default OperationalReviewManager;
