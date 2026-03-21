'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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

interface RemoteQuestion {
  text: string;
  order?: number;
}

interface RemoteSection {
  name: string;
  order?: number;
  questions?: RemoteQuestion[];
}

interface RemotePillar {
  name: string;
  order?: number;
  sections?: RemoteSection[];
}

export default function PillarSectionsPage() {
  const params = useParams<{ pillarIndex: string }>();
  const router = useRouter();

  const pillarIndex = Number(params.pillarIndex);

  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [sectionNameInput, setSectionNameInput] = useState('');
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null);
  const [showSectionModal, setShowSectionModal] = useState(false);

  const idCounterRef = useRef(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const nextId = () => {
    const nextIdValue = idCounterRef.current;
    idCounterRef.current += 1;
    return nextIdValue;
  };

  const currentPillar = pillars[pillarIndex] ?? null;

  useEffect(() => {
    if (Number.isNaN(pillarIndex)) {
      router.push('/admin/question-paper');
      return;
    }
  }, [pillarIndex, router]);

  // Load draft structure from backend
  useEffect(() => {
    const loadDraft = async () => {
      try {
        setLoading(true);
        const res = await questionPaperAPI.getDraft();
        const remotePillars: RemotePillar[] = res.data?.pillars || [];

        let counter = 1;
        const mapId = () => counter++;

        const mappedPillars: Pillar[] = remotePillars.map((p) => ({
          id: mapId(),
          name: p.name,
          sections: (p.sections || []).map((s) => ({
            id: mapId(),
            name: s.name,
            questions: (s.questions || []).map((q) => ({
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

  const handleAddSection = () => {
    if (!currentPillar || !sectionNameInput.trim()) {
      toast.error('Please enter section name');
      return;
    }
    const id = nextId();
    setPillars((prev) => {
      const next = prev.map((p, index) =>
        index === pillarIndex
          ? {
              ...p,
              sections: [
                ...p.sections,
                { id, name: sectionNameInput.trim(), questions: [] },
              ],
            }
          : p,
      );
      void persistDraft(next);
      return next;
    });
    setSectionNameInput('');
    setShowSectionModal(false);
    toast.success('Section added');
  };

  const handleUpdateSection = () => {
    if (!currentPillar || !editingSectionId) return;
    if (!sectionNameInput.trim()) {
      toast.error('Please enter section name');
      return;
    }
    setPillars((prev) => {
      const next = prev.map((p, index) =>
        index === pillarIndex
          ? {
              ...p,
              sections: p.sections.map((s) =>
                s.id === editingSectionId
                  ? { ...s, name: sectionNameInput.trim() }
                  : s,
              ),
            }
          : p,
      );
      void persistDraft(next);
      return next;
    });
    setEditingSectionId(null);
    setSectionNameInput('');
    setShowSectionModal(false);
    toast.success('Section updated');
  };

  const handleDeleteSection = (id: number) => {
    if (!currentPillar) return;
    setPillars((prev) => {
      const next = prev.map((p, index) =>
        index === pillarIndex
          ? { ...p, sections: p.sections.filter((s) => s.id !== id) }
          : p,
      );
      void persistDraft(next);
      return next;
    });
    toast.success('Section deleted');
  };

  const resetSectionForm = () => {
    setEditingSectionId(null);
    setSectionNameInput('');
    setShowSectionModal(false);
  };

  const sections = currentPillar?.sections ?? [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <Image
              src="/ohdlogo.png"
              alt="OHD Logo"
              width={48}
              height={48}
              className="w-12 h-12 object-contain rounded-lg border border-gray-200 bg-white shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                <Link href="/admin/question-paper" className="hover:text-primary-600">
                  Question Paper
                </Link>
                <span>/</span>
                <span>Pillar sections</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">
                {currentPillar ? currentPillar.name : 'Loading pillar...'}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Configure sections for this pillar. Click a section card to manage its questions.
              </p>
            </div>
          </div>
        </div>

        {loading && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 text-sm text-gray-500">
            Loading sections...
          </div>
        )}

        {!loading && !currentPillar && (
          <div className="bg-white border border-red-100 rounded-xl shadow-sm p-6 text-sm text-red-600">
            Pillar not found. It may have been removed. Go back to the{' '}
            <Link href="/admin/question-paper" className="underline">
              pillars list
            </Link>
            .
          </div>
        )}

        {!loading && currentPillar && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Sections</h2>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Group questions within this pillar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingSectionId(null);
                  setSectionNameInput('');
                  setShowSectionModal(true);
                }}
                className="inline-flex items-center px-3 py-1.5 rounded-lg bg-primary-600 text-white text-[11px] font-semibold hover:bg-primary-700"
              >
                Add section
              </button>
            </div>

            <p className="text-[11px] text-gray-500">
              {saving ? 'Saving changes…' : 'All changes are saved as draft.'}
            </p>

            <div className="space-y-2 overflow-y-auto max-h-[480px] pr-1">
              {sections.length === 0 && (
                <p className="text-xs text-gray-500">
                  No sections for this pillar yet. Add your first section.
                </p>
              )}
              {sections.map((section, index) => (
                <Link
                  key={section.id}
                  href={`/admin/question-paper/${pillarIndex}/${index}`}
                  className="block w-full border rounded-lg p-3 flex flex-col gap-2 text-left transition-colors border-gray-200 hover:border-primary-300 hover:bg-primary-50/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 line-clamp-2">
                      {section.name}
                    </p>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setEditingSectionId(section.id);
                          setSectionNameInput(section.name);
                          setShowSectionModal(true);
                        }}
                        className="px-2 py-1 rounded-md text-[11px] border border-gray-200 text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          handleDeleteSection(section.id);
                        }}
                        className="px-2 py-1 rounded-md text-[11px] border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Questions: {section.questions.length}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Section modal */}
      {showSectionModal && currentPillar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">
                {editingSectionId ? 'Edit section' : 'Add section'}
              </h2>
              <button
                type="button"
                onClick={resetSectionForm}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-gray-500">Pillar: {currentPillar.name}</p>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-700">
                Section name
              </label>
              <input
                type="text"
                value={sectionNameInput}
                onChange={(e) => setSectionNameInput(e.target.value)}
                placeholder="Enter section name"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={resetSectionForm}
                className="px-3 py-2 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={editingSectionId ? handleUpdateSection : handleAddSection}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700"
              >
                {editingSectionId ? 'Update section' : 'Add section'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

