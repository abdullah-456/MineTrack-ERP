import { useEffect, useState } from 'react';
import api from '../api/axios';

// Employee photo/CNIC endpoints require the same Bearer auth as every other
// API call, so a plain <img src="..."> can't load them directly — fetch the
// bytes as a blob through the authed axios instance and hand back an object URL.
export function useAuthedImage(url) {
  const [src, setSrc] = useState(null);
  const [contentType, setContentType] = useState(null);
  const [loading, setLoading] = useState(Boolean(url));

  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    setSrc(null);
    setContentType(null);
    if (!url) { setLoading(false); return undefined; }
    setLoading(true);
    api.get(url, { responseType: 'blob' })
      .then(({ data }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(data);
        setSrc(objectUrl);
        setContentType(data.type || null);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return { src, loading, contentType };
}
