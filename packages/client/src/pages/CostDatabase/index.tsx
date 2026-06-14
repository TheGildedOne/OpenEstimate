import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database } from 'lucide-react';
import CategoryTree from './CategoryTree';
import ItemList from './ItemList';
import ItemDetail from './ItemDetail';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageContainer } from '@/components/layout/PageContainer';

// ─── Resizable split ──────────────────────────────────────────────────────────

function ResizablePanel({
  left,
  right,
  defaultLeftWidth = 288,
  minLeftWidth = 180,
  maxLeftWidth = 480,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultLeftWidth?: number;
  minLeftWidth?: number;
  maxLeftWidth?: number;
}) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const isDragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startW = leftWidth;

    const onMove = (mv: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = mv.clientX - startX;
      const newW = Math.max(minLeftWidth, Math.min(maxLeftWidth, startW + delta));
      setLeftWidth(newW);
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [leftWidth, minLeftWidth, maxLeftWidth]);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div style={{ width: leftWidth, minWidth: leftWidth }} className="overflow-y-auto border-r border-gray-200 dark:border-zinc-700 flex-shrink-0">
        {left}
      </div>
      <div
        className="w-1 cursor-col-resize bg-transparent hover:bg-orange-400 dark:hover:bg-orange-500 transition-colors flex-shrink-0 group"
        onMouseDown={onMouseDown}
      >
        <div className="w-full h-full group-hover:bg-orange-400 dark:group-hover:bg-orange-500 transition-colors" />
      </div>
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {right}
      </div>
    </div>
  );
}

// ─── Main CostDatabase page ───────────────────────────────────────────────────

export default function CostDatabasePage() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  const handleCategorySelect = useCallback((id: number | null) => {
    setSelectedCategoryId(id);
    setSelectedItemId(null);
  }, []);

  const handleItemSelect = useCallback((id: number) => {
    setSelectedItemId(id);
  }, []);

  const handleItemDeleted = useCallback(() => {
    setSelectedItemId(null);
  }, []);

  return (
    <PageContainer fluid className="flex flex-col h-screen overflow-hidden pt-14 pl-56">
      <div
        data-testid="cost-database-page"
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
      >
        <ResizablePanel
          defaultLeftWidth={288}
          left={
            <div className="flex flex-col h-full">
              <div className="px-4 pt-4 pb-2 border-b border-gray-200 dark:border-zinc-700 flex-shrink-0">
                <h1 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-gray-400" />
                  Cost Database
                </h1>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                <CategoryTree
                  selectedCategoryId={selectedCategoryId}
                  onSelect={handleCategorySelect}
                />
              </div>
            </div>
          }
          right={
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* Item list */}
              <div className={`flex flex-col overflow-hidden transition-all ${selectedItemId ? 'flex-1' : 'flex-1'}`}>
                {selectedCategoryId === null ? (
                  <div className="flex-1 flex items-center justify-center">
                    <EmptyState
                      icon={<Database />}
                      title="Select a category"
                      description="Choose a category from the left panel to browse cost items."
                    />
                  </div>
                ) : (
                  <ItemList
                    categoryId={selectedCategoryId}
                    selectedItemId={selectedItemId}
                    onSelectItem={handleItemSelect}
                  />
                )}
              </div>

              {/* Item detail panel */}
              <AnimatePresence>
                {selectedItemId !== null && (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 380, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="flex-shrink-0 border-l border-gray-200 dark:border-zinc-700 overflow-hidden"
                  >
                    <div className="w-[380px] h-full overflow-y-auto">
                      <ItemDetail
                        itemId={selectedItemId}
                        onClose={() => setSelectedItemId(null)}
                        onDeleted={handleItemDeleted}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          }
        />
      </div>
    </PageContainer>
  );
}
