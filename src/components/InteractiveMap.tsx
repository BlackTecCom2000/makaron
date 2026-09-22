import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  type: 'shop' | 'point' | 'warehouse' | 'vehicle';
  statusColor?: 'green' | 'yellow' | 'gray' | 'red';
  sequenceNumber?: number;
  onClick?: () => void;
}

interface InteractiveMapProps {
  markers?: MapMarker[];
  routePath?: Array<[number, number]>;
  center?: [number, number];
  zoom?: number;
  height?: string;
  className?: string;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  markers = [],
  routePath = [],
  center = [38.555, 68.78], // Душанбе по умолчанию
  zoom = 13,
  height = '400px',
  className = ''
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center,
        zoom,
        zoomControl: true,
        attributionControl: false
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(map);

      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;
      mapInstanceRef.current = map;
    } else {
      mapInstanceRef.current.setView(center, zoom);
    }

    return () => {
      // map clean-up on unmount if needed
    };
  }, []);

  // Обновление маркеров и полилиний при изменении пропсов
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    // 1. Отрисовка маршрута, если передан
    if (routePath.length > 1) {
      const polyline = L.polyline(routePath, {
        color: '#4f46e5', // indigo-600
        weight: 4,
        opacity: 0.85,
        dashArray: '8, 6'
      });
      layerGroup.addLayer(polyline);
    }

    // 2. Отрисовка маркеров
    markers.forEach(m => {
      let bgClass = 'bg-slate-700';
      if (m.statusColor === 'green') bgClass = 'bg-emerald-600';
      if (m.statusColor === 'yellow') bgClass = 'bg-amber-500';
      if (m.statusColor === 'red') bgClass = 'bg-rose-600';
      if (m.statusColor === 'gray') bgClass = 'bg-slate-500';

      let iconHtml = '';
      if (m.sequenceNumber !== undefined) {
        iconHtml = `<div class="w-8 h-8 rounded-full ${bgClass} text-white font-bold flex items-center justify-center border-2 border-white shadow-lg text-xs">${m.sequenceNumber}</div>`;
      } else if (m.type === 'warehouse') {
        iconHtml = `<div class="w-9 h-9 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center border-2 border-white shadow-xl text-base">🏭</div>`;
      } else if (m.type === 'point') {
        iconHtml = `<div class="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center border-2 border-white shadow-lg text-sm">🏪</div>`;
      } else if (m.type === 'vehicle') {
        iconHtml = `<div class="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center border-2 border-white shadow-xl text-base animate-pulse">🚚</div>`;
      } else {
        iconHtml = `<div class="w-7 h-7 rounded-full ${bgClass} text-white flex items-center justify-center border-2 border-white shadow-md text-xs font-bold">🛒</div>`;
      }

      const customIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: iconHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([m.lat, m.lng], { icon: customIcon });

      const popupHtml = `
        <div class="p-1 font-sans text-xs">
          <div class="font-bold text-sm text-slate-900">${m.title}</div>
          ${m.subtitle ? `<div class="text-slate-600 mt-0.5">${m.subtitle}</div>` : ''}
          ${m.sequenceNumber ? `<div class="mt-1 inline-block px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded font-semibold text-[10px]">Остановка №${m.sequenceNumber}</div>` : ''}
        </div>
      `;
      marker.bindPopup(popupHtml);

      if (m.onClick) {
        marker.on('click', m.onClick);
      }

      layerGroup.addLayer(marker);
    });
  }, [markers, routePath]);

  return (
    <div
      ref={mapContainerRef}
      style={{ height }}
      className={`rounded-2xl overflow-hidden border border-slate-200 shadow-sm relative ${className}`}
    />
  );
};
