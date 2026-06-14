import { useEstimateStore } from '../store/estimateStore';

export interface UndoRedoControls {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

export function useUndoRedo(): UndoRedoControls {
  const undoStack = useEstimateStore((s) => s.undoStack);
  const redoStack = useEstimateStore((s) => s.redoStack);
  const undo = useEstimateStore((s) => s.undo);
  const redo = useEstimateStore((s) => s.redo);

  return {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undo,
    redo,
  };
}
