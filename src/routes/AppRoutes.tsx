import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AppLayout } from '../components/layout/AppLayout';
import { Login } from '../pages/Login';
import { Dashboard } from '../pages/Dashboard';
import { SystemStatus } from '../pages/SystemStatus';
import { NotFound } from '../pages/NotFound';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Route */}
      <Route path="/login" element={<Login />} />

      {/* Protected Routes inside AppLayout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/system-status" element={<SystemStatus />} />
          {/* Catch-all 404 inside layout */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>

      {/* Fallback redirection for unauthenticated direct hits to unknown routes */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

