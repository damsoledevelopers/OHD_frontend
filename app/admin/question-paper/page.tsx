'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import toast from 'react-hot-toast';
import { questionPaperAPI } from '@/lib/apiClient';

interface Question {
  id: number;
  text: string;
}

interface Section {
  id: number;
  name: string;
  questions: Question[];
}

interface Pillar {
  id: number;
  name: string;
  sections: Section[];
}

export default function QuestionPaperPage() {
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [pillarNameInput, setPillarNameInput] = useState('');
  const [editingPillarId, setEditingPillarId] = useState<number | null>(null);
  const [showPillarModal, setShowPillarModal] = useState(false);

  const idCounterRef = useRef(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const nextId = () => {
    const nextIdValue = idCounterRef.current;
    idCounterRef.current += 1;
    return nextIdValue;
  };

  // Load draft structure from backend
  useEffect(() => {
    const loadDraft = async () => {
      try {
        setLoading(true);
        const res = await questionPaperAPI.getDraft();
        const remotePillars = res.data?.pillars || [];

        let counter = 1;
        const mapId = () => counter++;

        const mappedPillars: Pillar[] = remotePillars.map((p: any) => ({
          id: mapId(),
          name: p.name,
          sections: (p.sections || []).map((s: any) => ({
            id: mapId(),
            name: s.name,
            questions: (s.questions || []).map((q: any) => ({
              id: mapId(),
              text: q.text,
            })),
          })),
        }));

        setPillars(mappedPillars);
        idCounterRef.current = counter;
      } catch (error: unknown) {
        console.error('Failed to load question paper draft', error);
        const message =
          error instanceof Error ? error.message : 'Failed to load question paper';
        toast.error(message);
      } finally {
        setLoading(false);
      }
    };

    loadDraft();
  }, []);

  const persistDraft = async (nextPillars: Pillar[]) => {
    try {
      setSaving(true);
      const payload = {
        pillars: nextPillars.map((p) => ({
          name: p.name,
          sections: p.sections.map((s) => ({
            name: s.name,
            questions: s.questions.map((q) => ({ text: q.text })),
          })),
        })),
      };
      await questionPaperAPI.saveDraft(payload);
    } catch (error: unknown) {
      console.error('Failed to save draft', error);
      const message =
        error instanceof Error ? error.message : 'Failed to save question paper';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddPillar = () => {
    if (!pillarNameInput.trim()) {
      toast.error('Please enter pillar name');
      return;
    }
    const id = nextId();
    setPillars((prev) => {
      const next = [
        ...prev,
        { id, name: pillarNameInput.trim(), sections: [] },
      ];
      void persistDraft(next);
      return next;
    });
    setPillarNameInput('');
    setShowPillarModal(false);
    toast.success('Pillar added');
  };

  const handleUpdatePillar = () => {
    if (!editingPillarId) return;
    if (!pillarNameInput.trim()) {
      toast.error('Please enter pillar name');
      return;
    }
    setPillars((prev) => {
      const next = prev.map((p) =>
        p.id === editingPillarId ? { ...p, name: pillarNameInput.trim() } : p,
      );
      void persistDraft(next);
      return next;
    });
    setEditingPillarId(null);
    setPillarNameInput('');
    setShowPillarModal(false);
    toast.success('Pillar updated');
  };

  const handleDeletePillar = (id: number) => {
    setPillars((prev) => {
      const next = prev.filter((p) => p.id !== id);
      void persistDraft(next);
      return next;
    });
    toast.success('Pillar deleted');
  };

  const resetPillarForm = () => {
    setEditingPillarId(null);
    setPillarNameInput('');
    setShowPillarModal(false);
  };

  const handlePublish = async () => {
    try {
      setPublishing(true);
      await questionPaperAPI.publish();
      toast.success('Question paper published successfully');
    } catch (error: unknown) {
      console.error('Failed to publish question paper', error);
      const message =
        error instanceof Error ? error.message : 'Failed to publish question paper';
      toast.error(message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <img
              src="/ohdlogo.png"
              alt="OHD Logo"
              width={48}
              height={48}
              className="w-12 h-12 object-contain rounded-lg border border-gray-200 bg-white shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900">Question Paper Builder</h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage pillars first, then drill into sections and questions on separate pages.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing || loading}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 disabled:opacity-50"
          >
            {publishing ? 'Publishing...' : 'Publish question set'}
          </button>
        </div>

        {loading && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 text-sm text-gray-500">
            Loading question paper...
          </div>
        )}

        {!loading && (
          <p className="text-xs text-gray-500">
            {saving
              ? 'Saving changes…'
              : 'All changes are saved as draft. Click publish to update the live survey.'}
          </p>
        )}

        {!loading && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Pillars</h2>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Define top-level dimensions for your question paper.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingPillarId(null);
                  setPillarNameInput('');
                  setShowPillarModal(true);
                }}
                className="inline-flex items-center px-3 py-1.5 rounded-lg bg-primary-600 text-white text-[11px] font-semibold hover:bg-primary-700"
              >
                Add pillar
              </button>
            </div>

            <div className="space-y-2 overflow-y-auto max-h-[480px] pr-1">
              {pillars.length === 0 && (
                <p className="text-xs text-gray-500">
                  No pillars added yet. Start by creating your first pillar.
                </p>
              )}
              {pillars.map((pillar, index) => (
                <Link
                  key={pillar.id}
                  href={`/admin/question-paper/${index}`}
                  className="block w-full border rounded-lg p-3 flex flex-col gap-2 text-left transition-colors border-gray-200 hover:border-primary-300 hover:bg-primary-50/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 line-clamp-2">
                      {pillar.name}
                    </p>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setEditingPillarId(pillar.id);
                          setPillarNameInput(pillar.name);
                          setShowPillarModal(true);
                        }}
                        className="px-2 py-1 rounded-md text-[11px] border border-gray-200 text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          handleDeletePillar(pillar.id);
                        }}
                        className="px-2 py-1 rounded-md text-[11px] border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Sections: {pillar.sections.length} • Questions:{' '}
                    {pillar.sections.reduce((sum, s) => sum + s.questions.length, 0)}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pillar modal */}
      {showPillarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">
                {editingPillarId ? 'Edit pillar' : 'Add pillar'}
              </h2>
              <button
                type="button"
                onClick={resetPillarForm}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-700">
                Pillar name
              </label>
              <input
                type="text"
                value={pillarNameInput}
                onChange={(e) => setPillarNameInput(e.target.value)}
                placeholder="Enter pillar name"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={resetPillarForm}
                className="px-3 py-2 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={editingPillarId ? handleUpdatePillar : handleAddPillar}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700"
              >
                {editingPillarId ? 'Update pillar' : 'Add pillar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
