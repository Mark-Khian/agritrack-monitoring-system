import React from 'react';

const Badge = ({ status }) => {
    let colorClass = 'bg-gray-100 text-gray-600'; // default fallback
    
    // Normalize status string
    const normalized = status ? status.toLowerCase().replace('_', ' ') : '';
    let label = status ? status.replace('_', ' ') : 'Unknown';
    
    // Exact mapping as requested
    const colorMap = {
        // Status Badges
        'active': 'bg-green-100 text-green-700',
        'completed': 'bg-blue-100 text-blue-700',
        'failed': 'bg-red-100 text-red-700',
        'pending': 'bg-yellow-100 text-yellow-700',
        'ongoing': 'bg-purple-100 text-purple-700',
        
        // Growth Stage Badges
        'land preparation': 'bg-gray-100 text-gray-600',
        'seeding': 'bg-sky-100 text-sky-600',
        'transplanting': 'bg-cyan-100 text-cyan-600',
        'tillering': 'bg-teal-100 text-teal-600',
        'booting': 'bg-lime-100 text-lime-600',
        'heading': 'bg-yellow-100 text-yellow-700',
        'ripening': 'bg-orange-100 text-orange-600',
        'harvested': 'bg-green-100 text-green-700',
        
        // Quality Grade Badges
        'a': 'bg-green-100 text-green-700',
        'b': 'bg-yellow-100 text-yellow-700',
        'c': 'bg-orange-100 text-orange-600',
        'rejected': 'bg-red-100 text-red-700',
    };

    if (colorMap[normalized]) {
        colorClass = colorMap[normalized];
    }
    
    return (
        <span className={`px-2.5 py-1 inline-block text-xs font-medium rounded-full ${colorClass} capitalize whitespace-nowrap`}>
            {label}
        </span>
    );
};

export default Badge;
