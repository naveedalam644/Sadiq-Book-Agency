import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Sidebar } from './Sidebar';

export interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-[#071F49]/70 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] flex z-10 animate-in slide-in-from-left duration-250 ease-out shadow-2xl">
        <div className="relative flex-1 flex flex-col bg-[#071F49]">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-3 p-1.5 rounded-xl text-slate-300 hover:text-[#F5B51B] hover:bg-[#0A255B] transition z-20"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
          <Sidebar onNavigate={onClose} className="w-full h-full border-r-0" />
        </div>
      </div>
    </div>
  );
};
