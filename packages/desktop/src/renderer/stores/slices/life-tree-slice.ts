import type { StateCreator } from 'zustand';
import type { HawkeyeStore, LifeTreeSlice } from '../types';

export const createLifeTreeSlice: StateCreator<HawkeyeStore, [], [], LifeTreeSlice> = (set, get) => ({
  lifeTree: null,
  lifeTreeLoading: false,
  lifeTreeError: null,
  selectedNodeId: null,
  expandedNodeIds: new Set<string>(),
  showLifeTree: false,

  setShowLifeTree: (show) => set({ showLifeTree: show }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  toggleNodeExpanded: (id) => set((state) => {
    const next = new Set(state.expandedNodeIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return { expandedNodeIds: next };
  }),

  fetchLifeTree: async () => {
    set({ lifeTreeLoading: true, lifeTreeError: null });
    try {
      const tree = await (window as any).hawkeye.lifeTree.getTree();
      set({ lifeTree: tree, lifeTreeLoading: false });
    } catch (err: any) {
      set({ lifeTreeError: err.message ?? 'Failed to fetch life tree', lifeTreeLoading: false });
    }
  },

  rebuildLifeTree: async () => {
    set({ lifeTreeLoading: true, lifeTreeError: null });
    try {
      const tree = await (window as any).hawkeye.lifeTree.rebuild();
      set({ lifeTree: tree, lifeTreeLoading: false });
    } catch (err: any) {
      set({ lifeTreeError: err.message ?? 'Failed to rebuild life tree', lifeTreeLoading: false });
    }
  },
});
