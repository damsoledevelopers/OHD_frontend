'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { companyAPI } from '@/lib/apiClient';
import Link from 'next/link';
import { ArrowLeft, Building2, Mail, Briefcase, Users } from 'lucide-react';
import toast from 'react-hot-toast';

interface Company {
  _id: string;
  name: string;
  email: string;
  industry?: string;
  employeeCount?: number;
  status?: string;
}

export default function EditCompanyPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [industry, setIndustry] = useState('');
  const [employeeCount, setEmployeeCount] = useState<number | ''>('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [excelFileName, setExcelFileName] = useState('');
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCompany = async () => {
    try {
      setLoading(true);
      const res = await companyAPI.getById(companyId);
      const data: Company = res.data.company || res.data;
      setCompany(data);
      setName(data.name);
      setEmail(data.email);
      setIndustry(data.industry || '');
      setEmployeeCount(
        typeof data.employeeCount === 'number' ? data.employeeCount : data.employeeCount || ''
      );
      setStatus(data.status === 'inactive' ? 'inactive' : 'active');
    } catch (error: unknown) {
      console.error('Failed to load company', error);
      const message = error instanceof Error ? error.message : 'Failed to load company';
      toast.error(message);
      router.push('/admin/companies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) {
      fetchCompany();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) {
      toast.error('Name and email are required');
      return;
    }
    try {
      setSaving(true);
      if (excelFile) {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('email', email);
        if (industry) formData.append('industry', industry);
        if (employeeCount !== '') formData.append('employeeCount', String(employeeCount));
        formData.append('status', status);
        // field name must match backend multer: upload.single('excelFile')
        formData.append('excelFile', excelFile);
        await companyAPI.updateWithFile(companyId, formData);
      } else {
        await companyAPI.update(companyId, {
          name,
          email,
          industry: industry || undefined,
          employeeCount: employeeCount === '' ? undefined : employeeCount,
          status,
        });
      }
      toast.success('Company updated successfully');
      router.push(`/admin/companies/${companyId}`);
    } catch (error: unknown) {
      console.error('Failed to update company', error);
      const message = error instanceof Error ? error.message : 'Failed to update company';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex items-center gap-4">
          <Link
            href={`/admin/companies/${companyId}`}
            className="group flex items-center gap-3 px-4 py-2 rounded-2xl bg-white border border-slate-100 text-slate-500 hover:text-primary-600 font-bold text-xs uppercase tracking-widest transition-all shadow-sm hover:shadow-md"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Profile
          </Link>
        </div>

        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Recalibrate Entity</h1>
          <p className="mt-2 text-slate-500 font-medium tracking-wide">
            Update organization parameters and operational context for {company?.name || 'the organization'}
          </p>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/40 border border-slate-100 p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary-50/50 rounded-bl-full -z-10" />
          
          {loading && !company ? (
            <div className="py-20 flex flex-col items-center justify-center text-primary-500">
               <svg className="animate-spin h-10 w-10 mb-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
               <span className="text-[11px] font-black uppercase tracking-[0.2em]">Accessing Registry...</span>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                    Organization Name <span className="text-rose-500 font-black">*</span>
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Building2 className="h-5 w-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                    </div>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 pl-12 pr-4 py-4 text-slate-900 font-bold bg-slate-50/30 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm"
                      placeholder="Organization Name"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                    Primary Contact Email <span className="text-rose-500 font-black">*</span>
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 pl-12 pr-4 py-4 text-slate-900 font-bold bg-slate-50/30 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm"
                      placeholder="email@organization.com"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Industry Vertical</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Briefcase className="h-5 w-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                    </div>
                    <input
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 pl-12 pr-4 py-4 text-slate-900 font-bold bg-slate-50/30 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm"
                      placeholder="Industry"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Employee Capacity</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Users className="h-5 w-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={employeeCount}
                      onChange={(e) => setEmployeeCount(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full rounded-2xl border border-slate-200 pl-12 pr-4 py-4 text-slate-900 font-bold bg-slate-50/30 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm"
                      placeholder="Count"
                    />
                  </div>
                </div>

              <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">Operational Status</label>
                  <div className="relative">
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                      className="w-full rounded-2xl border border-slate-200 px-6 py-4 text-slate-900 font-bold bg-slate-50/30 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm appearance-none"
                    >
                      <option value="active">Active Monitoring</option>
                      <option value="inactive">Paused / Inactive</option>
                    </select>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Excel/CSV upload for employee list */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                  Employee List File (CSV / Excel)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors ${
                    excelFileName ? 'border-primary-500 bg-primary-50/60' : 'border-slate-200 hover:border-primary-300'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        const f = e.target.files[0];
                        setExcelFile(f);
                        setExcelFileName(f.name);
                      } else {
                        setExcelFile(null);
                        setExcelFileName('');
                      }
                    }}
                  />
                  <p className="text-sm font-medium text-slate-700">
                    {excelFileName || 'Click to attach/update survey recipient file (CSV, XLS, XLSX)'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    This file is used for sending survey emails to employees.
                  </p>
                </div>
              </div>

              <div className="pt-10 flex flex-col sm:flex-row justify-end gap-6 border-t border-slate-100">
                <Link
                  href={`/admin/companies/${companyId}`}
                  className="px-10 py-5 rounded-[1.5rem] text-slate-400 bg-white border border-slate-100 hover:text-slate-600 hover:bg-slate-50 font-black text-xs uppercase tracking-[0.2em] transition-all text-center"
                >
                  Abort Update
                </Link>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center px-10 py-5 rounded-[1.5rem] bg-emerald-600 text-white font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-emerald-500/30 hover:bg-emerald-700 transition-all hover:translate-y-[-2px] active:scale-[0.98] disabled:opacity-40"
                >
                  {saving ? (
                    <span className="flex items-center">
                      <svg className="animate-spin h-4 w-4 mr-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Recalibrating...
                    </span>
                  ) : (
                    'Overwrite Parameters'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}


