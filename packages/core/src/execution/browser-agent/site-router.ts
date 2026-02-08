/**
 * Site Router
 *
 * Routes browser automation tasks to site-specific state machines
 * based on URL domain matching and task type compatibility.
 *
 * Supports:
 * - Domain-based routing (exact and wildcard matching)
 * - URL pattern matching (glob and regex)
 * - Task type filtering
 * - Custom machine registration at runtime
 * - Priority ordering (more specific matches first)
 */

import {
  StateMachineDefinition,
  AgentContext,
} from './types';

export interface RouteResult {
  /** Matched machine definition */
  machine: StateMachineDefinition;
  /** Match confidence 0-1 */
  confidence: number;
  /** What matched: 'domain', 'url_pattern', or 'task_type' */
  matchType: 'domain' | 'url_pattern' | 'task_type';
}

export class SiteRouter {
  private machines: Map<string, StateMachineDefinition> = new Map();
  private domainIndex: Map<string, string[]> = new Map(); // domain → machine IDs

  /**
   * Register a state machine definition
   */
  register(machine: StateMachineDefinition): void {
    this.machines.set(machine.id, machine);

    // Index by domain
    for (const domain of machine.domains) {
      const normalized = this.normalizeDomain(domain);
      const existing = this.domainIndex.get(normalized) || [];
      if (!existing.includes(machine.id)) {
        existing.push(machine.id);
        this.domainIndex.set(normalized, existing);
      }
    }
  }

  /**
   * Unregister a state machine
   */
  unregister(machineId: string): void {
    const machine = this.machines.get(machineId);
    if (!machine) return;

    // Remove from domain index
    for (const domain of machine.domains) {
      const normalized = this.normalizeDomain(domain);
      const existing = this.domainIndex.get(normalized);
      if (existing) {
        const filtered = existing.filter(id => id !== machineId);
        if (filtered.length === 0) {
          this.domainIndex.delete(normalized);
        } else {
          this.domainIndex.set(normalized, filtered);
        }
      }
    }

    this.machines.delete(machineId);
  }

  /**
   * Route a URL and task to the best matching state machine
   */
  route(url: string, taskType?: string): RouteResult | null {
    const candidates: RouteResult[] = [];

    // 1. Try exact domain match first
    const domain = this.extractDomain(url);
    const domainMachineIds = this.domainIndex.get(domain) || [];

    for (const machineId of domainMachineIds) {
      const machine = this.machines.get(machineId);
      if (!machine) continue;

      // Check task type compatibility
      if (taskType && !machine.supportedTasks.includes(taskType)) continue;

      candidates.push({
        machine,
        confidence: 0.9,
        matchType: 'domain',
      });
    }

    // 2. Try subdomain matching (e.g., "www.amazon.com" matches "amazon.com")
    if (candidates.length === 0) {
      const parts = domain.split('.');
      for (let i = 1; i < parts.length; i++) {
        const parentDomain = parts.slice(i).join('.');
        const parentIds = this.domainIndex.get(parentDomain) || [];
        for (const machineId of parentIds) {
          const machine = this.machines.get(machineId);
          if (!machine) continue;
          if (taskType && !machine.supportedTasks.includes(taskType)) continue;

          candidates.push({
            machine,
            confidence: 0.8,
            matchType: 'domain',
          });
        }
      }
    }

    // 3. Try URL pattern matching
    if (candidates.length === 0) {
      for (const machine of this.machines.values()) {
        if (taskType && !machine.supportedTasks.includes(taskType)) continue;

        for (const pattern of machine.urlPatterns) {
          if (this.matchUrlPattern(url, pattern)) {
            candidates.push({
              machine,
              confidence: 0.7,
              matchType: 'url_pattern',
            });
            break;
          }
        }
      }
    }

    // 4. Try task-type-only matching (lowest confidence)
    if (candidates.length === 0 && taskType) {
      for (const machine of this.machines.values()) {
        if (machine.supportedTasks.includes(taskType)) {
          candidates.push({
            machine,
            confidence: 0.3,
            matchType: 'task_type',
          });
        }
      }
    }

    // Return highest confidence match
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.confidence - a.confidence);
    return candidates[0];
  }

  /**
   * Get all registered machines
   */
  getMachines(): StateMachineDefinition[] {
    return Array.from(this.machines.values());
  }

  /**
   * Get machine by ID
   */
  getMachine(id: string): StateMachineDefinition | undefined {
    return this.machines.get(id);
  }

  /**
   * Check if a URL has a matching machine
   */
  hasMatch(url: string, taskType?: string): boolean {
    return this.route(url, taskType) !== null;
  }

  /**
   * Get all machines that handle a given domain
   */
  getMachinesForDomain(domain: string): StateMachineDefinition[] {
    const normalized = this.normalizeDomain(domain);
    const ids = this.domainIndex.get(normalized) || [];
    return ids.map(id => this.machines.get(id)).filter(Boolean) as StateMachineDefinition[];
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  private normalizeDomain(domain: string): string {
    return domain.toLowerCase().replace(/^www\./, '').replace(/\/$/, '');
  }

  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return this.normalizeDomain(parsed.hostname);
    } catch {
      // Try to extract domain from non-URL string
      const match = url.match(/(?:https?:\/\/)?([^\/\s]+)/);
      return match ? this.normalizeDomain(match[1]) : '';
    }
  }

  private matchUrlPattern(url: string, pattern: string): boolean {
    // Check if pattern is a regex (wrapped in /.../)
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      try {
        const regex = new RegExp(pattern.slice(1, -1));
        return regex.test(url);
      } catch {
        return false;
      }
    }

    // Glob-style matching: * matches any non-/ chars, ** matches anything
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '___DOUBLESTAR___')
      .replace(/\*/g, '[^/]*')
      .replace(/___DOUBLESTAR___/g, '.*');

    try {
      return new RegExp(`^${regexStr}$`).test(url);
    } catch {
      return false;
    }
  }
}
