import React, { useState } from 'react';
import {
  createNote,
  updateNote,
  deleteNote
} from '../../services/api';
import {
  X, Save, Loader2, StickyNote, Trash2, AlertTriangle
} from 'lucide-react';

const themeMap = {
  slate: {
    headerBg: 'bg-slate-50 dark:bg-slate-900/40',
    iconBg: 'bg-white/90 dark:bg-slate-800/80',
    iconText: 'text-slate-600 dark:text-slate-400',
    iconBorder: 'border-slate-200 dark:border-slate-700',
    badgeBg: 'bg-slate-100 dark:bg-slate-800/60',
    badgeText: 'text-slate-800 dark:text-slate-300',
    btnBg: 'bg-slate-600 hover:bg-slate-700 text-white',
  },
  blue: {
    headerBg: 'bg-blue-50 dark:bg-blue-900/20',
    iconBg: 'bg-white/90 dark:bg-slate-900/80',
    iconText: 'text-blue-600 dark:text-blue-400',
    iconBorder: 'border-blue-200 dark:border-blue-800',
    badgeBg: 'bg-blue-100 dark:bg-blue-800/40',
    badgeText: 'text-blue-800 dark:text-blue-300',
    btnBg: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  emerald: {
    headerBg: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconBg: 'bg-white/90 dark:bg-slate-900/80',
    iconText: 'text-emerald-600 dark:text-emerald-400',
    iconBorder: 'border-emerald-200 dark:border-emerald-800',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-800/40',
    badgeText: 'text-emerald-800 dark:text-emerald-300',
    btnBg: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
  amber: {
    headerBg: 'bg-amber-50 dark:bg-amber-900/20',
    iconBg: 'bg-white/90 dark:bg-slate-900/80',
    iconText: 'text-amber-600 dark:text-amber-400',
    iconBorder: 'border-amber-200 dark:border-amber-800',
    badgeBg: 'bg-amber-100 dark:bg-amber-800/40',
    badgeText: 'text-amber-800 dark:text-amber-300',
    btnBg: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  rose: {
    headerBg: 'bg-rose-50 dark:bg-rose-900/20',
    iconBg: 'bg-white/90 dark:bg-slate-900/80',
    iconText: 'text-rose-600 dark:text-rose-400',
    iconBorder: 'border-rose-200 dark:border-rose-800',
    badgeBg: 'bg-rose-100 dark:bg-rose-800/40',
    badgeText: 'text-rose-800 dark:text-rose-300',
    btnBg: 'bg-rose-600 hover:bg-rose-700 text-white',
  },
  purple: {
    headerBg: 'bg-purple-50 dark:bg-purple-900/20',
    iconBg: 'bg-white/90 dark:bg-slate-900/80',
    iconText: 'text-purple-600 dark:text-purple-400',
    iconBorder: 'border-purple-200 dark:border-purple-800',
    badgeBg: 'bg-purple-100 dark:bg-purple-800/40',
    badgeText: 'text-purple-800 dark:text-purple-300',
    btnBg: 'bg-purple-600 hover:bg-purple-700 text-white',
  },
};

const NoteModal = ({
  note = null,
  selectedDate = '',
  onClose,
  onNoteSaved,
  onNoteDeleted,
  onSuccess,
  onError
}) => {
  const [loading, setLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Default color options
  const colorOptions = [
    { value: 'slate', label: 'Slate', bgClass: 'bg-slate-500' },
    { value: 'blue', label: 'Blue', bgClass: 'bg-blue-500' },
    { value: 'emerald', label: 'Emerald', bgClass: 'bg-emerald-500' },
    { value: 'amber', label: 'Amber', bgClass: 'bg-amber-500' },
    { value: 'rose', label: 'Rose', bgClass: 'bg-rose-500' },
    { value: 'purple', label: 'Purple', bgClass: 'bg-purple-500' },
  ];

  const [formData, setFormData] = useState({
    title: note?.title || '',
    description: note?.description || '',
    note_date: note?.note_date ? String(note.note_date).slice(0, 10) : (selectedDate || new Date().toISOString().slice(0, 10)),
    color: note?.color || 'slate'
  });

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.note_date) {
      if (onError) onError("Title and Date are required.");
      return;
    }

    setLoading(true);
    try {
      const dataToSave = {
        ...formData,
        title: formData.title.trim()
      };

      if (note?.id) {
        // Update
        const res = await updateNote(note.id, dataToSave);
        onNoteSaved({ ...res.data?.data, is_note: true });
        if (onSuccess) onSuccess("Note updated successfully!");
      } else {
        // Create
        const res = await createNote(dataToSave);
        onNoteSaved({ ...res.data?.data, is_note: true });
        if (onSuccess) onSuccess("Note created successfully!");
      }
      onClose();
    } catch (err) {
      if (onError) onError(err.response?.data?.message || err.message || 'Failed to save note');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!note?.id) return;
    
    if (!window.confirm("Are you sure you want to delete this note?")) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteNote(note.id);
      onNoteDeleted(note.id);
      if (onSuccess) onSuccess("Note deleted successfully!");
      onClose();
    } catch (err) {
      if (onError) onError(err.response?.data?.message || err.message || 'Failed to delete note');
      setIsDeleting(false);
    }
  };

  const isEditMode = !!note?.id;
  const theme = themeMap[formData.color] || themeMap.slate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      
      <div
        className="relative w-full max-w-lg bg-white border border-gray-200 dark:bg-slate-900 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-scaleUp text-gray-900 dark:text-white"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header Banner */}
        <div className={`p-6 border-b border-gray-200 dark:border-slate-800 flex items-start justify-between gap-4 ${theme.headerBg}`}>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl shadow-sm border ${theme.iconBg} ${theme.iconText} ${theme.iconBorder}`}>
              <StickyNote size={20} />
            </div>
            <div>
              <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full ${theme.badgeBg} ${theme.badgeText}`}>
                Note
              </span>
              <h3 className="text-xl font-bold tracking-tight mt-1 text-gray-900 dark:text-white">
                {isEditMode ? 'Edit Note' : 'Add Note'}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-white/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/80 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 max-h-[70vh] overflow-y-auto scrollbar-thin">
          <form id="note-form" onSubmit={handleSave} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-gray-700 dark:text-slate-400 mb-1">Title <span className="text-rose-500">*</span></label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Note title (e.g. Field Inspection)"
                maxLength={100}
                className="w-full bg-gray-50 border border-gray-200 dark:bg-slate-800 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>


            <div>
              <label className="block font-semibold text-gray-700 dark:text-slate-400 mb-1">Color</label>
              <div className="flex gap-2">
                {colorOptions.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => setFormData({ ...formData, color: c.value })}
                    className={`w-8 h-8 rounded-full ${c.bgClass} flex items-center justify-center transition-transform ${formData.color === c.value ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-slate-400 dark:ring-offset-slate-900 scale-110' : 'hover:scale-110'}`}
                  >
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 dark:text-slate-400 mb-1">Description</label>
              <textarea
                rows={4}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Add more details..."
                className="w-full bg-gray-50 border border-gray-200 dark:bg-slate-800 dark:border-slate-700 text-gray-900 dark:text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </form>
        </div>

        {/* Footer Action Buttons */}
        <div className="p-6 border-t border-gray-200 bg-gray-50/90 dark:border-slate-800 dark:bg-slate-900/90 flex items-center justify-between gap-3">
          {isEditMode ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting || loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:text-rose-400 text-xs font-semibold rounded-xl border border-rose-200 dark:border-rose-800/50 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              <span>Delete</span>
            </button>
          ) : (
            <div></div> // Spacer
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={loading || isDeleting}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="note-form"
              disabled={loading || isDeleting}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl shadow-md transition-all cursor-pointer ${theme.btnBg}`}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>{isEditMode ? 'Save Changes' : 'Create Note'}</span>
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};

export default NoteModal;
