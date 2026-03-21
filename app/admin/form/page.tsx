'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { companyAPI, sectionAPI, questionAPI, responseAPI } from '@/lib/apiClient';
import toast from 'react-hot-toast';

interface Company {
  _id: string;
  name: string;
}

interface Section {
  _id: string;
  name: string;
  order: number;
}

interface Question {
  _id: string;
  text: string;
  sectionId: string | Section;
  order: number;
}

type Rating = 'A' | 'B' | 'C' | 'D' | 'E';

export default function FillFormPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [answers, setAnswers] = useState<Record<string, Rating | ''>>({});
  const [submitting, setSubmitting] = useState(false);

  const [selectedService, setSelectedService] = useState('Organizational Health Diagnostic');

  const services = [
    'Organizational Health Diagnostic',
    'Culture Audit',
    'Leadership Assessment',
    'Employee Engagement Survey',
    'Team Performance Evaluation',
    'Other'
  ];

  const fetchMeta = async () => {
    try {
      const [companyRes, sectionRes, questionRes] = await Promise.all([
        companyAPI.getAll(),
        sectionAPI.getAll(),
        questionAPI.getAll(),
      ]);
      setCompanies(companyRes.data.companies || []);
      setSections(sectionRes.data.sections || []);
      setQuestions(questionRes.data.questions || []);
    } catch (error: unknown) {
      console.error('Failed to load form data', error);
      const message = error instanceof Error ? error.message : 'Failed to load form data';
      toast.error(message);
    }
  };

  useEffect(() => {
    fetchMeta();
  }, []);

  const groupedBySection = sections
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((section) => ({
      section,
      questions: questions
        .filter((q) => {
          const sid = typeof q.sectionId === 'string' ? q.sectionId : q.sectionId._id;
          return sid === section._id;
        })
        .sort((a, b) => a.order - b.order),
    }));

  const setAnswer = (questionId: string, rating: Rating) => {
    setAnswers((prev) => ({ ...prev, [questionId]: rating }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) {
      toast.error('Please select a company');
      return;
    }

    const filledAnswers = Object.entries(answers)
      .filter(([, rating]) => rating)
      .map(([questionId, rating]) => ({
        questionId,
        rating,
      }));

    if (filledAnswers.length === 0) {
      toast.error('Please answer at least one question');
      return;
    }

    try {
      setSubmitting(true);
      await responseAPI.submit({
        companyId: selectedCompany,
        service: selectedService,
        answers: filledAnswers,
      });
      toast.success('Response submitted');
      setAnswers({});
    } catch (error: unknown) {
      console.error('Failed to submit response', error);
      const message = error instanceof Error ? error.message : 'Failed to submit response';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fill Diagnostic Form</h1>
          <p className="text-sm text-gray-500">Manually enter diagnostic responses for a company.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Metadata Selection */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Select Company</label>
                <select
                  value={selectedCompany}
                  onChange={(e) => setSelectedCompany(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                >
                  <option value="">Select a company...</option>
                  {companies.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Select Service</label>
                <select
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                >
                  {services.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-10">
            {groupedBySection.map(({ section, questions: qs }) => (
              <div key={section._id} className="space-y-4">
                <div className="flex items-center gap-3">
                   <div className="bg-gray-100 text-gray-700 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm">
                     {section.order}
                   </div>
                   <h2 className="text-lg font-bold text-gray-900">{section.name}</h2>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {qs.map((q) => (
                    <div
                      key={q._id}
                      className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6"
                    >
                      <div className="flex-1">
                         <p className="text-sm font-semibold text-gray-900 mb-1">{q.text}</p>
                         <p className="text-xs text-gray-400">Section {section.order} • Question {q.order}</p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {(['A', 'B', 'C', 'D', 'E'] as Rating[]).map((rating) => {
                          const active = answers[q._id] === rating;
                          return (
                            <button
                              key={rating}
                              type="button"
                              onClick={() => setAnswer(q._id, rating)}
                              className={`w-10 h-10 rounded-lg text-sm font-bold transition-colors ${
                                active
                                  ? 'bg-primary-600 text-white shadow-sm'
                                  : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                              }`}
                            >
                              {rating}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-6 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-8 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Response'}
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}


