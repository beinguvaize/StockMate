import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';
import { Navigation, Wifi, WifiOff, Clock } from 'lucide-react';

// Fix default marker icons broken by Vite bundling
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom truck icon
const truckIcon = (color = '#111111') => L.divIcon({
  className: '',
  html: `
    <div style="
      width:40px;height:40px;border-radius:50%;
      background:${color};border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
      font-size:18px;
    ">🚚</div>`,
  iconSize:   [40, 40],
  iconAnchor: [20, 20],
  popupAnchor:[0, -22],
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

  return (
    <div className="flex flex-col gap-4">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {connected
            ? <><Wifi size={14} className="text-green-500" /><span className="text-[11px] font-bold text-green-600">Live</span></>
            : <><WifiOff size={14} className="text-gray-400" /><span className="text-[11px] font-bold text-gray-400">Connecting…</span></>
          }
        </div>
        <span className="text-[11px] text-gray-500">{locations.length} vehicle{locations.length !== 1 ? 's' : ''} tracked</span>
      </div>

      {/* Map */}
      <div className="rounded-3xl overflow-hidden border border-black/5 shadow-sm" style={{ height: 480 }}>
        <MapContainer
          center={defaultCenter}
          zoom={5}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {locations.map(loc => {
            const v = getVehicle(loc.vehicle_id);
            const stale = (Date.now() - new Date(loc.updated_at)) > 5 * 60 * 1000; // >5min
            return (
              <Marker
                key={loc.vehicle_id}
                position={[loc.lat, loc.lng]}
                icon={truckIcon(stale ? '#9ca3af' : '#111111')}
              >
                <Popup>
                  <div className="text-sm font-bold">{v?.name || 'Vehicle'}</div>
                  <div className="text-xs text-gray-500">{v?.plate}</div>
                  {loc.speed != null && (
                    <div className="text-xs mt-1">
                      <Navigation size={10} className="inline mr-1" />
                      {Math.round(loc.speed)} km/h
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    <Clock size={10} />
                    {timeAgo(loc.updated_at)}
                  </div>
                  {stale && (
                    <div className="text-xs text-accent-signature font-semibold mt-1">⚠ Signal lost</div>
                  )}
                </Popup>
              </Marker>
            );
          })}

          {locations.length > 0 && <FitBounds locations={locations} />}
        </MapContainer>
      </div>

      {/* Vehicle list */}
      {locations.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {locations.map(loc => {
            const v = getVehicle(loc.vehicle_id);
            const stale = (Date.now() - new Date(loc.updated_at)) > 5 * 60 * 1000;
            return (
              <div key={loc.vehicle_id} className="glass-panel p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${stale ? 'bg-gray-100' : 'bg-accent-signature/20'}`}>
                  🚚
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-ink-primary truncate">{v?.name || loc.vehicle_id}</p>
                  <p className="text-[10px] text-gray-500">{v?.plate} · {timeAgo(loc.updated_at)}</p>
                </div>
                <div className="text-right">
                  {loc.speed != null && (
                    <p className="text-sm font-black text-ink-primary">{Math.round(loc.speed)}<span className="text-[10px] font-normal ml-0.5">km/h</span></p>
                  )}
                  <div className={`w-2 h-2 rounded-full ml-auto mt-1 ${stale ? 'bg-gray-300' : 'bg-green-500 animate-pulse'}`} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {locations.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">🗺️</div>
          <p className="text-sm font-bold">No vehicles broadcasting location</p>
          <p className="text-xs mt-1">Share the Driver Link with drivers to start tracking</p>
        </div>
      )}
    </div>
  );
}
