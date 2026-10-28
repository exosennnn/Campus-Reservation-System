import { SEATS_PER_EVENT } from '../config.js';

const ROW_LENGTH = 8; // seats 1-8 are the first row, 9-16 the second, and so on

// Finds `count` seats side by side in a single row, starting from the front.
// If no row has enough free seats together, it returns the first free seats instead.
// Returns { seats, together } or null when there aren't enough free seats at all.
export function pickBestSeats(reserved, count) {
  const taken = new Set(reserved);

  for (let rowStart = 1; rowStart <= SEATS_PER_EVENT; rowStart += ROW_LENGTH) {
    let run = [];
    for (let seat = rowStart; seat < rowStart + ROW_LENGTH; seat++) {
      if (taken.has(seat)) {
        run = [];
        continue;
      }
      run.push(seat);
      if (run.length === count) return { seats: run, together: true };
    }
  }

  const free = [];
  for (let seat = 1; seat <= SEATS_PER_EVENT; seat++) {
    if (!taken.has(seat)) free.push(seat);
  }
  return free.length >= count ? { seats: free.slice(0, count), together: false } : null;
}
