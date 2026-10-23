// Coordinates and georeferencing for EMEB Prof. Joaquim Candelário de Freitas and surroundings in Jundiaí/SP
import { isBackendApiAvailable } from '../services/apiEnvironment';

export interface SchoolLocation {
  name: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
}

// Official School address:
// EMEB Professor Joaquim Candelário de Freitas
// Rua Joaquim Candelário de Freitas, s/n - Vila Hortolândia, Jundiaí - SP, 13214-040
export const CANDELARIO_SCHOOL_LOCATION: SchoolLocation = {
  name: 'EMEB Prof. Joaquim Candelário de Freitas',
  address: 'Rua Joaquim Candelário de Freitas, s/n - Vila Hortolândia',
  city: 'Jundiaí',
  state: 'SP',
  lat: -23.16781,
  lng: -46.89922,
};

// Known neighborhood coordinates in Jundiaí (anchors for student geocoding)
export const JUNDIAI_NEIGHBORHOOD_ANCHORS: Record<string, { lat: number; lng: number }> = {
  'VILA HORTOLANDIA': { lat: -23.1685, lng: -46.8985 },
  'VILA HORTOLÂNDIA': { lat: -23.1685, lng: -46.8985 },
  'JARDIM BUFALO': { lat: -23.1622, lng: -46.9048 },
  'JARDIM BÚFALO': { lat: -23.1622, lng: -46.9048 },
  'CIDADE SANTOS DUMONT': { lat: -23.1558, lng: -46.9112 },
  'SANTOS DUMONT': { lat: -23.1558, lng: -46.9112 },
  'JARDIM SHANGAI': { lat: -23.1594, lng: -46.9073 },
  'CIDADE LUIZA': { lat: -23.1648, lng: -46.8912 },
  'TERRA DA UVA': { lat: -23.1512, lng: -46.9189 },
  'RESIDENCIAL TERRA DA UVA': { lat: -23.1512, lng: -46.9189 },
  'VILA MUNICIPAL': { lat: -23.1745, lng: -46.8931 },
  'PONTE DE SAO JOAO': { lat: -23.1812, lng: -46.8795 },
  'PONTE DE SÃO JOÃO': { lat: -23.1812, lng: -46.8795 },
  'VILA RIO BRANCO': { lat: -23.1712, lng: -46.8905 },
  'VILA LIBERDADE': { lat: -23.1795, lng: -46.8965 },
  'CENTRO': { lat: -23.1865, lng: -46.8845 },
  'JARDIM BOTANICO': { lat: -23.1612, lng: -46.8835 },
  'JARDIM BOTÂNICO': { lat: -23.1612, lng: -46.8835 },
  'CECAP': { lat: -23.1495, lng: -46.9245 },
  'ENGORDADOURO': { lat: -23.1425, lng: -46.9055 },
  'MORADA DAS VINHAS': { lat: -23.1465, lng: -46.9145 },
  'VILA APARECIDA': { lat: -23.184, lng: -46.889 },
  'JARDIM DANUBIO': { lat: -23.178, lng: -46.881 },
  'JARDIM DANÚBIO': { lat: -23.178, lng: -46.881 },
  'RETIRO': { lat: -23.176, lng: -46.915 },
  'ELOY CHAVES': { lat: -23.189, lng: -46.975 },
  'FAZENDA GRANDE': { lat: -23.175, lng: -46.992 },
  'JARDIM TULIPAS': { lat: -23.161, lng: -46.968 },
  'CAXAMBU': { lat: -23.145, lng: -46.852 },
  'COLONIA': { lat: -23.195, lng: -46.865 },
  'COLÔNIA': { lat: -23.195, lng: -46.865 },
  'MEDEIROS': { lat: -23.185, lng: -46.998 },
  'VILA ARENS': { lat: -23.198, lng: -46.882 },
  'VARJAO': { lat: -23.172, lng: -47.012 },
  'VARJÃO': { lat: -23.172, lng: -47.012 },
  'VILA MARINGA': { lat: -23.212, lng: -46.878 },
  'VILA MARINGÁ': { lat: -23.212, lng: -46.878 },
};

/**
 * Calculates straight line distance (Haversine formula in km)
 */
export const haversineDistanceKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Estimates street path distance and travel time from student to school
 */
export interface RouteTravelEstimates {
  distanceDirectKm: number;
  distanceRoadKm: number;
  walkMinutes: number;
  carMinutes: number;
  busMinutes: number;
  routeTier: 'perto' | 'medio' | 'distante' | 'muito_distante';
  routeTierLabel: string;
}

export const calculateTravelEstimates = (
  studentLat: number,
  studentLng: number
): RouteTravelEstimates => {
  const direct = haversineDistanceKm(
    studentLat,
    studentLng,
    CANDELARIO_SCHOOL_LOCATION.lat,
    CANDELARIO_SCHOOL_LOCATION.lng
  );

  // Street urban winding factor in Jundiaí (approx 1.28x direct distance)
  const roadKm = Math.round(direct * 1.28 * 10) / 10;

  // Speeds:
  // Walking: ~4.2 km/h (child/adult pace)
  // Car: ~25 km/h in city urban traffic with stop signs
  // School bus with stops: ~18 km/h + 4 min base stops
  const walkMinutes = Math.max(3, Math.round((roadKm / 4.2) * 60));
  const carMinutes = Math.max(3, Math.round((roadKm / 25) * 60 + 2));
  const busMinutes = Math.max(5, Math.round((roadKm / 18) * 60 + 5));

  let routeTier: RouteTravelEstimates['routeTier'] = 'perto';
  let routeTierLabel = 'Menos de 1 km (Raio Escolar Direto)';

  if (roadKm > 3.5) {
    routeTier = 'muito_distante';
    routeTierLabel = 'Acima de 3.5 km (Prioridade Transporte/Ônibus)';
  } else if (roadKm > 2.0) {
    routeTier = 'distante';
    routeTierLabel = '2.0 a 3.5 km (Rota de Transporte Escolar)';
  } else if (roadKm > 1.0) {
    routeTier = 'medio';
    routeTierLabel = '1.0 a 2.0 km (Distância Intermediária)';
  }

  return {
    distanceDirectKm: Math.round(direct * 10) / 10,
    distanceRoadKm: roadKm,
    walkMinutes,
    carMinutes,
    busMinutes,
    routeTier,
    routeTierLabel,
  };
};

/**
 * Deterministically generates geographic coordinates (Lat/Lng) for a student
 * based on their street name, number, neighborhood and RA/ID so it is stable and repeatable.
 */
export const resolveStudentCoordinates = (
  student: {
    id: string;
    logradouro?: string;
    numeroResidencia?: string;
    bairro?: string;
    cidade?: string;
    ra?: string;
    lat?: number;
    lng?: number;
  }
): { lat: number; lng: number; isApproximate: boolean; fullAddress: string } => {
  const logr = student.logradouro || 'Logradouro não informado';
  const num = student.numeroResidencia ? `, nº ${student.numeroResidencia}` : '';
  const bai = student.bairro ? ` - ${student.bairro}` : '';
  const cid = student.cidade || 'Jundiaí';
  const fullAddress = `${logr}${num}${bai}, ${cid} - SP`;

  if (
    typeof student.lat === 'number' &&
    typeof student.lng === 'number' &&
    !isNaN(student.lat) &&
    !isNaN(student.lng) &&
    student.lat !== 0 &&
    student.lng !== 0
  ) {
    return {
      lat: student.lat,
      lng: student.lng,
      isApproximate: false,
      fullAddress,
    };
  }
  const cleanBairro = (student.bairro || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

  const anchor =
    JUNDIAI_NEIGHBORHOOD_ANCHORS[cleanBairro] ||
    JUNDIAI_NEIGHBORHOOD_ANCHORS['VILA HORTOLANDIA'];

  // Hash the address string + id to introduce deterministic micro-spread along real streets
  const hashSeed = `${student.logradouro || ''}-${student.numeroResidencia || ''}-${student.id}`;
  let hashVal = 0;
  for (let i = 0; i < hashSeed.length; i++) {
    hashVal = (hashVal << 5) - hashVal + hashSeed.charCodeAt(i);
    hashVal |= 0;
  }
  const posHash = Math.abs(hashVal);

  // Pseudo-random spread within ~300 to 700 meters of the neighborhood anchor
  const latOffset = (((posHash % 1000) - 500) / 500) * 0.0055;
  const lngOffset = ((((posHash >> 3) % 1000) - 500) / 500) * 0.0062;

  const lat = Math.round((anchor.lat + latOffset) * 100000) / 100000;
  const lng = Math.round((anchor.lng + lngOffset) * 100000) / 100000;

  return {
    lat,
    lng,
    isApproximate: true,
    fullAddress,
  };
};

/**
 * Maneuver types for turn-by-turn routing steps
 */
export interface FreeRouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  streetName: string;
}

export interface FreeRouteResult {
  coordinates: [number, number][]; // [lat, lng] for Leaflet
  distanceKm: number;
  durationMinutes: number;
  steps: FreeRouteStep[];
  source: 'osrm' | 'fallback';
  profile: 'foot' | 'driving' | 'bus';
}

/**
 * Translates OSRM maneuver modifiers and types to clear, friendly Portuguese
 */
function translateOsrmManeuver(step: any, isLast: boolean): string {
  const name = step.name ? `pela ${step.name}` : 'em frente';
  const type = step.maneuver?.type || '';
  const modifier = step.maneuver?.modifier || '';

  if (isLast || type === 'arrive') {
    return `Chegada ao destino (${step.name || 'EMEB Joaquim Candelário'})`;
  }
  if (type === 'depart') {
    return `Inicie o trajeto ${name}`;
  }
  if (modifier === 'right') {
    return `Vire à direita ${name}`;
  }
  if (modifier === 'sharp right') {
    return `Curva acentuada à direita ${name}`;
  }
  if (modifier === 'slight right') {
    return `Mantenha-se à direita ${name}`;
  }
  if (modifier === 'left') {
    return `Vire à esquerda ${name}`;
  }
  if (modifier === 'sharp left') {
    return `Curva acentuada à esquerda ${name}`;
  }
  if (modifier === 'slight left') {
    return `Mantenha-se à esquerda ${name}`;
  }
  if (modifier === 'straight' || type === 'continue') {
    return `Siga em frente ${name}`;
  }
  if (modifier === 'uturn') {
    return `Faça o retorno ${name}`;
  }
  if (type === 'roundabout' || type === 'rotary') {
    return `Na rotatória, siga ${name}`;
  }
  return `Siga ${name}`;
}

/**
 * Fetches free street trajectory, real street distance, and turn-by-turn steps
 * using free OpenStreetMap / OSRM (100% Free, NO API Keys required)
 */
export async function fetchFreeOsmRoute(
  origin: { lat: number; lng: number; label?: string },
  destination: { lat: number; lng: number; label?: string },
  mode: 'foot' | 'driving' | 'bus' = 'driving'
): Promise<FreeRouteResult> {
  const profile = mode === 'foot' ? 'foot' : 'driving';
  const coordsParam = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;

  // 1. Try local server proxy only if backend API is available
  if (isBackendApiAvailable()) {
    try {
      const proxyUrl = `/api/route?profile=${profile}&coords=${encodeURIComponent(coordsParam)}`;
      const res = await fetch(proxyUrl, { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        if (data && data.code === 'Ok' && Array.isArray(data.routes) && data.routes[0]) {
          return parseOsrmRoute(data.routes[0], mode);
        }
      }
    } catch {
      // try direct fallback next
    }
  }

  // 2. Direct public OSRM router fallback
  try {
    const directUrl = `https://router.project-osrm.org/route/v1/${profile}/${coordsParam}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(directUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.code === 'Ok' && Array.isArray(data.routes) && data.routes[0]) {
        return parseOsrmRoute(data.routes[0], mode);
      }
    }
  } catch {
    // fallback to mathematical street geometry
  }

  // 3. Graceful offline fallback: interpolated trajectory with road geometry
  const directDistance = haversineDistanceKm(origin.lat, origin.lng, destination.lat, destination.lng);
  const roadKm = Math.round(directDistance * 1.28 * 10) / 10;
  const speedKmH = mode === 'foot' ? 4.2 : mode === 'bus' ? 18 : 25;
  const durationMin = Math.max(3, Math.round((roadKm / speedKmH) * 60 + (mode === 'bus' ? 5 : 2)));

  // Generate 5-point interpolated curve along Jundiaí street axes
  const midLat = (origin.lat + destination.lat) / 2;
  const midLng = (origin.lng + destination.lng) / 2;
  const p1: [number, number] = [origin.lat, origin.lng];
  const p2: [number, number] = [origin.lat * 0.7 + destination.lat * 0.3, origin.lng * 0.7 + destination.lng * 0.3 + 0.0008];
  const p3: [number, number] = [midLat + 0.0006, midLng - 0.0006];
  const p4: [number, number] = [origin.lat * 0.3 + destination.lat * 0.7, origin.lng * 0.3 + destination.lng * 0.7 - 0.0004];
  const p5: [number, number] = [destination.lat, destination.lng];

  const destName = destination.label || 'EMEB Prof. Joaquim Candelário de Freitas';
  const origName = origin.label || 'Ponto de Partida';

  return {
    coordinates: [p1, p2, p3, p4, p5],
    distanceKm: roadKm,
    durationMinutes: durationMin,
    source: 'fallback',
    profile: mode,
    steps: [
      {
        instruction: `Inicie o percurso a partir de ${origName}`,
        distanceMeters: Math.round(roadKm * 400),
        durationSeconds: Math.round(durationMin * 25),
        streetName: 'Vias urbanas de Jundiaí',
      },
      {
        instruction: `Siga pelo eixo viário do bairro em direção a ${destName}`,
        distanceMeters: Math.round(roadKm * 400),
        durationSeconds: Math.round(durationMin * 25),
        streetName: 'Avenida/Rua Principal',
      },
      {
        instruction: `Chegada ao destino final (${destName})`,
        distanceMeters: Math.round(roadKm * 200),
        durationSeconds: Math.round(durationMin * 10),
        streetName: destName,
      },
    ],
  };
}

function parseOsrmRoute(route: any, mode: 'foot' | 'driving' | 'bus'): FreeRouteResult {
  const geojsonCoords = route.geometry?.coordinates || [];
  // GeoJSON is [lng, lat], Leaflet polyline expects [lat, lng]
  const coordinates: [number, number][] = geojsonCoords.map((c: [number, number]) => [c[1], c[0]]);

  const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
  let durationMinutes = Math.round(route.duration / 60);
  if (mode === 'bus') {
    durationMinutes = Math.max(5, Math.round(durationMinutes * 1.35 + 4));
  } else if (mode === 'foot') {
    durationMinutes = Math.max(3, durationMinutes);
  }

  const rawSteps = route.legs?.[0]?.steps || [];
  const steps: FreeRouteStep[] = rawSteps.map((s: any, idx: number) => {
    const isLast = idx === rawSteps.length - 1;
    return {
      instruction: translateOsrmManeuver(s, isLast),
      distanceMeters: Math.round(s.distance || 0),
      durationSeconds: Math.round(s.duration || 0),
      streetName: s.name || 'Via local',
    };
  });

  return {
    coordinates,
    distanceKm,
    durationMinutes,
    steps,
    source: 'osrm',
    profile: mode,
  };
}

/**
 * Builds free open navigation and web direction links (Zero API Keys)
 */
export const buildGoogleMapsNavigationUrls = (
  destinationLat: number,
  destinationLng: number,
  destinationAddress: string,
  customOrigin?: { lat: number; lng: number }
) => {
  const originLat = customOrigin ? customOrigin.lat : CANDELARIO_SCHOOL_LOCATION.lat;
  const originLng = customOrigin ? customOrigin.lng : CANDELARIO_SCHOOL_LOCATION.lng;

  // 100% Free OpenStreetMap directions link (no keys, completely open)
  const openStreetMapDirectionsUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${destinationLat}%2C${destinationLng}%3B${originLat}%2C${originLng}`;

  // Free OpenStreetMap walking directions link
  const openStreetMapWalkingUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${destinationLat}%2C${destinationLng}%3B${originLat}%2C${originLng}`;

  // Standard web directions (opens in browser / Google Maps app without API keys)
  const directionsFromSchoolUrl = `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destinationLat},${destinationLng}&travelmode=driving`;
  const directionsToSchoolUrl = `https://www.google.com/maps/dir/?api=1&origin=${destinationLat},${destinationLng}&destination=${originLat},${originLng}&travelmode=walking`;
  const placeSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destinationAddress)}`;

  // Waze direct navigation link
  const wazeUrl = `https://waze.com/ul?ll=${destinationLat},${destinationLng}&navigate=yes`;

  return {
    openStreetMapDirectionsUrl,
    openStreetMapWalkingUrl,
    directionsFromSchoolUrl,
    directionsToSchoolUrl,
    placeSearchUrl,
    wazeUrl,
  };
};
