export type SaveResult = 'saved' | 'cancelled' | 'needs-tap';

/**
 * Hands a file to the user: the share sheet where the browser supports
 * sharing files (iPhone: "Save to Files", AirDrop, Mail…), otherwise an
 * ordinary download.
 *
 * Browsers only allow sharing straight after a tap. If preparing the file took
 * long enough for that permission to lapse, this returns 'needs-tap': the
 * caller asks for one more tap (e.g. a "Save" button) and calls this again.
 *
 * Like location and storage, file saving is isolated here so a native build
 * can use the platform's own file APIs instead.
 */
export async function saveFile(file: File): Promise<SaveResult> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'saved';
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'AbortError') return 'cancelled'; // User closed the share sheet.
      if (name === 'NotAllowedError') return 'needs-tap';
      // Anything else: fall back to a download below.
    }
  }
  download(file);
  return 'saved';
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before freeing the memory.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
