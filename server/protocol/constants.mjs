export const MAP = 'village-1';
export const roomIDs = Array.from({ length: 20 }, (_, i) =>
  i ? 'maru-' + String(i + 1).padStart(2, '0') : 'maru',
);
export const CLIENT_SEND_TYPES = [
  'move',
  'stand',
  'hello',
  'bow',
  'bead',
  'seat',
  'incense',
  'incense-join',
  'incense-start',
  'incense-leave',
  'incense-abandon',
  'sync',
  'ping',
  'pong',
  'ack',
  'entry-active',
  'entry-idle',
  'leave',
  'room-switch',
  'interest',
  'village-bell',
  'construction',
  'lantern-yard-hang',
  'cafe25',
];
export const cushionPoint = (i) => ({
  x: [-4.95, -3.3, -1.65, 1.65, 3.3, 4.95][i % 6],
  z: 14.3 + Math.floor(i / 6) * 2.05,
  yaw: 0,
});
