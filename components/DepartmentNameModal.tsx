'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

type DepartmentNameModalProps = {
  open: boolean;
  title?: string;
  label?: string;
  placeholder?: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
};

export default function DepartmentNameModal({
  open,
  title = 'Add department',
  label = 'Enter department name',
  placeholder = 'Department name',
  onClose,
  onConfirm,
}: DepartmentNameModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = inputRef.current?.value ?? '';
    const normalized = raw.trim();
    if (!normalized) return;
    onConfirm(normalized);
    if (inputRef.current) inputRef.current.value = '';
    onClose();
  };

  const handleCancel = () => {
    if (inputRef.current) inputRef.current.value = '';
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="department-modal-title"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={handleCancel}
          className="absolute right-3 top-3 rounded-full p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <form onSubmit={handleSubmit} className="p-6 pt-8">
          <h2
            id="department-modal-title"
            className="text-lg font-semibold text-gray-900 pr-8"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-gray-500">{label}</p>

          <input
            ref={inputRef}
            type="text"
            name="departmentName"
            autoComplete="off"
            placeholder={placeholder}
            className="mt-4 w-full rounded-xl border-2 border-primary-600 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold text-gray-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 transition-colors"
            >
              OK
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
