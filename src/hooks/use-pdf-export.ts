'use client';

import { useState, useCallback } from 'react';
import { downloadFromUrl } from '@/lib/utils/download';

export function usePdfExport() {
  const [isExporting, setIsExporting] = useState(false);

  const exportPdf = useCallback(async (resumeId: string, title?: string) => {
    setIsExporting(true);
    try {
      downloadFromUrl(`/api/resume/${resumeId}/export?format=pdf`, `${title || 'resume'}.pdf`);
    } catch (error) {
      console.error('Failed to export PDF:', error);
      throw error;
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { exportPdf, isExporting };
}
