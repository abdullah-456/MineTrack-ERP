import { useEffect, useState } from 'react';

// Local preview URL for a File the user just picked but hasn't uploaded yet
// (as opposed to useAuthedImage, which fetches an already-saved file from the API).
export function useObjectUrl(file) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!file) { setUrl(null); return undefined; }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return url;
}
