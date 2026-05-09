import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Map, AlertTriangle, Sprout } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { getFields, createField, updateField, deleteField, getFarms, getPlantings } from '../services/api';
import { useAuth } from '../context/AuthContext';

const Fields = () => {
    const navigate = useNavigate();
    const { token } = useAuth();
    const FIELD_NAME_LIST_ID = 'field-name-options';
    const [fields, setFields] = useState([]);
    const [farms, setFarms] = useState([]);
    const [plantings, setPlantings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [editingField, setEditingField] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [formData, setFormData] = useState({ farm_id: '', name: '', size: '' });
    const [formError, setFormError] = useState('');
    const [isDuplicateFieldError, setIsDuplicateFieldError] = useState(false);
    const [showCompletedFields, setShowCompletedFields] = useState(false);
    const existingFieldNames = Array.from(
        new Set(
            fields
                .map((f) => (f.name || '').trim())
                .filter(Boolean)
        )
    ).sort((a, b) => a.localeCompare(b));

    const fetchData = useCallback(async () => {
        try {
            setError(null);
            const [fieldsRes, farmsRes, plantingsRes] = await Promise.all([
                getFields(),
                getFarms(),
                getPlantings({ limit: 100 }),
            ]);
            setFields(fieldsRes.data.data || []);
            setFarms(farmsRes.data.data || []);
            setPlantings(plantingsRes.data.data || []);
        } catch (err) {
            setError('Failed to load fields. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { if (token) fetchData(); }, [fetchData, token]);

    const handleOpenModal = (field = null) => {
        setFormError('');
        setIsDuplicateFieldError(false);
        if (field) {
            setFormData({ farm_id: field.farm_id, name: field.name, size: field.size });
            setEditingField(field);
        } else {
            setFormData({ farm_id: farms[0]?.id || '', name: '', size: '' });
            setEditingField(null);
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFormError('');
        setIsDuplicateFieldError(false);
        try {
            if (editingField) {
                await updateField(editingField.id, { name: formData.name, size: parseFloat(formData.size) });
            } else {
                await createField({ farm_id: formData.farm_id, name: formData.name, size: parseFloat(formData.size) });
            }
            setIsModalOpen(false);
            await fetchData();
        } catch (err) {
            const apiMessage = String(err?.response?.data?.message || '');
            const normalized = apiMessage.toLowerCase();
            if (normalized.includes('already exists')) {
                setIsDuplicateFieldError(true);
                setFormError('This field already exists in the selected farm. Reuse it when creating a new planting (toggle "Show completed fields" if needed).');
            } else {
                setFormError(apiMessage || 'Failed to save field.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteClick = (id) => { setDeletingId(id); setIsConfirmOpen(true); };
    const confirmDelete = async () => {
        try { await deleteField(deletingId); await fetchData(); }
        catch (err) { console.error('Delete field error:', err); }
    };

    const fieldPlantingsMap = (plantings || []).reduce((acc, p) => {
        const fid = p?.field_id;
        if (!fid) return acc;
        acc[fid] = acc[fid] || [];
        acc[fid].push(p);
        return acc;
    }, {});

    const isPlantingCompleted = (p) => {
        const status = String(p?.status || '').toLowerCase();
        const stage = String(p?.growth_stage || '').toLowerCase();
        return status === 'completed' || stage === 'harvested';
    };

    const visibleFields = fields.filter((field) => {
        if (showCompletedFields) return true;
        const related = fieldPlantingsMap[field.id] || [];
        if (related.length === 0) return true;
        const allCompleted = related.every(isPlantingCompleted);
        return !allCompleted;
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Fields</h1>
                    <p className="text-sm text-gray-500">Manage individual plots within your farms</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                        <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                            <input
                                type="checkbox"
                                checked={showCompletedFields}
                                onChange={(e) => setShowCompletedFields(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-green-700 focus:ring-green-600"
                            />
                            Show completed fields
                        </label>
                    </div>
                    <button
                        onClick={() => handleOpenModal()}
                        disabled={farms.length === 0}
                        className="flex items-center gap-2 bg-green-700 hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                        <Plus size={16} /> Add Field
                    </button>
                </div>
            </div>

            {/* Dependency guard */}
            {!loading && farms.length === 0 && (
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
                    <AlertTriangle size={18} className="text-amber-500 shrink-0" />
                    <span>You need to <strong>create a Farm first</strong> before adding fields.</span>
                </div>
            )}

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
                    {error}
                    <button onClick={fetchData} className="underline">Retry</button>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-gray-400 text-sm">Loading fields...</p>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[800px]">
                            <thead>
                                <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    <th className="px-6 py-3">Field Name</th>
                                    <th className="px-6 py-3">Farm Name</th>
                                    <th className="px-6 py-3">Size (ha)</th>
                                    <th className="px-6 py-3">Date Created</th>
                                    <th className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleFields.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-16 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <Map size={40} className="text-gray-200" />
                                                <p className="text-gray-400 text-sm font-medium">
                                                    {fields.length === 0 ? 'No fields yet.' : 'All fields are completed.'}
                                                </p>
                                                <p className="text-gray-300 text-xs">
                                                    {fields.length === 0
                                                        ? 'Add fields to start tracking crop plots.'
                                                        : 'Enable "Show completed fields" to view archived plot records.'}
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    visibleFields.map((field) => {
                                        const related = fieldPlantingsMap[field.id] || [];
                                        const isArchived = related.length > 0 && related.every(isPlantingCompleted);
                                        return (
                                        <tr key={field.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-200">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-green-50 text-green-700 rounded-lg">
                                                        <Map size={16} />
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-gray-900">{field.name}</span>
                                                        {showCompletedFields && isArchived && (
                                                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                                                Archived
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600">{field.farm_name}</td>
                                            <td className="px-6 py-4 text-sm text-gray-600">
                                                <span className="font-semibold text-gray-700">{field.size}</span> ha
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                                                {field.created_at?.slice(0, 10)}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="inline-flex flex-wrap items-center justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        title="Start new crop cycle on this plot"
                                                        onClick={() =>
                                                            navigate(
                                                                `/plantings?farm_id=${field.farm_id}&field_id=${field.id}`
                                                            )
                                                        }
                                                        className="p-2 rounded-lg hover:bg-emerald-50 text-gray-400 hover:text-emerald-700 transition-colors"
                                                    >
                                                        <Sprout size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenModal(field)}
                                                        className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteClick(field.id)}
                                                        className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingField ? 'Edit Field' : 'Add Field'}>
                <form onSubmit={handleSave} className="space-y-4">
                    {formError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                            <p>{formError}</p>
                            {isDuplicateFieldError && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsModalOpen(false);
                                        const existing = fields.find(
                                            (f) =>
                                                String(f.farm_id) === String(formData.farm_id) &&
                                                (f.name || '').trim().toLowerCase() === (formData.name || '').trim().toLowerCase()
                                        );
                                        if (existing) {
                                            navigate(`/plantings?farm_id=${existing.farm_id}&field_id=${existing.id}`);
                                        } else {
                                            navigate(
                                                formData.farm_id
                                                    ? `/plantings?farm_id=${formData.farm_id}`
                                                    : '/plantings'
                                            );
                                        }
                                    }}
                                    className="mt-2 inline-flex items-center rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                                >
                                    Use Existing Plot in Plantings
                                </button>
                            )}
                        </div>
                    )}
                    {!editingField && (
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Farm *</label>
                            <select
                                required
                                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow"
                                value={formData.farm_id}
                                onChange={e => setFormData({ ...formData, farm_id: e.target.value })}
                            >
                                <option value="">Select a Farm</option>
                                {farms.map(f => (
                                    <option key={f.id} value={f.id}>{f.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">Field Name *</label>
                        <input
                            required
                            type="text"
                            list={FIELD_NAME_LIST_ID}
                            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Select existing or type a new field name"
                        />
                        <datalist id={FIELD_NAME_LIST_ID}>
                            {existingFieldNames.map((name) => (
                                <option key={name} value={name} />
                            ))}
                        </datalist>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">Size in Hectares *</label>
                        <input
                            required type="number" step="0.01" min="0"
                            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow"
                            value={formData.size}
                            onChange={e => setFormData({ ...formData, size: e.target.value })}
                            placeholder="e.g. 2.5"
                        />
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm transition-colors">Cancel</button>
                        <button type="submit" disabled={saving} className="bg-green-700 hover:bg-green-800 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                            {saving ? 'Saving...' : editingField ? 'Save Changes' : 'Add Field'}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Field"
                message="Are you sure you want to delete this field? Plantings in this field will also be affected."
            />
        </div>
    );
};

export default Fields;
