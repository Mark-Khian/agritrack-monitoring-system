import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Wheat, AlertTriangle } from 'lucide-react';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Badge from '../components/Badge';
import { getHarvests, createHarvest, updateHarvest, deleteHarvest, getPlantings } from '../services/api';
import { SkeletonTable } from '../components/Skeleton';

const Harvests = () => {
    const [harvests, setHarvests] = useState([]);
    const [activePlantings, setActivePlantings] = useState([]); // only active for dropdown
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [formError, setFormError] = useState('');

    const [formData, setFormData] = useState({
        planting_id: '', harvest_date: '', yield_kg: '',
        quality_grade: 'A', remarks: ''
    });

    const getReadableFormError = (err) => {
        const fallback = err?.response?.data?.message || 'Failed to save harvest record.';
        const apiErrors = err?.response?.data?.errors;
        if (!Array.isArray(apiErrors) || apiErrors.length === 0) return fallback;

        const lines = apiErrors
            .map((e) => {
                const field = e?.field ? String(e.field).replaceAll('_', ' ') : '';
                const message = e?.message || '';
                if (!message) return null;
                return field ? `${field}: ${message}` : message;
            })
            .filter(Boolean);

        return lines.length > 0 ? lines.join(' ') : fallback;
    };

    const fetchData = useCallback(async () => {
        try {
            setError(null);
            const [hRes, pRes] = await Promise.all([
                getHarvests(),
                getPlantings({ status: 'active' }),
            ]);
            setHarvests(hRes.data.data || []);
            setActivePlantings(pRes.data.data || []);
        } catch (err) {
            setError('Failed to load harvest records. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleOpenModal = (item = null) => {
        setFormError('');
        if (item) {
            setFormData({
                planting_id: item.planting_id,
                harvest_date: item.harvest_date?.slice(0, 10) || '',
                yield_kg: item.yield_kg,
                quality_grade: item.quality_grade || 'A',
                remarks: item.remarks || ''
            });
            setEditingItem(item);
        } else {
            setFormData({
                planting_id: activePlantings[0]?.id || '',
                harvest_date: '', yield_kg: '',
                quality_grade: 'A', remarks: ''
            });
            setEditingItem(null);
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFormError('');
        try {
            if (editingItem) {
                await updateHarvest(editingItem.id, {
                    planting_id: Number(formData.planting_id || editingItem.planting_id),
                    harvest_date: formData.harvest_date,
                    yield_kg: parseFloat(formData.yield_kg),
                    quality_grade: formData.quality_grade,
                    remarks: formData.remarks
                });
            } else {
                await createHarvest({
                    planting_id: formData.planting_id,
                    harvest_date: formData.harvest_date,
                    yield_kg: parseFloat(formData.yield_kg),
                    quality_grade: formData.quality_grade,
                    remarks: formData.remarks
                });
            }
            setIsModalOpen(false);
            await fetchData(); // refreshes both harvests + active plantings list
        } catch (err) {
            setFormError(getReadableFormError(err));
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteClick = (id) => { setDeletingId(id); setIsConfirmOpen(true); };
    const confirmDelete = async () => {
        try { await deleteHarvest(deletingId); await fetchData(); }
        catch (err) { console.error('Delete harvest error:', err); }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Harvest Records</h1>
                    <p className="text-sm text-gray-500">Review yields and quality of completed crops</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    disabled={activePlantings.length === 0}
                    className="flex items-center gap-2 bg-green-700 hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    <Plus size={16} /> Record Harvest
                </button>
            </div>

            {/* Dependency guard */}
            {!loading && activePlantings.length === 0 && harvests.length === 0 && (
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
                    <AlertTriangle size={18} className="text-amber-500 shrink-0" />
                    <span>No <strong>active plantings</strong> available to harvest. Create and activate a planting first.</span>
                </div>
            )}
            {!loading && activePlantings.length === 0 && harvests.length > 0 && (
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-xl text-sm">
                    <Wheat size={18} className="text-blue-500 shrink-0" />
                    <span>All plantings have been harvested. Create a new planting to record more harvests.</span>
                </div>
            )}

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
                    {error}
                    <button onClick={fetchData} className="underline">Retry</button>
                </div>
            )}

            {loading ? (
                <SkeletonTable 
                    rows={6} 
                    cols={6}
                    columnHeaders={['Variety', 'Harvest Date', 'Yield (kg)', 'Quality Grade', 'Remarks', 'Actions']}
                />
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[800px]">
                            <thead>
                                <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    <th className="px-6 py-3">Planting Variety</th>
                                    <th className="px-6 py-3">Harvest Date</th>
                                    <th className="px-6 py-3">Yield (kg)</th>
                                    <th className="px-6 py-3">Quality Grade</th>
                                    <th className="px-6 py-3">Remarks</th>
                                    <th className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {harvests.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-16 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <Wheat size={40} className="text-gray-200" />
                                                <p className="text-gray-400 text-sm font-medium">No harvest records yet.</p>
                                                <p className="text-gray-300 text-xs">Record a harvest when a planting reaches maturity.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    harvests.map((h) => (
                                        <tr key={h.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-200">
                                            <td className="px-6 py-4 font-bold text-gray-900">{h.planting_variety}</td>
                                            <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                                                {h.harvest_date?.slice(0, 10)}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="font-bold text-amber-600">
                                                    {parseFloat(h.yield_kg).toLocaleString()}
                                                </span>{' '}
                                                <span className="text-sm text-gray-500">kg</span>
                                            </td>
                                            <td className="px-6 py-4 text-sm"><Badge status={h.quality_grade} /></td>
                                            <td className="px-6 py-4 text-xs text-gray-500 max-w-[250px] truncate" title={h.remarks}>
                                                {h.remarks || '—'}
                                            </td>
                                            <td className="px-6 py-4 text-right space-x-2">
                                                <button onClick={() => handleOpenModal(h)} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button onClick={() => handleDeleteClick(h.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? 'Edit Harvest Details' : 'Record Harvest'}>
                <form onSubmit={handleSave} className="space-y-4">
                    {formError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{formError}</div>
                    )}
                    {!editingItem && (
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Source Planting *</label>
                            <select
                                required
                                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow"
                                value={formData.planting_id}
                                onChange={e => setFormData({ ...formData, planting_id: e.target.value })}
                            >
                                <option value="">Select Active Planting</option>
                                {activePlantings.map(p => (
                                    <option key={p.id} value={p.id}>{p.variety} ({p.field_name})</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Recording a harvest will mark the planting as completed and archive pending activities.
                            </p>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Harvest Date *</label>
                            <input
                                required type="date"
                                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow"
                                value={formData.harvest_date}
                                onChange={e => setFormData({ ...formData, harvest_date: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Yield (kg) *</label>
                            <input
                                required type="number" step="0.01" min="0"
                                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow"
                                value={formData.yield_kg}
                                onChange={e => setFormData({ ...formData, yield_kg: e.target.value })}
                                placeholder="e.g. 1250.50"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Quality Grade *</label>
                            <select
                                required
                                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow"
                                value={formData.quality_grade}
                                onChange={e => setFormData({ ...formData, quality_grade: e.target.value })}
                            >
                                <option value="A">Grade A (Premium)</option>
                                <option value="B">Grade B (Standard)</option>
                                <option value="C">Grade C (Substandard)</option>
                                <option value="rejected">Rejected / Unmarketable</option>
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Remarks</label>
                            <textarea
                                rows="3"
                                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow resize-none"
                                value={formData.remarks}
                                onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                                placeholder="Any observation about the yield or quality..."
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm transition-colors">Cancel</button>
                        <button type="submit" disabled={saving} className="bg-green-700 hover:bg-green-800 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                            {saving ? 'Saving...' : editingItem ? 'Save Changes' : 'Record Harvest'}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Harvest Record"
                message="Are you sure you want to delete this harvest record? This action cannot be undone."
            />
        </div>
    );
};

export default Harvests;
