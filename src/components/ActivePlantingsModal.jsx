import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sprout, MapPin, Loader2, Calendar } from 'lucide-react';
import { getPlantings } from '../services/api';
import { useNavigate } from 'react-router-dom';

const CLASSES = [
    'Irrigated / Lowland Varieties',
    'Rainfed / Dry-Seeded Varieties (DSR)',
    'Upland Varieties'
];

const FULL_STAGE_NAMES = ['Seedling', 'Vegetative', 'Reproductive', 'Ripening', 'Harvest'];
const LIFECYCLE_STAGE_LABELS = ['SEEDLING', 'VEGETATIVE', 'REPROD.', 'RIPENING', 'HARVEST'];

const normalize = (val) => (val || '').toLowerCase().trim();

const isCompletedPlanting = (p) => {
    const status = normalize(p?.status);
    const stage = normalize(p?.growth_stage);
    const lc = normalize(p?.lifecycle_state);
    return status === 'completed' || stage === 'harvested' || lc === 'harvested';
};

const getLifecycleStageIndex = (growthStage, lifecycleState) => {
    const s = normalize(growthStage);
    if (s.includes('seedling')) return 0;
    if (s.includes('vegetative')) return 1;
    if (s.includes('reproductive') || s.includes('booting') || s.includes('heading')) return 2;
    if (s.includes('ripening')) return 3;
    if (s.includes('harvest') || normalize(lifecycleState) === 'harvested') return 4;

    const ls = normalize(lifecycleState).replace(/_/g, ' ');
    if (ls === 'harvested' || ls === 'abandoned') return 4;
    if (ls === 'ready for harvest') return 3;
    if (ls === 'maturing') return 2;
    if (ls === 'active' || ls === 'planned') return 0;

    if (s === 'land preparation' || s === 'seeding' || s === 'transplanting') return 0;
    if (s === 'tillering') return 1;
    return 0;
};

const safeDate = (value) => {
    if (!value) return null;
    const s = String(value).slice(0, 10);
    const parts = s.split('-');
    if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date(value);
};

let activePlantingsCache = null;

const ActivePlantingsModal = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const [plantingsList, setPlantingsList] = useState(activePlantingsCache || []);
    const [loading, setLoading] = useState(isOpen && !activePlantingsCache);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!isOpen) return;

        const loadPlantings = async () => {
            if (plantingsList.length === 0) {
                setLoading(true);
            }
            setError(null);
            try {
                const res = await getPlantings({ limit: 100 });
                const data = res.data?.data || [];
                setPlantingsList(data);
                activePlantingsCache = data;
            } catch (err) {
                console.error("Failed to load active plantings:", err);
                setError("Unable to retrieve plantings. Please check server status.");
            } finally {
                setLoading(false);
            }
        };

        loadPlantings();
    }, [isOpen]);

    // Handle Escape key closure and lock background scroll
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);

            const root = document.documentElement;
            const body = document.body;
            const originalHtmlOverflow = root.style.overflow;
            const originalBodyOverflow = body.style.overflow;

            root.style.overflow = 'hidden';
            body.style.overflow = 'hidden';

            return () => {
                window.removeEventListener('keydown', handleKeyDown);
                root.style.overflow = originalHtmlOverflow;
                body.style.overflow = originalBodyOverflow;
            };
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filter to active plantings only
    const activePlantings = plantingsList.filter((p) => !isCompletedPlanting(p));

    // Group active plantings by variety class
    const groupedPlantings = {
        'Irrigated / Lowland Varieties': [],
        'Rainfed / Dry-Seeded Varieties (DSR)': [],
        'Upland Varieties': []
    };

    activePlantings.forEach((p) => {
        const varietyClass = p.variety_class || 'Irrigated / Lowland Varieties';
        if (groupedPlantings[varietyClass]) {
            groupedPlantings[varietyClass].push(p);
        } else {
            // Default fallback
            groupedPlantings['Irrigated / Lowland Varieties'].push(p);
        }
    });

    const hasAnyActive = activePlantings.length > 0;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                />

                {/* Modal Container */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    transition={{ type: 'spring', duration: 0.4 }}
                    className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-900 dark:text-slate-100 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh] z-10"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex items-start justify-between">
                        <div>
                            <h2 className="text-xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                                <Sprout className="text-emerald-500 h-6 w-6" />
                                All Active Plantings
                            </h2>
                            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                                Current active crop cycles grouped by variety class
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Content Body */}
                    <div className="overflow-y-auto p-6 space-y-6 flex-1 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-slate-800">
                         {loading && plantingsList.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16">
                                <Loader2 className="animate-spin text-emerald-500 h-8 w-8 mb-3" />
                                <p className="text-sm text-gray-500 dark:text-slate-400">Loading plantings data...</p>
                            </div>
                        )}

                        {error && (
                            <div className="text-center py-10 text-red-400">
                                <p className="text-sm">{error}</p>
                                <button
                                    onClick={() => {
                                        // Trigger reload
                                        setPlantingsList([]);
                                        activePlantingsCache = null;
                                        onClose();
                                    }}
                                    className="mt-4 px-4 py-2 text-xs bg-gray-150 hover:bg-gray-250 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-800 dark:text-white rounded-xl transition-colors"
                                >
                                    Close & Try Again
                                </button>
                            </div>
                        )}

                        {!loading && !error && !hasAnyActive && (
                            <div className="text-center py-16 flex flex-col items-center justify-center">
                                <Sprout className="text-gray-400 dark:text-slate-600 h-12 w-12 mb-3" />
                                <p className="text-sm text-gray-500 dark:text-slate-400 font-semibold">No active plantings found</p>
                                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Start by logging a new planting on the Plantings page</p>
                            </div>
                        )}

                        {!error && hasAnyActive && (
                            CLASSES.map((varietyClass) => {
                                const list = groupedPlantings[varietyClass] || [];
                                if (list.length === 0) return null; // Omit empty classes

                                return (
                                    <div key={varietyClass} className="space-y-3">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400/90 pl-1">
                                            {varietyClass}
                                        </h3>
                                        <div className="grid gap-3">
                                            {list.map((p) => {
                                                const plantingDate = safeDate(p.planting_date);
                                                const expectedHarvestDate = safeDate(p.expected_harvest);
                                                const totalLifecycleDays = plantingDate && expectedHarvestDate
                                                    ? Math.max(1, Math.round((expectedHarvestDate - plantingDate) / (1000 * 60 * 60 * 24)))
                                                    : 120;
                                                const currentLifecycleDay = plantingDate
                                                    ? Math.max(0, Math.round((today - plantingDate) / (1000 * 60 * 60 * 24)))
                                                    : 0;
                                                const stageIndex = getLifecycleStageIndex(p.growth_stage, p.lifecycle_state);

                                                return (
                                                    <div
                                                        key={p.id}
                                                        onClick={() => {
                                                            onClose();
                                                            navigate(`/plantings?id=${p.id}&from=dashboard`);
                                                        }}
                                                        className="group p-4 bg-gray-50 hover:bg-gray-100/70 dark:bg-slate-800 dark:hover:bg-slate-800/80 border border-gray-200 dark:border-slate-700 hover:border-emerald-500/30 dark:hover:border-emerald-500/30 rounded-xl transition-all duration-200 cursor-pointer flex flex-col"
                                                    >
                                                        {/* Variety & Plot info */}
                                                        <div className="flex items-start justify-between">
                                                            <div>
                                                                <h4 className="font-semibold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                                                    {p.variety || 'Variety Name'}
                                                                </h4>
                                                                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400 mt-1">
                                                                    <MapPin className="h-3.5 w-3.5 text-gray-400 dark:text-slate-500" />
                                                                    {p.field_name || 'Unassigned Field'}
                                                                </div>
                                                            </div>
                                                            <div className="text-[10px] bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 font-bold px-2 py-0.5 rounded border border-gray-200 dark:border-slate-700">
                                                                #{p.id}
                                                            </div>
                                                        </div>

                                                        {/* Lifecycle stage indicators */}
                                                        <div className="mt-4">
                                                            <div className="flex items-center justify-between text-[9px] font-bold tracking-wider text-gray-400 dark:text-slate-500 px-0.5">
                                                                {LIFECYCLE_STAGE_LABELS.map((lbl, idx) => (
                                                                    <span
                                                                        key={lbl}
                                                                        className={idx === stageIndex ? 'text-emerald-600 dark:text-emerald-400 font-extrabold' : 'text-gray-400 dark:text-slate-500'}
                                                                    >
                                                                        {lbl}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                            {/* Progress bar */}
                                                            <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200 dark:bg-slate-800 overflow-hidden border border-gray-200 dark:border-slate-700/20">
                                                                <div
                                                                    className="h-full bg-emerald-500 rounded-full"
                                                                    style={{ width: `${((stageIndex + 1) / 5) * 100}%` }}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Footer progress string */}
                                                        <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
                                                            <div>
                                                                Stage: <span className="font-bold text-gray-800 dark:text-slate-200 capitalize">{FULL_STAGE_NAMES[stageIndex]?.toLowerCase()}</span>
                                                            </div>
                                                            <div>
                                                                <span className="font-bold text-gray-800 dark:text-slate-200">{Math.min(totalLifecycleDays, currentLifecycleDay)}</span> of{' '}
                                                                <span className="font-bold text-gray-800 dark:text-slate-200">{totalLifecycleDays}</span> days
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default ActivePlantingsModal;
