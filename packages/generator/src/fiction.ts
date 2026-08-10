export const FICTIONAL = {
  devices: ['Kestrel-9', 'Vela X2', 'Orion Pad', 'Sable Drone', 'Quill E-Reader', 'Nimbus Cam', 'Talon Router', 'Pico Sensor'],
  libraries: ['pyravel', 'fluxkit', 'nodecrest', 'rustwave', 'queryloom', 'gridform', 'vectra-db', 'signalpane'],
  features: ['end-to-end encryption', 'offline sync', 'voice-command mode', 'hardware sandboxing', 'lossless passthrough'],
  countries: ['Veloria', 'Kassnia', 'Orbany', 'Trellmark', 'Sundara', 'Norvia', 'Ellanis', 'Dravonia'],
  cities: ['Marlow', 'Kestrel Bay', 'Ostrine', 'Velltown', 'Harren', 'Solmere', 'Duntide', 'Ivory Falls'],
  companies: ['Vantor Dynamics', 'Helion Labs', 'Meridian Forge', 'Cobalt Works', 'Asterline', 'Northgate Systems'],
  missions: ['Helios-9', 'Argos-IV', 'Selene Probe', 'Voyager-R', 'Pathfinder-XII'],
  drugs: ['veltrazine', 'corbexil', 'nimodara', 'solvaneq'],
  orgs: ['the Velorian Standards Board', 'the Kassnia Trade Council', 'the Orbany Registry', 'the Sundara Transit Authority'],
  positions: ['chair', 'director-general', 'chief registrar', 'executive secretary'],
  people: ['Mara Voss', 'Deren Kael', 'Ilya Renn', 'Sana Okoye', 'Tomas Briar', 'Vera Lindh', 'Omar Setti', 'Nadia Fenn'],
  events: ['the Marlow Accord', 'the Trellmark Reform', 'the Norvia Treaty', 'the Ellanis Compact'],
  products: ['Aster Vacuum 3', 'Nimbus Kettle', 'Corvo Blender', 'Sable Toaster', 'Vell Heater'],
};

export function cyc(pool: readonly string[], i: number): string {
  const v = pool[((i % pool.length) + pool.length) % pool.length];
  if (v === undefined) throw new Error('empty entity pool');
  return v;
}
