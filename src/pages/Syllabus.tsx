import React from 'react';
import { NavLink } from 'react-router-dom';
import { Receipt, ArrowRight } from 'lucide-react';
import { SyllabusManager } from '../components/syllabus/SyllabusManager';

export const Syllabus: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <NavLink to="/" className="hover:text-[#071F49] transition">
            Dashboard
          </NavLink>
          <span>/</span>
          <span className="font-semibold text-slate-800">
            Syllabus & Course Sets / اسکول سلیبس و کورس سیٹس
          </span>
        </div>

        <div className="flex items-center gap-3">
          <NavLink
            to="/pos"
            className="inline-flex items-center gap-1 font-semibold text-[#071F49] hover:underline"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Open POS Register</span>
            <ArrowRight className="w-3 h-3" />
          </NavLink>
        </div>
      </div>

      {/* Main Syllabus Workspace */}
      <SyllabusManager />
    </div>
  );
};
