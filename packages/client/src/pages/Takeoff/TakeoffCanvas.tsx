import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Ruler,
  Square,
  Hash,
  Box,
  MousePointer2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Settings2,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Palette,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useTakeoffSheets, useCreateMeasurement, useDeleteMeasurement, useDocuments } from '@/lib/api';
import { useUIStore } from '@/store/uiStore';
import MeasurementPanel from './MeasurementPanel';
import type { TakeoffMeasurement, TakeoffPoint, MeasurementType } from '@openestimate/shared';

type Tool = 'select' | 'linear' | 'area' | 'count' | 'volume';

const TOOL_DEFS: Array<{ key: Tool; icon: React.ReactNode; label: string; shortcut: string }> = [
  { key: 'select', icon: <MousePointer2 className="w-4 h-4" />, label: 'Select / Move', shortcut: 'V' },
  { key: 'linear', icon: <Ruler className="w-4 h-4" />, label: 'Linear (LF)', shortcut: 'L' },
  { key: 'area', icon: <Square className="w-4 h-4" />, label: 'Area (SF)', shortcut: 'A' },
  { key: 'count', icon: <Hash className="w-4 h-4" />, label: 'Count (EA)', shortcut: 'C' },
  { key: 'volume', icon: <Box className="w-4 h-4" />, label: 'Volume (CY)', shortcut: 'O' },
];

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

// ── Simple distance / area helpers ────────────────────────────────────────────

function distance(a: TakeoffPoint, b: TakeoffPoint): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function polylineLength(pts: TakeoffPoint[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += distance(pts[i - 1], pts[i]);
  return total;
}

function polygonArea(pts: TakeoffPoint[]): number {
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    area += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  }
  return Math.abs(area / 2);
}

function pxToFt(px: number, pxPerFt: number): number {
  return px / pxPerFt;
}

// ── Canvas drawing helpers ────────────────────────────────────────────────────

function drawMeasurement(
  ctx: CanvasRenderingContext2D,
  m: TakeoffMeasurement,
  selected: boolean,
  pxPerFt: number,
  zoom: number
) {
  const pts = m.pointsJson;
  if (pts.length === 0) return;

  ctx.save();
  ctx.strokeStyle = m.color;
  ctx.fillStyle = m.color;
  ctx.lineWidth = selected ? 3 : 2;
  ctx.globalAlpha = selected ? 1 : 0.8;

  if (m.type === 'linear') {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    // Endpoint dots
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (m.type === 'area' || m.type === 'volume') {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.globalAlpha = 0.2;
    ctx.fill();
    ctx.globalAlpha = selected ? 1 : 0.8;
    ctx.stroke();
  } else if (m.type === 'count') {
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = m.color + '33';
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
    }
  }

  // Label
  const centroid = pts.reduce(
    (acc, p) => ({ x: acc.x + p.x / pts.length, y: acc.y + p.y / pts.length }),
    { x: 0, y: 0 }
  );
  ctx.globalAlpha = 1;
  ctx.font = `bold ${Math.max(10, 12 / zoom)}px sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = m.color;
  ctx.lineWidth = 3;
  const label = `${m.label}: ${m.calculatedValue.toFixed(1)} ${m.unit}`;
  ctx.strokeText(label, centroid.x + 6, centroid.y - 6);
  ctx.fillStyle = m.color;
  ctx.fillText(label, centroid.x + 6, centroid.y - 6);

  ctx.restore();
}

// ── Scale calibration dialog ───────────────────────────────────────────────────

interface ScaleDialogProps {
  pxLength: number;
  onConfirm: (realLength: number, unit: 'ft' | 'm' | 'in') => void;
  onCancel: () => void;
}

function ScaleDialog({ pxLength, onConfirm, onCancel }: ScaleDialogProps) {
  const [realLength, setRealLength] = useState('');
  const [unit, setUnit] = useState<'ft' | 'm' | 'in'>('ft');

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-80"
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
      >
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Set Scale</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          You drew {pxLength.toFixed(0)} px. What is the real-world length?
        </p>
        <div className="flex gap-2 mb-4">
          <input
            type="number"
            value={realLength}
            onChange={(e) => setRealLength(e.target.value)}
            placeholder="e.g. 10"
            autoFocus
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as 'ft' | 'm' | 'in')}
            className="px-2 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none"
          >
            <option value="ft">ft</option>
            <option value="m">m</option>
            <option value="in">in</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onConfirm(parseFloat(realLength) || 1, unit)}
            disabled={!realLength}
            className="flex-1 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-50"
          >
            Set Scale
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Volume depth dialog ───────────────────────────────────────────────────────

interface DepthDialogProps {
  areaSF: number;
  onConfirm: (depth: number) => void;
  onCancel: () => void;
}

function DepthDialog({ areaSF, onConfirm, onCancel }: DepthDialogProps) {
  const [depth, setDepth] = useState('');
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-72"
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
      >
        <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Set Depth</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Area: {areaSF.toFixed(1)} SF. Enter depth to calculate volume (CY).
        </p>
        <div className="flex gap-2 items-center mb-4">
          <input
            type="number"
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
            placeholder="Depth in inches"
            autoFocus
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <span className="text-sm text-gray-400">in</span>
        </div>
        {depth && (
          <p className="text-xs text-gray-500 mb-3">
            = {(areaSF * (parseFloat(depth) / 12) / 27).toFixed(2)} CY
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => onConfirm(parseFloat(depth) || 0)}
            disabled={!depth}
            className="flex-1 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-50"
          >
            OK
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main TakeoffCanvas ────────────────────────────────────────────────────────

interface TakeoffCanvasProps {
  projectId: number;
  sheetId?: number;
}

export default function TakeoffCanvas({ projectId, sheetId }: TakeoffCanvasProps) {
  const { data: sheets = [] } = useTakeoffSheets(projectId);
  const { data: documents = [] } = useDocuments(projectId);
  const createMeasurement = useCreateMeasurement();
  const deleteMeasurement = useDeleteMeasurement();
  const { showError, showSuccess } = useUIStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [currentPoints, setCurrentPoints] = useState<TakeoffPoint[]>([]);
  const [measurements, setMeasurements] = useState<TakeoffMeasurement[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeColor, setActiveColor] = useState(COLORS[0]);
  const [pxPerFt, setPxPerFt] = useState(96); // default: 96 px = 1 ft
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<TakeoffPoint[]>([]);
  const [scaleDialogPxLen, setScaleDialogPxLen] = useState<number | null>(null);
  const [depthDialog, setDepthDialog] = useState<{ areaSF: number; pts: TakeoffPoint[] } | null>(null);
  const [selectedPage, setSelectedPage] = useState(0);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [labelCounter, setLabelCounter] = useState(1);

  const activeSheet = sheets[selectedPage] ?? null;

  // ── Draw loop ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Draw existing measurements
    for (const m of measurements) {
      drawMeasurement(ctx, m, m.id === selectedId, pxPerFt, zoom);
    }

    // Draw in-progress shape
    if (currentPoints.length > 0) {
      ctx.save();
      ctx.strokeStyle = activeColor;
      ctx.fillStyle = activeColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
      for (let i = 1; i < currentPoints.length; i++) ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
      ctx.stroke();
      for (const p of currentPoints) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Draw calibration line
    if (calibrating && calibrationPoints.length === 2) {
      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(calibrationPoints[0].x, calibrationPoints[0].y);
      ctx.lineTo(calibrationPoints[1].x, calibrationPoints[1].y);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }, [measurements, currentPoints, selectedId, zoom, pan, activeColor, calibrating, calibrationPoints, pxPerFt]);

  // ── Canvas event handlers ──────────────────────────────────────────────────

  const screenToCanvas = useCallback((e: React.MouseEvent<HTMLCanvasElement>): TakeoffPoint => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
  }, [pan, zoom]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const pt = screenToCanvas(e);

    if (calibrating) {
      const pts = [...calibrationPoints, pt];
      setCalibrationPoints(pts);
      if (pts.length === 2) {
        const pxLen = distance(pts[0], pts[1]);
        setScaleDialogPxLen(pxLen);
      }
      return;
    }

    if (activeTool === 'select') {
      // Hit test
      const hit = measurements.find((m) => {
        if (m.type === 'count') {
          return m.pointsJson.some((p) => distance(p, pt) < 12);
        }
        if (m.type === 'linear') {
          for (let i = 1; i < m.pointsJson.length; i++) {
            const a = m.pointsJson[i - 1], b = m.pointsJson[i];
            const d = Math.abs((b.y - a.y) * pt.x - (b.x - a.x) * pt.y + b.x * a.y - b.y * a.x) /
              Math.sqrt((b.y - a.y) ** 2 + (b.x - a.x) ** 2);
            if (d < 8) return true;
          }
        }
        return false;
      });
      setSelectedId(hit?.id ?? null);
      return;
    }

    if (activeTool === 'count') {
      // Each click places a count marker
      const newPts = [...currentPoints, pt];
      const val = newPts.length;
      const m: TakeoffMeasurement = {
        id: -Date.now(),
        sheetId: activeSheet?.id ?? 0,
        label: `Count ${labelCounter}`,
        type: 'count',
        pointsJson: newPts,
        calculatedValue: val,
        unit: 'EA',
        linkedLineItemId: null,
        color: activeColor,
        createdAt: new Date().toISOString(),
      };
      setMeasurements((prev) => {
        const existing = prev.find((x) => x.id === -(Date.now() - 1));
        if (existing) {
          return prev.map((x) => x === existing ? m : x);
        }
        return [...prev, m];
      });
      setCurrentPoints(newPts);
      return;
    }

    setCurrentPoints((prev) => {
      const next = [...prev, pt];
      if (activeTool === 'linear') {
        // Live update running total (double-click to finish)
      }
      return next;
    });
  }, [activeTool, calibrating, calibrationPoints, measurements, currentPoints, activeColor, labelCounter, activeSheet, screenToCanvas]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool === 'linear' && currentPoints.length >= 2) {
      const pts = currentPoints;
      const pxLen = polylineLength(pts);
      const realLen = pxToFt(pxLen, pxPerFt);
      const m: TakeoffMeasurement = {
        id: -Date.now(),
        sheetId: activeSheet?.id ?? 0,
        label: `Linear ${labelCounter}`,
        type: 'linear',
        pointsJson: pts,
        calculatedValue: parseFloat(realLen.toFixed(2)),
        unit: 'LF',
        linkedLineItemId: null,
        color: activeColor,
        createdAt: new Date().toISOString(),
      };
      setMeasurements((prev) => [...prev, m]);
      setCurrentPoints([]);
      setLabelCounter((n) => n + 1);
      if (activeSheet) {
        createMeasurement.mutate({ ...m, id: undefined, projectId } as Parameters<typeof createMeasurement.mutate>[0]);
      }
    }
  }, [activeTool, currentPoints, pxPerFt, activeColor, labelCounter, activeSheet, projectId, createMeasurement]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    // Finish area/volume on right-click
    if ((activeTool === 'area' || activeTool === 'volume') && currentPoints.length >= 3) {
      const pts = currentPoints;
      const pxArea = polygonArea(pts);
      const realAreaSF = pxToFt(Math.sqrt(pxArea), pxPerFt) ** 2;

      if (activeTool === 'volume') {
        setDepthDialog({ areaSF: realAreaSF, pts });
        setCurrentPoints([]);
        return;
      }

      const m: TakeoffMeasurement = {
        id: -Date.now(),
        sheetId: activeSheet?.id ?? 0,
        label: `Area ${labelCounter}`,
        type: 'area',
        pointsJson: pts,
        calculatedValue: parseFloat(realAreaSF.toFixed(2)),
        unit: 'SF',
        linkedLineItemId: null,
        color: activeColor,
        createdAt: new Date().toISOString(),
      };
      setMeasurements((prev) => [...prev, m]);
      setCurrentPoints([]);
      setLabelCounter((n) => n + 1);
      if (activeSheet) {
        createMeasurement.mutate({ ...m, id: undefined, projectId } as Parameters<typeof createMeasurement.mutate>[0]);
      }
    }
    if (activeTool === 'count') {
      // Finish count
      setCurrentPoints([]);
      setLabelCounter((n) => n + 1);
    }
  }, [activeTool, currentPoints, pxPerFt, activeColor, labelCounter, activeSheet, projectId, createMeasurement]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.min(8, Math.max(0.1, z * delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (selectedId === null) return;
    setMeasurements((prev) => prev.filter((m) => m.id !== selectedId));
    setSelectedId(null);
    if (selectedId > 0 && activeSheet) {
      deleteMeasurement.mutate({ id: selectedId, sheetId: activeSheet.id, projectId });
    }
  }, [selectedId, activeSheet, projectId, deleteMeasurement]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      switch (e.key.toUpperCase()) {
        case 'V': setActiveTool('select'); break;
        case 'L': setActiveTool('linear'); break;
        case 'A': setActiveTool('area'); break;
        case 'C': setActiveTool('count'); break;
        case 'O': setActiveTool('volume'); break;
        case 'ESCAPE': setCurrentPoints([]); setCalibrating(false); setCalibrationPoints([]); break;
        case 'DELETE':
        case 'BACKSPACE':
          if (selectedId !== null) handleDeleteSelected();
          break;
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selectedId, handleDeleteSelected]);

  // ── Resize canvas ──────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ro = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex h-full overflow-hidden bg-gray-100 dark:bg-gray-950">
      {/* Left: page thumbnails */}
      <div className="w-24 flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 overflow-y-auto flex flex-col">
        <div className="px-2 py-2 text-xs font-semibold text-gray-400 border-b border-gray-200 dark:border-gray-700">
          Pages
        </div>
        {documents.filter((d) => d.mimeType === 'application/pdf').length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-3">
            <p className="text-xs text-gray-400 text-center">No PDFs uploaded</p>
          </div>
        ) : (
          documents
            .filter((d) => d.mimeType === 'application/pdf')
            .map((doc, idx) => (
              <button
                key={doc.id}
                onClick={() => setSelectedPage(idx)}
                className={`mx-2 my-1.5 rounded-lg border-2 transition-colors overflow-hidden ${
                  selectedPage === idx
                    ? 'border-orange-500'
                    : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="w-full aspect-[3/4] bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <span className="text-xs text-gray-400">p.{idx + 1}</span>
                </div>
              </button>
            ))
        )}
      </div>

      {/* Center: canvas + toolbar */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          {/* Tools */}
          <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {TOOL_DEFS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTool(t.key)}
                title={`${t.label} (${t.shortcut})`}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTool === t.key
                    ? 'bg-white dark:bg-gray-700 text-orange-600 dark:text-orange-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t.icon}
                <span className="hidden lg:inline">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />

          {/* Zoom */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom((z) => Math.max(0.1, z / 1.2))}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(8, z * 1.2))}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
              title="Reset view"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />

          {/* Color picker */}
          <div className="relative">
            <button
              onClick={() => setShowColorPicker((v) => !v)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="w-5 h-5 rounded-full border-2 border-white dark:border-gray-700 shadow" style={{ backgroundColor: activeColor }} />
              <Palette className="w-3.5 h-3.5 text-gray-400" />
            </button>
            <AnimatePresence>
              {showColorPicker && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-2 flex gap-1.5 flex-wrap w-28"
                >
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => { setActiveColor(c); setShowColorPicker(false); }}
                      className={`w-6 h-6 rounded-full border-2 ${activeColor === c ? 'border-gray-900 dark:border-white' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Scale calibration */}
          <button
            onClick={() => { setCalibrating(true); setCalibrationPoints([]); setActiveTool('select'); }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
              calibrating
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            {calibrating ? 'Click two points on a known length' : 'Set Scale'}
            {calibrating && (
              <button
                onClick={(e) => { e.stopPropagation(); setCalibrating(false); setCalibrationPoints([]); }}
                className="ml-1"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </button>

          {/* Scale indicator */}
          <span className="text-xs text-gray-400 ml-1">
            1 ft = {pxPerFt.toFixed(0)} px
          </span>
        </div>

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden bg-gray-200 dark:bg-gray-800"
          style={{ cursor: isPanning ? 'grabbing' : activeTool === 'select' ? 'default' : 'crosshair' }}
        >
          {/* Empty state */}
          {documents.filter((d) => d.mimeType === 'application/pdf').length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
              <Square className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">No PDF uploaded</p>
              <p className="text-xs mt-1">Upload a PDF in the project documents tab</p>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            onClick={handleCanvasClick}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 text-xs text-gray-400">
          <span>
            {activeTool !== 'select' && (
              <>
                {activeTool === 'linear' && 'Click to add points. Double-click to finish.'}
                {activeTool === 'area' && 'Click to add polygon points. Right-click to close.'}
                {activeTool === 'count' && 'Click to place count markers. Right-click to finish.'}
                {activeTool === 'volume' && 'Click to draw area. Right-click to finish, then enter depth.'}
                {calibrating && 'Click two points on a known dimension to set scale.'}
              </>
            )}
            {selectedId !== null && activeTool === 'select' && (
              <span>
                Selected — <button onClick={handleDeleteSelected} className="text-red-500 hover:underline">Delete</button>
              </span>
            )}
          </span>
          <span>{currentPoints.length > 0 && `${currentPoints.length} pts`}</span>
        </div>
      </div>

      {/* Right: measurement panel */}
      <div className="w-72 flex-shrink-0">
        <MeasurementPanel
          measurements={measurements}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onDelete={handleDeleteSelected}
          onSendToEstimate={(items) => {
            showSuccess(`${items.length} measurement(s) sent to estimate`);
          }}
        />
      </div>

      {/* Dialogs */}
      <AnimatePresence>
        {scaleDialogPxLen !== null && (
          <ScaleDialog
            pxLength={scaleDialogPxLen}
            onConfirm={(realLen, unit) => {
              const ftLen = unit === 'ft' ? realLen : unit === 'in' ? realLen / 12 : realLen * 3.28084;
              setPxPerFt(scaleDialogPxLen / ftLen);
              setScaleDialogPxLen(null);
              setCalibrating(false);
              setCalibrationPoints([]);
              showSuccess(`Scale set: 1 ft = ${(scaleDialogPxLen / ftLen).toFixed(1)} px`);
            }}
            onCancel={() => { setScaleDialogPxLen(null); setCalibrating(false); setCalibrationPoints([]); }}
          />
        )}
        {depthDialog && (
          <DepthDialog
            areaSF={depthDialog.areaSF}
            onConfirm={(depthInches) => {
              const cy = (depthDialog.areaSF * (depthInches / 12)) / 27;
              const m: TakeoffMeasurement = {
                id: -Date.now(),
                sheetId: activeSheet?.id ?? 0,
                label: `Volume ${labelCounter}`,
                type: 'volume',
                pointsJson: depthDialog.pts,
                calculatedValue: parseFloat(cy.toFixed(3)),
                unit: 'CY',
                linkedLineItemId: null,
                color: activeColor,
                depth: depthInches,
                createdAt: new Date().toISOString(),
              };
              setMeasurements((prev) => [...prev, m]);
              setLabelCounter((n) => n + 1);
              setDepthDialog(null);
              if (activeSheet) {
                createMeasurement.mutate({ ...m, id: undefined, projectId } as Parameters<typeof createMeasurement.mutate>[0]);
              }
            }}
            onCancel={() => setDepthDialog(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
