import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Home } from 'lucide-react';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { getFarms, createFarm, updateFarm, deleteFarm } from '../services/api';

const Farms = () => {
    const { user, token } = useAuth();
    const [farms, setFarms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [editingFarm, setEditingFarm] = useState(null);
    const [deletingId, setDeletingId] = useState(null);

    const [formData, setFormData] = useState({ name: '', location: '' });
    const [formError, setFormError] = useState('');

    // ── Fetch farms ────────────────────────────────────────────────────────
    const fetchFarms = useCallback(async () => {
        try {
            setError(null);
            const res = await getFarms();
            setFarms(res.data.data || []);
        } catch (err) {
            setError('Failed to load farms. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { if (token) fetchFarms(); }, [fetchFarms, token]);

    // ── Modal helpers ──────────────────────────────────────────────────────
    const handleOpenModal = (farm = null) => {
        setFormError('');
        if (farm) {
            setFormData({ name: farm.name, location: farm.location });
            setEditingFarm(farm);
        } else {
            setFormData({ name: '', location: '' });
            setEditingFarm(null);
        }
        setIsModalOpen(true);
    };

    // ── Save (create / update) ─────────────────────────────────────────────
    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFormError('');
        try {
            if (editingFarm) {
                await updateFarm(editingFarm.id, { name: formData.name, location: formData.location });
            } else {
                await createFarm({ ...formData, owner_id: user.id });
            }
            setIsModalOpen(false);
            await fetchFarms();
        } catch (err) {
            setFormError(err.response?.data?.message || 'Failed to save farm.');
        } finally {
            setSaving(false);
        }
    };

    // ── Delete ─────────────────────────────────────────────────────────────
    const handleDeleteClick = (id) => {
        setDeletingId(id);
        setIsConfirmOpen(true);
    };

    const confirmDelete = async () => {
        try {
            await deleteFarm(deletingId);
            await fetchFarms();
        } catch (err) {
            console.error('Delete farm error:', err);
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Farms</h1>
                    <p className="text-sm text-gray-500">Manage your registered agricultural lands</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    <Plus size={16} /> Add Farm
                </button>
            </div>

            {/* Error banner */}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
                    {error}
                    <button onClick={fetchFarms} className="underline text-red-600 hover:text-red-800">Retry</button>
                </div>
            )}

            {/* Loading */}
            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-gray-400 text-sm">Loading farms...</p>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-200">
                            <thead>
                                <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    <th className="px-6 py-3">Farm Name</th>
                                    <th className="px-6 py-3">Location</th>
                                    <th className="px-6 py-3">Owner</th>
                                    <th className="px-6 py-3">Total Fields</th>
                                    <th className="px-6 py-3">Date Created</th>
                                    <th className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {farms.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-16 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <Home size={40} className="text-gray-200" />
                                                <p className="text-gray-400 text-sm font-medium">No farms yet.</p>
                                                <p className="text-gray-300 text-xs">Click "Add Farm" to register your first agricultural land.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    farms.map((farm) => (
                                        <tr key={farm.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-200">
                                            <td className="px-6 py-4 font-medium text-gray-900 border-l-4 border-transparent hover:border-green-500 transition-colors">
                                                {farm.name}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600">{farm.location}</td>
                                            <td className="px-6 py-4 text-sm text-gray-600">{farm.owner_name}</td>
                                            <td className="px-6 py-4">
                                                <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">
                                                    {farm.fields_count ?? 0} Fields
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                                                {farm.created_at?.slice(0, 10)}
                                            </td>
                                            <td className="px-6 py-4 text-right space-x-2">
                                                <button
                                                    onClick={() => handleOpenModal(farm)}
                                                    className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteClick(farm.id)}
                                                    className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                                                    title="Delete"
                                                >
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

            {/* Add / Edit Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingFarm ? 'Edit Farm' : 'Add Farm'}
            >
                <form onSubmit={handleSave} className="space-y-4">
                    {formError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                            {formError}
                        </div>
                    )}
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">Farm Name *</label>
                        <input
                            required type="text"
                            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g. Dela Cruz Farm"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">Location *</label>
                        <input
                            required type="text"
                            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow"
                            value={formData.location}
                            onChange={e => setFormData({ ...formData, location: e.target.value })}
                            placeholder="e.g. Nueva Ecija"
                        />
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="bg-green-700 hover:bg-green-800 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            {saving ? 'Saving...' : editingFarm ? 'Save Changes' : 'Add Farm'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Confirm Delete */}
            <ConfirmDialog
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Farm"
                message="Are you sure you want to delete this farm? This action cannot be undone."
            />
        </div>
    );
};

export default Farms;
