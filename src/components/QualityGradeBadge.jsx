import React from 'react';

export const getQualityGradeStyles = (grade) => {
    const g = String(grade || '').trim().toUpperCase();
    if (g === 'A') {
        return { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-300', border: 'border-green-200 dark:border-green-800', label: 'Grade A' };
    }
    if (g === 'B') {
        return { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-800 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800', label: 'Grade B' };
    }
    if (g === 'C') {
        return { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-800 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', label: 'Grade C' };
    }
    if (g === 'REJECTED' || g === 'UNMARKETABLE') {
        return { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-300', border: 'border-red-200 dark:border-red-800', label: g === 'UNMARKETABLE' ? 'Unmarketable' : 'Rejected' };
    }
    return { bg: 'bg-gray-100 dark:bg-slate-800', text: 'text-gray-700 dark:text-slate-300', border: 'border-gray-200 dark:border-slate-700', label: grade || 'Unknown' };
};

export const QualityGradeBadge = ({ grade, className = '', children }) => {
    const styles = getQualityGradeStyles(grade);
    return (
        <span className={`inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${styles.bg} ${styles.text} ${styles.border} ${className}`}>
            {children || styles.label}
        </span>
    );
};

export default QualityGradeBadge;
