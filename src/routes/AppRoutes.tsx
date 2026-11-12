import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { SectionLockRoute } from './SectionLockRoute';
import { AppLayout } from '../components/layout/AppLayout';
import { Login } from '../pages/Login';
import { Dashboard } from '../pages/Dashboard';
import { Inventory } from '../pages/Inventory';
import { PriceList } from '../pages/PriceList';
import { Syllabus } from '../pages/Syllabus';
import { Suppliers } from '../pages/Suppliers';
import { Purchases } from '../pages/Purchases';
import { Customers } from '../pages/Customers';
import { POS } from '../pages/POS';
import { SalesHistory } from '../pages/SalesHistory';
import { PublisherAnalytics } from '../pages/PublisherAnalytics';
import { Reports } from '../pages/Reports';
import { Expenses } from '../pages/Expenses';
import { RoughBill } from '../pages/RoughBill';
import { SystemStatus } from '../pages/SystemStatus';
import { CustomerKhataPortal } from '../pages/CustomerKhataPortal';
import { NotFound } from '../pages/NotFound';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/khata/:portalCode" element={<CustomerKhataPortal />} />
      <Route path="/portal/:portalCode" element={<CustomerKhataPortal />} />

      {/* Protected Routes inside AppLayout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          {/* Admin Section Password Protection Wrapper */}
          <Route element={<SectionLockRoute />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/syllabus" element={<Syllabus />} />
            <Route path="/price-list" element={<PriceList />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/purchases" element={<Purchases />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/pos" element={<POS />} />
            <Route path="/sales-history" element={<SalesHistory />} />
            <Route path="/publisher-analytics" element={<PublisherAnalytics />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/rough-bill" element={<RoughBill />} />
            <Route path="/system-status" element={<SystemStatus />} />
            {/* Catch-all 404 inside layout */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Route>

      {/* Fallback redirection for unauthenticated direct hits to unknown routes */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
