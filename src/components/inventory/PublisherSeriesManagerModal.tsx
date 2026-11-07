import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Layers,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  ChevronRight,
  BookOpen,
} from 'lucide-react';
import {
  getPublishers,
  createPublisher,
  updatePublisher,
  togglePublisherStatus,
  deletePublisher,
} from '../../services/publisherService';
import {
  getSeriesByPublisher,
  createSeries,
  updateSeries,
  toggleSeriesStatus,
  deleteSeries,
} from '../../services/seriesService';
import type { PublisherDocument, SeriesDocument } from '../../types/database';
import { useAuth } from '../../hooks/useAuth';

export interface PublisherSeriesManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
}

export const PublisherSeriesManagerModal: React.FC<PublisherSeriesManagerModalProps> = ({
  isOpen,
  onClose,
  onDataChanged,
}) => {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid || 'admin';
  const userEmail = currentUser?.email || 'admin@sadiqbookagency.com';

  // Publishers state
  const [publishers, setPublishers] = useState<PublisherDocument[]>([]);
  const [selectedPublisher, setSelectedPublisher] = useState<PublisherDocument | null>(null);
  const [publisherSearch, setPublisherSearch] = useState('');
  const [isLoadingPubs, setIsLoadingPubs] = useState(false);

  // Series state
  const [seriesList, setSeriesList] = useState<SeriesDocument[]>([]);
  const [isLoadingSeries, setIsLoadingSeries] = useState(false);

  // Form states: Publisher
  const [isAddingPub, setIsAddingPub] = useState(false);
  const [editingPub, setEditingPub] = useState<PublisherDocument | null>(null);
  const [pubNameInput, setPubNameInput] = useState('');
  const [pubDescInput, setPubDescInput] = useState('');

  // Form states: Series
  const [isAddingSeries, setIsAddingSeries] = useState(false);
  const [editingSeries, setEditingSeries] = useState<SeriesDocument | null>(null);
  const [seriesNameInput, setSeriesNameInput] = useState('');
  const [seriesDescInput, setSeriesDescInput] = useState('');

  // Messages & Errors
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load Publishers
  const loadPublishersList = useCallback(async (selectId?: string) => {
    setIsLoadingPubs(true);
    setError(null);
    try {
      const pubs = await getPublishers(true);
      setPublishers(pubs);

      if (selectId) {
        const found = pubs.find((p) => p.id === selectId);
        if (found) setSelectedPublisher(found);
      } else if (pubs.length > 0 && !selectedPublisher) {
        setSelectedPublisher(pubs[0]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load publishers.');
    } finally {
      setIsLoadingPubs(false);
    }
  }, [selectedPublisher]);

  // Load Series for Selected Publisher
  const loadSeriesForPublisher = useCallback(async (pubId: string) => {
    setIsLoadingSeries(true);
    try {
      const list = await getSeriesByPublisher(pubId, true);
      setSeriesList(list);
    } catch (err: any) {
      console.error('Failed to load series:', err);
    } finally {
      setIsLoadingSeries(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadPublishersList();
    }
  }, [isOpen, loadPublishersList]);

  useEffect(() => {
    if (selectedPublisher) {
      loadSeriesForPublisher(selectedPublisher.id);
      setIsAddingSeries(false);
      setEditingSeries(null);
    } else {
      setSeriesList([]);
    }
  }, [selectedPublisher, loadSeriesForPublisher]);

  if (!isOpen) return null;

  // Filtered publishers
  const filteredPublishers = publishers.filter((p) =>
    p.name.toLowerCase().includes(publisherSearch.toLowerCase().trim())
  );

  // ---------------------------------------------------------------------------
  // Publisher Actions
  // ---------------------------------------------------------------------------
  const handleSavePublisher = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!pubNameInput.trim()) {
      setError('Publisher name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingPub) {
        await updatePublisher(
          editingPub.id,
          { name: pubNameInput.trim(), description: pubDescInput.trim() },
          userId,
          userEmail
        );
        setSuccess(`Publisher "${pubNameInput}" updated successfully.`);
      } else {
        const created = await createPublisher(
          { name: pubNameInput.trim(), description: pubDescInput.trim() },
          userId,
          userEmail
        );
        setSelectedPublisher(created);
        setSuccess(`Publisher "${created.name}" created successfully.`);
      }

      setIsAddingPub(false);
      setEditingPub(null);
      setPubNameInput('');
      setPubDescInput('');
      await loadPublishersList(editingPub?.id || undefined);
      onDataChanged?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to save publisher.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTogglePublisherActive = async (pub: PublisherDocument) => {
    try {
      await togglePublisherStatus(pub.id, !pub.isActive, userId, userEmail);
      await loadPublishersList(pub.id);
      onDataChanged?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to update publisher status.');
    }
  };

  const handleDeletePublisher = async (pub: PublisherDocument) => {
    if (!window.confirm(`Are you sure you want to delete publisher "${pub.name}"?`)) {
      return;
    }

    setError(null);
    try {
      const res = await deletePublisher(pub.id, userId, userEmail);
      if (res.success) {
        setSuccess(`Publisher "${pub.name}" deleted.`);
        setSelectedPublisher(null);
        await loadPublishersList();
        onDataChanged?.();
      } else {
        setError(res.message || 'Cannot delete publisher.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to delete publisher.');
    }
  };

  // ---------------------------------------------------------------------------
  // Series Actions
  // ---------------------------------------------------------------------------
  const handleSaveSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPublisher) return;

    setError(null);
    setSuccess(null);

    if (!seriesNameInput.trim()) {
      setError('Series name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingSeries) {
        await updateSeries(
          editingSeries.id,
          { name: seriesNameInput.trim(), description: seriesDescInput.trim() },
          userId,
          userEmail
        );
        setSuccess(`Series "${seriesNameInput}" updated.`);
      } else {
        const created = await createSeries(
          {
            name: seriesNameInput.trim(),
            publisherId: selectedPublisher.id,
            description: seriesDescInput.trim(),
          },
          userId,
          userEmail
        );
        setSuccess(`Series "${created.name}" added under "${selectedPublisher.name}".`);
      }

      setIsAddingSeries(false);
      setEditingSeries(null);
      setSeriesNameInput('');
      setSeriesDescInput('');
      await loadSeriesForPublisher(selectedPublisher.id);
      onDataChanged?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to save series.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleSeriesActive = async (ser: SeriesDocument) => {
    if (!selectedPublisher) return;
    try {
      await toggleSeriesStatus(ser.id, !ser.isActive, userId, userEmail);
      await loadSeriesForPublisher(selectedPublisher.id);
      onDataChanged?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to update series status.');
    }
  };

  const handleDeleteSeries = async (ser: SeriesDocument) => {
    if (!selectedPublisher) return;
    if (!window.confirm(`Are you sure you want to delete series "${ser.name}"?`)) {
      return;
    }

    setError(null);
    try {
      const res = await deleteSeries(ser.id, userId, userEmail);
      if (res.success) {
        setSuccess(`Series "${ser.name}" deleted.`);
        await loadSeriesForPublisher(selectedPublisher.id);
        onDataChanged?.();
      } else {
        setError(res.message || 'Cannot delete series.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to delete series.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full overflow-hidden border border-slate-300 flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#071F49] text-white px-5 py-4 flex items-center justify-between border-b-2 border-[#F5B51B] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F5B51B] text-[#071F49] rounded-xl shadow-md">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg leading-tight">
                Publisher & Series Hierarchy Manager
              </h3>
              <p className="text-xs text-slate-300">
                Manage Publishers, Organizations, and their associated Book Series
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Messages */}
        {error && (
          <div className="bg-red-50 border-b border-red-200 text-red-700 text-xs px-5 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {success && (
          <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs px-5 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{success}</span>
            </div>
            <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-800">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 2-Column Split Workspace */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left Column: Publishers List */}
          <div className="w-full md:w-2/5 border-r border-slate-200 flex flex-col bg-slate-50/50">
            {/* Publisher Header & Search */}
            <div className="p-3 border-b border-slate-200 space-y-2 bg-white">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-[#071F49]" />
                  Publishers ({publishers.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingPub(true);
                    setEditingPub(null);
                    setPubNameInput('');
                    setPubDescInput('');
                  }}
                  className="px-2.5 py-1 bg-[#071F49] hover:bg-[#0c2f6d] text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-[#F5B51B]" />
                  <span>Add Publisher</span>
                </button>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={publisherSearch}
                  onChange={(e) => setPublisherSearch(e.target.value)}
                  placeholder="Filter publishers..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-[#071F49] outline-none"
                />
              </div>
            </div>

            {/* Publisher Form (Inline on Add/Edit) */}
            {(isAddingPub || editingPub) && (
              <form onSubmit={handleSavePublisher} className="p-3 bg-amber-50/80 border-b border-amber-200 space-y-2 text-xs">
                <div className="font-bold text-slate-800">
                  {editingPub ? `Edit "${editingPub.name}"` : 'New Publisher'}
                </div>
                <input
                  type="text"
                  value={pubNameInput}
                  onChange={(e) => setPubNameInput(e.target.value)}
                  placeholder="Publisher Name (e.g. Oxford University Press)..."
                  required
                  autoFocus
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none"
                />
                <input
                  type="text"
                  value={pubDescInput}
                  onChange={(e) => setPubDescInput(e.target.value)}
                  placeholder="Description or notes (optional)..."
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingPub(false);
                      setEditingPub(null);
                    }}
                    className="px-2.5 py-1 text-slate-600 hover:bg-slate-200 rounded font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-3 py-1 bg-[#071F49] text-white rounded font-bold shadow-xs hover:bg-[#0c2f6d]"
                  >
                    {editingPub ? 'Update' : 'Save Publisher'}
                  </button>
                </div>
              </form>
            )}

            {/* Publishers Scrollable List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {isLoadingPubs && publishers.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading publishers...</div>
              ) : filteredPublishers.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No publishers found matching search.
                </div>
              ) : (
                filteredPublishers.map((pub) => {
                  const isSelected = selectedPublisher?.id === pub.id;
                  return (
                    <div
                      key={pub.id}
                      onClick={() => setSelectedPublisher(pub)}
                      className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[#071F49] text-white'
                          : 'hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs truncate">{pub.name}</span>
                          {!pub.isActive && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-200 text-slate-700">
                              Inactive
                            </span>
                          )}
                        </div>
                        {pub.description && (
                          <p className={`text-[10px] truncate ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                            {pub.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingPub(pub);
                            setIsAddingPub(false);
                            setPubNameInput(pub.name);
                            setPubDescInput(pub.description || '');
                          }}
                          className={`p-1 rounded hover:bg-white/20 ${isSelected ? 'text-white' : 'text-slate-500'}`}
                          title="Edit Publisher"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className={`w-4 h-4 ${isSelected ? 'text-[#F5B51B]' : 'text-slate-400'}`} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Series Management for Selected Publisher */}
          <div className="w-full md:w-3/5 flex flex-col bg-white">
            {selectedPublisher ? (
              <>
                {/* Selected Publisher Header */}
                <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                        Selected Publisher
                      </span>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          selectedPublisher.isActive
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {selectedPublisher.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <h4 className="text-base font-black text-slate-900 leading-snug">
                      {selectedPublisher.name}
                    </h4>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTogglePublisherActive(selectedPublisher)}
                      className="px-2.5 py-1 border border-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      {selectedPublisher.isActive ? 'Deactivate' : 'Activate'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeletePublisher(selectedPublisher)}
                      className="p-1.5 border border-rose-300 text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Delete Publisher (Protected against linked records)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingSeries(true);
                        setEditingSeries(null);
                        setSeriesNameInput('');
                        setSeriesDescInput('');
                      }}
                      className="px-3 py-1 bg-[#F5B51B] hover:bg-amber-400 text-[#071F49] rounded-lg text-xs font-black flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Series</span>
                    </button>
                  </div>
                </div>

                {/* Series Form (Inline Add/Edit) */}
                {(isAddingSeries || editingSeries) && (
                  <form onSubmit={handleSaveSeries} className="p-4 bg-amber-50/60 border-b border-amber-200 space-y-2 text-xs">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-[#071F49]" />
                      <span>
                        {editingSeries
                          ? `Edit Series "${editingSeries.name}"`
                          : `Add New Series under "${selectedPublisher.name}"`}
                      </span>
                    </div>

                    <input
                      type="text"
                      value={seriesNameInput}
                      onChange={(e) => setSeriesNameInput(e.target.value)}
                      placeholder="Series Name (e.g. Progressive Series, Amazing Series)..."
                      required
                      autoFocus
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none"
                    />

                    <input
                      type="text"
                      value={seriesDescInput}
                      onChange={(e) => setSeriesDescInput(e.target.value)}
                      placeholder="Description or target classes/subjects (optional)..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none"
                    />

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingSeries(false);
                          setEditingSeries(null);
                        }}
                        className="px-3 py-1 text-slate-600 hover:bg-slate-200 rounded-lg font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-4 py-1.5 bg-[#071F49] text-white rounded-lg font-bold shadow-xs hover:bg-[#0c2f6d]"
                      >
                        {editingSeries ? 'Update Series' : 'Save Series'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Associated Series List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider pb-2 border-b border-slate-100">
                    <span>Associated Series ({seriesList.length})</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      Must belong strictly to {selectedPublisher.name}
                    </span>
                  </div>

                  {isLoadingSeries ? (
                    <div className="py-12 text-center text-xs text-slate-400">Loading series...</div>
                  ) : seriesList.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400 space-y-2">
                      <Layers className="w-8 h-8 text-slate-300" />
                      <p className="text-xs font-semibold text-slate-600">
                        No series configured yet for {selectedPublisher.name}.
                      </p>
                      <p className="text-[11px] text-slate-400 max-w-sm">
                        Click "Add Series" above to create series like "Progressive Series" or "Amazing Series".
                      </p>
                    </div>
                  ) : (
                    seriesList.map((ser) => (
                      <div
                        key={ser.id}
                        className="p-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors flex items-center justify-between text-xs"
                      >
                        <div className="space-y-0.5 min-w-0 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900 text-sm">{ser.name}</span>
                            {!ser.isActive && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-200 text-slate-700">
                                Inactive
                              </span>
                            )}
                          </div>
                          {ser.description && (
                            <p className="text-slate-500 text-[11px]">{ser.description}</p>
                          )}
                          <p className="text-[10px] text-slate-400 font-mono">ID: {ser.id}</p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleSeriesActive(ser)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-200 text-slate-600"
                            title={ser.isActive ? 'Deactivate Series' : 'Activate Series'}
                          >
                            {ser.isActive ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-slate-400" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingSeries(ser);
                              setIsAddingSeries(false);
                              setSeriesNameInput(ser.name);
                              setSeriesDescInput(ser.description || '');
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-200 text-slate-600"
                            title="Edit Series"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteSeries(ser)}
                            className="p-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-600"
                            title="Delete Series (Protected if linked to products)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2">
                <Building2 className="w-12 h-12 text-slate-300" />
                <p className="text-sm font-semibold text-slate-600">Select a publisher from the left</p>
                <p className="text-xs text-slate-400 max-w-sm">
                  Or click "Add Publisher" to register a new educational publisher or organization.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-100 border-t border-slate-300 flex items-center justify-between text-xs text-slate-600 shrink-0">
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-[#071F49]" />
            <span>Relationship Rule: Products $\rightarrow$ Series $\rightarrow$ Publisher</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 bg-[#071F49] hover:bg-[#0c2f6d] text-white rounded-xl font-bold transition-all cursor-pointer"
          >
            Done / Close
          </button>
        </div>
      </div>
    </div>
  );
};

