'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';

const scrollHide =
  'overflow-y-auto max-h-[min(22rem,50vh)] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

type DepartmentPickerModalProps = {
  open: boolean;
  onClose: () => void;
  /** Department names from the dashboard (upload / manage list). */
  departments: string[];
  selected: string[];
  onToggle: (name: string) => void;
  title?: string;
};

export default function DepartmentPickerModal({
  open,
  onClose,
  departments,
  selected,
  onToggle,
  title = 'Choose departments',
}: DepartmentPickerModalProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((d) => d.toLowerCase().includes(q));
  }, [departments, query]);

  if (!open) return null;

  const selectedSet = new Set(selected.map((s) => s.toLowerCase()));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dept-picker-title"
    >
      <div className="relative w-full max-w-[420px] rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[min(90vh,560px)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-5 pb-3 pr-12 border-b border-gray-100 shrink-0">
          <h2 id="dept-picker-title" className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            List updates when you change departments on the Dashboard.
          </p>
        </div>

        <div className="px-5 pt-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search departments…"
              autoComplete="off"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </div>

        <div className={`px-5 py-3 flex-1 min-h-0 ${scrollHide}`}>
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {departments.length === 0
                ? 'No departments on the Dashboard yet — upload or add names there first.'
                : 'No matches for your search.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {filtered.map((dept) => {
                const checked = selectedSet.has(dept.toLowerCase());
                return (
                  <li key={dept}>
                    <label className="flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-gray-50 text-sm text-gray-800">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(dept)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 shrink-0"
                      />
                      <span className="min-w-0 break-words">{dept}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50/80 shrink-0 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
