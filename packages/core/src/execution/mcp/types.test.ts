/**
 * MCP Types Tests
 */

import { describe, it, expect } from 'vitest';
import type {
  MCPConfig,
  MCPConnectionStatus,
  BrowserAction,
  BrowserActionType,
  BrowserNavigateParams,
  BrowserClickParams,
  BrowserTypeParams,
  BrowserFillFormParams,
  BrowserScreenshotParams,
  BrowserExecutionPlan,
  BrowserExecutionStep,
  BrowserPlanExecutionStatus,
  MCPResult,
  SnapshotResult,
  ScreenshotResult,
  ConsoleMessage,
  NetworkRequest,
  TabInfo,
  FormField,
} from './types';

describe('MCP Types', () => {
  describe('MCPConfig', () => {
    it('should allow valid config object', () => {
      const config: MCPConfig = {
        debugPort: 9222,
        chromePath: '/usr/bin/chromium',
        headless: true,
        timeout: 30000,
        viewport: { width: 1280, height: 720 },
      };

      expect(config.debugPort).toBe(9222);
      expect(config.headless).toBe(true);
      expect(config.viewport?.width).toBe(1280);
    });

    it('should allow partial config', () => {
      const config: MCPConfig = {
        debugPort: 9333,
      };

      expect(config.debugPort).toBe(9333);
      expect(config.headless).toBeUndefined();
    });

    it('should allow empty config', () => {
      const config: MCPConfig = {};
      expect(config).toEqual({});
    });
  });

  describe('MCPConnectionStatus', () => {
    it('should accept valid status values', () => {
      const statuses: MCPConnectionStatus[] = [
        'disconnected',
        'connecting',
        'connected',
        'error',
      ];

      expect(statuses).toHaveLength(4);
      expect(statuses).toContain('connected');
    });
  });

  describe('BrowserAction', () => {
    it('should create navigate action', () => {
      const action: BrowserAction<'navigate'> = {
        type: 'navigate',
        params: {
          url: 'https://example.com',
          waitUntil: 'load',
        },
      };

      expect(action.type).toBe('navigate');
      expect(action.params.url).toBe('https://example.com');
    });

    it('should create click action', () => {
      const action: BrowserAction<'click'> = {
        type: 'click',
        params: {
          element: 'Submit button',
          ref: 'btn-submit',
          button: 'left',
        },
      };

      expect(action.type).toBe('click');
      expect(action.params.element).toBe('Submit button');
    });

    it('should create type action', () => {
      const action: BrowserAction<'type'> = {
        type: 'type',
        params: {
          element: 'Username input',
          ref: 'input-username',
          text: 'testuser',
          slowly: true,
          submit: false,
        },
      };

      expect(action.type).toBe('type');
      expect(action.params.text).toBe('testuser');
      expect(action.params.slowly).toBe(true);
    });

    it('should create fill_form action', () => {
      const fields: FormField[] = [
        { name: 'username', type: 'textbox', ref: 'user', value: 'test' },
        { name: 'remember', type: 'checkbox', ref: 'chk', value: 'true' },
      ];

      const action: BrowserAction<'fill_form'> = {
        type: 'fill_form',
        params: { fields },
      };

      expect(action.type).toBe('fill_form');
      expect(action.params.fields).toHaveLength(2);
    });

    it('should create screenshot action', () => {
      const action: BrowserAction<'screenshot'> = {
        type: 'screenshot',
        params: {
          filename: 'test.png',
          fullPage: true,
          type: 'png',
        },
      };

      expect(action.type).toBe('screenshot');
      expect(action.params.fullPage).toBe(true);
    });

    it('should create wait action', () => {
      const action: BrowserAction<'wait'> = {
        type: 'wait',
        params: {
          text: 'Success',
          time: 5,
        },
      };

      expect(action.type).toBe('wait');
      expect(action.params.text).toBe('Success');
    });

    it('should create evaluate action', () => {
      const action: BrowserAction<'evaluate'> = {
        type: 'evaluate',
        params: {
          function: '() => document.title',
        },
      };

      expect(action.type).toBe('evaluate');
      expect(action.params.function).toContain('document.title');
    });
  });

  describe('BrowserExecutionPlan', () => {
    it('should create valid execution plan', () => {
      const plan: BrowserExecutionPlan = {
        id: 'plan-001',
        name: 'Login Test',
        description: 'Test login flow',
        steps: [
          {
            id: 'step-1',
            order: 1,
            action: {
              type: 'navigate',
              params: { url: 'https://example.com/login' },
            },
          },
          {
            id: 'step-2',
            order: 2,
            action: {
              type: 'type',
              params: {
                element: 'username',
                text: 'test',
                ref: 'user-input',
              },
            },
            onFailure: 'retry',
            retryCount: 3,
          },
        ],
        startUrl: 'https://example.com',
        createdAt: Date.now(),
      };

      expect(plan.id).toBe('plan-001');
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[1].retryCount).toBe(3);
    });
  });

  describe('BrowserPlanExecutionStatus', () => {
    it('should track execution status', () => {
      const status: BrowserPlanExecutionStatus = {
        planId: 'plan-001',
        status: 'running',
        currentStepIndex: 1,
        totalSteps: 5,
        stepResults: [
          {
            stepId: 'step-1',
            success: true,
            duration: 1500,
            retries: 0,
          },
        ],
        startedAt: Date.now(),
      };

      expect(status.status).toBe('running');
      expect(status.currentStepIndex).toBe(1);
      expect(status.stepResults).toHaveLength(1);
    });

    it('should handle completed status', () => {
      const status: BrowserPlanExecutionStatus = {
        planId: 'plan-001',
        status: 'completed',
        currentStepIndex: 5,
        totalSteps: 5,
        stepResults: [],
        startedAt: Date.now() - 10000,
        completedAt: Date.now(),
      };

      expect(status.status).toBe('completed');
      expect(status.completedAt).toBeDefined();
    });

    it('should handle failed status with error', () => {
      const status: BrowserPlanExecutionStatus = {
        planId: 'plan-001',
        status: 'failed',
        currentStepIndex: 2,
        totalSteps: 5,
        stepResults: [],
        startedAt: Date.now() - 5000,
        completedAt: Date.now(),
        error: 'Element not found: Submit button',
      };

      expect(status.status).toBe('failed');
      expect(status.error).toContain('Element not found');
    });
  });

  describe('MCPResult', () => {
    it('should create success result', () => {
      const result: MCPResult<string> = {
        success: true,
        data: 'Test result',
        duration: 100,
      };

      expect(result.success).toBe(true);
      expect(result.data).toBe('Test result');
    });

    it('should create error result', () => {
      const result: MCPResult = {
        success: false,
        error: 'Connection failed',
        duration: 50,
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection failed');
    });
  });

  describe('SnapshotResult', () => {
    it('should contain page information', () => {
      const snapshot: SnapshotResult = {
        title: 'Test Page',
        url: 'https://example.com',
        accessibilityTree: '- [button] Submit\n- [textbox] Username',
        elementRefs: new Map([
          ['btn-submit', 'Submit button'],
          ['input-user', 'Username field'],
        ]),
      };

      expect(snapshot.title).toBe('Test Page');
      expect(snapshot.accessibilityTree).toContain('[button]');
      expect(snapshot.elementRefs.size).toBe(2);
    });
  });

  describe('ScreenshotResult', () => {
    it('should contain image data', () => {
      const screenshot: ScreenshotResult = {
        imageData: 'base64encodeddata...',
        filePath: '/tmp/screenshot.png',
      };

      expect(screenshot.imageData).toBeDefined();
      expect(screenshot.filePath).toContain('.png');
    });
  });

  describe('ConsoleMessage', () => {
    it('should capture console output', () => {
      const message: ConsoleMessage = {
        level: 'error',
        text: 'Uncaught TypeError: Cannot read property',
        timestamp: Date.now(),
      };

      expect(message.level).toBe('error');
      expect(message.text).toContain('TypeError');
    });
  });

  describe('NetworkRequest', () => {
    it('should track network activity', () => {
      const request: NetworkRequest = {
        url: 'https://api.example.com/users',
        method: 'GET',
        status: 200,
        resourceType: 'XHR',
        timestamp: Date.now(),
      };

      expect(request.method).toBe('GET');
      expect(request.status).toBe(200);
      expect(request.resourceType).toBe('XHR');
    });
  });

  describe('TabInfo', () => {
    it('should describe browser tab', () => {
      const tab: TabInfo = {
        index: 0,
        title: 'Google',
        url: 'https://google.com',
        active: true,
      };

      expect(tab.index).toBe(0);
      expect(tab.active).toBe(true);
    });
  });

  describe('BrowserActionType', () => {
    it('should include all action types', () => {
      const actionTypes: BrowserActionType[] = [
        'navigate',
        'click',
        'type',
        'fill_form',
        'screenshot',
        'snapshot',
        'hover',
        'select',
        'press_key',
        'wait',
        'drag',
        'evaluate',
        'tabs',
        'file_upload',
        'dialog',
        'navigate_back',
        'close',
        'resize',
        'console_messages',
        'network_requests',
      ];

      expect(actionTypes).toHaveLength(20);
      expect(actionTypes).toContain('navigate');
      expect(actionTypes).toContain('fill_form');
    });
  });
});
