import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Plus, Check, ChevronDown, X, BookOpen, AlertCircle } from 'lucide-react';

export interface PublisherSelectProps {
  value?: string;
  onChange: (publisherName: string) => void;
  existingPublishers: string[];
  onAddNewPublisher?: (publisherName: string) => void;
  disabled?: boolean;
}

export const PublisherSelect: React.FC<PublisherSelectProps> = ({
  value = '',
  onChange,
  existingPublishers = [],
  onAddNewPublisher,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newPublisherInput, setNewPublisherInput] = useState('');
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const newPublisherInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsAddingNew(false);
        setSearchTerm('');
        setDuplicateNotice(null);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && !isAddingNew) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, isAddingNew]);

  // Focus new publisher input when "Add New" mode is active
  useEffect(() => {
    if (isAddingNew) {
      setTimeout(() => {
        newPublisherInputRef.current?.focus();
      }, 50);
    }
  }, [isAddingNew]);

  // Deduplicated list of publishers with extra spaces stripped
  const cleanPublishers = useMemo(() => {
    const map = new Map<string, string>(); // lower -> original
    for (const pub of existingPublishers) {
      if (typeof pub === 'string') {
        const cleaned = pub.replace(/\s+/g, ' ').trim();
        if (cleaned.length > 0) {
          const key = cleaned.toLowerCase();
          if (!map.has(key)) {
            map.set(key, cleaned);
          }
        }
      }
    }
    // Also include current value if present and not in list
    if (value) {
      const cleanedVal = value.replace(/\s+/g, ' ').trim();
      const valKey = cleanedVal.toLowerCase();
      if (cleanedVal && !map.has(valKey)) {
        map.set(valKey, cleanedVal);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [existingPublishers, value]);

  // Filtered publishers based on search input
  const filteredPublishers = useMemo(() => {
    const term = searchTerm.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!term) return cleanPublishers;
    return cleanPublishers.filter((p) => p.toLowerCase().includes(term));
  }, [cleanPublishers, searchTerm]);

  // Check if search term exactly matches an existing publisher (case-insensitive)
  const exactMatchExists = useMemo(() => {
    const term = (isAddingNew ? newPublisherInput : searchTerm).replace(/\s+/g, ' ').trim().toLowerCase();
    if (!term) return null;
    return cleanPublishers.find((p) => p.toLowerCase() === term) || null;
  }, [cleanPublishers, searchTerm, newPublisherInput, isAddingNew]);

  const handleSelect = (publisher: string) => {
    onChange(publisher);
    setIsOpen(false);
    setSearchTerm('');
    setIsAddingNew(false);
    setDuplicateNotice(null);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setDuplicateNotice(null);
  };

  const handleCreatePublisher = (nameToCreate: string) => {
    setDuplicateNotice(null);
    const cleaned = nameToCreate.replace(/\s+/g, ' ').trim();
    if (!cleaned) return;

    // Duplicate check: case-insensitive & extra space insensitive
    const existing = cleanPublishers.find((p) => p.toLowerCase() === cleaned.toLowerCase());
    if (existing) {
      // Existing publisher found! Select existing and alert user
      onChange(existing);
      setDuplicateNotice(`Publisher "${existing}" already exists. Selected existing publisher.`);
      setIsAddingNew(false);
      setNewPublisherInput('');
      setSearchTerm('');
      setTimeout(() => {
        setIsOpen(false);
        setDuplicateNotice(null);
      }, 1400);
      return;
    }

    // Genuinely new publisher
    if (onAddNewPublisher) {
      onAddNewPublisher(cleaned);
    }
    onChange(cleaned);
    setIsAddingNew(false);
    setNewPublisherInput('');
    setSearchTerm('');
    setIsOpen(false);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
        Publisher
      </label>

      {/* Select Box / Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen((prev) => !prev);
            setDuplicateNotice(null);
          }
        }}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm font-medium transition shadow-xs bg-white text-left ${
          isOpen
            ? 'border-[#071F49] ring-2 ring-[#071F49]/20'
            : 'border-slate-300 hover:border-slate-400'
        } ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className="flex items-center gap-2 truncate">
          <BookOpen className="w-4 h-4 text-slate-400 shrink-0" />
          {value ? (
            <span className="font-semibold text-slate-900 truncate">{value}</span>
          ) : (
            <span className="text-slate-400 font-normal">Select or search publisher...</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              title="Clear publisher"
              className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${
              isOpen ? 'rotate-180 text-[#071F49]' : ''
            }`}
          />
        </div>
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-full bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden text-xs animation-in fade-in slide-in-from-top-1 duration-150">
          {/* Duplicate Notice Banner if triggered */}
          {duplicateNotice && (
            <div className="bg-amber-50 border-b border-amber-200 p-2.5 text-amber-800 text-[11px] font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{duplicateNotice}</span>
            </div>
          )}

          {!isAddingNew ? (
            <>
              {/* Search Bar */}
              <div className="p-2 border-b border-slate-100 bg-slate-50/70">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search publisher..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#071F49]"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Publisher Options List */}
              <div className="max-h-52 overflow-y-auto divide-y divide-slate-50">
                {filteredPublishers.length === 0 ? (
                  <div className="p-4 text-center text-slate-400">
                    <p className="font-semibold text-slate-500">No publishers found.</p>
                    {searchTerm.trim() ? (
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        No matches for "{searchTerm}". You can add it below.
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Add a new publisher to get started.
                      </p>
                    )}
                  </div>
                ) : (
                  filteredPublishers.map((publisher) => {
                    const isSelected = value.toLowerCase() === publisher.toLowerCase();
                    return (
                      <button
                        key={publisher}
                        type="button"
                        onClick={() => handleSelect(publisher)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left transition ${
                          isSelected
                            ? 'bg-[#071F49]/10 text-[#071F49] font-bold'
                            : 'hover:bg-slate-50 text-slate-800 font-medium'
                        }`}
                      >
                        <span className="truncate">{publisher}</span>
                        {isSelected && <Check className="w-4 h-4 text-[#071F49] shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Add New Publisher Action Row */}
              <div className="p-2 border-t border-slate-100 bg-slate-50/50">
                {searchTerm.trim() && !exactMatchExists ? (
                  <button
                    type="button"
                    onClick={() => handleCreatePublisher(searchTerm)}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-[#F5B51B]/20 hover:bg-[#F5B51B]/30 text-[#071F49] rounded-lg font-bold text-xs transition active:scale-98"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#071F49]" />
                    <span className="truncate">Add "{searchTerm.trim()}" as New Publisher</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingNew(true);
                      setNewPublisherInput(searchTerm.trim());
                    }}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[#071F49] hover:bg-slate-100 rounded-lg font-bold text-xs transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add New Publisher</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            /* Inline "Add New Publisher" Form */
            <div className="p-3 space-y-2.5 bg-slate-50">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span>Enter New Publisher Name</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNew(false);
                    setNewPublisherInput('');
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <input
                  ref={newPublisherInputRef}
                  type="text"
                  value={newPublisherInput}
                  onChange={(e) => {
                    setNewPublisherInput(e.target.value);
                    setDuplicateNotice(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreatePublisher(newPublisherInput);
                    } else if (e.key === 'Escape') {
                      setIsAddingNew(false);
                      setNewPublisherInput('');
                    }
                  }}
                  placeholder="e.g. Oxford University Press"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#071F49]"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Extra spaces are ignored and names are checked case-insensitively.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNew(false);
                    setNewPublisherInput('');
                  }}
                  className="px-2.5 py-1 text-slate-600 hover:bg-slate-200 rounded font-semibold text-xs"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={!newPublisherInput.trim()}
                  onClick={() => handleCreatePublisher(newPublisherInput)}
                  className="px-3 py-1 bg-[#071F49] hover:bg-[#0c2f6d] disabled:opacity-50 text-white rounded font-bold text-xs shadow-sm transition"
                >
                  Save & Select
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

