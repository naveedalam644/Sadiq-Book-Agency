import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X } from 'lucide-react';

export interface SearchInputProps {
  placeholder?: string;
  value?: string;
  onSearch: (term: string) => void;
  debounceMs?: number;
  className?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  placeholder = 'Search by name, SKU, or barcode...',
  value: initialValue = '',
  onSearch,
  debounceMs = 400,
  className = '',
}) => {
  const [searchTerm, setSearchTerm] = useState(initialValue);
  const onSearchRef = useRef(onSearch);
  const lastEmittedValueRef = useRef(initialValue);
  const isFirstMountRef = useRef(true);

  // Keep latest onSearch ref without causing re-renders or restarting debounce
  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  // Sync with external value changes (e.g., when filters are cleared externally)
  useEffect(() => {
    if (initialValue !== lastEmittedValueRef.current) {
      setSearchTerm(initialValue);
      lastEmittedValueRef.current = initialValue;
    }
  }, [initialValue]);

  // Debounced search trigger: only fires when searchTerm genuinely changes
  useEffect(() => {
    // Avoid triggering on initial mount since parent already fetches initial data
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      if (searchTerm === lastEmittedValueRef.current) {
        return;
      }
    }

    if (searchTerm === lastEmittedValueRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      lastEmittedValueRef.current = searchTerm;
      onSearchRef.current(searchTerm);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [searchTerm, debounceMs]);

  const handleClear = useCallback(() => {
    setSearchTerm('');
    lastEmittedValueRef.current = '';
    onSearchRef.current('');
  }, []);

  return (
    <div className={`relative w-full ${className}`}>
      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
        <Search className="w-4 h-4" />
      </div>

      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-9 py-2.5 text-sm bg-white border border-slate-300 rounded-xl placeholder:text-slate-400 focus:outline-none focus:border-[#F5B51B] focus:ring-2 focus:ring-[#F5B51B]/20 transition-all duration-150"
      />

      {searchTerm && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition"
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

