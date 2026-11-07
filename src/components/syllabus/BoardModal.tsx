import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import type { EducationalBoardDocument } from '../../types/database';
import { createBoard, updateBoard } from '../../services/syllabusService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';

export interface BoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingBoard?: EducationalBoardDocument | null;
  onSaved: () => void;
}

export const BoardModal: React.FC<BoardModalProps> = ({
  isOpen,
  onClose,
  editingBoard,
  onSaved,
}) => {
  const { currentUser } = useAuth();
  const { success } = useToast();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (editingBoard) {
      setName(editingBoard.name || '');
      setCode(editingBoard.code || '');
      setCity(editingBoard.city || '');
      setDescription(editingBoard.description || '');
    } else {
      setName('');
      setCode('');
      setCity('');
      setDescription('');
    }
    setValidationError(null);
  }, [editingBoard, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setValidationError('Board name is required.');
      return;
    }

    setValidationError(null);
    setIsSubmitting(true);

    try {
      if (editingBoard) {
        await updateBoard(
          editingBoard.id,
          {
            name: name.trim(),
            code: code.trim() || undefined,
            city: city.trim() || undefined,
            description: description.trim() || undefined,
          },
          currentUser?.uid || 'admin',
          currentUser?.email || 'admin@sadiqbookagency.com'
        );
        success(`Board "${name}" updated successfully.`);
      } else {
        await createBoard(
          {
            name: name.trim(),
            code: code.trim() || undefined,
            city: city.trim() || undefined,
            description: description.trim() || undefined,
          },
          currentUser?.uid || 'admin',
          currentUser?.email || 'admin@sadiqbookagency.com'
        );
        success(`Board "${name}" created successfully.`);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to save board.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingBoard ? 'Edit Educational Board / بورڈ ایڈٹ کریں' : 'Add Educational Board / نیا بورڈ شامل کریں'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {validationError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Board Name / بورڈ کا نام <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. BISE Peshawar, Private Schools Board..."
            className="w-full px-3 py-2 text-sm text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Code (Optional)
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. PESH, MRDN"
              className="w-full px-3 py-2 text-sm uppercase text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              City / District
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Peshawar, Mardan"
              className="w-full px-3 py-2 text-sm text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Description / Notes (Optional)
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Details about affiliated schools or regions..."
            className="w-full px-3 py-2 text-sm text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="gold"
            isLoading={isSubmitting}
            leftIcon={<CheckCircle2 className="w-4 h-4 text-[#071F49]" />}
          >
            {editingBoard ? 'Update Board' : 'Save Board'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
