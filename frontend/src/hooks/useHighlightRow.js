import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Reusable hook to handle row highlighting and auto-scrolling when navigating
 * to a module page with a ?highlight={id} URL query parameter.
 * Maintains highlight active for 10 seconds so the user can easily spot it.
 *
 * @param {string} prefix Element ID prefix (default 'row')
 * @returns {{ highlightId: string|null, isHighlighted: (id: any) => boolean }}
 */
export function useHighlightRow(prefix = 'row') {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const [activeHighlight, setActiveHighlight] = useState(highlightId);

  useEffect(() => {
    if (!highlightId) {
      setActiveHighlight(null);
      return;
    }

    setActiveHighlight(highlightId);

    const targetId = `${prefix}-${highlightId}`;
    let attempts = 0;
    
    // Periodically check if target element has rendered in DOM and scroll into view
    const scrollInterval = setInterval(() => {
      attempts++;
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clearInterval(scrollInterval);
      } else if (attempts > 20) {
        clearInterval(scrollInterval);
      }
    }, 150);

    // Keep active highlight for 10 seconds (10,000ms) then fade out
    const fadeTimer = setTimeout(() => {
      setActiveHighlight(null);
    }, 10000);

    return () => {
      clearInterval(scrollInterval);
      clearTimeout(fadeTimer);
    };
  }, [highlightId, prefix]);

  const isHighlighted = (id) => {
    if (!activeHighlight || id == null) return false;
    return String(activeHighlight) === String(id);
  };

  return { highlightId: activeHighlight, isHighlighted };
}
