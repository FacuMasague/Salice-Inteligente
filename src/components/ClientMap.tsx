import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { SALICE_DEPOT, type Client, type Product } from '../../shared/models';
import { money, number } from '../lib/format';
import { clientPrimaryName, clientSecondaryName } from '../lib/client-name';
import { clientKilos90d, productContentById } from '../lib/commercial-metrics';

const markerIcon = (client: Client, selected: boolean) => L.divIcon({
  className: 'client-marker-shell',
  html: `<div class="client-marker ${client.active ? client.health : 'inactive'} ${client.locationStatus === 'corrected' ? 'corrected' : ''} ${selected ? 'selected' : ''}"><span></span></div>`,
  iconSize: [32, 38],
  iconAnchor: [16, 33],
});

const clusterIcon = (count: number) => L.divIcon({
  className: 'client-cluster-shell',
  html: `<div class="client-cluster"><strong>${count}</strong><span>clientes</span></div>`,
  iconSize: [56, 56],
  iconAnchor: [28, 28],
});

const depotIcon = L.divIcon({
  className: 'depot-marker-shell',
  html: '<div class="depot-marker"><strong>S</strong></div>',
  iconSize: [38, 42],
  iconAnchor: [19, 38],
});

type GeocodedClient = Client & { coordinates: [number, number] };

function FitClients({ clients }: { clients: GeocodedClient[] }) {
  const map = useMap();
  useEffect(() => {
    if (!clients.length) return;
    const bounds = L.latLngBounds([...clients.map((client) => client.coordinates), SALICE_DEPOT.coordinates]);
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 12 });
  }, [clients, map]);
  return null;
}

interface ClientMapProps {
  clients: Client[];
  products: Product[];
  selectedId: number | null;
  onSelect: (client: Client) => void;
}

function ClusteredMarkers({ clients, contentByProduct, selectedId, onSelect }: { clients: GeocodedClient[]; contentByProduct: Map<string, number | null>; selectedId: number | null; onSelect: (client: Client) => void }) {
  const [zoom, setZoom] = useState(10);
  const map = useMap();
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const groups = useMemo(() => {
    if (zoom >= 14) return clients.map((client) => ({ key: `client-${client.id}`, clients: [client], coordinates: client.coordinates }));
    const longitudeCell = 52 * 360 / (256 * 2 ** zoom);
    const latitudeCell = longitudeCell * .78;
    const buckets = new Map<string, GeocodedClient[]>();
    clients.forEach((client) => {
      const key = `${Math.floor(client.coordinates[0] / latitudeCell)}:${Math.floor(client.coordinates[1] / longitudeCell)}`;
      buckets.set(key, [...(buckets.get(key) ?? []), client]);
    });
    return [...buckets.entries()].map(([key, members]) => ({
      key,
      clients: members,
      coordinates: [
        members.reduce((sum, client) => sum + client.coordinates[0], 0) / members.length,
        members.reduce((sum, client) => sum + client.coordinates[1], 0) / members.length,
      ] as [number, number],
    }));
  }, [clients, zoom]);

  return <>{groups.map((group) => {
    if (group.clients.length === 1) {
      const client = group.clients[0];
      const kilos = clientKilos90d(client, contentByProduct);
      return <Marker key={client.id} position={client.coordinates} icon={markerIcon(client, selectedId === client.id)} eventHandlers={{ click: () => onSelect(client) }}>
        <Tooltip direction="top" offset={[0, -26]} opacity={1}><div className="map-tooltip"><strong>{clientPrimaryName(client)}</strong>{clientSecondaryName(client) && <span>{clientSecondaryName(client)}</span>}<span>{client.locality} · {client.segment} · {client.active ? 'Activo' : 'Inactivo'}</span>{client.locationStatus === 'corrected' && <span className="map-location-correction">Ubicación corregida · referencia aproximada de la localidad</span>}<span>90d: {money(client.sales90d, true)} · {number(kilos.kilos, 2)} kg{kilos.complete ? '' : ' parciales'}</span><span>Riesgo de cobranza {client.collectionRisk}/100</span></div></Tooltip>
      </Marker>;
    }
    return <Marker key={group.key} position={group.coordinates} icon={clusterIcon(group.clients.length)} eventHandlers={{ click: () => map.setView(group.coordinates, Math.min(16, zoom + 2), { animate: true }) }}>
      <Tooltip direction="top" offset={[0, -20]} opacity={1}><div className="map-tooltip"><strong>{group.clients.length} clientes agrupados</strong><span>{group.clients.slice(0, 3).map(clientPrimaryName).join(' · ')}{group.clients.length > 3 ? '…' : ''}</span><span>Hacé clic para acercar</span></div></Tooltip>
    </Marker>;
  })}</>;
}

export function ClientMap({ clients, products, selectedId, onSelect }: ClientMapProps) {
  const geocoded = clients.filter((client): client is GeocodedClient => client.coordinates !== null);
  const contentByProduct = useMemo(() => productContentById(products), [products]);
  return (
    <MapContainer className="leaflet-map" center={SALICE_DEPOT.coordinates} zoom={10} zoomControl={false} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitClients clients={geocoded} />
      <Marker position={SALICE_DEPOT.coordinates} icon={depotIcon} zIndexOffset={1000}><Tooltip direction="top" offset={[0, -31]} opacity={1}><div className="map-tooltip depot-tooltip"><strong>{SALICE_DEPOT.name}</strong><span>{SALICE_DEPOT.address}, {SALICE_DEPOT.locality}</span><span>Origen y regreso de los recorridos</span></div></Tooltip></Marker>
      <ClusteredMarkers clients={geocoded} contentByProduct={contentByProduct} selectedId={selectedId} onSelect={onSelect} />
    </MapContainer>
  );
}
