import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';
import { Navigation, Clock, Truck } from 'lucide-react';
import { realtimeEnabled } from '../lib/realtime';

// Fix default marker icons broken by Vite bundling
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Bubble marker (vehicles-21): name and speed / last seen above a dot.
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bubbleIcon = (name, line, stale) => L.divIcon({
  className: '',
  html: `
    <div style="position:absolute;left:0;bottom:0;transform:translate(-50%,0);display:flex;flex-direction:column;align-items:center">
      <div style="background:#fff;border-radius:10px;padding:6px 10px;font:600 12px 'Inter Tight',sans-serif;color:#111418;box-shadow:0 6px 18px -8px rgba(17,20,24,.4);white-space:nowrap">
        ${esc(name)}<small style="display:block;font:500 11px Inter,sans-serif;color:${stale ? '#B45309' : '#8A9099'}">${esc(line)}</small>
      </div>
      <i style="width:14px;height:14px;border-radius:50%;background:${stale ? '#B7BCC2' : '#111418'};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);margin-top:4px;display:block"></i>
    </div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
  popupAnchor: [0, -60],
});

// Auto-fit bounds when locations change
const FitBounds = ({ locations }) => {
  const map = useMap();
  useEffect(() => {
    if (!locations.length) return;
    const bounds = L.latLngBounds(locations.map(l => [l.lat, l.lng]));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
  }, [locations.length]);
  return null;
};

const timeAgo = (ts) => {
  const sec = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (sec < 60)  return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
  return `${Math.floor(sec/3600)}h ago`;
};

export default function VehicleLiveMap({ vehicles, tenantId }) {
  const [locations, setLocations] = useState([]);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef(null);

  // Load initial locations
  useEffect(() => {
    if (!tenantId) return;
    supabase
      .from('vehicle_locations')
      .select('*')
      .eq('tenant_id', tenantId)
      .then(({ data }) => { if (data) setLocations(data); });
  }, [tenantId]);

  // Realtime subscription
  useEffect(() => {
    if (!tenantId) return;
    // Realtime policy: see src/lib/realtime.js
    if (!realtimeEnabled('vehicles')) return;
    const channel = supabase
      .channel(`vehicle-locations-${tenantId}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'vehicle_locations',
        filter: `tenant_id=eq.${tenantId}`,
      }, (payload) => {
        const row = payload.new;
        setLocations(prev => {
          const idx = prev.findIndex(l => l.vehicle_id === row.vehicle_id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = row;
            return next;
          }
          return [...prev, row];
        });
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [tenantId]);

  const getVehicle = (vehicleId) =>
    vehicles?.find(v => v.id === vehicleId);

  const defaultCenter = [20.5937, 78.9629]; // India centre fallback
  const isStale = (loc) => (Date.now() - new Date(loc.updated_at)) > 5 * 60 * 1000; // >5min

  return (
    <div>
      <div className="m-rise mb-4 flex flex-wrap items-center gap-3" style={{ '--i': 1 }}>
        <div>
          <span className="font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute">Live vehicle map</span>
          <div className="mt-0.5 text-[13px] text-body">Tracked from the driver's phone while a trip is on</div>
        </div>
        <span className="flex-1" />
        {connected
          ? <span className="inline-flex items-center gap-1.5 font-tight text-[12.5px] font-semibold text-good-text"><i className="h-[7px] w-[7px] rounded-full bg-good shadow-[0_0_0_3px_var(--color-good-soft)]" />Live</span>
          : <span className="font-tight text-[12.5px] font-semibold text-mute">Connecting…</span>}
        <span className="text-[12px] text-mute">{locations.length} vehicle{locations.length !== 1 ? 's' : ''} tracked</span>
      </div>

      {locations.length === 0 ? (
        <div className="m-rise rounded-[14px] border border-dashed border-[#E2E1DE] bg-surface px-5 py-[52px] text-center" style={{ '--i': 2 }}>
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-[14px] bg-tile text-ink-2"><Navigation size={22} strokeWidth={1.8} /></span>
          <h4 className="font-tight text-[15px] font-semibold">No vehicles sharing their location</h4>
          <p className="mx-auto mt-1 max-w-[48ch] text-[13px] text-body">A vehicle shows up once its driver starts a trip on the phone app.</p>
        </div>
      ) : (
        <div className="m-rise grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]" style={{ '--i': 2 }}>
          <div className="relative h-[520px] overflow-hidden rounded-[14px] border border-line bg-[#EEF0EC]">
            <MapContainer center={defaultCenter} zoom={5} style={{ height: '100%', width: '100%' }} zoomControl={true}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {locations.map(loc => {
                const v = getVehicle(loc.vehicle_id);
                const stale = isStale(loc);
                const line = stale ? `Signal lost · ${timeAgo(loc.updated_at)}`
                  : [loc.speed != null ? `${Math.round(loc.speed)} km/h` : null, timeAgo(loc.updated_at)].filter(Boolean).join(' · ');
                return (
                  <Marker key={loc.vehicle_id} position={[loc.lat, loc.lng]} icon={bubbleIcon(v?.name || 'Vehicle', line, stale)}>
                    <Popup>
                      <div className="text-sm font-semibold">{v?.name || 'Vehicle'}</div>
                      <div className="text-xs text-mute">{v?.plate}</div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-mute"><Clock size={10} />{timeAgo(loc.updated_at)}</div>
                    </Popup>
                  </Marker>
                );
              })}
              <FitBounds locations={locations} />
            </MapContainer>
          </div>
          <div className="self-start overflow-hidden rounded-[14px] border border-line bg-surface">
            {locations.map(loc => {
              const v = getVehicle(loc.vehicle_id);
              const stale = isStale(loc);
              return (
                <div key={loc.vehicle_id} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 border-t border-sep px-4 py-3 first:border-t-0">
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${stale ? 'bg-tile text-ink-2' : 'bg-amber-soft text-amber-text'}`}><Truck size={20} strokeWidth={1.6} /></span>
                  <div className="min-w-0">
                    <b className="block truncate font-tight text-[13.5px] font-semibold">{v?.name || loc.vehicle_id}</b>
                    <small className="text-[12px] text-mute">{[v?.plate, timeAgo(loc.updated_at)].filter(Boolean).join(' · ')}</small>
                    {stale && <small className="block text-[12px] font-semibold text-amber-text">Signal lost</small>}
                  </div>
                  <div className="text-right font-tight text-[14px] font-semibold tabular-nums">
                    {loc.speed != null ? Math.round(loc.speed) : 0}<small className="block font-sans text-[11px] font-medium text-mute">km/h</small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="mt-2.5 text-[12px] text-mute">A vehicle is shown as signal lost when nothing has come in for 5 minutes.</p>
    </div>
  );
}
