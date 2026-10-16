import React, { useState, useMemo, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ClassGroup, Student, UserRole } from '../types';
import {
  CANDELARIO_SCHOOL_LOCATION,
  resolveStudentCoordinates,
  calculateTravelEstimates,
  RouteTravelEstimates,
} from '../utils/geoRouting';
import { getStudentGenderLabel, resolveGuardianRelationshipInfo } from '../utils/genderDictionary';
import { buildWhatsAppLinksFromPhoneString } from './VisualizarPdfNominalModal';
import { StudentAvatar } from './StudentAvatar';

interface MapaEstudantesScreenProps {
  classes: ClassGroup[];
  userRole?: UserRole;
  selectedClassId?: string;
  initialSelectedStudentId?: string;
  onOpenStudentGrid?: (
    student: Student,
    classId: string,
    className: string,
    diasLetivosMes: number
  ) => void;
  onOpenStudentPdf?: (student: Student, className: string) => void;
  onNavigateToTurma?: (cls: ClassGroup) => void;
}

export interface StudentMapMarkerItem {
  student: Student;
  cls: ClassGroup;
  lat: number;
  lng: number;
  fullAddress: string;
  estimates: RouteTravelEstimates;
  guardianInfo: ReturnType<typeof resolveGuardianRelationshipInfo>;
  genderInfo: ReturnType<typeof getStudentGenderLabel>;
  photoUrl: string;
  initials: string;
}

const getStudentPhotoAndInitials = (student: Student) => {
  const rawPhoto = (student.photo || student.photoDriveUrl || '').trim();
  let photoUrl = '';
  if (
    rawPhoto.startsWith('http://') ||
    rawPhoto.startsWith('https://') ||
    rawPhoto.startsWith('data:image/') ||
    rawPhoto.startsWith('/')
  ) {
    const driveMatch = rawPhoto.match(/(?:\/api\/drive-photo\/|\/file\/d\/|[?&]id=|d\/)([a-zA-Z0-9-_]+)/);
    if (driveMatch && driveMatch[1]) {
      photoUrl = `/api/drive-photo/${driveMatch[1]}`;
    } else {
      photoUrl = rawPhoto;
    }
  }

  const cleanName = (student.name || 'E').trim();
  const parts = cleanName.split(/\s+/);
  const initials =
    parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : cleanName.slice(0, 2).toUpperCase();

  return { photoUrl, initials, cleanName };
};

export const MapaEstudantesScreen: React.FC<MapaEstudantesScreenProps> = ({
  classes,
  userRole = 'admin',
  selectedClassId,
  initialSelectedStudentId,
  onOpenStudentGrid,
  onOpenStudentPdf,
  onNavigateToTurma,
}) => {
  const [filterClassId, setFilterClassId] = useState<string>(selectedClassId || 'all');
  const [filterShift, setFilterShift] = useState<'all' | 'MANHÃ' | 'TARDE'>('all');
  const [filterDistanceTier, setFilterDistanceTier] = useState<
    'all' | 'perto' | 'medio' | 'distante' | 'muito_distante'
  >('all');
  const [filterTransporte, setFilterTransporte] = useState<'all' | 'com_onibus' | 'sem_onibus'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentMarker, setSelectedStudentMarker] = useState<StudentMapMarkerItem | null>(null);
  const [showSchoolRadiusCircle, setShowSchoolRadiusCircle] = useState(true);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [isListViewOpen, setIsListViewOpen] = useState(false);

  // Map DOM and Leaflet instance references
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const radiusLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);

  // Compute all student markers with coordinates & route calculations
  const allMarkers = useMemo<StudentMapMarkerItem[]>(() => {
    const list: StudentMapMarkerItem[] = [];

    classes.forEach((cls) => {
      cls.students.forEach((student) => {
        const sit = (student.situacao || 'ATIVO').toUpperCase();
        if (sit.includes('BXTR') || sit.includes('TRANSF')) return;

        const coords = resolveStudentCoordinates(student);
        const estimates = calculateTravelEstimates(coords.lat, coords.lng);
        const guardianInfo = resolveGuardianRelationshipInfo(
          student.filiacao1 || student.guardianName,
          'filiacao1',
          student.notes
        );
        const genderInfo = getStudentGenderLabel(student);
        const { photoUrl, initials } = getStudentPhotoAndInitials(student);

        list.push({
          student,
          cls,
          lat: coords.lat,
          lng: coords.lng,
          fullAddress: coords.fullAddress,
          estimates,
          guardianInfo,
          genderInfo,
          photoUrl,
          initials,
        });
      });
    });

    return list;
  }, [classes]);

  // Set initial selected student if requested
  useEffect(() => {
    if (initialSelectedStudentId && allMarkers.length > 0) {
      const found = allMarkers.find((m) => m.student.id === initialSelectedStudentId);
      if (found) {
        setSelectedStudentMarker(found);
      }
    }
  }, [initialSelectedStudentId, allMarkers]);

  // Apply filters
  const filteredMarkers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return allMarkers.filter((item) => {
      if (filterClassId !== 'all' && item.cls.id !== filterClassId) return false;
      if (filterShift !== 'all' && item.cls.shift.toUpperCase().indexOf(filterShift) === -1) return false;
      if (filterDistanceTier !== 'all' && item.estimates.routeTier !== filterDistanceTier) return false;
      if (filterTransporte === 'com_onibus' && !item.student.rotaOnibus) return false;
      if (filterTransporte === 'sem_onibus' && Boolean(item.student.rotaOnibus)) return false;

      if (q) {
        const matchName = item.student.name.toLowerCase().includes(q);
        const matchBairro = (item.student.bairro || '').toLowerCase().includes(q);
        const matchLogradouro = (item.student.logradouro || '').toLowerCase().includes(q);
        const matchRota = (item.student.rotaOnibus || '').toLowerCase().includes(q);
        const matchTurma = item.cls.name.toLowerCase().includes(q);
        const matchRa = (item.student.ra || '').toLowerCase().includes(q);
        return matchName || matchBairro || matchLogradouro || matchRota || matchTurma || matchRa;
      }

      return true;
    });
  }, [allMarkers, filterClassId, filterShift, filterDistanceTier, filterTransporte, searchQuery]);

  // Overall statistics for distance and transport
  const stats = useMemo(() => {
    const total = filteredMarkers.length;
    if (total === 0) {
      return {
        total: 0,
        avgDistanceKm: 0,
        avgWalkMinutes: 0,
        avgCarMinutes: 0,
        comTransporteEscolar: 0,
        maisDe2Km: 0,
        menosDe1Km: 0,
      };
    }

    let sumRoadKm = 0;
    let sumWalk = 0;
    let sumCar = 0;
    let comTransporte = 0;
    let maisDe2Km = 0;
    let menosDe1Km = 0;

    filteredMarkers.forEach((m) => {
      sumRoadKm += m.estimates.distanceRoadKm;
      sumWalk += m.estimates.walkMinutes;
      sumCar += m.estimates.carMinutes;
      if (m.student.rotaOnibus) comTransporte++;
      if (m.estimates.distanceRoadKm >= 2.0) maisDe2Km++;
      if (m.estimates.distanceRoadKm < 1.0) menosDe1Km++;
    });

    return {
      total,
      avgDistanceKm: Math.round((sumRoadKm / total) * 10) / 10,
      avgWalkMinutes: Math.round(sumWalk / total),
      avgCarMinutes: Math.round(sumCar / total),
      comTransporteEscolar: comTransporte,
      maisDe2Km,
      menosDe1Km,
    };
  }, [filteredMarkers]);

  // 1. Initialize Leaflet Map Instance
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [CANDELARIO_SCHOOL_LOCATION.lat, CANDELARIO_SCHOOL_LOCATION.lng],
      zoom: 14,
      zoomControl: false,
      attributionControl: true,
    });

    // High performance CartoDB Voyager tiles (crisp retina, clean, modern typography)
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      }
    ).addTo(map);

    // Zoom control at top right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Layer groups
    radiusLayerGroupRef.current = L.layerGroup().addTo(map);
    routeLayerGroupRef.current = L.layerGroup().addTo(map);
    markersLayerGroupRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    // Handle initial resize smoothly
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Render Radius Circles & School Marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    const radiusGroup = radiusLayerGroupRef.current;
    if (!map || !radiusGroup) return;

    radiusGroup.clearLayers();

    // Central School Marker
    const schoolIcon = L.divIcon({
      className: 'candelario-school-div-icon',
      html: `
        <div class="relative flex flex-col items-center cursor-pointer select-none -translate-x-1/2 -translate-y-1/2">
          <div class="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-[#003440] text-white shadow-xl border-2 border-white ring-4 ring-[#003440]/25">
            <span class="material-symbols-outlined text-[24px]">school</span>
            <span class="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
            </span>
          </div>
          <div class="mt-1 px-2.5 py-0.5 rounded-full bg-[#1d1d1f] text-white text-[10px] font-black tracking-wide whitespace-nowrap shadow-md border border-white/20">
            EMEB Joaquim Candelário
          </div>
        </div>
      `,
      iconSize: [48, 64],
      iconAnchor: [24, 32],
    });

    const schoolMarker = L.marker(
      [CANDELARIO_SCHOOL_LOCATION.lat, CANDELARIO_SCHOOL_LOCATION.lng],
      { icon: schoolIcon, zIndexOffset: 1000 }
    ).addTo(radiusGroup);

    schoolMarker.bindPopup(`
      <div class="p-3 text-slate-800 space-y-1 text-xs">
        <div class="font-extrabold text-sm text-[#003440] flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[18px]">school</span>
          <span>${CANDELARIO_SCHOOL_LOCATION.name}</span>
        </div>
        <p class="text-slate-600 font-medium">${CANDELARIO_SCHOOL_LOCATION.address}, Jundiaí - SP</p>
        <div class="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-500">
          <span>Lat: ${CANDELARIO_SCHOOL_LOCATION.lat}</span>
          <span>Lng: ${CANDELARIO_SCHOOL_LOCATION.lng}</span>
        </div>
      </div>
    `);

    // Concentric radius circles around school
    if (showSchoolRadiusCircle) {
      // 1.0 km radius (Caminhável direto)
      L.circle([CANDELARIO_SCHOOL_LOCATION.lat, CANDELARIO_SCHOOL_LOCATION.lng], {
        radius: 1000,
        color: '#10b981',
        weight: 1.5,
        opacity: 0.6,
        fillColor: '#10b981',
        fillOpacity: 0.05,
        dashArray: '5, 5',
      })
        .bindTooltip('Raio 1.0 km (Caminhável)', { permanent: false, direction: 'top' })
        .addTo(radiusGroup);

      // 2.0 km radius (Transporte recomendado)
      L.circle([CANDELARIO_SCHOOL_LOCATION.lat, CANDELARIO_SCHOOL_LOCATION.lng], {
        radius: 2000,
        color: '#0071e3',
        weight: 1.2,
        opacity: 0.5,
        fillColor: '#0071e3',
        fillOpacity: 0.03,
        dashArray: '6, 6',
      })
        .bindTooltip('Raio 2.0 km (Deslocamento Intermediário)', { permanent: false, direction: 'top' })
        .addTo(radiusGroup);

      // 3.5 km radius (Transporte prioritário)
      L.circle([CANDELARIO_SCHOOL_LOCATION.lat, CANDELARIO_SCHOOL_LOCATION.lng], {
        radius: 3500,
        color: '#8b5cf6',
        weight: 1.2,
        opacity: 0.45,
        fillColor: '#8b5cf6',
        fillOpacity: 0.02,
        dashArray: '8, 8',
      })
        .bindTooltip('Raio 3.5 km (Prioridade Ônibus Fretado)', { permanent: false, direction: 'top' })
        .addTo(radiusGroup);
    }
  }, [showSchoolRadiusCircle]);

  // 3. Render Student Pins with Photo on Map
  useEffect(() => {
    const markersGroup = markersLayerGroupRef.current;
    if (!markersGroup) return;

    markersGroup.clearLayers();

    filteredMarkers.forEach((item) => {
      const isSelected = selectedStudentMarker?.student.id === item.student.id;
      const numStr = item.student.number.toString().padStart(2, '0');
      const hasBus = Boolean(item.student.rotaOnibus);

      let ringColorClass = 'border-emerald-500';
      if (hasBus) ringColorClass = 'border-purple-600';
      else if (item.estimates.routeTier === 'muito_distante') ringColorClass = 'border-rose-500';
      else if (item.estimates.routeTier === 'distante') ringColorClass = 'border-amber-500';
      else if (item.estimates.routeTier === 'medio') ringColorClass = 'border-sky-500';

      const iconHtml = `
        <div class="relative flex flex-col items-center cursor-pointer select-none transition-transform hover:scale-120 ${
          isSelected ? 'scale-125 z-50' : 'z-20'
        }" style="width: 44px; height: 50px;">
          <!-- Avatar Pin com Foto da Criança -->
          <div class="relative w-10 h-10 rounded-full overflow-hidden bg-white border-2 ${ringColorClass} shadow-md flex items-center justify-center">
            ${
              item.photoUrl
                ? `<img src="${item.photoUrl}" alt="${item.student.name}" class="w-full h-full object-cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                   <div class="hidden w-full h-full bg-[#003440] text-white font-mono font-bold text-[11px] items-center justify-center">${item.initials}</div>`
                : `<div class="w-full h-full bg-[#003440] text-white font-mono font-bold text-[11px] flex items-center justify-center">${item.initials}</div>`
            }
          </div>
          <!-- Badge com Nº de Chamada -->
          <span class="absolute bottom-1 -right-0.5 px-1.5 py-0.2 rounded-full font-mono font-extrabold text-[9px] leading-tight text-white shadow-xs ${
            isSelected
              ? 'bg-[#0071e3] ring-2 ring-white'
              : hasBus
              ? 'bg-[#8b5cf6]'
              : 'bg-[#1d1d1f]'
          }">
            ${numStr}
          </span>
          <!-- Pino inferior -->
          <div class="w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-[#0071e3]' : 'bg-slate-700'} mt-0.5"></div>
        </div>
      `;

      const studentIcon = L.divIcon({
        className: 'candelario-student-div-icon',
        html: iconHtml,
        iconSize: [44, 50],
        iconAnchor: [22, 50],
      });

      const marker = L.marker([item.lat, item.lng], {
        icon: studentIcon,
        zIndexOffset: isSelected ? 500 : 100,
      });

      marker.bindTooltip(
        `<strong>${item.student.name}</strong> (Nº ${item.student.number})<br/>
         Turma ${item.cls.name} • 🚶 ${item.estimates.walkMinutes} min (${item.estimates.distanceRoadKm} km)`,
        { direction: 'top', offset: [0, -45] }
      );

      marker.on('click', () => {
        setSelectedStudentMarker(item);
      });

      marker.addTo(markersGroup);
    });
  }, [filteredMarkers, selectedStudentMarker]);

  // 4. Render Dynamic Trajectory Polyline to School when Student is Selected
  useEffect(() => {
    const map = mapInstanceRef.current;
    const routeGroup = routeLayerGroupRef.current;
    if (!map || !routeGroup) return;

    routeGroup.clearLayers();

    if (!selectedStudentMarker) return;

    const studentCoords: [number, number] = [selectedStudentMarker.lat, selectedStudentMarker.lng];
    const schoolCoords: [number, number] = [CANDELARIO_SCHOOL_LOCATION.lat, CANDELARIO_SCHOOL_LOCATION.lng];

    // Trajectory Polyline
    const polyline = L.polyline([studentCoords, schoolCoords], {
      color: '#0071e3',
      weight: 3.5,
      dashArray: '6, 6',
      opacity: 0.9,
    }).addTo(routeGroup);

    // Midpoint Distance & Time Badge
    const midLat = (selectedStudentMarker.lat + CANDELARIO_SCHOOL_LOCATION.lat) / 2;
    const midLng = (selectedStudentMarker.lng + CANDELARIO_SCHOOL_LOCATION.lng) / 2;

    const badgeIcon = L.divIcon({
      className: 'candelario-midpoint-badge',
      html: `
        <div class="px-2.5 py-1 rounded-full bg-[#1d1d1f] text-white font-mono font-bold text-[10px] shadow-lg border border-white/20 whitespace-nowrap flex items-center gap-1.5 -translate-x-1/2 -translate-y-1/2">
          <span>🚶 ${selectedStudentMarker.estimates.walkMinutes} min</span>
          <span class="text-slate-400">·</span>
          <span>${selectedStudentMarker.estimates.distanceRoadKm} km</span>
        </div>
      `,
      iconSize: [120, 26],
      iconAnchor: [60, 13],
    });

    L.marker([midLat, midLng], { icon: badgeIcon, interactive: false }).addTo(routeGroup);

    // Smoothly pan & fit bounds
    map.fitBounds([studentCoords, schoolCoords], {
      padding: [70, 70],
      maxZoom: 16,
    });
  }, [selectedStudentMarker]);

  const handleCenterOnSchool = () => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo(
      [CANDELARIO_SCHOOL_LOCATION.lat, CANDELARIO_SCHOOL_LOCATION.lng],
      14,
      { duration: 0.8 }
    );
  };

  const handleCopyCoords = (lat: number, lng: number) => {
    navigator.clipboard?.writeText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  return (
    <div className="space-y-4 pb-20 animate-gentle-fade max-w-[1600px] mx-auto px-2 sm:px-4 lg:px-6 candelario-map-container">
      {/* Top Banner & Title Bar */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-xs border border-black/[0.06] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[28px]">distance</span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#0071e3]/10 text-[#0071e3] text-[0.7rem] font-black uppercase tracking-wider">
                  Mapeamento Georreferenciado &amp; Trajetos
                </span>
                <span className="text-[0.74rem] font-semibold text-[#86868b]">
                  {stats.total} de {allMarkers.length} estudantes ativos
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[0.68rem] font-bold border border-emerald-200">
                  Latitude &amp; Longitude Integradas
                </span>
              </div>
              <h1 className="text-[1.35rem] sm:text-[1.6rem] font-black text-[#1d1d1f] tracking-tight leading-tight mt-0.5">
                Pontos de Endereço &amp; Tempo de Percurso até a EMEB Candelário
              </h1>
              <p className="text-[0.82rem] text-[#6e6e73] mt-0.5">
                Geolocalização funcional com fotos dos estudantes, cálculo de distância rodoviária, tempo a pé, de carro e ônibus escolar.
              </p>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCenterOnSchool}
              className="h-[38px] px-3.5 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] text-[0.76rem] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Centralizar mapa na EMEB Candelário"
            >
              <span className="material-symbols-outlined text-[17px] text-[#0071e3]">my_location</span>
              <span>Centralizar na Escola</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSchoolRadiusCircle(!showSchoolRadiusCircle)}
              className={`h-[38px] px-3.5 rounded-full text-[0.76rem] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                showSchoolRadiusCircle
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-[#f5f5f7] text-[#6e6e73]'
              }`}
              title="Exibir círculos de raio caminhável (1km, 2km e 3.5km)"
            >
              <span className="material-symbols-outlined text-[17px]">radar</span>
              <span>Raios de Deslocamento</span>
            </button>

            <button
              type="button"
              onClick={() => setIsListViewOpen(!isListViewOpen)}
              className={`h-[38px] px-3.5 rounded-full text-[0.76rem] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                isListViewOpen
                  ? 'bg-[#1d1d1f] text-white shadow-2xs'
                  : 'bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed]'
              }`}
            >
              <span className="material-symbols-outlined text-[17px]">format_list_bulleted</span>
              <span>Lista de Estudantes ({filteredMarkers.length})</span>
            </button>
          </div>
        </div>

        {/* Metric Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2">
          <div className="rounded-2xl bg-[#f5f5f7] p-3 border border-black/[0.04]">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#86868b] block">
              Distância Média
            </span>
            <span className="text-[1.35rem] font-black text-[#1d1d1f] tabular-nums leading-tight">
              {stats.avgDistanceKm} <span className="text-[0.8rem] font-semibold text-[#6e6e73]">km</span>
            </span>
            <span className="text-[0.68rem] text-[#6e6e73] block mt-0.5">Trajeto rodoviário</span>
          </div>

          <div className="rounded-2xl bg-[#f5f5f7] p-3 border border-black/[0.04]">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#86868b] block">
              Tempo Médio a Pé
            </span>
            <span className="text-[1.35rem] font-black text-[#0071e3] tabular-nums leading-tight">
              {stats.avgWalkMinutes} <span className="text-[0.8rem] font-semibold text-[#6e6e73]">min</span>
            </span>
            <span className="text-[0.68rem] text-[#6e6e73] block mt-0.5">Caminhada escolar</span>
          </div>

          <div className="rounded-2xl bg-[#f5f5f7] p-3 border border-black/[0.04]">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#86868b] block">
              Tempo de Carro
            </span>
            <span className="text-[1.35rem] font-black text-[#34c759] tabular-nums leading-tight">
              {stats.avgCarMinutes} <span className="text-[0.8rem] font-semibold text-[#6e6e73]">min</span>
            </span>
            <span className="text-[0.68rem] text-[#6e6e73] block mt-0.5">Trânsito local</span>
          </div>

          <div className="rounded-2xl bg-[#f5f5f7] p-3 border border-black/[0.04]">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#86868b] block">
              Raio Imediato &lt; 1km
            </span>
            <span className="text-[1.35rem] font-black text-[#1d1d1f] tabular-nums leading-tight">
              {stats.menosDe1Km}
            </span>
            <span className="text-[0.68rem] text-[#1d8338] font-bold block mt-0.5">
              {stats.total > 0 ? Math.round((stats.menosDe1Km / stats.total) * 100) : 0}% da escola
            </span>
          </div>

          <div className="rounded-2xl bg-[#f5f5f7] p-3 border border-black/[0.04]">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#86868b] block">
              Distância &gt; 2km
            </span>
            <span className="text-[1.35rem] font-black text-[#ff9500] tabular-nums leading-tight">
              {stats.maisDe2Km}
            </span>
            <span className="text-[0.68rem] text-[#b25000] font-bold block mt-0.5">
              Transporte prioritário
            </span>
          </div>

          <div className="rounded-2xl bg-[#f5f5f7] p-3 border border-black/[0.04]">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#86868b] block">
              Transporte Escolar
            </span>
            <span className="text-[1.35rem] font-black text-[#8b5cf6] tabular-nums leading-tight">
              {stats.comTransporteEscolar}
            </span>
            <span className="text-[0.68rem] text-[#7c3aed] font-bold block mt-0.5">
              Rotas de Ônibus
            </span>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-1">
          {/* Search bar */}
          <div className="relative">
            <span className="material-symbols-outlined text-[18px] text-[#86868b] absolute left-3 top-2.5">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por estudante, rua, bairro ou RA..."
              className="w-full h-10 pl-9 pr-3 rounded-2xl bg-[#f5f5f7] text-[0.82rem] font-semibold text-[#1d1d1f] placeholder:text-[#86868b] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30"
            />
          </div>

          {/* Filter by Class */}
          <div>
            <select
              value={filterClassId}
              onChange={(e) => setFilterClassId(e.target.value)}
              className="w-full h-10 px-3 rounded-2xl bg-[#f5f5f7] text-[0.82rem] font-semibold text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 cursor-pointer"
            >
              <option value="all">Todas as {classes.length} Turmas</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  Turma {c.name} ({c.shift.replace('Turno ', '')})
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Shift */}
          <div>
            <select
              value={filterShift}
              onChange={(e) => setFilterShift(e.target.value as any)}
              className="w-full h-10 px-3 rounded-2xl bg-[#f5f5f7] text-[0.82rem] font-semibold text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 cursor-pointer"
            >
              <option value="all">Todos os Turnos (Manhã + Tarde)</option>
              <option value="MANHÃ">☀️ Turno Manhã</option>
              <option value="TARDE">⛅ Turno Tarde</option>
            </select>
          </div>

          {/* Filter by Distance Tier */}
          <div>
            <select
              value={filterDistanceTier}
              onChange={(e) => setFilterDistanceTier(e.target.value as any)}
              className="w-full h-10 px-3 rounded-2xl bg-[#f5f5f7] text-[0.82rem] font-semibold text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 cursor-pointer"
            >
              <option value="all">Todas as Distâncias</option>
              <option value="perto">🟢 Raio Imediato (&lt; 1.0 km)</option>
              <option value="medio">🔵 Intermediário (1.0 a 2.0 km)</option>
              <option value="distante">🟠 Distante (2.0 a 3.5 km)</option>
              <option value="muito_distante">🔴 Muito Distante (&gt; 3.5 km)</option>
            </select>
          </div>

          {/* Filter by Bus Route */}
          <div>
            <select
              value={filterTransporte}
              onChange={(e) => setFilterTransporte(e.target.value as any)}
              className="w-full h-10 px-3 rounded-2xl bg-[#f5f5f7] text-[0.82rem] font-semibold text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 cursor-pointer"
            >
              <option value="all">Todos os Transportes</option>
              <option value="com_onibus">🚌 Com Ônibus Fretado</option>
              <option value="sem_onibus">🚶 Transporte Individual / A pé</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Interactive Map Layout: Grid with Map & Inspector Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Leaflet Native Map Container */}
        <div className="lg:col-span-8 space-y-3">
          <div className="relative bg-white rounded-3xl p-2.5 shadow-sm border border-black/[0.08] overflow-hidden">
            {/* The Actual Leaflet Map Canvas */}
            <div
              ref={mapContainerRef}
              className="w-full h-[540px] sm:h-[620px] rounded-2xl overflow-hidden z-0"
              style={{ minHeight: '520px' }}
            />

            {/* Bottom Floating Legend */}
            <div className="absolute bottom-6 left-6 z-10 bg-white/95 backdrop-blur-md rounded-2xl p-3 border border-black/[0.08] shadow-lg text-[0.72rem] space-y-1.5 max-w-[280px]">
              <span className="font-extrabold text-[#1d1d1f] block text-[0.7rem] uppercase tracking-wider">
                Legenda de Deslocamento até a EMEB:
              </span>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 border border-white shrink-0" />
                <span className="text-[#1d1d1f] font-semibold">&lt; 1 km (Raio Caminhável)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#0071e3] border border-white shrink-0" />
                <span className="text-[#1d1d1f] font-semibold">1 a 2 km (Deslocamento Médio)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500 border border-white shrink-0" />
                <span className="text-[#1d1d1f] font-semibold">&gt; 2 km (Distância Elevada)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-purple-600 border border-white shrink-0" />
                <span className="text-[#1d1d1f] font-semibold">🚌 Ônibus Fretado Atribuído</span>
              </div>
            </div>

            {/* Selected Student Banner Overlay on Top of Map */}
            {selectedStudentMarker && (
              <div className="absolute top-5 left-5 right-16 z-10 bg-white/95 backdrop-blur-md p-3 rounded-2xl border border-black/[0.08] shadow-lg flex items-center justify-between gap-3 animate-in fade-in duration-200">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-white border-2 border-[#0071e3] shadow-xs shrink-0 flex items-center justify-center">
                    {selectedStudentMarker.photoUrl ? (
                      <img
                        src={selectedStudentMarker.photoUrl}
                        alt={selectedStudentMarker.student.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="font-mono font-bold text-xs text-[#003440]">
                        {selectedStudentMarker.initials}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-[0.88rem] text-[#1d1d1f] truncate">
                        {selectedStudentMarker.student.name}
                      </span>
                      <span className="text-[0.68rem] font-bold px-2 py-0.2 rounded-md bg-[#eaf6ef] text-[#005035]">
                        Turma {selectedStudentMarker.cls.name}
                      </span>
                    </div>
                    <p className="text-[0.72rem] text-[#6e6e73] truncate">
                      🚶 {selectedStudentMarker.estimates.walkMinutes} min a pé ({selectedStudentMarker.estimates.distanceRoadKm} km) · Lat: {selectedStudentMarker.lat.toFixed(5)}, Lng: {selectedStudentMarker.lng.toFixed(5)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedStudentMarker(null)}
                  className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  title="Fechar seleção"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Inspector & Student Details Panel */}
        <div className="lg:col-span-4 space-y-4">
          {selectedStudentMarker ? (
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-black/[0.08] space-y-4 animate-in fade-in duration-200">
              {/* Header: Photo, Name, RA, Class */}
              <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-black/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white border-2 border-[#0071e3] shadow-md shrink-0 flex items-center justify-center">
                    {selectedStudentMarker.photoUrl ? (
                      <img
                        src={selectedStudentMarker.photoUrl}
                        alt={selectedStudentMarker.student.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="font-mono font-bold text-base text-[#003440]">
                        {selectedStudentMarker.initials}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-[0.66rem] font-black uppercase tracking-wider text-[#0071e3] block">
                      Estudante Selecionado(a)
                    </span>
                    <h2 className="text-[1.05rem] font-black text-[#1d1d1f] leading-tight">
                      {selectedStudentMarker.student.name}
                    </h2>
                    <p className="text-[0.72rem] text-[#6e6e73] font-mono mt-0.5">
                      Nº {selectedStudentMarker.student.number.toString().padStart(2, '0')} · RA {selectedStudentMarker.student.ra || 'S/N'}-{selectedStudentMarker.student.digRa || '0'}
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-full bg-[#f5f5f7] text-[#1d1d1f] font-bold text-[0.72rem] shrink-0 border border-black/[0.06]">
                  {selectedStudentMarker.cls.name}
                </span>
              </div>

              {/* Exact Geolocation: Latitude & Longitude */}
              <div className="bg-[#f8faf9] rounded-2xl p-3.5 border border-[#003440]/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[0.66rem] font-extrabold uppercase tracking-wider text-[#003440] flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px]">pin_drop</span>
                    <span>Geolocalização Precisa (Lat / Lng)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyCoords(selectedStudentMarker.lat, selectedStudentMarker.lng)}
                    className="text-[0.68rem] font-bold text-[#0071e3] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {copiedCoords ? 'done' : 'content_copy'}
                    </span>
                    <span>{copiedCoords ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center font-mono">
                  <div className="bg-white rounded-xl p-2 border border-black/[0.05]">
                    <span className="text-[0.62rem] text-slate-400 block font-sans uppercase">Latitude</span>
                    <span className="text-[0.82rem] font-bold text-[#003440]">
                      {selectedStudentMarker.lat.toFixed(5)}
                    </span>
                  </div>
                  <div className="bg-white rounded-xl p-2 border border-black/[0.05]">
                    <span className="text-[0.62rem] text-slate-400 block font-sans uppercase">Longitude</span>
                    <span className="text-[0.82rem] font-bold text-[#003440]">
                      {selectedStudentMarker.lng.toFixed(5)}
                    </span>
                  </div>
                </div>

                <div className="pt-1 text-[0.72rem] text-[#1d1d1f]">
                  <span className="text-slate-400 block text-[0.64rem] font-bold uppercase">Endereço Cadastrado:</span>
                  <span className="font-semibold block">{selectedStudentMarker.fullAddress}</span>
                </div>
              </div>

              {/* Cálculo Oficial de Percurso até a EMEB Candelário */}
              <div className="bg-white rounded-2xl p-3.5 border border-black/[0.08] space-y-2.5 shadow-2xs">
                <span className="text-[0.66rem] font-extrabold uppercase tracking-wider text-slate-700 block">
                  Tempo de Percurso até a EMEB Candelário
                </span>

                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-[#f0fdf4] rounded-xl p-2.5 border border-emerald-200 text-center">
                    <span className="material-symbols-outlined text-emerald-700 text-[20px] block">
                      directions_walk
                    </span>
                    <span className="text-xl font-black text-emerald-800 font-mono tabular-nums block mt-0.5">
                      {selectedStudentMarker.estimates.walkMinutes}
                      <span className="text-[0.65rem] font-normal"> min</span>
                    </span>
                    <span className="text-[0.62rem] font-bold text-emerald-700 block uppercase">
                      A pé
                    </span>
                  </div>

                  <div className="bg-[#f0f9ff] rounded-xl p-2.5 border border-sky-200 text-center">
                    <span className="material-symbols-outlined text-sky-700 text-[20px] block">
                      directions_car
                    </span>
                    <span className="text-xl font-black text-sky-800 font-mono tabular-nums block mt-0.5">
                      {selectedStudentMarker.estimates.carMinutes}
                      <span className="text-[0.65rem] font-normal"> min</span>
                    </span>
                    <span className="text-[0.62rem] font-bold text-sky-700 block uppercase">
                      De Carro
                    </span>
                  </div>

                  <div className="bg-[#faf5ff] rounded-xl p-2.5 border border-purple-200 text-center">
                    <span className="material-symbols-outlined text-purple-700 text-[20px] block">
                      directions_bus
                    </span>
                    <span className="text-xl font-black text-purple-800 font-mono tabular-nums block mt-0.5">
                      {selectedStudentMarker.estimates.busMinutes}
                      <span className="text-[0.65rem] font-normal"> min</span>
                    </span>
                    <span className="text-[0.62rem] font-bold text-purple-700 block uppercase">
                      Ônibus
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-[0.74rem]">
                  <span className="text-slate-600 font-medium">Distância Rodoviária Real:</span>
                  <span className="font-mono font-black text-slate-900 text-[0.88rem]">
                    {selectedStudentMarker.estimates.distanceRoadKm} km
                  </span>
                </div>

                {selectedStudentMarker.student.rotaOnibus && (
                  <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-between text-[0.74rem]">
                    <span className="text-purple-800 font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px]">directions_bus</span>
                      <span>Linha de Transporte Fretado:</span>
                    </span>
                    <span className="font-extrabold text-purple-900">
                      {selectedStudentMarker.student.rotaOnibus}
                    </span>
                  </div>
                )}
              </div>

              {/* Family Contacts & WhatsApp Quick Link */}
              <div className="bg-[#f5f5f7] rounded-2xl p-3.5 border border-black/[0.04] space-y-2">
                <span className="text-[0.66rem] font-extrabold uppercase tracking-wider text-[#6e6e73] block">
                  Responsável &amp; Comunicação
                </span>

                <div className="text-[0.74rem]">
                  <span className="text-slate-400 block text-[0.64rem] font-bold uppercase">
                    {selectedStudentMarker.guardianInfo.roleLabel}:
                  </span>
                  <span className="font-bold text-slate-900 block truncate">
                    {selectedStudentMarker.guardianInfo.cleanName}
                  </span>
                </div>

                {(() => {
                  const rawPhone =
                    selectedStudentMarker.student.telefones ||
                    selectedStudentMarker.student.guardianPhone;
                  const waList = buildWhatsAppLinksFromPhoneString(
                    rawPhone,
                    selectedStudentMarker.student.name,
                    `Olá! Somos da Secretaria de Educação de Jundiaí / EMEB Joaquim Candelário de Freitas. Gostaríamos de conversar sobre o trajeto e acompanhamento escolar de ${selectedStudentMarker.student.name}.`
                  );

                  if (!rawPhone || waList.length === 0) {
                    return <span className="text-slate-400 italic text-[0.7rem]">Sem telefone cadastrado</span>;
                  }

                  return (
                    <div className="flex items-center gap-2 pt-1">
                      <a
                        href={waList[0].waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 h-[32px] px-3 rounded-xl bg-[#25d366]/15 hover:bg-[#25d366]/25 text-[#075e54] font-bold text-[0.72rem] flex items-center justify-center gap-1.5 transition-colors cursor-pointer truncate"
                      >
                        <span className="material-symbols-outlined text-[15px]">chat</span>
                        <span className="truncate">WhatsApp: {waList[0].display}</span>
                      </a>

                      <a
                        href={`tel:${rawPhone.replace(/\D/g, '')}`}
                        className="h-[32px] px-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-bold text-[0.72rem] flex items-center justify-center transition-colors border border-black/[0.08]"
                        title="Fazer ligação"
                      >
                        <span className="material-symbols-outlined text-[15px]">call</span>
                      </a>
                    </div>
                  );
                })()}
              </div>

              {/* Action Buttons: Ficha Completa & Ficha PDF */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                {onOpenStudentGrid && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenStudentGrid(
                        selectedStudentMarker.student,
                        selectedStudentMarker.cls.id,
                        selectedStudentMarker.cls.name,
                        selectedStudentMarker.cls.classesHeld || 20
                      )
                    }
                    className="h-[38px] px-3 rounded-xl bg-[#003440] hover:bg-[#00252e] text-white font-bold text-[0.74rem] flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-97"
                  >
                    <span className="material-symbols-outlined text-[16px]">open_in_full</span>
                    <span>Ficha Completa</span>
                  </button>
                )}

                {onOpenStudentPdf && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenStudentPdf(selectedStudentMarker.student, selectedStudentMarker.cls.name)
                    }
                    className="h-[38px] px-3 rounded-xl bg-[#0071e3] hover:bg-[#005bb5] text-white font-bold text-[0.74rem] flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-97"
                  >
                    <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                    <span>Ficha PDF</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-black/[0.08] text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-[28px]">touch_app</span>
              </div>
              <div>
                <h3 className="font-extrabold text-[0.95rem] text-[#1d1d1f]">
                  Selecione um Estudante no Mapa
                </h3>
                <p className="text-[0.74rem] text-[#6e6e73] mt-1 leading-relaxed">
                  Clique em qualquer pino de foto no mapa interativo ou selecione da lista para traçar a rota exata até a EMEB Candelário, calcular tempo a pé, de carro, de ônibus e visualizar as coordenadas geográficas.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setIsListViewOpen(true)}
                  className="w-full h-[40px] px-4 rounded-xl bg-[#1d1d1f] hover:bg-black text-white text-[0.78rem] font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <span className="material-symbols-outlined text-[18px]">format_list_bulleted</span>
                  <span>Ver Lista de {filteredMarkers.length} Estudantes</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick List of Filtered Students */}
          {isListViewOpen && (
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-black/[0.08] space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-black/[0.06]">
                <span className="text-[0.72rem] font-extrabold uppercase tracking-wider text-slate-700">
                  Estudantes Mapeados ({filteredMarkers.length})
                </span>
                <button
                  type="button"
                  onClick={() => setIsListViewOpen(false)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100 pr-1">
                {filteredMarkers.map((m) => {
                  const isSelected = selectedStudentMarker?.student.id === m.student.id;
                  return (
                    <div
                      key={m.student.id}
                      onClick={() => {
                        setSelectedStudentMarker(m);
                      }}
                      className={`p-2 rounded-xl flex items-center justify-between gap-2.5 cursor-pointer transition-colors ${
                        isSelected ? 'bg-sky-50/80 font-bold' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-white border border-slate-200 shrink-0 flex items-center justify-center text-[10px] font-mono font-bold">
                          {m.photoUrl ? (
                            <img src={m.photoUrl} alt={m.student.name} className="w-full h-full object-cover" />
                          ) : (
                            <span>{m.initials}</span>
                          )}
                        </div>
                        <div className="min-w-0 text-[0.74rem]">
                          <span className="font-extrabold text-slate-900 block truncate">
                            {m.student.name}
                          </span>
                          <span className="text-[0.66rem] text-slate-500 block truncate">
                            Turma {m.cls.name} · {m.student.bairro || 'Vila Hortolândia'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[0.74rem] font-mono font-extrabold text-[#0071e3] block">
                          {m.estimates.walkMinutes} min
                        </span>
                        <span className="text-[0.64rem] font-mono text-slate-500 block">
                          {m.estimates.distanceRoadKm} km
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
