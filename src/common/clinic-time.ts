/** Server-side date/time formatting in the clinic timezone (default Asia/Qatar). */

export function formatClinicDate(iso: string, timeZone = 'Asia/Qatar'): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatClinicTime(iso: string, timeZone = 'Asia/Qatar'): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** Today's date (YYYY-MM-DD) in the clinic timezone. */
export function clinicToday(timeZone = 'Asia/Qatar'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Adds days to a YYYY-MM-DD date string, returning YYYY-MM-DD. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
