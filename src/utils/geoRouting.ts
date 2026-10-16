// Coordinates and georeferencing for EMEB Prof. Joaquim Candelário de Freitas and surroundings in Jundiaí/SP

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
 * Builds standard Google Maps directions and place links
 */
export const buildGoogleMapsNavigationUrls = (
  destinationLat: number,
  destinationLng: number,
  destinationAddress: string
) => {
  const originLat = CANDELARIO_SCHOOL_LOCATION.lat;
  const originLng = CANDELARIO_SCHOOL_LOCATION.lng;

  // Directions from EMEB Candelário to Student's home
  const directionsFromSchoolUrl = `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destinationLat},${destinationLng}&travelmode=driving`;

  // Directions from Student's home to EMEB Candelário
  const directionsToSchoolUrl = `https://www.google.com/maps/dir/?api=1&origin=${destinationLat},${destinationLng}&destination=${originLat},${originLng}&travelmode=walking`;

  // Direct Pin Search on Google Maps
  const placeSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${destinationAddress}`
  )}`;

  return {
    directionsFromSchoolUrl,
    directionsToSchoolUrl,
    placeSearchUrl,
  };
};
