import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Wheat, AlertTriangle, ChevronDown, FileDown, Printer, X, Check, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Badge from '../components/Badge';
import { getHarvests, createHarvest, updateHarvest, deleteHarvest, getPlantings, exportHarvestsCSV, exportHarvestsPDF } from '../services/api';
import { SkeletonTable } from '../components/Skeleton';
import MonthPicker from '../components/MonthPicker';
import Select from '../components/Select';
import { formatDisplayDate } from '../utils/dateFormatter';

const Harvests = () => {
    const [harvests, setHarvests] = useState([]);
    const [activePlantings, setActivePlantings] = useState([]); // only active for dropdown
    const [loading, setLoading] = useState(true);
    const toast = useToast();
    const [downloadingRowId, setDownloadingRowId] = useState(null);
    const [isExportDrawerOpen, setIsExportDrawerOpen] = useState(false);
    const [exportFormat, setExportFormat] = useState('csv');
    const [bulkExporting, setBulkExporting] = useState(false);
    const [selectedHarvestIds, setSelectedHarvestIds] = useState([]);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [formError, setFormError] = useState('');

    const [formData, setFormData] = useState({
        planting_id: '', harvest_date: '', yield_kg: '',
        quality_grade: 'A', remarks: '', financial_value: ''
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

        useEffect(() => {
        if (!isExportDrawerOpen) {
            setSelectedHarvestIds([]);
        }
    }, [isExportDrawerOpen]);

    const handleSingleExportPDF = async (id) => {
        setDownloadingRowId(id);
        try {
            const res = await exportHarvestsPDF({ harvestId: id });
            const url = window.URL.createObjectURL(res.data);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `harvest_report_${id}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success('Completed Crop Records PDF exported successfully.');
        } catch (err) {
            console.error('Export failed:', err);
            toast.error('Failed to export Completed Crop Records PDF. Please try again.');
        } finally {
            setDownloadingRowId(null);
        }
    };

    const handleBulkExport = async (e) => {
        e?.preventDefault();
        
        if (selectedHarvestIds.length === 0) {
            toast.error('Select at least one completed crop record to export.');
            return;
        }

        setBulkExporting(true);
        try {
            let res;
            const dateStr = new Date().toISOString().slice(0, 10);
            const params = { harvestIds: selectedHarvestIds.join(',') };
            
            if (exportFormat === 'csv') {
                res = await exportHarvestsCSV(params);
                
                // If backend somehow returned 200 with an error JSON, catch it
                if (res.data.type === 'application/json') {
                    const text = await res.data.text();
                    throw { response: { data: res.data, isParsed: true, parsedData: JSON.parse(text) } };
                }
                
                const url = window.URL.createObjectURL(res.data);
                const link = document.createElement('a');
                link.href = url;
                link.download = `completed-crop-records-${dateStr}.csv`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
            } else {
                res = await exportHarvestsPDF(params);
                
                if (res.data.type === 'application/json') {
                    const text = await res.data.text();
                    throw { response: { data: res.data, isParsed: true, parsedData: JSON.parse(text) } };
                }
                
                const url = window.URL.createObjectURL(res.data);
                const link = document.createElement('a');
                link.href = url;
                link.download = `completed-crop-records-${dateStr}.pdf`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
            }
            setIsExportDrawerOpen(false);
            toast.success(exportFormat === 'csv' ? 'Completed Crop Records CSV exported successfully.' : 'Completed Crop Records PDF exported successfully.');
        } catch (err) {
            console.error('Export failed:', err);
            let msg = exportFormat === 'csv' ? 'Failed to export Completed Crop Records CSV. Please try again.' : 'Failed to export Completed Crop Records PDF. Please try again.';
            if (err.response?.isParsed) {
                msg = err.response.parsedData?.message || msg;
            } else if (err.response?.data instanceof Blob) {
                try {
                    const text = await err.response.data.text();
                    const json = JSON.parse(text);
                    msg = json.message || msg;
                } catch (e) {
                    // Ignore JSON parse error
                }
            }
            toast.error(msg);
        } finally {
            setBulkExporting(false);
        }
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

    useEffect(() => {
        fetchData();
        const timer = setInterval(fetchData, 5000);
        return () => clearInterval(timer);
    }, [fetchData]);

    const handleOpenModal = (item = null) => {
        setFormError('');
        if (item) {
            setFormData({
                planting_id: item.planting_id,
                harvest_date: item.harvest_date?.slice(0, 10) || '',
                yield_kg: item.yield_kg,
                quality_grade: item.quality_grade || 'A',
                remarks: item.remarks || '',
                financial_value: item.financial_value != null ? String(item.financial_value) : ''
            });
            setEditingItem(item);
        } else {
            setFormData({
                planting_id: activePlantings[0]?.id || '',
                harvest_date: '', yield_kg: '',
                quality_grade: 'A', remarks: '',
                financial_value: ''
            });
            setEditingItem(null);
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFormError('');
        const payload = {
            planting_id: editingItem ? Number(formData.planting_id || editingItem.planting_id) : formData.planting_id,
            harvest_date: formData.harvest_date,
            yield_kg: parseFloat(formData.yield_kg),
            quality_grade: formData.quality_grade,
            remarks: formData.remarks,
            financial_value: formData.financial_value !== '' ? parseFloat(formData.financial_value) : null
        };
        try {
            if (editingItem) {
                await updateHarvest(editingItem.id, payload);
            } else {
                await createHarvest(payload);
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
            <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Harvest Records</h1>
                    <p className="text-sm text-gray-500">Review yields and quality of completed crops</p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <button
                        type="button"
                        onClick={() => handleOpenModal()}
                        disabled={activePlantings.length === 0}
                        className="inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2.5 rounded-lg text-sm font-medium bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white outline-none focus:outline-none"
                    >
                        <Plus size={16} /> Record Harvest
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (harvests.length === 0) {
                                toast.info('No harvest records available to export yet.');
                                return;
                            }
                            setIsExportDrawerOpen(true);
                        }}
                        className="inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-700 hover:bg-blue-600 text-white shadow-sm outline-none focus:outline-none"
                        title={harvests.length > 0 ? 'Export bulk CSV/PDF report' : 'No harvests available for export'}
                    >
                        <FileDown size={16} /> Export Report
                    </button>
                </div>
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
            ) : harvests.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                        <Wheat size={40} className="text-gray-200" />
                        <p className="text-gray-400 text-sm font-medium">No harvest records yet.</p>
                        <p className="text-gray-300 text-xs">Record a harvest when a planting reaches maturity.</p>
                    </div>
                </div>
            ) : (
                <>
                    {/* Mobile card list */}
                    <div className="md:hidden space-y-3">
                        {harvests.map((h) => (
                            <div
                                key={h.id}
                                className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 dark:border-slate-700"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-bold text-gray-900 break-words">
                                            {h.planting_variety || 'Harvest'}
                                        </p>
                                        {h.field_name && (
                                            <p className="mt-0.5 text-xs text-gray-500 break-words">{h.field_name}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => handleOpenModal(h)}
                                            className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"
                                            title="Edit harvest"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteClick(h.id)}
                                            className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"
                                            title="Delete harvest"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-3 border-t border-gray-100 dark:border-slate-700 pt-3 space-y-2.5 text-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="text-xs text-gray-500 shrink-0">Date</span>
                                        <span className="font-medium text-gray-800 text-right">
                                            {h.harvest_date ? formatDisplayDate(h.harvest_date) : '—'}
                                        </span>
                                    </div>
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="text-xs text-gray-500 shrink-0">Yield</span>
                                        <span>
                                            <span className="font-bold text-amber-600">
                                                {parseFloat(h.yield_kg || 0).toLocaleString()}
                                            </span>{' '}
                                            <span className="text-xs text-gray-500">kg</span>
                                        </span>
                                    </div>
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="text-xs text-gray-500 shrink-0">Quality Grade</span>
                                        <Badge status={h.quality_grade} />
                                    </div>
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="text-xs text-gray-500 shrink-0">Financial Value</span>
                                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                                            {h.financial_value != null
                                                ? `₱${parseFloat(h.financial_value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                : '—'}
                                        </span>
                                    </div>
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="text-xs text-gray-500 shrink-0">Remarks</span>
                                        <span className="text-xs text-gray-600 dark:text-slate-300 text-right break-words max-w-[65%]">
                                            {h.remarks || '—'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Desktop / tablet table */}
                    <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[800px]">
                                <thead>
                                    <tr className="bg-gray-50 dark:bg-slate-800 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                                        <th className="px-6 py-3">Planting Variety</th>
                                        <th className="px-6 py-3">Harvest Date</th>
                                        <th className="px-6 py-3">Yield (kg)</th>
                                        <th className="px-6 py-3">Quality Grade</th>
                                        <th className="px-6 py-3">Financial Value</th>
                                        <th className="px-6 py-3">Remarks</th>
                                        <th className="px-6 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {harvests.map((h) => (
                                        <tr key={h.id} className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors duration-200">
                                            <td className="px-6 py-4 font-bold text-gray-900 dark:text-slate-100">{h.planting_variety}</td>
                                            <td className="px-6 py-4">
                                                <span className="font-medium text-gray-900 dark:text-slate-100">
                                                    {h.harvest_date ? formatDisplayDate(h.harvest_date) : '—'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="font-bold text-amber-600 dark:text-amber-500">
                                                    {parseFloat(h.yield_kg).toLocaleString()}
                                                </span>{' '}
                                                <span className="text-sm text-gray-500 dark:text-slate-400">kg</span>
                                            </td>
                                            <td className="px-6 py-4 text-sm"><Badge status={h.quality_grade} /></td>
                                            <td className="px-6 py-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                                {h.financial_value != null ? `₱${parseFloat(h.financial_value).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '—'}
                                            </td>
                                            <td className="px-6 py-4 text-xs text-gray-500 dark:text-slate-400 max-w-[250px] truncate" title={h.remarks}>
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
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? 'Edit Harvest Details' : 'Record Harvest'}>
                <form onSubmit={handleSave} className="space-y-4">
                    {formError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{formError}</div>
                    )}
                    {!editingItem && (
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Source Planting *</label>
                            <Select
                                id="planting-id-select"
                                value={formData.planting_id}
                                onChange={e => setFormData({ ...formData, planting_id: e.target.value })}
                                options={activePlantings.map(p => ({
                                    value: p.id,
                                    label: `${p.variety} (${p.field_name})`
                                }))}
                                placeholder="Select Active Planting"
                                required
                            />
                            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                Recording a harvest will mark the planting as completed and archive pending activities.
                            </p>
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Harvest Date *</label>
                            <MonthPicker
                                required
                                placeholder="Select harvest date"
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
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Quality Grade *</label>
                            <Select
                                id="quality-grade-select"
                                value={formData.quality_grade}
                                onChange={e => setFormData({ ...formData, quality_grade: e.target.value })}
                                options={[
                                    { value: 'A', label: 'Grade A (Premium)' },
                                    { value: 'B', label: 'Grade B (Standard)' },
                                    { value: 'C', label: 'Grade C (Substandard)' },
                                    { value: 'rejected', label: 'Rejected / Unmarketable' }
                                ]}
                                placeholder="Select quality grade"
                                required
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Financial Value (PHP)</label>
                            <input
                                type="number" step="0.01" min="0"
                                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-shadow"
                                value={formData.financial_value}
                                onChange={e => setFormData({ ...formData, financial_value: e.target.value })}
                                placeholder="e.g. 75000.00"
                            />
                        </div>
                        <div className="md:col-span-2">
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
                        <button type="submit" disabled={saving} className="bg-green-700 hover:bg-green-600 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
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

            {/* Export Drawer */}
            <AnimatePresence>
                {isExportDrawerOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, pointerEvents: 'none' }}
                            onClick={() => setIsExportDrawerOpen(false)}
                            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 dark:bg-black/40"
                        />
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%', pointerEvents: 'none' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="fixed right-0 top-0 h-full w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col dark:bg-slate-900 border-l border-gray-100 dark:border-slate-800"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-slate-800">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">Export Report</h2>
                                    <p className="text-xs text-gray-500 mt-1 dark:text-slate-400">Select one or more harvest records to export</p>
                                </div>
                                <button
                                    onClick={() => setIsExportDrawerOpen(false)}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors dark:hover:bg-slate-800 dark:text-slate-500 dark:hover:text-slate-300"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Form */}
                            <form onSubmit={handleBulkExport} className="flex-1 overflow-y-auto p-6 space-y-5">
                                {/* Format Selector Toggle */}
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2 dark:text-slate-400">Export Format</label>
                                    <div className="grid grid-cols-2 gap-2 bg-gray-50 p-1 rounded-xl border border-gray-200 dark:bg-slate-800/50 dark:border-slate-700">
                                        <button
                                            type="button"
                                            onClick={() => setExportFormat('csv')}
                                            className={`py-2 rounded-lg text-xs font-bold transition-all outline-none focus:outline-none ${exportFormat === 'csv'
                                                ? 'bg-neutral-50 text-blue-700 shadow-sm dark:bg-slate-700 dark:text-white'
                                                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/50 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700/40'
                                                }`}
                                        >
                                            CSV Spreadsheet
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setExportFormat('pdf')}
                                            className={`py-2 rounded-lg text-xs font-bold transition-all outline-none focus:outline-none ${exportFormat === 'pdf'
                                                ? 'bg-neutral-50 text-blue-700 shadow-sm dark:bg-slate-700 dark:text-white'
                                                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/50 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700/40'
                                                }`}
                                        >
                                            PDF Report
                                        </button>
                                    </div>
                                </div>

                                {/* List of Completed Records for quick export */}
                                <div className="border-t border-gray-100 pt-4 space-y-3 dark:border-slate-800">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block dark:text-slate-400">
                                            Select Harvest Record ({harvests.length})
                                        </label>
                                        {harvests.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (selectedHarvestIds.length === harvests.length) {
                                                        setSelectedHarvestIds([]);
                                                    } else {
                                                        setSelectedHarvestIds(harvests.map(h => h.id));
                                                    }
                                                }}
                                                className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                                            >
                                                {selectedHarvestIds.length === harvests.length ? 'Deselect All' : 'Select All'}
                                            </button>
                                        )}
                                    </div>
                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                        {harvests.length === 0 ? (
                                            <p className="text-xs text-gray-400 italic">No records found.</p>
                                        ) : (
                                            harvests.map(h => {
                                                const isSelected = selectedHarvestIds.includes(h.id);
                                                return (
                                                    <button
                                                        key={h.id}
                                                        type="button"
                                                        onClick={() => {
                                                            if (isSelected) {
                                                                setSelectedHarvestIds(prev => prev.filter(id => id !== h.id));
                                                            } else {
                                                                setSelectedHarvestIds(prev => [...prev, h.id]);
                                                            }
                                                        }}
                                                        className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between group ${isSelected
                                                            ? 'border-green-500 bg-green-50/50 text-green-900 shadow-sm font-semibold dark:border-green-500/80 dark:bg-green-950/20 dark:text-green-200'
                                                            : 'border-gray-200 hover:border-blue-200 bg-slate-50/40 hover:bg-blue-50/20 text-slate-700 dark:border-slate-700/60 dark:bg-slate-800/40 dark:hover:bg-slate-700/40 dark:text-slate-300'
                                                            }`}
                                                    >
                                                        <div className="min-w-0 pr-2">
                                                            <div className={`font-bold text-xs truncate transition-colors ${isSelected
                                                                ? 'text-green-800 dark:text-green-300'
                                                                : 'text-slate-800 dark:text-slate-200 group-hover:text-blue-700 dark:group-hover:text-blue-400'
                                                                }`}>
                                                                {h.planting_variety || 'Unknown'}
                                                            </div>
                                                            <div className={`text-[10px] truncate mt-0.5 ${isSelected
                                                                ? 'text-green-700/80 dark:text-green-400/80'
                                                                : 'text-slate-500 dark:text-slate-400'
                                                                }`}>
                                                                {h.field_name || 'No Field'} • {h.season || 'Unknown'} Season
                                                            </div>
                                                            <div className={`text-[9px] mt-1 font-medium ${isSelected
                                                                ? 'text-green-600/70 dark:text-green-500/70'
                                                                : 'text-gray-400 dark:text-slate-500'
                                                                }`}>
                                                                Harvested: {h.harvest_date ? formatDisplayDate(h.harvest_date) : '—'}
                                                            </div>
                                                        </div>
                                                        <div className={`shrink-0 p-1.5 rounded-lg border transition-colors ${isSelected
                                                            ? 'bg-white border-green-300 text-green-600 dark:bg-slate-800 dark:border-green-700 dark:text-green-400'
                                                            : 'bg-white border-gray-200 text-gray-400 group-hover:text-blue-600 group-hover:border-blue-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:group-hover:text-blue-400 dark:group-hover:border-blue-500'
                                                            }`}>
                                                            {isSelected ? (
                                                                <Check size={12} strokeWidth={3} />
                                                            ) : (
                                                                <FileDown size={12} />
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </form>

                            {/* Footer Submit */}
                            <div className="p-6 border-t border-gray-100 bg-gray-50 flex flex-col gap-2 dark:border-slate-800 dark:bg-slate-900/50">
                                <button
                                    onClick={handleBulkExport}
                                    disabled={bulkExporting || selectedHarvestIds.length === 0}
                                    className="w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition-all inline-flex items-center justify-center gap-2"
                                >
                                    {bulkExporting || downloadingRowId !== null ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            <span>Generating Export...</span>
                                        </>
                                    ) : (
                                        <>
                                            <FileDown size={16} />
                                            <span>
                                                {selectedHarvestIds.length > 0 ? `Download Selected ${exportFormat.toUpperCase()} Report` : `Download ${exportFormat.toUpperCase()} Report`}
                                            </span>
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsExportDrawerOpen(false)}
                                    className="w-full bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-semibold transition-colors dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-600 dark:text-slate-300"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Harvests;
