import React from 'react';
import { BookOpen, ArrowRight } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { PriceListTable } from '../components/inventory/PriceListTable';

export const PriceList: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <NavLink to="/" className="hover:text-[#071F49] transition">
            Dashboard
          </NavLink>
          <span>/</span>
          <NavLink to="/inventory" className="hover:text-[#071F49] transition">
            Inventory & Catalog
          </NavLink>
          <span>/</span>
          <span className="font-semibold text-slate-800">Price List</span>
        </div>

        <NavLink
          to="/inventory"
          className="inline-flex items-center gap-1 font-semibold text-[#071F49] hover:underline"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Manage Master Products Catalog</span>
          <ArrowRight className="w-3 h-3" />
        </NavLink>
      </div>

      {/* Main Price List Component */}
      <PriceListTable />
    </div>
  );
};
