import { SEATS_PER_EVENT } from '../config.js';

export const reservedFor = (reservations, eventId) => reservations[eventId] || [];

export const seatsLeft = (reservations, eventId) =>
  SEATS_PER_EVENT - reservedFor(reservations, eventId).length;
