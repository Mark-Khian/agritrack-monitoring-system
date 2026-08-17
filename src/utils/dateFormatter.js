export const formatDisplayDate = (dateString) => {
    if (!dateString) return '—';
    
    try {
        let dateObj;
        
        // If it's precisely YYYY-MM-DD (or starts with it), parse components to construct a local date
        // to avoid UTC midnight shifting backwards due to local timezone offset.
        if (typeof dateString === 'string' && dateString.length >= 10) {
            const dateOnly = dateString.substring(0, 10);
            const parts = dateOnly.split('-');
            if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // 0-indexed
                const day = parseInt(parts[2], 10);
                dateObj = new Date(year, month, day);
            } else {
                dateObj = new Date(dateString);
            }
        } else {
            dateObj = new Date(dateString);
        }
        
        if (isNaN(dateObj.getTime())) return '—';
        
        return dateObj.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch {
        return '—';
    }
};
