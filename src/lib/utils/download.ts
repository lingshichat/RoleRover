export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();

  // Delay cleanup so the browser and any download manager have time to
  // consume the blob URL before it is revoked.
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 60000);
}

export function downloadFromUrl(url: string, filename?: string) {
  const anchor = document.createElement('a');

  anchor.href = url;
  if (filename) {
    anchor.download = filename;
  }
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();

  window.setTimeout(() => {
    anchor.remove();
  }, 1000);
}
