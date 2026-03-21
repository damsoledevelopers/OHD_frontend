'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authAPI } from '@/lib/apiClient';
import toast from 'react-hot-toast';
import { 
  LayoutDashboard, 
  Building2, 
  BarChart3, 
  LogOut,
  FileText,
  Menu,
  X
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Companies', href: '/admin/companies', icon: Building2 },
  { name: 'Question Paper', href: '/admin/question-paper', icon: FileText },
  { name: 'Reports', href: '/admin/reports', icon: BarChart3 },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await authAPI.logout();
      toast.success('Logged out successfully');
      router.push('/admin/login');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Logout failed';
      toast.error(message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans selection:bg-primary-500 selection:text-white">
      {/* Mobile sidebar backdrop */}
      <div
        className={`fixed inset-0 z-40 lg:hidden transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        onClick={() => setSidebarOpen(false)}
      >
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm" />
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-950 text-slate-300 shadow-xl border-r border-slate-800 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo Section */}
          <div className="flex items-center justify-between h-20 px-6 border-b border-slate-800 bg-slate-900/20">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-lg p-1.5 transition-transform hover:scale-105">
                <Image src="/ohdlogo.png" alt="OHD Logo" width={40} height={40} className="w-full h-full object-contain" />
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">OHD <span className="text-primary-400">Admin</span></h1>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-800"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Navigation */}
          <div className="flex-1 px-4 py-6 space-y-1 overflow-y-auto no-scrollbar">
            <div className="px-4 mb-4">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Main Menu</span>
            </div>
            <nav className="space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${isActive
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/20'
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                      }`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Icon className={`mr-3 w-5 h-5 transition-colors duration-200 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-primary-400'}`} />
                    <span className="tracking-wide">{item.name}</span>
                    {isActive && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Logout */}
          <div className="p-4 mt-auto border-t border-slate-800">
            <button
              onClick={handleLogout}
              className="flex items-center w-full px-4 py-3 text-sm font-medium text-slate-400 rounded-xl hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 group"
            >
              <LogOut className="mr-3 w-5 h-5 transition-colors" />
              <span className="tracking-wide">Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-72 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between h-20 px-8 bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-gray-600 hover:text-gray-900 p-2 rounded-xl hover:bg-gray-100 transition-colors border border-gray-200 shadow-sm"
          >
            <Menu className="w-6 h-6" />
          </button>
          
          <div className="flex items-center space-x-4 ml-auto">
            <div className="flex flex-col items-end mr-2">
              <span className="text-sm font-bold text-gray-900">Administrator</span>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-widest">Super Admin</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-primary-600 border-2 border-white shadow-md flex items-center justify-center text-white font-bold text-sm">
              AD
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-8 lg:p-10 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

