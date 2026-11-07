import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { Footer } from './Footer';

export const AppLayout: React.FC = () => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  const isPos = location.pathname === '/pos';

  return (
    <div className="min-h-screen bg-[#F4F7FB] flex overflow-x-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block lg:shrink-0">
        <Sidebar className="fixed inset-y-0 left-0 w-64 z-30" />
      </div>

      {/* Mobile Drawer */}
      <MobileNav isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <Header onToggleMobileNav={() => setMobileNavOpen(true)} />

        <main
          className={
            isPos
              ? 'flex-1 w-full p-1 sm:p-2 lg:p-3 flex flex-col overflow-hidden'
              : 'flex-1 p-3 sm:p-5 lg:p-8 max-w-7xl w-full mx-auto'
          }
        >
          <Outlet />
        </main>

        {!isPos && <Footer />}
      </div>
    </div>
  );
};
