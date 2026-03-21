'use client';

export default function AdminTest() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-green-600 mb-4">Admin Page Works!</h1>
        <p className="text-gray-600">If you can see this, the route is working.</p>
        <div className="mt-8">
          <a href="/admin/login" className="text-blue-600 underline">
            Back to Login
          </a>
        </div>
      </div>
    </div>
  );
}
