/**
 * A2UI Types Tests
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_A2UI_CONFIG,
  type A2UICard,
  type A2UISuggestionCard,
  type A2UIPreviewCard,
  type A2UIProgressCard,
  type A2UIResultCard,
  type A2UIConfig,
  type A2UIAction,
} from './types';

describe('A2UI Types', () => {
  describe('DEFAULT_A2UI_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_A2UI_CONFIG.maxVisibleCards).toBe(5);
      expect(DEFAULT_A2UI_CONFIG.cardExpirationMs).toBe(5 * 60 * 1000);
      expect(DEFAULT_A2UI_CONFIG.enableAnimations).toBe(true);
      expect(DEFAULT_A2UI_CONFIG.showConfidence).toBe(true);
      expect(DEFAULT_A2UI_CONFIG.enableShortcuts).toBe(true);
      expect(DEFAULT_A2UI_CONFIG.enableSounds).toBe(false);
      expect(DEFAULT_A2UI_CONFIG.theme).toBe('system');
    });

    it('should be a valid A2UIConfig', () => {
      const config: A2UIConfig = DEFAULT_A2UI_CONFIG;
      expect(config).toBeDefined();
    });
  });

  describe('A2UIAction', () => {
    it('should create a valid action', () => {
      const action: A2UIAction = {
        id: 'test-action',
        label: 'Test Action',
        type: 'primary',
      };

      expect(action.id).toBe('test-action');
      expect(action.label).toBe('Test Action');
      expect(action.type).toBe('primary');
    });

    it('should support all action types', () => {
      const actionTypes = ['primary', 'secondary', 'danger', 'dismiss'] as const;

      actionTypes.forEach((type) => {
        const action: A2UIAction = {
          id: `action-${type}`,
          label: `${type} Action`,
          type,
        };
        expect(action.type).toBe(type);
      });
    });

    it('should support optional properties', () => {
      const action: A2UIAction = {
        id: 'full-action',
        label: 'Full Action',
        type: 'primary',
        icon: 'check',
        disabled: false,
        loading: false,
        shortcut: 'Cmd+Enter',
        tooltip: 'Execute this action',
      };

      expect(action.icon).toBe('check');
      expect(action.disabled).toBe(false);
      expect(action.loading).toBe(false);
      expect(action.shortcut).toBe('Cmd+Enter');
      expect(action.tooltip).toBe('Execute this action');
    });
  });

  describe('A2UISuggestionCard', () => {
    it('should create a valid suggestion card', () => {
      const card: A2UISuggestionCard = {
        id: 'suggestion-1',
        type: 'suggestion',
        title: 'Organize Downloads',
        description: 'Move files to appropriate folders',
        suggestionType: 'file_organize',
        timestamp: Date.now(),
        actions: [
          { id: 'execute', label: 'Execute', type: 'primary' },
          { id: 'dismiss', label: 'Dismiss', type: 'dismiss' },
        ],
      };

      expect(card.type).toBe('suggestion');
      expect(card.suggestionType).toBe('file_organize');
      expect(card.actions).toHaveLength(2);
    });

    it('should support impact information', () => {
      const card: A2UISuggestionCard = {
        id: 'suggestion-2',
        type: 'suggestion',
        title: 'Delete temp files',
        suggestionType: 'file_organize',
        timestamp: Date.now(),
        actions: [],
        impact: {
          filesAffected: 15,
          riskLevel: 'medium',
          reversible: false,
          estimatedDuration: 5000,
        },
      };

      expect(card.impact?.filesAffected).toBe(15);
      expect(card.impact?.riskLevel).toBe('medium');
      expect(card.impact?.reversible).toBe(false);
    });
  });

  describe('A2UIPreviewCard', () => {
    it('should create a plan preview card', () => {
      const card: A2UIPreviewCard = {
        id: 'preview-1',
        type: 'preview',
        title: 'Execution Plan',
        previewType: 'plan',
        timestamp: Date.now(),
        content: {
          steps: [
            { order: 1, description: 'Scan files', actionType: 'read', riskLevel: 'low' },
            { order: 2, description: 'Move files', actionType: 'write', riskLevel: 'medium' },
          ],
        },
        analysis: {
          pros: ['Clean organization', 'Better access'],
          cons: ['Takes time'],
        },
        actions: [
          { id: 'execute', label: 'Execute', type: 'primary' },
          { id: 'reject', label: 'Cancel', type: 'secondary' },
        ],
      };

      expect(card.type).toBe('preview');
      expect(card.previewType).toBe('plan');
      expect(card.content.steps).toHaveLength(2);
      expect(card.analysis?.pros).toHaveLength(2);
    });

    it('should support file preview type', () => {
      const card: A2UIPreviewCard = {
        id: 'preview-2',
        type: 'preview',
        title: 'File Preview',
        previewType: 'file',
        timestamp: Date.now(),
        content: {
          fileContent: 'const x = 1;',
        },
        actions: [],
      };

      expect(card.previewType).toBe('file');
      expect(card.content.fileContent).toBe('const x = 1;');
    });
  });

  describe('A2UIProgressCard', () => {
    it('should create a valid progress card', () => {
      const card: A2UIProgressCard = {
        id: 'progress-1',
        type: 'progress',
        title: 'Executing Plan',
        currentStep: 2,
        totalSteps: 5,
        stepDescription: 'Moving files...',
        progress: 40,
        pausable: true,
        cancellable: true,
        status: 'running',
        timestamp: Date.now(),
        actions: [
          { id: 'pause', label: 'Pause', type: 'secondary' },
          { id: 'cancel', label: 'Cancel', type: 'danger' },
        ],
      };

      expect(card.type).toBe('progress');
      expect(card.currentStep).toBe(2);
      expect(card.totalSteps).toBe(5);
      expect(card.progress).toBe(40);
      expect(card.status).toBe('running');
    });

    it('should support all status types', () => {
      const statuses = ['running', 'paused', 'completing'] as const;

      statuses.forEach((status) => {
        const card: A2UIProgressCard = {
          id: `progress-${status}`,
          type: 'progress',
          title: 'Test',
          currentStep: 1,
          totalSteps: 1,
          stepDescription: 'Test',
          progress: 50,
          pausable: true,
          cancellable: true,
          status,
          timestamp: Date.now(),
          actions: [],
        };
        expect(card.status).toBe(status);
      });
    });
  });

  describe('A2UIResultCard', () => {
    it('should create a success result card', () => {
      const card: A2UIResultCard = {
        id: 'result-1',
        type: 'result',
        title: 'Execution Complete',
        status: 'success',
        summary: {
          totalSteps: 5,
          completedSteps: 5,
          failedSteps: 0,
          duration: 3000,
        },
        timestamp: Date.now(),
        actions: [
          { id: 'done', label: 'Done', type: 'primary' },
        ],
      };

      expect(card.type).toBe('result');
      expect(card.status).toBe('success');
      expect(card.summary.completedSteps).toBe(5);
    });

    it('should create a failed result card with error info', () => {
      const card: A2UIResultCard = {
        id: 'result-2',
        type: 'result',
        title: 'Execution Failed',
        status: 'failed',
        summary: {
          totalSteps: 5,
          completedSteps: 2,
          failedSteps: 1,
          duration: 1500,
        },
        error: {
          message: 'Permission denied',
          code: 'EACCES',
          recoverable: true,
        },
        rollback: {
          available: true,
          description: 'Undo all changes',
        },
        timestamp: Date.now(),
        actions: [
          { id: 'retry', label: 'Retry', type: 'primary' },
          { id: 'rollback', label: 'Rollback', type: 'secondary' },
        ],
      };

      expect(card.status).toBe('failed');
      expect(card.error?.message).toBe('Permission denied');
      expect(card.rollback?.available).toBe(true);
    });
  });

  describe('A2UICard union type', () => {
    it('should correctly narrow card types', () => {
      const cards: A2UICard[] = [
        {
          id: 'suggestion',
          type: 'suggestion',
          title: 'Test',
          suggestionType: 'custom',
          timestamp: Date.now(),
          actions: [],
        } as A2UISuggestionCard,
        {
          id: 'progress',
          type: 'progress',
          title: 'Test',
          currentStep: 1,
          totalSteps: 1,
          stepDescription: '',
          progress: 50,
          pausable: true,
          cancellable: true,
          status: 'running',
          timestamp: Date.now(),
          actions: [],
        } as A2UIProgressCard,
      ];

      cards.forEach((card) => {
        if (card.type === 'suggestion') {
          expect((card as A2UISuggestionCard).suggestionType).toBeDefined();
        } else if (card.type === 'progress') {
          expect((card as A2UIProgressCard).progress).toBeDefined();
        }
      });
    });
  });
});
