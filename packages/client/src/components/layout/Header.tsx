import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useMatches } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { useLogout, apiFetch } from '../../lib/api';
import { NotificationBell } from '../NotificationBell';
import { DarkModeToggle } from '../DarkModeToggle';

interface SearchResult {
  type: 'project' | 'estimate';
  id: number;
  title: string;
  subtitle?: string;
  href: string;
}

function useGlobalSearch(query: string) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const data = await apiFetch<SearchResult[]>(
          `/api/search?q=${encodeURIComponent(query)}`
        );
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);
  }, [query]);

  return { results, isLoading };
}

function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } catch {
      // ignore
    } finally {
      navigate('/login');
    }
  };

  if (!user) return null;

  const initials = user.name
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0].toUpperCase())
    .slice(0, 2)
    .join('');

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-950 text-brand-700 dark:text-brand-300 flex items-center justify-center text-xs font-semibold">
          {initials}
        </div>
        <span className="hidden sm:block text-sm font-medium text-gray-700 dark:text-zinc-300">
          {user.name}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-48 rounded-lg shadow-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 py-1 z-50">
          <div className="px-3 py-2 border-b border-gray-100 dark:border-zinc-800">
            <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">{user.name}</p>
            <p className="text-xs text-gray-500 dark:text-zinc-500">{user.email}</p>
          </div>
          <button
            onClick={() => { setOpen(false); navigate('/settings'); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Profile &amp; Settings
          </button>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Header({ searchRef }: { searchRef?: React.RefObject<HTMLInputElement> }) {
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const { results, isLoading } = useGlobalSearch(query);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Merge external ref
  useEffect(() => {
    if (searchRef && inputRef.current) {
      (searchRef as React.MutableRefObject<HTMLInputElement | null>).current = inputRef.current;
    }
  }, [searchRef]);

  const matches = useMatches();
  const currentMatch = matches[matches.length - 1];
  const pageTitle = (currentMatch?.handle as { title?: string } | undefined)?.title ?? '';

  const clearSearch = () => {
    setQuery('');
    setSearchOpen(false);
    inputRef.current?.blur();
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [searchOpen]);

  return (
    <header className="h-14 flex items-center gap-3 px-4 border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 sticky top-0 z-30">
      {/* Page title */}
      {pageTitle && (
        <h1 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mr-2 whitespace-nowrap hidden md:block">
          {pageTitle}
        </h1>
      )}

      {/* Search */}
      <div className="relative flex-1 max-w-sm">
        <div className="relative flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-gray-400 dark:text-zinc-500 pointer-events-none" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search projects, estimates…"
            className={[
              'w-full pl-9 pr-8 py-1.5 text-sm rounded-lg border',
              'bg-gray-50 dark:bg-zinc-900',
              'text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500',
              'border-gray-200 dark:border-zinc-700',
              'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
            ].join(' ')}
            aria-label="Global search"
            aria-autocomplete="list"
            aria-expanded={searchOpen && (results.length > 0 || isLoading)}
          />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {searchOpen && query.length >= 2 && (
          <div
            ref={dropdownRef}
            className="absolute top-full mt-1 w-full rounded-lg shadow-lg bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 overflow-hidden z-50"
            role="listbox"
          >
            {isLoading && (
              <div className="px-4 py-3 text-sm text-gray-500 dark:text-zinc-400">Searching…</div>
            )}
            {!isLoading && results.length === 0 && (
              <div className="px-4 py-3 text-sm text-gray-500 dark:text-zinc-400">No results found</div>
            )}
            {results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                role="option"
                aria-selected={false}
                className="flex flex-col w-full px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 text-left transition-colors"
                onClick={() => {
                  navigate(r.href);
                  clearSearch();
                }}
              >
                <span className="text-sm font-medium text-gray-900 dark:text-zinc-100">{r.title}</span>
                {r.subtitle && (
                  <span className="text-xs text-gray-500 dark:text-zinc-500">{r.subtitle}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <NotificationBell />
        <DarkModeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
