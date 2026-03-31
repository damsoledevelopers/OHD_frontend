import api, { API_BASE_URL } from './api';

// Public (no auth) — app config from backend .env
export const publicAPI = {
  getConfig: () =>
    api.get<{
      publicAppBaseUrl: string | null;
      questionPaperBaseUrl: string | null;
      /** @deprecated same as publicAppBaseUrl */
      surveyBaseUrl: string | null;
    }>('/public/config'),
  /** Global department list (survey / company forms; no auth). */
  getDepartments: () => api.get<{ departments: string[] }>('/public/departments'),
};

// Auth APIs
export const authAPI = {
  signup: (data: { email: string; password: string }) =>
    api.post('/auth/signup', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
};

// Company APIs
export const companyAPI = {
  getAll: () => api.get('/companies'),
  getPaginated: (params: { page: number; limit: number }) =>
    api.get('/companies', { params }),
  getWithSurvey: () => api.get('/companies/with-survey'),
  getById: (id: string) => api.get(`/companies/${id}`),
  // Public read-only endpoint for survey participants; does not require admin auth.
  getPublicById: (id: string, employeeEmail?: string) =>
    api.get(`/companies/public/${id}`, {
      params: employeeEmail ? { employeeEmail } : undefined,
    }),
  getEmails: (id: string) => api.get(`/companies/${id}/emails`),
  create: (data: Record<string, unknown>) => api.post('/companies', data),
  // Do not set Content-Type: axios adds multipart/form-data with the correct boundary for FormData.
  createWithFile: (formData: FormData) => api.post('/companies', formData),
  update: (id: string, data: Record<string, unknown>) => api.put(`/companies/${id}`, data),
  updateWithFile: (id: string, formData: FormData) =>
    api.put(`/companies/${id}`, formData),
  delete: (id: string) => api.delete(`/companies/${id}`),
  submitFromCompany: (formData: FormData) =>
    api.post('/companies/public', formData),
};

/** Admin-only department registry (MongoDB). */
export const departmentAPI = {
  list: () =>
    api.get<{ departments: Array<{ _id: string; name: string }> }>('/departments'),
  create: (name: string) => api.post<{ department: { _id: string; name: string } }>('/departments', { name }),
  update: (id: string, name: string) =>
    api.put<{ department: { _id: string; name: string } }>(`/departments/${id}`, { name }),
  delete: (id: string) => api.delete<{ ok: boolean }>(`/departments/${id}`),
  bulkImport: (names: string[]) =>
    api.post<{ added: number; skippedDuplicate: number; departments: string[] }>(
      '/departments/bulk-import',
      { names },
    ),
};

// Response APIs
export const responseAPI = {
  getAll: () => api.get('/responses/all'),
  getAllPaginated: (params: { page: number; limit: number }) =>
    api.get('/responses/all', { params }),
  getByCompany: (companyId: string) => api.get(`/responses/companies/${companyId}`),
  submit: (data: Record<string, unknown>) => api.post('/responses', data),
  startExam: (data: { companyId: string; employeeEmail: string; department?: string }) =>
    api.post('/responses/start', data),
  getCompanySummary: (companyId: string) => api.get(`/responses/companies/${companyId}/summary`),
};

// Report APIs
export const reportAPI = {
  getCompanyReport: (companyId: string) => api.get(`/reports/companies/${companyId}`),
  getSectionReport: (sectionId: string, companyId?: string) => {
    const params = companyId ? { companyId } : {};
    return api.get(`/reports/sections/${sectionId}`, { params });
  },
  getOverallReport: (params?: {
    companyId?: string;
    department?: string;
    employeeEmail?: string;
    sectionId?: string;
    pillarId?: string;
  }) => {
    const p: Record<string, string> = {};
    if (params?.companyId) p.companyId = params.companyId;
    if (params?.department) p.department = params.department;
    if (params?.employeeEmail) p.employeeEmail = params.employeeEmail;
    if (params?.sectionId) p.sectionId = params.sectionId;
    if (params?.pillarId) p.pillarId = params.pillarId;
    return api.get('/reports/overall', { params: p });
  },
};

/** Payload shape accepted by PUT /question-paper/draft (IDs are server-generated). */
export type QuestionPaperDraftPillar = {
  name: string;
  order?: number;
  sections?: Array<{
    name: string;
    order?: number;
    questions?: Array<{ text: string; order?: number }>;
  }>;
};

// Question paper APIs (pillars/sections/questions structure)
// Admin draft endpoints live under `/api/question-paper/draft` on the backend.
// Published structure is exposed at `/api/question-paper/published`.
export const questionPaperAPI = {
  getDraft: () => api.get('/question-paper/draft'),
  saveDraft: (data: { pillars: QuestionPaperDraftPillar[] }) =>
    api.put('/question-paper/draft', data),
  publish: () => api.post('/question-paper/publish', {}),
  getPublished: () => api.get('/question-paper/published'),
};

// Export APIs
export const exportAPI = {
  exportPDF: (companyId: string) => api.get(`/export/companies/${companyId}/pdf`, { responseType: 'blob' }),
  exportExcel: (companyId: string) => api.get(`/export/companies/${companyId}/excel`, { responseType: 'blob' }),
};

// Mail APIs
export const mailAPI = {
  sendBulk: (data: {
    subject: string;
    surveyLink: string;
    recipients: string[];
    companyId: string;
    notes?: string;
  }) => api.post('/mail/bulk', data),
  /** Base URL from `NEXT_PUBLIC_API_URL` (exported as `API_BASE_URL` in `./api`). */
  sendCompanyFormLink: (data: {
    subject: string;
    notes?: string;
    recipientEmail: string;
  }) =>
    api.post('/companies/share-registration-link', data, {
      baseURL: API_BASE_URL,
    }),
  getLogs: (params?: Record<string, string | number | boolean | undefined>) =>
    api.get('/mail/logs', { params }),
};

