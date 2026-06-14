import { create } from 'zustand';
import type { Estimate, EstimateSection, EstimateLineItem } from '@openestimate/shared';

export interface EstimateState {
  sections: EstimateSection[];
  lineItems: EstimateLineItem[];
}

interface EstimateStoreState {
  estimate: Estimate | null;
  undoStack: EstimateState[];
  redoStack: EstimateState[];
  isDirty: boolean;
  isAutoSaving: boolean;
}

interface EstimateStoreActions {
  setEstimate: (estimate: Estimate) => void;
  updateLineItem: (id: number, updates: Partial<EstimateLineItem>) => void;
  addLineItem: (sectionId: number, item: EstimateLineItem) => void;
  deleteLineItem: (id: number) => void;
  addSection: (section: EstimateSection) => void;
  updateSection: (id: number, updates: Partial<EstimateSection>) => void;
  deleteSection: (id: number) => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  setAutoSaving: (value: boolean) => void;
  pushToUndoStack: () => void;
  reset: () => void;
}

export type EstimateStore = EstimateStoreState & EstimateStoreActions;

const MAX_UNDO_STATES = 50;

function extractState(estimate: Estimate | null): EstimateState {
  if (!estimate) return { sections: [], lineItems: [] };
  const sections = estimate.sections ?? [];
  const lineItems = sections.flatMap((s) => s.lineItems ?? []);
  return { sections, lineItems };
}

function applySectionState(estimate: Estimate, state: EstimateState): Estimate {
  // Rebuild sections with their line items
  const itemsBySectionId = new Map<number, EstimateLineItem[]>();
  for (const item of state.lineItems) {
    const arr = itemsBySectionId.get(item.sectionId) ?? [];
    arr.push(item);
    itemsBySectionId.set(item.sectionId, arr);
  }
  const sections = state.sections.map((s) => ({
    ...s,
    lineItems: itemsBySectionId.get(s.id) ?? [],
  }));
  return { ...estimate, sections };
}

export const useEstimateStore = create<EstimateStore>((set, get) => ({
  estimate: null,
  undoStack: [],
  redoStack: [],
  isDirty: false,
  isAutoSaving: false,

  setEstimate: (estimate) => {
    set({ estimate, undoStack: [], redoStack: [], isDirty: false });
  },

  pushToUndoStack: () => {
    const current = get().estimate;
    if (!current) return;
    const snapshot = extractState(current);
    set((s) => {
      const next = [snapshot, ...s.undoStack].slice(0, MAX_UNDO_STATES);
      return { undoStack: next, redoStack: [] };
    });
  },

  updateLineItem: (id, updates) => {
    get().pushToUndoStack();
    set((s) => {
      if (!s.estimate) return {};
      const sections = (s.estimate.sections ?? []).map((section) => ({
        ...section,
        lineItems: (section.lineItems ?? []).map((item) =>
          item.id === id ? { ...item, ...updates } : item
        ),
      }));
      return { estimate: { ...s.estimate, sections }, isDirty: true };
    });
  },

  addLineItem: (sectionId, item) => {
    get().pushToUndoStack();
    set((s) => {
      if (!s.estimate) return {};
      const sections = (s.estimate.sections ?? []).map((section) => {
        if (section.id !== sectionId) return section;
        return { ...section, lineItems: [...(section.lineItems ?? []), item] };
      });
      return { estimate: { ...s.estimate, sections }, isDirty: true };
    });
  },

  deleteLineItem: (id) => {
    get().pushToUndoStack();
    set((s) => {
      if (!s.estimate) return {};
      const sections = (s.estimate.sections ?? []).map((section) => ({
        ...section,
        lineItems: (section.lineItems ?? []).filter((item) => item.id !== id),
      }));
      return { estimate: { ...s.estimate, sections }, isDirty: true };
    });
  },

  addSection: (section) => {
    get().pushToUndoStack();
    set((s) => {
      if (!s.estimate) return {};
      const sections = [...(s.estimate.sections ?? []), { ...section, lineItems: [] }];
      return { estimate: { ...s.estimate, sections }, isDirty: true };
    });
  },

  updateSection: (id, updates) => {
    get().pushToUndoStack();
    set((s) => {
      if (!s.estimate) return {};
      const sections = (s.estimate.sections ?? []).map((section) =>
        section.id === id ? { ...section, ...updates } : section
      );
      return { estimate: { ...s.estimate, sections }, isDirty: true };
    });
  },

  deleteSection: (id) => {
    get().pushToUndoStack();
    set((s) => {
      if (!s.estimate) return {};
      const sections = (s.estimate.sections ?? []).filter((section) => section.id !== id);
      return { estimate: { ...s.estimate, sections }, isDirty: true };
    });
  },

  undo: () => {
    const { estimate, undoStack } = get();
    if (!estimate || undoStack.length === 0) return;
    const [prev, ...rest] = undoStack;
    const currentSnapshot = extractState(estimate);
    set((s) => ({
      estimate: applySectionState(estimate, prev),
      undoStack: rest,
      redoStack: [currentSnapshot, ...s.redoStack],
      isDirty: true,
    }));
  },

  redo: () => {
    const { estimate, redoStack } = get();
    if (!estimate || redoStack.length === 0) return;
    const [next, ...rest] = redoStack;
    const currentSnapshot = extractState(estimate);
    set((s) => ({
      estimate: applySectionState(estimate, next),
      redoStack: rest,
      undoStack: [currentSnapshot, ...s.undoStack],
      isDirty: true,
    }));
  },

  markSaved: () => {
    set({ isDirty: false, isAutoSaving: false });
  },

  setAutoSaving: (value) => {
    set({ isAutoSaving: value });
  },

  reset: () => {
    set({ estimate: null, undoStack: [], redoStack: [], isDirty: false, isAutoSaving: false });
  },
}));
