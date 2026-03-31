'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { companyAPI } from '@/lib/apiClient';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { UploadCloud, Building2, Mail, Briefcase, Users, User, Phone } from 'lucide-react';
import DepartmentNameModal from '@/components/DepartmentNameModal';
import DepartmentPickerModal from '@/components/DepartmentPickerModal';
import { useDashboardDepartments } from '@/lib/useDashboardDepartments';

export default function AddCompanyPage() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [contactPerson, setContactPerson] = useState('');
    const [phone, setPhone] = useState('');
    const [industry, setIndustry] = useState('');
    const [employeeCount, setEmployeeCount] = useState<number | ''>('');
    const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
    const [departmentPickerOpen, setDepartmentPickerOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const { departments: departmentsFromDashboard } = useDashboardDepartments();

    // File upload state (employee list for surveys)
    const [fileName, setFileName] = useState<string>('');
    const [file, setFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selected = e.target.files[0];
            setFile(selected);
            setFileName(selected.name);
        } else {
            setFile(null);
            setFileName('');
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !email || !industry || !employeeCount || !contactPerson || !phone || !file) {
            toast.error('Please fill in all fields and upload a file');
            return;
        }

        try {
            setCreating(true);
          if (file) {
            const formData = new FormData();
            formData.append('name', name);
            formData.append('email', email);
            if (contactPerson) formData.append('contactPerson', contactPerson);
            if (phone) formData.append('phone', phone);
            if (industry) formData.append('industry', industry);
            if (employeeCount !== '') formData.append('employeeCount', String(employeeCount));
            if (selectedDepartments.length > 0) {
              formData.append('departments', selectedDepartments.join(','));
            }
            // important: field name must match backend multer config
            formData.append('excelFile', file);
            await companyAPI.createWithFile(formData);
          } else {
            await companyAPI.create({
              name,
              email,
              contactPerson: contactPerson || undefined,
              phone: phone || undefined,
              industry: industry || undefined,
              employeeCount: employeeCount || undefined,
              departments: selectedDepartments.length > 0 ? selectedDepartments : undefined,
            });
          }
          toast.success('Company created');
          router.push('/admin/companies');
        } catch (error: unknown) {
          console.error('Failed to create company', error);
          let apiMessage = 'Failed to create company';
          if (error && typeof error === 'object' && 'response' in error) {
            const ax = error as {
              response?: { data?: { error?: string; message?: string } };
              message?: string;
            };
            apiMessage =
              ax.response?.data?.error ||
              ax.response?.data?.message ||
              ax.message ||
              apiMessage;
          } else if (error instanceof Error) {
            apiMessage = error.message;
          }
          toast.error(apiMessage);
        } finally {
          setCreating(false);
        }
      };

    const togglePickerDepartment = (dept: string) => {
      setSelectedDepartments((prev) =>
        prev.some((d) => d.toLowerCase() === dept.toLowerCase())
          ? prev.filter((d) => d.toLowerCase() !== dept.toLowerCase())
          : [...prev, dept],
      );
    };

    const removeDepartment = (dept: string) => {
      setSelectedDepartments((prev) => prev.filter((d) => d !== dept));
    };

    return (
    <AdminLayout>
      <DepartmentPickerModal
        open={departmentPickerOpen}
        onClose={() => setDepartmentPickerOpen(false)}
        departments={departmentsFromDashboard}
        selected={selectedDepartments}
        onToggle={togglePickerDepartment}
        title="Allowed departments"
      />
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add New Company</h1>
          <p className="text-sm text-gray-500">Create a new organizational profile in the system.</p>
        </div>

        <form onSubmit={handleCreate} className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Company Name</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Enter company name"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Admin Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="admin@company.com"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Industry</label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="e.g. Technology"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Employee Count</label>
                <div className="relative">
                  <Users className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="number"
                    value={employeeCount}
                    onChange={(e) => setEmployeeCount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-300 pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Number of employees"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-gray-700">Allowed Departments</label>
                <p className="text-[11px] text-gray-400">
                  Choose from the list managed on the Dashboard (upload / add departments there).
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDepartmentPickerOpen(true)}
                    className="inline-flex items-center justify-center rounded-xl border border-primary-500 bg-primary-50 px-4 py-2.5 text-sm font-semibold text-primary-700 hover:bg-primary-100"
                  >
                    Allowed departments
                    {selectedDepartments.length > 0 ? (
                      <span className="ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary-600 px-1.5 text-[11px] text-white">
                        {selectedDepartments.length}
                      </span>
                    ) : null}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedDepartments.map((dept) => (
                    <span
                      key={dept}
                      className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white"
                    >
                      {dept}
                      <button
                        type="button"
                        onClick={() => removeDepartment(dept)}
                        className="text-white/90 hover:text-white"
                        aria-label={`Remove ${dept}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Contact Person Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Name of contact person"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="+91 98765 43210"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-4">
              <label className="text-sm font-semibold text-gray-700">Supporting Documents</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${fileName ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-primary-400'}`}
              >
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx" required />
                <div className="flex flex-col items-center">
                  <UploadCloud className={`w-8 h-8 mb-2 ${fileName ? 'text-primary-600' : 'text-gray-400'}`} />
                  <p className="text-sm font-medium text-gray-700">{fileName ? fileName : 'Click to upload files'}</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, DOCX, XLSX up to 10MB</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Link
              href="/admin/companies"
              className="px-6 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={creating}
              className="px-6 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Company'}
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
    );
}
