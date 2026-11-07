import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Home } from 'lucide-react';
import { Button } from '../components/common/Button';

export const NotFound: React.FC = () => {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4 border border-rose-200">
        <AlertCircle className="w-8 h-8" />
      </div>

      <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl">
        404 — Page Not Found
      </h1>
      <p className="mt-2 text-sm text-slate-500 max-w-md">
        The requested bookstore module or address does not exist.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <Link to="/">
          <Button variant="primary" size="md" leftIcon={<Home className="w-4 h-4" />}>
            Return to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
};
