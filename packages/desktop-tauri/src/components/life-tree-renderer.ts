/**
 * Life Tree Radial Mindmap — Pure Canvas Renderer
 *
 * Adapted from EvoClaw Soul Mindmap with improvements:
 * - 7 life stages with proportional node sizing
 * - Activity-based pulsing glow
 * - Status-based visual treatment
 * - Click interaction + detail panel callbacks
 */

import type {
  LifeTreeSnapshot,
  LifeTreeNode,
  LifeStage,
  NodeStatus,
} from '../hooks/useTauri';

// ── Constants ──────────────────────────────────────────────

const STAGE_COLORS: Record<LifeStage, string> = {
  career:        '#4A9EFF',
  learning:      '#50C878',
  health:        '#FF6B6B',
  relationships: '#FFB347',
  creativity:    '#CB6CE6',
  finance:       '#FFD700',
  safety:        '#5BC0DE',
};

const STAGE_LABELS: Record<LifeStage, string> = {
  career:        'Career',
  learning:      'Learning',
  health:        'Health',
  relationships: 'Relations',
  creativity:    'Creative',
  finance:       'Finance',
  safety:        'Safety',
};

const STATUS_ALPHA: Record<NodeStatus, number> = {
  active: 1.0, completed: 0.6, paused: 0.35, failed: 0.25,
};

const ROOT_COLOR = '#e94560';
const BG_COLOR = '#0a0a1a';

// Layout radii
const STAGE_RADIUS = 160;
const TASK_RADIUS = 290;
const EXPERIMENT_RADIUS = 380;

// Node base radii
const ROOT_NODE_R = 28;
const STAGE_NODE_R = 18;
const TASK_NODE_R = 10;
const EXPERIMENT_NODE_R = 7;

// Animation
const EASE_FACTOR = 0.08;
const CAM_SMOOTH = 0.06;
const WOBBLE_AMP = 6;
const GLOW_BASE = 0.12;
const GLOW_HOVER = 0.28;

// Zoom
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 3.0;

// ── Types ──────────────────────────────────────────────────

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  alpha: number;
  label: string;
  depth: number;
  scale: number;
  targetScale: number;
  glowIntensity: number;
  data: LifeTreeNode;
}

interface Edge {
  fromId: string;
  toId: string;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

// ── Helpers ────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function nodeRadius(node: LifeTreeNode): number {
  const base =
    node.nodeType === 'root' ? ROOT_NODE_R :
    node.nodeType === 'stage' ? STAGE_NODE_R :
    node.nodeType === 'experiment' ? EXPERIMENT_NODE_R :
    TASK_NODE_R;
  // Scale by observation count (log scale, capped)
  const boost = Math.log2(Math.max(node.observationCount, 1) + 1) * 2;
  return base + Math.min(boost, 12);
}

function recencyGlow(updatedAt: number): number {
  const ageMs = Date.now() - updatedAt;
  const ageHours = ageMs / (1000 * 60 * 60);
  // Recent (< 1h) = full glow, fades over 24h
  return Math.max(0, 1 - ageHours / 24);
}

// ── Renderer Class ─────────────────────────────────────────

export class LifeTreeRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private width = 0;
  private height = 0;

  // Data
  private nodes: Map<string, LayoutNode> = new Map();
  private edges: Edge[] = [];
  private particles: Particle[] = [];

  // Camera
  private camX = 0;
  private camY = 0;
  private camZoom = 1;
  private targetCamX = 0;
  private targetCamY = 0;
  private targetCamZoom = 1;

  // Interaction
  private hoveredNodeId: string | null = null;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private camStartX = 0;
  private camStartY = 0;

  // Animation
  private animTime = 0;
  private animFrameId = 0;
  private running = false;

  // Callbacks
  private _onNodeHover: ((node: LifeTreeNode | null) => void) | null = null;
  private _onNodeClick: ((node: LifeTreeNode) => void) | null = null;

  // Known node IDs for new-node detection
  private knownNodeIds = new Set<string>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.dpr = window.devicePixelRatio || 1;

    this._resize();
    this._bindEvents();
  }

  // ── Public API ─────────────────────────────────────────

  setData(snapshot: LifeTreeSnapshot | null, visibleStages: Set<LifeStage>): void {
    if (!snapshot) return;
    const newNodeIds = new Set(snapshot.nodes.map((n) => n.id));

    // Detect new nodes for particle celebration
    const addedIds: string[] = [];
    if (this.knownNodeIds.size > 0) {
      for (const id of newNodeIds) {
        if (!this.knownNodeIds.has(id)) addedIds.push(id);
      }
    }

    this._layoutRadial(snapshot, visibleStages);
    this.knownNodeIds = newNodeIds;

    // Celebrate new nodes
    for (const id of addedIds) {
      const node = this.nodes.get(id);
      if (node) {
        node.scale = 0;
        node.targetScale = 1;
        this._spawnParticles(node.x, node.y, node.color, 12);
      }
    }
  }

  setSelectedNode(nodeId: string | null): void {
    // Optionally pan camera to selected node
    if (nodeId) {
      const node = this.nodes.get(nodeId);
      if (node) {
        this.targetCamX = node.x;
        this.targetCamY = node.y;
      }
    }
  }

  onNodeHover(cb: (node: LifeTreeNode | null) => void): void {
    this._onNodeHover = cb;
  }

  onNodeClick(cb: (node: LifeTreeNode) => void): void {
    this._onNodeClick = cb;
  }

  fitToView(): void {
    if (this.nodes.size === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of this.nodes.values()) {
      minX = Math.min(minX, n.x - n.radius);
      maxX = Math.max(maxX, n.x + n.radius);
      minY = Math.min(minY, n.y - n.radius);
      maxY = Math.max(maxY, n.y + n.radius);
    }
    const bw = maxX - minX + 80;
    const bh = maxY - minY + 80;
    this.targetCamX = (minX + maxX) / 2;
    this.targetCamY = (minY + maxY) / 2;
    this.targetCamZoom = Math.min(this.width / bw, this.height / bh, 2.0);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this._loop();
  }

  stop(): void {
    this.running = false;
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
  }

  destroy(): void {
    this.stop();
    this._unbindEvents();
  }

  /** Expose hovered node for tooltip positioning */
  getHoveredNode(): LayoutNode | null {
    return this.hoveredNodeId ? this.nodes.get(this.hoveredNodeId) ?? null : null;
  }

  /** Convert canvas-local coords to world coords */
  screenToWorld(sx: number, sy: number): [number, number] {
    const wx = (sx - this.width / 2) / this.camZoom + this.camX;
    const wy = (sy - this.height / 2) / this.camZoom + this.camY;
    return [wx, wy];
  }

  // ── Layout ─────────────────────────────────────────────

  private _layoutRadial(snapshot: LifeTreeSnapshot, visibleStages: Set<LifeStage>): void {
    const nodeMap = new Map<string, LifeTreeNode>();
    for (const n of snapshot.nodes) nodeMap.set(n.id, n);

    const oldNodes = new Map(this.nodes);
    this.nodes.clear();
    this.edges = [];

    const root = nodeMap.get(snapshot.rootId);
    if (!root) return;

    // Root node at center
    const rootLayout = this._makeLayoutNode(root, 0, 0, 0, ROOT_COLOR, oldNodes);
    this.nodes.set(root.id, rootLayout);

    // Filter visible stage children
    const stageIds = root.children.filter((cid) => {
      const child = nodeMap.get(cid);
      return child && child.stage && visibleStages.has(child.stage);
    });

    const stageCount = stageIds.length;
    if (stageCount === 0) return;

    const angleStep = (Math.PI * 2) / stageCount;
    // Start from top (-π/2)
    const startAngle = -Math.PI / 2;

    stageIds.forEach((stageId, i) => {
      const stageNode = nodeMap.get(stageId);
      if (!stageNode) return;

      const angle = startAngle + i * angleStep;
      const sx = Math.cos(angle) * STAGE_RADIUS;
      const sy = Math.sin(angle) * STAGE_RADIUS;
      const color = stageNode.stage ? STAGE_COLORS[stageNode.stage] : '#888';

      const stageLayout = this._makeLayoutNode(stageNode, sx, sy, 1, color, oldNodes);
      this.nodes.set(stageId, stageLayout);
      this.edges.push({ fromId: root.id, toId: stageId, color });

      // Children of stage (tasks/goals)
      const childIds = stageNode.children;
      if (childIds.length === 0) return;

      // Distribute children within the stage's angular wedge
      const wedge = angleStep * 0.8; // 80% of stage wedge to avoid overlap
      const childAngleStep = childIds.length > 1 ? wedge / (childIds.length - 1) : 0;
      const childStartAngle = angle - wedge / 2;

      childIds.forEach((childId, ci) => {
        const childNode = nodeMap.get(childId);
        if (!childNode) return;

        const ca = childIds.length === 1 ? angle : childStartAngle + ci * childAngleStep;
        const cx = Math.cos(ca) * TASK_RADIUS;
        const cy = Math.sin(ca) * TASK_RADIUS;

        const childLayout = this._makeLayoutNode(childNode, cx, cy, 2, color, oldNodes);
        this.nodes.set(childId, childLayout);
        this.edges.push({ fromId: stageId, toId: childId, color });

        // Experiments under tasks
        const expIds = childNode.children;
        if (expIds.length === 0) return;

        const expWedge = childAngleStep * 0.6;
        const expStep = expIds.length > 1 ? expWedge / (expIds.length - 1) : 0;
        const expStart = ca - expWedge / 2;

        expIds.forEach((expId, ei) => {
          const expNode = nodeMap.get(expId);
          if (!expNode) return;

          const ea = expIds.length === 1 ? ca : expStart + ei * expStep;
          const ex = Math.cos(ea) * EXPERIMENT_RADIUS;
          const ey = Math.sin(ea) * EXPERIMENT_RADIUS;

          const expColor = expNode.status === 'completed' ? '#50C878' :
                           expNode.status === 'failed' ? '#FF4444' : color;

          const expLayout = this._makeLayoutNode(expNode, ex, ey, 3, expColor, oldNodes);
          this.nodes.set(expId, expLayout);
          this.edges.push({ fromId: childId, toId: expId, color: expColor });
        });
      });
    });
  }

  private _makeLayoutNode(
    data: LifeTreeNode,
    x: number,
    y: number,
    depth: number,
    color: string,
    oldNodes: Map<string, LayoutNode>,
  ): LayoutNode {
    const old = oldNodes.get(data.id);
    return {
      id: data.id,
      x,
      y,
      radius: nodeRadius(data),
      color,
      alpha: STATUS_ALPHA[data.status] ?? 1,
      label: data.label,
      depth,
      scale: old ? old.scale : 0,
      targetScale: 1,
      glowIntensity: recencyGlow(data.updatedAt),
      data,
    };
  }

  // ── Animation Loop ─────────────────────────────────────

  private _loop = (): void => {
    if (!this.running) return;
    this._resize();
    this._update();
    this._draw();
    this.animFrameId = requestAnimationFrame(this._loop);
  };

  private _update(): void {
    this.animTime += 0.016; // ~60fps

    // Smooth camera
    this.camX += (this.targetCamX - this.camX) * CAM_SMOOTH;
    this.camY += (this.targetCamY - this.camY) * CAM_SMOOTH;
    this.camZoom += (this.targetCamZoom - this.camZoom) * CAM_SMOOTH;

    // Animate node scales
    for (const n of this.nodes.values()) {
      n.scale += (n.targetScale - n.scale) * EASE_FACTOR;
    }

    // Update particles
    this.particles = this.particles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= p.decay;
      return p.life > 0;
    });
  }

  private _draw(): void {
    const { ctx, width, height } = this;

    // Clear
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(this.camZoom, this.camZoom);
    ctx.translate(-this.camX, -this.camY);

    // Draw edges
    this._drawEdges();

    // Draw nodes
    this._drawNodes();

    // Draw particles
    this._drawParticles();

    ctx.restore();
  }

  private _drawEdges(): void {
    const { ctx } = this;

    for (const edge of this.edges) {
      const from = this.nodes.get(edge.fromId);
      const to = this.nodes.get(edge.toId);
      if (!from || !to) continue;

      const alpha = Math.min(from.scale, to.scale) * from.alpha * to.alpha;
      if (alpha < 0.01) continue;

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) continue;

      // Midpoint + perpendicular wobble
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;
      const nx = -dy / dist;
      const ny = dx / dist;
      const wobble = Math.sin(this.animTime * 0.5 + from.x * 0.01) * WOBBLE_AMP;

      const [r, g, b] = hexToRgb(edge.color);

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(mx + nx * wobble, my + ny * wobble, to.x, to.y);
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.3})`;
      ctx.lineWidth = to.depth <= 1 ? 2.5 : 1.5;
      ctx.stroke();
    }
  }

  private _drawNodes(): void {
    const { ctx } = this;

    // Sort: draw deeper nodes first, hovered node last
    const sorted = [...this.nodes.values()].sort((a, b) => {
      if (a.id === this.hoveredNodeId) return 1;
      if (b.id === this.hoveredNodeId) return -1;
      return b.depth - a.depth;
    });

    for (const n of sorted) {
      if (n.scale < 0.01) continue;

      const r = n.radius * n.scale;
      const isHovered = n.id === this.hoveredNodeId;
      const [cr, cg, cb] = hexToRgb(n.color);

      // Glow halo
      const glowR = r * (isHovered ? 4 : 2.5);
      const glowAlpha = isHovered ? GLOW_HOVER : GLOW_BASE;
      // Recency pulse
      const pulse = n.glowIntensity > 0
        ? 1 + Math.sin(this.animTime * 3 + n.x * 0.1) * 0.15 * n.glowIntensity
        : 1;

      const gradient = ctx.createRadialGradient(n.x, n.y, r * 0.5, n.x, n.y, glowR * pulse);
      gradient.addColorStop(0, `rgba(${cr},${cg},${cb},${glowAlpha * n.alpha})`);
      gradient.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(n.x, n.y, glowR * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Node body
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${(isHovered ? 0.95 : 0.75) * n.alpha})`;
      ctx.fill();

      // Border
      if (n.depth <= 1 || isHovered) {
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${0.5 * n.alpha})`;
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.stroke();
      }

      // Status ring for experiments
      if (n.data.nodeType === 'experiment') {
        this._drawStatusRing(n, r);
      }

      // Labels
      if (n.depth === 0) {
        // Root label
        ctx.fillStyle = `rgba(255,255,255,${0.95 * n.alpha * n.scale})`;
        ctx.font = '700 13px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Life', n.x, n.y - 6);
        ctx.fillText('Goal', n.x, n.y + 8);
      } else if (n.depth === 1) {
        // Stage label below node
        const stageLabel = n.data.stage ? STAGE_LABELS[n.data.stage] : n.label;
        ctx.fillStyle = `rgba(200,200,216,${0.85 * n.alpha * n.scale})`;
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(stageLabel, n.x, n.y + r + 6);

        // Observation count badge
        if (n.data.observationCount > 0) {
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.6 * n.alpha * n.scale})`;
          ctx.font = '400 8px "JetBrains Mono", monospace';
          ctx.fillText(`${n.data.observationCount}`, n.x, n.y + r + 18);
        }
      } else if (isHovered || this.camZoom > 1.5) {
        // Task/experiment labels only on hover or zoomed in
        const maxLen = 18;
        const lbl = n.label.length > maxLen ? n.label.slice(0, maxLen - 1) + '…' : n.label;
        ctx.fillStyle = `rgba(200,200,216,${0.75 * n.alpha * n.scale})`;
        ctx.font = '400 9px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(lbl, n.x, n.y + r + 4);
      }
    }
  }

  private _drawStatusRing(n: LayoutNode, r: number): void {
    const { ctx } = this;
    const status = n.data.status;
    let ringColor: string;

    switch (status) {
      case 'completed': ringColor = 'rgba(80,200,120,0.8)'; break;
      case 'failed':    ringColor = 'rgba(255,68,68,0.8)'; break;
      case 'paused':    ringColor = 'rgba(255,179,71,0.5)'; break;
      default:          ringColor = 'rgba(255,255,255,0.3)'; break;
    }

    ctx.beginPath();
    ctx.arc(n.x, n.y, r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 2;
    ctx.setLineDash(status === 'paused' ? [4, 4] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private _drawParticles(): void {
    const { ctx } = this;
    for (const p of this.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${p.life * 0.6})`;
      ctx.fill();
    }
  }

  // ── Particles ──────────────────────────────────────────

  private _spawnParticles(x: number, y: number, color: string, count: number): void {
    const [r, g, b] = hexToRgb(color);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.015 + Math.random() * 0.02,
        size: 2 + Math.random() * 3,
        r, g, b,
      });
    }
  }

  // ── Resize ─────────────────────────────────────────────

  private _resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === this.width / this.dpr && h === this.height / this.dpr) return;

    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.width = w * this.dpr;
    this.height = h * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
    // Reset the stored dimensions to CSS pixels for calculations
    this.width = w;
    this.height = h;
  }

  // ── Events ─────────────────────────────────────────────

  private _onMouseMove = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (this.isDragging) {
      this.targetCamX = this.camStartX - (e.clientX - this.dragStartX) / this.camZoom;
      this.targetCamY = this.camStartY - (e.clientY - this.dragStartY) / this.camZoom;
      return;
    }

    // Hit test
    const [wx, wy] = this.screenToWorld(mx, my);
    let hit: LayoutNode | null = null;
    let minDist = Infinity;

    for (const n of this.nodes.values()) {
      const dx = wx - n.x;
      const dy = wy - n.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hitR = n.radius * n.scale + 6; // padding
      if (dist < hitR && dist < minDist) {
        hit = n;
        minDist = dist;
      }
    }

    const newId = hit?.id ?? null;
    if (newId !== this.hoveredNodeId) {
      this.hoveredNodeId = newId;
      this.canvas.style.cursor = newId ? 'pointer' : 'grab';
      this._onNodeHover?.(hit ? hit.data : null);
    }
  };

  private _onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.camStartX = this.targetCamX;
    this.camStartY = this.targetCamY;
    this.canvas.style.cursor = 'grabbing';
  };

  private _onMouseUp = (e: MouseEvent): void => {
    const wasDrag = this.isDragging &&
      (Math.abs(e.clientX - this.dragStartX) > 4 || Math.abs(e.clientY - this.dragStartY) > 4);
    this.isDragging = false;
    this.canvas.style.cursor = this.hoveredNodeId ? 'pointer' : 'grab';

    // Click (not drag)
    if (!wasDrag && this.hoveredNodeId) {
      const node = this.nodes.get(this.hoveredNodeId);
      if (node) this._onNodeClick?.(node.data);
    }
  };

  private _onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    this.targetCamZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.targetCamZoom * factor));
  };

  private _onMouseLeave = (): void => {
    if (this.hoveredNodeId) {
      this.hoveredNodeId = null;
      this._onNodeHover?.(null);
    }
    this.isDragging = false;
  };

  private _boundHandlers: Array<[string, EventListener]> = [];

  private _bindEvents(): void {
    const handlers: Array<[string, EventListener]> = [
      ['mousemove', this._onMouseMove as EventListener],
      ['mousedown', this._onMouseDown as EventListener],
      ['mouseup', this._onMouseUp as EventListener],
      ['wheel', this._onWheel as EventListener],
      ['mouseleave', this._onMouseLeave as EventListener],
    ];
    for (const [event, handler] of handlers) {
      this.canvas.addEventListener(event, handler, { passive: false });
    }
    this._boundHandlers = handlers;
  }

  private _unbindEvents(): void {
    for (const [event, handler] of this._boundHandlers) {
      this.canvas.removeEventListener(event, handler);
    }
    this._boundHandlers = [];
  }
}
