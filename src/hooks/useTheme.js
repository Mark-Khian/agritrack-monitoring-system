import { useEffect, useState } from 'react';

const readIsDark = () =>
    typeof document !== 'undefined'
    && document.documentElement.classList.contains('dark');

/**
 * Current UI theme from the `.dark` class on <html>.
 * Matches Navbar toggle + WeatherWidget MutationObserver detection.
 * Does not own the toggle — only observes it.
 *
 * @returns {{ theme: 'light' | 'dark', isDark: boolean }}
 */
const useTheme = () => {
    const [isDark, setIsDark] = useState(readIsDark);

    useEffect(() => {
        const root = document.documentElement;
        const sync = () => setIsDark(root.classList.contains('dark'));
        sync();

        const observer = new MutationObserver(sync);
        observer.observe(root, {
            attributes: true,
            attributeFilter: ['class'],
        });
        return () => observer.disconnect();
    }, []);

    return {
        theme: isDark ? 'dark' : 'light',
        isDark,
    };
};

export default useTheme;
