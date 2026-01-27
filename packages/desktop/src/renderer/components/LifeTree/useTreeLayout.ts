/**
 * Tree Layout Algorithm
 *
 * Recursive top-down layout for the Life Tree.
 * Computes x/y positions for each node.
 */

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  label: string;
  type: string;
  status: string;
  stage?: string;
  confidence: number;
  experimentStatus?: string;
  experimentPhase?: string;
  children: LayoutNode[];
}

export interface LayoutEdge {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface TreeLayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

const NODE_WIDTH = 120;
const NODE_HEIGHT = 50;
const LEVEL_GAP = 80;
const SIBLING_GAP = 20;

/**
 * Compute tree layout positions.
 */
export function computeTreeLayout(root: any): TreeLayoutResult {
  if (!root) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const flatNodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  // Phase 1: compute subtree widths bottom-up
  function computeWidth(node: any): number {
    if (!node.children || node.children.length === 0) {
      return NODE_WIDTH;
    }
    const childWidths = node.children.map(computeWidth);
    return childWidths.reduce((sum: number, w: number) => sum + w, 0) +
      (node.children.length - 1) * SIBLING_GAP;
  }

  // Phase 2: assign positions top-down
  function assignPositions(node: any, x: number, y: number, depth: number): void {
    const layoutNode: LayoutNode = {
      id: node.id,
      x,
      y,
      label: node.label,
      type: node.type,
      status: node.status,
      stage: node.stage,
      confidence: node.confidence,
      experimentStatus: node.metadata?.experimentStatus,
      experimentPhase: node.metadata?.experimentPhase,
      children: [],
    };
    flatNodes.push(layoutNode);

    if (!node.children || node.children.length === 0) return;

    const childWidths = node.children.map(computeWidth);
    const totalWidth = childWidths.reduce((sum: number, w: number) => sum + w, 0) +
      (node.children.length - 1) * SIBLING_GAP;

    let childX = x - totalWidth / 2;
    const childY = y + NODE_HEIGHT + LEVEL_GAP;

    for (let i = 0; i < node.children.length; i++) {
      const cw = childWidths[i];
      const cx = childX + cw / 2;

      edges.push({
        from: { x, y: y + NODE_HEIGHT / 2 },
        to: { x: cx, y: childY - NODE_HEIGHT / 2 },
      });

      assignPositions(node.children[i], cx, childY, depth + 1);
      childX += cw + SIBLING_GAP;
    }
  }

  const totalWidth = computeWidth(root);
  const centerX = totalWidth / 2 + 60;
  assignPositions(root, centerX, 40, 0);

  // Compute bounds
  let maxX = 0, maxY = 0;
  for (const n of flatNodes) {
    maxX = Math.max(maxX, n.x + NODE_WIDTH / 2);
    maxY = Math.max(maxY, n.y + NODE_HEIGHT);
  }

  return {
    nodes: flatNodes,
    edges,
    width: maxX + 60,
    height: maxY + 40,
  };
}
