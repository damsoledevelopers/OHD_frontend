'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { companyAPI, responseAPI, departmentAPI } from '@/lib/apiClient';
import { AUTH_TOKEN_STORAGE_KEY } from '@/lib/api';
import toast from 'react-hot-toast';
import { notifyDepartmentsUpdated } from '@/lib/departmentsStorage';
import { parseDepartmentFile } from '@/lib/parseDepartmentFile';
import DepartmentNameModal from '@/components/DepartmentNameModal';
import { Building2, FileSpreadsheet, ClipboardList, Pencil, Trash2, Plus, ChevronRight } from 'lucide-react';

interface CompanyRow {
  _id: string;
  name?: string;
  email?: string;
  industry?: string;
}

interface ResponseRow {
  _id: string;
  employeeEmail?: string;
  employeeName?: string;
  department?: string;
  submittedAt?: string;
  companyId?: { _id?: string; name?: string; email?: string } | string;
}

type ListModal = 'companies' | 'responses' | null;

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [companiesTotal, setCompaniesTotal] = useState(0);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [responsesTotal, setResponsesTotal] = useState(0);
  const [listModal, setListModal] = useState<ListModal>(null);
  const [companiesModalPage, setCompaniesModalPage] = useState(1);
  const [responsesModalPage, setResponsesModalPage] = useState(1);
  const [modalLoading, setModalLoading] = useState(false);
  const modalPageSize = 10;
  const [uploadingDept, setUploadingDept] = useState(false);
  const deptFileRef = useRef<HTMLInputElement>(null);
  const [departments, setDepartments] = useState<Array<{ _id: string; name: string }>>([]);
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  /** When set, modal is editing this row; otherwise add mode. */
  const [editingDept, setEditingDept] = useState<{ _id: string; name: string } | null>(null);

  const refreshDepartments = useCallback(async () => {
    try {
      const res = await departmentAPI.list();
      setDepartments(res.data.departments || []);
    } catch (error: unknown) {
      console.error('Failed to load departments', error);
      const message = error instanceof Error ? error.message : 'Failed to load departments';
      toast.error(message);
    }
  }, []);

  const loadCompaniesPage = useCallback(async (page: number) => {
    setModalLoading(true);
    try {
      const res = await companyAPI.getPaginated({ page, limit: modalPageSize });
      setCompanies(res.data.companies || []);
      setCompaniesTotal(res.data.total || 0);
      setCompaniesModalPage(page);
    } catch (error: unknown) {
      console.error('Failed to load companies page', error);
      const message = error instanceof Error ? error.message : 'Failed to load companies page';
      toast.error(message);
    } finally {
      setModalLoading(false);
    }
  }, [modalPageSize]);

  const loadResponsesPage = useCallback(async (page: number) => {
    setModalLoading(true);
    try {
      const res = await responseAPI.getAllPaginated({ page, limit: modalPageSize });
      setResponses(res.data.responses || []);
      setResponsesTotal(res.data.total || 0);
      setResponsesModalPage(page);
    } catch (error: unknown) {
      console.error('Failed to load responses page', error);
      const message = error instanceof Error ? error.message : 'Failed to load responses page';
      toast.error(message);
    } finally {
      setModalLoading(false);
    }
  }, [modalPageSize]);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [companiesRes, responsesRes] = await Promise.all([
        companyAPI.getPaginated({ page: 1, limit: modalPageSize }),
        responseAPI.getAllPaginated({ page: 1, limit: modalPageSize }),
      ]);

      setCompanies(companiesRes.data.companies || []);
      setCompaniesTotal(companiesRes.data.total || 0);
      setResponses(responsesRes.data.responses || []);
      setResponsesTotal(responsesRes.data.total || 0);
    } catch (error: unknown) {
      console.error('Failed to load dashboard data', error);
      const message = error instanceof Error ? error.message : 'Failed to load dashboard data';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [modalPageSize]);

  useEffect(() => {
    const hasSession =
      typeof window !== 'undefined' &&
      (localStorage.getItem('user') || localStorage.getItem(AUTH_TOKEN_STORAGE_KEY));
    if (!hasSession) {
      window.location.href = '/admin/login';
      return;
    }
    void fetchDashboardData();
    void refreshDepartments();
  }, [fetchDashboardData, refreshDepartments]);

  const openAddDepartment = () => {
    setEditingDept(null);
    setDeptModalOpen(true);
  };

  const openEditDepartment = (dept: { _id: string; name: string }) => {
    setEditingDept(dept);
    setDeptModalOpen(true);
  };

  const handleDeptModalConfirm = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name cannot be empty');
      return;
    }
    try {
      if (editingDept) {
        await departmentAPI.update(editingDept._id, trimmed);
        toast.success('Department updated');
      } else {
        await departmentAPI.create(trimmed);
        toast.success('Department added');
      }
      await refreshDepartments();
      notifyDepartmentsUpdated();
      setDeptModalOpen(false);
      setEditingDept(null);
    } catch (error: unknown) {
      const ax = error as { response?: { data?: { error?: string } } };
      const msg =
        ax.response?.data?.error ||
        (error instanceof Error ? error.message : 'Could not save department');
      toast.error(msg);
    }
  };

  const handleDeptModalClose = () => {
    setDeptModalOpen(false);
    setEditingDept(null);
  };

  const handleDeleteDepartment = async (id: string, name: string) => {
    if (!window.confirm(`Remove "${name}" from the department list?`)) return;
    try {
      await departmentAPI.delete(id);
      await refreshDepartments();
      notifyDepartmentsUpdated();
      toast.success('Department removed');
    } catch (error: unknown) {
      const ax = error as { response?: { data?: { error?: string } } };
      toast.error(ax.response?.data?.error || 'Failed to delete department');
    }
  };

  const companyCount = companiesTotal;
  const responseCount = responsesTotal;
  const companiesTotalPages = companiesTotal > 0 ? Math.ceil(companiesTotal / modalPageSize) : 1;
  const responsesTotalPages = responsesTotal > 0 ? Math.ceil(responsesTotal / modalPageSize) : 1;

  const companyName = (c: CompanyRow) => c.name || '—';
  const companyEmail = (c: CompanyRow) => c.email || '—';

  const responseCompanyLabel = (r: ResponseRow) => {
    const cid = r.companyId;
    if (cid && typeof cid === 'object' && cid.name) return cid.name;
    return '—';
  };

  const handleDepartmentFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      setUploadingDept(true);
      const { raw } = await parseDepartmentFile(file);
      const nonEmpty = raw.map((s) => String(s).replace(/\u00a0/g, ' ').trim()).filter(Boolean);
      if (nonEmpty.length === 0) {
        toast.error('No department names found in that file');
        return;
      }
      const res = await departmentAPI.bulkImport(raw);
      const { added, skippedDuplicate } = res.data;
      await refreshDepartments();
      notifyDepartmentsUpdated();

      const parts: string[] = [];
      if (added > 0) {
        parts.push(`${added} department${added === 1 ? '' : 's'} added`);
      } else {
        parts.push('No new departments added');
      }
      if (skippedDuplicate > 0) {
        parts.push(
          `${skippedDuplicate} duplicate${skippedDuplicate === 1 ? '' : 's'} skipped (already in your list or repeated in the file)`,
        );
      }
      toast.success(parts.join('. ') + '.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not read department file';
      toast.error(msg);
    } finally {
      setUploadingDept(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <DepartmentNameModal
        open={deptModalOpen}
        onClose={handleDeptModalClose}
        onConfirm={handleDeptModalConfirm}
        title={editingDept ? 'Edit department' : 'Add department'}
        label={editingDept ? 'Update the name' : 'Enter department name'}
        initialName={editingDept?.name}
      />
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Dashboard</h1>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={deptFileRef}
            type="file"
            accept=".csv,.txt,.xlsx,.xls"
            className="hidden"
            onChange={handleDepartmentFile}
          />

          <button
            type="button"
            onClick={() => {
              setListModal('companies');
              void loadCompaniesPage(1);
            }}
            className="group flex min-w-0 flex-1 basis-[200px] items-center gap-3 rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50/80"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Building2 className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-slate-500">Companies</span>
              <span className="mt-0.5 block text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
                {companyCount}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-600" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => {
              setListModal('responses');
              void loadResponsesPage(1);
            }}
            className="group flex min-w-0 flex-1 basis-[200px] items-center gap-3 rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50/80"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <ClipboardList className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-slate-500">Responses</span>
              <span className="mt-0.5 block text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
                {responseCount}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-600" aria-hidden />
          </button>

          <button
            type="button"
            disabled={uploadingDept}
            onClick={() => deptFileRef.current?.click()}
            className="inline-flex h-[58px] shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-200/90 bg-emerald-50/90 px-5 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[200px]"
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
            {uploadingDept ? 'Processing…' : 'Upload departments'}
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/80">
            <div>
              <h2 className="text-base font-bold text-slate-900">Department list</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {departments.length === 0
                  ? 'No departments yet — upload a file or add one.'
                  : `${departments.length} department${departments.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <button
              type="button"
              onClick={openAddDepartment}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 text-white px-4 py-2 text-sm font-semibold hover:bg-primary-700 shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add department
            </button>
          </div>
          <div
            className="scrollbar-none max-h-[20rem] overflow-y-auto"
            aria-label="Department list"
          >
            {departments.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-slate-500">No departments in the list.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {departments.map((d) => (
                  <li
                    key={d._id}
                    className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 hover:bg-slate-50/80"
                  >
                    <span className="text-sm font-medium text-slate-900 truncate">{d.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditDepartment(d)}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50"
                        aria-label={`Edit ${d.name}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDepartment(d._id, d.name)}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                        aria-label={`Delete ${d.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {listModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="list-modal-title"
        >
          <div className="relative flex min-h-0 w-full max-w-3xl max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 id="list-modal-title" className="text-lg font-bold text-slate-900">
                {listModal === 'companies' ? 'All companies' : 'Completed users'}
              </h2>
              <button
                type="button"
                onClick={() => setListModal(null)}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <div className="scrollbar-none max-h-[22rem] min-h-0 overflow-y-auto p-0">
              {listModal === 'companies' && (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr className="text-left text-slate-600">
                      <th className="px-6 py-3 font-semibold">Name</th>
                      <th className="px-6 py-3 font-semibold">Email</th>
                      <th className="px-6 py-3 font-semibold">Industry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-slate-500">
                          No companies yet
                        </td>
                      </tr>
                    ) : (
                      companies.map((c) => (
                        <tr key={c._id} className="border-t border-slate-100 hover:bg-slate-50/80">
                          <td className="px-6 py-3 font-medium text-slate-900">{companyName(c)}</td>
                          <td className="px-6 py-3 text-slate-600">{companyEmail(c)}</td>
                          <td className="px-6 py-3 text-slate-600">{c.industry || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
              {listModal === 'responses' && (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr className="text-left text-slate-600">
                      <th className="px-6 py-3 font-semibold">Company</th>
                      <th className="px-6 py-3 font-semibold">Email</th>
                      <th className="px-6 py-3 font-semibold">Department</th>
                      <th className="px-6 py-3 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {responses.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                          No responses yet
                        </td>
                      </tr>
                    ) : (
                      responses.map((r) => (
                        <tr key={r._id} className="border-t border-slate-100 hover:bg-slate-50/80">
                          <td className="px-6 py-3 font-medium text-slate-900">
                            {responseCompanyLabel(r)}
                          </td>
                          <td className="px-6 py-3 text-slate-600">
                            {r.employeeEmail || '—'}
                          </td>
                          <td className="px-6 py-3 text-slate-600">{r.department || '—'}</td>
                          <td className="px-6 py-3 text-slate-500 whitespace-nowrap">
                            {r.submittedAt
                              ? new Date(r.submittedAt).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: '2-digit',
                                })
                              : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {listModal === 'companies' && (
              <div className="border-t border-slate-100 px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white">
                <p className="text-xs text-slate-500">
                  Page <span className="font-medium text-slate-700">{companiesModalPage}</span> of{' '}
                  <span className="font-medium text-slate-700">{companiesTotalPages}</span>
                </p>
                <div className="inline-flex items-center justify-center rounded-full border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => void loadCompaniesPage(Math.max(1, companiesModalPage - 1))}
                    disabled={companiesModalPage <= 1 || modalLoading}
                    className="px-3 py-1.5 text-xs font-medium disabled:text-slate-300 disabled:bg-slate-50 hover:bg-slate-50"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1.5 border-l border-r border-slate-200 text-xs">
                    Page <span className="font-semibold">{companiesModalPage}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void loadCompaniesPage(Math.min(companiesTotalPages, companiesModalPage + 1))}
                    disabled={companiesModalPage >= companiesTotalPages || modalLoading}
                    className="px-3 py-1.5 text-xs font-medium disabled:text-slate-300 disabled:bg-slate-50 hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {listModal === 'responses' && (
              <div className="border-t border-slate-100 px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white">
                <p className="text-xs text-slate-500">
                  Page <span className="font-medium text-slate-700">{responsesModalPage}</span> of{' '}
                  <span className="font-medium text-slate-700">{responsesTotalPages}</span>
                </p>
                <div className="inline-flex items-center justify-center rounded-full border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => void loadResponsesPage(Math.max(1, responsesModalPage - 1))}
                    disabled={responsesModalPage <= 1 || modalLoading}
                    className="px-3 py-1.5 text-xs font-medium disabled:text-slate-300 disabled:bg-slate-50 hover:bg-slate-50"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1.5 border-l border-r border-slate-200 text-xs">
                    Page <span className="font-semibold">{responsesModalPage}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void loadResponsesPage(Math.min(responsesTotalPages, responsesModalPage + 1))
                    }
                    disabled={responsesModalPage >= responsesTotalPages || modalLoading}
                    className="px-3 py-1.5 text-xs font-medium disabled:text-slate-300 disabled:bg-slate-50 hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
