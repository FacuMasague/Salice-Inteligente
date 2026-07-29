import L from 'leaflet';
import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { Client, DeliveryAssignmentStatus, DeliveryInvoice } from '../../shared/models';
import { clientPrimaryName } from '../lib/client-name';
import { money, number } from '../lib/format';
import { summarizeReliableInvoiceKilos } from '../lib/delivery-status';

export interface DeliveryMapPoint {
  client: Client;
  invoices: DeliveryInvoice[];
  status: DeliveryAssignmentStatus;
}

const icon = (point: DeliveryMapPoint) => L.divIcon({
  className: 'delivery-sheet-marker-shell',
  html: `<div class="delivery-sheet-marker ${point.status} ${point.client.locationStatus === 'corrected' ? 'corrected' : ''}"><strong>${point.invoices.length}</strong></div>`,
  iconSize: [34, 38],
  iconAnchor: [17, 34],
});

function FitPoints({ points }: { points: DeliveryMapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    const coordinates = points.flatMap((point) => point.client.coordinates ? [point.client.coordinates] : []);
    if (coordinates.length) map.fitBounds(L.latLngBounds(coordinates), { padding: [42, 42], maxZoom: 13 });
  }, [map, points]);
  return null;
}

export function DeliverySheetMap({ points, onOpenClient }: { points: DeliveryMapPoint[]; onOpenClient: (client: Client) => void }) {
  return <MapContainer className="leaflet-map delivery-sheet-map" center={[-38.0055, -57.5426]} zoom={10} scrollWheelZoom>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <FitPoints points={points} />
    {points.map((point) => {
      const kiloSummary = summarizeReliableInvoiceKilos(point.invoices);
      return <Marker key={point.client.id} position={point.client.coordinates!} icon={icon(point)} eventHandlers={{ click: () => onOpenClient(point.client) }}>
        <Tooltip direction="top" offset={[0, -28]} opacity={1}><div className="map-tooltip"><strong>{clientPrimaryName(point.client)}</strong><span>{point.invoices.length} comprobante(s) · {money(point.invoices.reduce((sum, invoice) => sum + invoice.amount, 0), true)}</span><span>{kiloSummary.reliableInvoiceCount ? `${number(kiloSummary.kilos, 2)} kg confiables · ${kiloSummary.reliableInvoiceCount}/${kiloSummary.totalInvoiceCount} comprobantes` : 'Kilos sin cobertura confiable'}</span>{point.client.locationStatus === 'corrected' && <span className="map-location-correction">Ubicación aproximada de la localidad · no usar para optimizar rutas</span>}</div></Tooltip>
      </Marker>;
    })}
  </MapContainer>;
}
