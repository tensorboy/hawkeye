/**
 * Life Tree — AI Prompt Templates
 *
 * Prompts for stage classification, goal inference, and experiment proposals.
 */

import type { LifeStage, ExperimentPhase, LifeTreeNode } from './types';
import type { ContextRecord } from '../storage/database';

// ============ System Prompt ============

export const LIFE_TREE_SYSTEM_PROMPT = `You are analyzing a user's daily computer activity to build a "Life Tree" — a hierarchical view of their life organized by stages, goals, and tasks.

Life Stages: Career, Learning, Health, Relationships, Creativity, Finance.

Your role:
1. Classify activities into life stages
2. Infer goals from repeated task patterns
3. Suggest micro-experiments to improve outcomes

Always respond with valid JSON. Be concise and specific.`;

// ============ Stage Classification ============

export function buildClassificationPrompt(context: ContextRecord): string {
  const parts: string[] = [];

  if (context.appName) parts.push(`Active App: ${context.appName}`);
  if (context.windowTitle) parts.push(`Window Title: ${context.windowTitle}`);
  if (context.ocrText) parts.push(`Screen Text (excerpt): ${context.ocrText.slice(0, 300)}`);
  if (context.clipboard) parts.push(`Clipboard: ${context.clipboard.slice(0, 150)}`);

  return `Classify this computer activity into a life stage.

${parts.join('\n')}

Life stages:
- career: Work, coding, meetings, email, project management
- learning: Courses, tutorials, reading educational content, language learning
- health: Exercise tracking, health apps, meal planning, meditation
- relationships: Messaging, social media, calendar (social events)
- creativity: Art, music, writing (non-work), design projects
- finance: Banking, investing, budgeting, shopping

Respond with JSON only:
{"stage": "<stage>", "confidence": <0-1>, "reasoning": "<brief explanation>"}`;
}

// ============ Goal Inference ============

export function buildGoalInferencePrompt(
  stage: LifeStage,
  tasks: Array<{ label: string; frequency: number; id: string }>,
  timeWindowDays: number = 7
): string {
  const taskList = tasks
    .map(t => `- "${t.label}" (seen ${t.frequency}x)`)
    .join('\n');

  return `Based on these observed tasks over the past ${timeWindowDays} days in the "${stage}" life stage:

${taskList}

Infer 1-3 likely goals the user is working toward.

Respond with JSON array:
[{
  "label": "<concise goal name>",
  "description": "<what the user seems to be trying to achieve>",
  "confidence": <0-1>,
  "supporting_task_ids": ["<task ids that support this inference>"]
}]`;
}

// ============ Experiment Proposals ============

export function buildExperimentProposalPrompt(
  phase: ExperimentPhase,
  targetNode: LifeTreeNode,
  taskSummary: string
): string {
  const phaseInstructions: Record<ExperimentPhase, string> = {
    task: 'Suggest a small productivity technique or tool tweak that can be tried in 1-3 days.',
    goal: 'Suggest a strategy change or routine restructuring that takes about a week to evaluate.',
    automation: 'Suggest a repeatable workflow to automate. Include specific steps.',
  };

  return `The user is working on: "${targetNode.label}"
Related tasks: ${taskSummary}

Phase: ${phase}
${phaseInstructions[phase]}

Respond with JSON:
{
  "hypothesis": "<what we expect to improve>",
  "description": "<what to try>",
  "duration_days": <number>,
  "metrics": ["<what to measure>"],
  "steps": ["<action 1>", "<action 2>"]
}`;
}

// ============ Tree Summary ============

export function buildTreeSummaryPrompt(nodeLabels: string[]): string {
  return `Given these observed activities and patterns:
${nodeLabels.map(l => `- ${l}`).join('\n')}

Summarize the user's current focus areas in 2-3 sentences. What are they primarily working on? What areas seem neglected?

Respond with JSON:
{"summary": "<2-3 sentences>", "focus_areas": ["<area1>", "<area2>"], "neglected_areas": ["<area1>"]}`;
}
