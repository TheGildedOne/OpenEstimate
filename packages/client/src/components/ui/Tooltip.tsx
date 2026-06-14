import React, { useState, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
  disabled?: boolean;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 200,
  className = '',
  disabled = false,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const show = () => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const OFFSET = 8;
        let x = 0;
        let y = 0;

        switch (position) {
          case 'top':
            x = rect.left + rect.width / 2;
            y = rect.top - OFFSET;
            break;
          case 'bottom':
            x = rect.left + rect.width / 2;
            y = rect.bottom + OFFSET;
            break;
          case 'left':
            x = rect.left - OFFSET;
            y = rect.top + rect.height / 2;
            break;
          case 'right':
            x = rect.right + OFFSET;
            y = rect.top + rect.height / 2;
            break;
        }
        setCoords({ x, y });
        setIsVisible(true);
      }
    }, delay);
  };

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  const transformOrigin: Record<typeof position, string> = {
    top: 'bottom center',
    bottom: 'top center',
    left: 'right center',
    right: 'left center',
  };

  const transformStyle: Record<typeof position, React.CSSProperties> = {
    top: { left: coords.x, top: coords.y, transform: 'translate(-50%, -100%)' },
    bottom: { left: coords.x, top: coords.y, transform: 'translate(-50%, 0)' },
    left: { left: coords.x, top: coords.y, transform: 'translate(-100%, -50%)' },
    right: { left: coords.x, top: coords.y, transform: 'translate(0, -50%)' },
  };

  const child = React.cloneElement(children, {
    ref: triggerRef,
    onMouseEnter: (e: React.MouseEvent) => {
      show();
      children.props.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hide();
      children.props.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      show();
      children.props.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      hide();
      children.props.onBlur?.(e);
    },
    'aria-describedby': isVisible ? tooltipId : undefined,
  });

  return (
    <>
      {child}
      {createPortal(
        <AnimatePresence>
          {isVisible && (
            <motion.div
              id={tooltipId}
              role="tooltip"
              className={[
                'fixed z-[9998] pointer-events-none',
                'px-2.5 py-1.5 rounded-md text-xs font-medium',
                'bg-gray-900 text-white dark:bg-zinc-700 dark:text-zinc-100',
                'shadow-md max-w-xs text-center',
                className,
              ].join(' ')}
              style={{ ...transformStyle[position], transformOrigin: transformOrigin[position] }}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.1 }}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
