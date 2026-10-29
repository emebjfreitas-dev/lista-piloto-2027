import React, { useState, useMemo, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ClassGroup, Student, UserRole } from '../types';
import {
  CANDELARIO_SCHOOL_LOCATION,
  resolveStudentCoordinates,
  calculateTravelEstimates,
  fetchFreeOsmRoute,
  buildGoogleMapsNavigationUrls,
  FreeRouteResult,
  RouteTravelEstimates,
} from '../utils/geoRouting';
import { resolveGuardianRelationshipInfo } from '../utils/genderDictionary';
import { buildWhatsAppLinksFromPhoneString } from './VisualizarPdfNominalModal';
import { isBackendApiAvailable } from '../services/apiEnvironment';
import { toast } from 'sonner';

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
  onBack?: () => void;
}

export interface StudentMapMarkerItem {
  student: Student;
  cls: ClassGroup;
  lat: number;
  lng: number;
  fullAddress: string;
  estimates: RouteTravelEstimates;
  guardianInfo: ReturnType<typeof resolveGuardianRelationshipInfo>;
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
      photoUrl = isBackendApiAvailable()
        ? `/api/drive-photo/${driveMatch[1]}`
        : `https://lh3.googleusercontent.com/d/${driveMatch[1]}=w200`;
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
  onBack,
}) => {
  // Navigation & Filter States
  const [filterClassId, setFilterClassId] = useState<string>(selectedClassId || 'all');
  const [filterOnlyBus, setFilterOnlyBus] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isListViewOpen, setIsListViewOpen] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'map' | 'route'>('map');

  // Selected student & Routing state
  const [selectedStudentMarker, setSelectedStudentMarker] = useState<StudentMapMarkerItem | null>(null);
  const [travelMode, setTravelMode] = useState<'foot' | 'driving' | 'bus'>('foot');
  const [routeData, setRouteData] = useState<FreeRouteResult | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);

  // Custom 2-Point Routing Mode
  const [isCustomPointsMode, setIsCustomPointsMode] = useState(false);
  const [customPointA, setCustomPointA] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [customPointB, setCustomPointB] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [settingPointStep, setSettingPointStep] = useState<'none' | 'pointA' | 'pointB'>('none');

  // Map and layer references
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const schoolMarkerLayerRef = useRef<L.LayerGroup | null>(null);

  // Compute all active student markers
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
        const { photoUrl, initials } = getStudentPhotoAndInitials(student);

        list.push({
          student,
          cls,
          lat: coords.lat,
          lng: coords.lng,
          fullAddress: coords.fullAddress,
          estimates,
          guardianInfo,
          photoUrl,
          initials,
        });
      });
    });

    return list;
  }, [classes]);

  // Handle initial selected student
  useEffect(() => {
    if (initialSelectedStudentId && allMarkers.length > 0) {
      const found = allMarkers.find((m) => m.student.id === initialSelectedStudentId);
      if (found) {
        setSelectedStudentMarker(found);
        setActiveMobileTab('route');
      }
    }
  }, [initialSelectedStudentId, allMarkers]);

  // Filtered markers
  const filteredMarkers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return allMarkers.filter((item) => {
      if (filterClassId !== 'all' && item.cls.id !== filterClassId) return false;
      if (filterOnlyBus && !item.student.rotaOnibus) return false;

      if (q) {
        const matchName = item.student.name.toLowerCase().includes(q);
        const matchBairro = (item.student.bairro || '').toLowerCase().includes(q);
        const matchLogr = (item.student.logradouro || '').toLowerCase().includes(q);
        const matchTurma = item.cls.name.toLowerCase().includes(q);
        const matchRa = (item.student.ra || '').toLowerCase().includes(q);
        return matchName || matchBairro || matchLogr || matchTurma || matchRa;
      }

      return true;
    });
  }, [allMarkers, filterClassId, filterOnlyBus, searchQuery]);

  // Concise key metrics
  const stats = useMemo(() => {
    const total = filteredMarkers.length;
    if (total === 0) return { total: 0, avgDistanceKm: 0, avgWalkMinutes: 0, withBus: 0 };

    let sumRoadKm = 0;
    let sumWalk = 0;
    let withBus = 0;

    filteredMarkers.forEach((m) => {
      sumRoadKm += m.estimates.distanceRoadKm;
      sumWalk += m.estimates.walkMinutes;
      if (m.student.rotaOnibus) withBus++;
    });

    return {
      total,
      avgDistanceKm: Math.round((sumRoadKm / total) * 10) / 10,
      avgWalkMinutes: Math.round(sumWalk / total),
      withBus,
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

    // 100% Free OpenStreetMap & Carto Voyager tiles (clean, high contrast, no API keys)
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> &copy; <a href="https://carto.com/" target="_blank">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }
    ).addTo(map);

    // Big, accessible Zoom control
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Layer Groups
    schoolMarkerLayerRef.current = L.layerGroup().addTo(map);
    routeLayerGroupRef.current = L.layerGroup().addTo(map);
    markersLayerGroupRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    // Handle map click for custom 2-point routing
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (settingPointStep === 'pointA') {
        setCustomPointA({
          lat: Math.round(lat * 100000) / 100000,
          lng: Math.round(lng * 100000) / 100000,
          label: `Ponto A (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        });
        setSettingPointStep('pointB');
        toast.info('Ponto 1 (Partida) marcado! Agora toque no mapa para marcar o Ponto 2 (Chegada).');
      } else if (settingPointStep === 'pointB') {
        setCustomPointB({
          lat: Math.round(lat * 100000) / 100000,
          lng: Math.round(lng * 100000) / 100000,
          label: `Ponto B (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        });
        setSettingPointStep('none');
        toast.success('Ponto 2 marcado! Calculando rota gratuita pelas ruas...');
      }
    });

    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Sync settingPointStep with leaflet click listener
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.off('click');
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (settingPointStep === 'pointA') {
        setCustomPointA({
          lat: Math.round(lat * 100000) / 100000,
          lng: Math.round(lng * 100000) / 100000,
          label: `Ponto 1 (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        });
        setSettingPointStep('pointB');
        toast.info('Ponto 1 marcado! Agora toque no local do Ponto 2 (Chegada).');
      } else if (settingPointStep === 'pointB') {
        setCustomPointB({
          lat: Math.round(lat * 100000) / 100000,
          lng: Math.round(lng * 100000) / 100000,
          label: `Ponto 2 (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        });
        setSettingPointStep('none');
        toast.success('Ponto 2 marcado! Calculando caminho gratuito...');
      }
    });
  }, [settingPointStep]);

  // 2. Render School Marker and 1km Walking Radius
  useEffect(() => {
    const schoolGroup = schoolMarkerLayerRef.current;
    if (!schoolGroup) return;

    schoolGroup.clearLayers();

    // Prominent High-Contrast School Icon
    const schoolIcon = L.divIcon({
      className: 'candelario-school-marker-div',
      html: `
        <div class="relative flex flex-col items-center cursor-pointer select-none -translate-x-1/2 -translate-y-1/2">
          <div class="w-14 h-14 rounded-2xl bg-[#003440] text-white shadow-2xl flex items-center justify-center">
            <span class="material-symbols-outlined text-[30px]">school</span>
          </div>
          <div class="mt-1 px-3 py-1 rounded-xl bg-[#0f172a] text-white text-xs font-bold tracking-wide whitespace-nowrap shadow-xl">
            EMEB Candelário (Escola)
          </div>
        </div>
      `,
      iconSize: [56, 74],
      iconAnchor: [28, 37],
    });

    const marker = L.marker(
      [CANDELARIO_SCHOOL_LOCATION.lat, CANDELARIO_SCHOOL_LOCATION.lng],
      { icon: schoolIcon, zIndexOffset: 2000 }
    ).addTo(schoolGroup);

    marker.bindPopup(`
      <div class="p-4 text-slate-900 space-y-2">
        <div class="font-semibold text-base text-[#003440] flex items-center gap-2">
          <span class="material-symbols-outlined text-[22px]">school</span>
          <span>${CANDELARIO_SCHOOL_LOCATION.name}</span>
        </div>
        <p class="text-sm font-semibold text-slate-700">${CANDELARIO_SCHOOL_LOCATION.address}, Jundiaí - SP</p>
        <div class="mt-2 text-xs font-bold text-emerald-950 bg-emerald-100 px-3 py-1.5 rounded-xl">
          Destino central de todas as rotas de alunos
        </div>
      </div>
    `);

    // 1 km walk radius circle (High contrast, clearly visible)
    L.circle([CANDELARIO_SCHOOL_LOCATION.lat, CANDELARIO_SCHOOL_LOCATION.lng], {
      radius: 1000,
      color: '#059669',
      weight: 2,
      opacity: 0.8,
      fillColor: '#10b981',
      fillOpacity: 0.08,
      dashArray: '6, 6',
    })
      .bindTooltip('Raio de 1 km em volta da escola (caminhável a pé)', {
        permanent: false,
        direction: 'top',
      })
      .addTo(schoolGroup);
  }, []);

  // 3. Render Student Pins
  useEffect(() => {
    const markersGroup = markersLayerGroupRef.current;
    if (!markersGroup) return;

    markersGroup.clearLayers();

    filteredMarkers.forEach((item) => {
      const isSelected = selectedStudentMarker?.student.id === item.student.id;
      const numStr = item.student.number.toString().padStart(2, '0');
      const hasBus = Boolean(item.student.rotaOnibus);

      let pinRingColor = '';
      if (hasBus) pinRingColor = 'ring-2 ring-purple-600';
      else if (item.estimates.distanceRoadKm >= 2.0) pinRingColor = 'ring-2 ring-amber-500';

      const iconHtml = `
        <div class="relative flex flex-col items-center cursor-pointer select-none transition-transform hover:scale-115 ${
          isSelected ? 'scale-125 z-50' : 'z-20'
        }" style="width: 48px; height: 56px;">
          <!-- Avatar da Criança -->
          <div class="relative w-11 h-11 rounded-full overflow-hidden bg-slate-900 ${
            isSelected ? 'ring-4 ring-amber-400' : pinRingColor
          } shadow-xl flex items-center justify-center">
            ${
              item.photoUrl
                ? `<img src="${item.photoUrl}" alt="${item.student.name}" class="w-full h-full object-cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                   <div class="hidden w-full h-full bg-[#003440] text-white font-mono font-bold text-xs items-center justify-center">${item.initials}</div>`
                : `<div class="w-full h-full bg-[#003440] text-white font-mono font-semibold text-xs flex items-center justify-center">${item.initials}</div>`
            }
          </div>
          <!-- Número de Chamada Grande e Nítido -->
          <span class="absolute -bottom-1 px-2 py-0.5 rounded-full font-mono font-semibold text-[11px] text-white shadow-md ${
            isSelected
              ? 'bg-[#005bb5] ring-2 ring-white'
              : hasBus
              ? 'bg-[#7c3aed]'
              : 'bg-[#0f172a]'
          }">
            Nº ${numStr}
          </span>
        </div>
      `;

      const studentIcon = L.divIcon({
        className: 'candelario-student-pin',
        html: iconHtml,
        iconSize: [48, 56],
        iconAnchor: [24, 56],
      });

      const marker = L.marker([item.lat, item.lng], {
        icon: studentIcon,
        zIndexOffset: isSelected ? 800 : 100,
      });

      marker.bindTooltip(
        `<div class="p-1 font-sans text-xs">
           <strong class="text-sm font-semibold text-slate-900">${item.student.name}</strong><br/>
           Turma ${item.cls.name} • 🚶 ${item.estimates.walkMinutes} min a pé (${item.estimates.distanceRoadKm} km)
         </div>`,
        { direction: 'top', offset: [0, -50] }
      );

      marker.on('click', () => {
        setIsCustomPointsMode(false);
        setSelectedStudentMarker(item);
        setActiveMobileTab('route');
      });

      marker.addTo(markersGroup);
    });
  }, [filteredMarkers, selectedStudentMarker]);

  // 4. Calculate and Draw Real Free Route using OSRM
  useEffect(() => {
    let isCancelled = false;
    const map = mapInstanceRef.current;
    const routeGroup = routeLayerGroupRef.current;
    if (!map || !routeGroup) return;

    routeGroup.clearLayers();

    // Determine Origin and Destination
    let origin: { lat: number; lng: number; label: string } | null = null;
    let destination: { lat: number; lng: number; label: string } | null = null;

    if (isCustomPointsMode && customPointA && customPointB) {
      origin = customPointA;
      destination = customPointB;
    } else if (selectedStudentMarker) {
      origin = {
        lat: selectedStudentMarker.lat,
        lng: selectedStudentMarker.lng,
        label: `Casa de ${selectedStudentMarker.student.name}`,
      };
      destination = {
        lat: CANDELARIO_SCHOOL_LOCATION.lat,
        lng: CANDELARIO_SCHOOL_LOCATION.lng,
        label: CANDELARIO_SCHOOL_LOCATION.name,
      };
    }

    if (!origin || !destination) {
      setRouteData(null);
      return;
    }

    setIsCalculatingRoute(true);

    fetchFreeOsmRoute(origin, destination, travelMode)
      .then((res) => {
        if (isCancelled) return;
        setRouteData(res);
        setIsCalculatingRoute(false);

        // Draw Thick Visible High-Contrast Trajectory Polyline
        // Outer glow/casing for visibility
        L.polyline(res.coordinates, {
          color: '#0f172a',
          weight: 7,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(routeGroup);

        // Inner bright line
        const lineColor =
          travelMode === 'foot' ? '#10b981' : travelMode === 'bus' ? '#9333ea' : '#0284c7';

        L.polyline(res.coordinates, {
          color: lineColor,
          weight: 5,
          opacity: 1,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(routeGroup);

        // Start Flag Marker 🟢
        const startIcon = L.divIcon({
          className: 'candelario-route-start-icon',
          html: `
            <div class="px-2.5 py-1 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-xl flex items-center gap-1 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
              <span>🟢 Início</span>
            </div>
          `,
          iconSize: [80, 28],
          iconAnchor: [40, 14],
        });
        L.marker([origin.lat, origin.lng], { icon: startIcon, interactive: false }).addTo(routeGroup);

        // End Flag Marker 🔴
        const endIcon = L.divIcon({
          className: 'candelario-route-end-icon',
          html: `
            <div class="px-2.5 py-1 rounded-xl bg-rose-600 text-white font-bold text-xs shadow-xl flex items-center gap-1 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
              <span>🏁 Chegada</span>
            </div>
          `,
          iconSize: [80, 28],
          iconAnchor: [40, 14],
        });
        L.marker([destination.lat, destination.lng], { icon: endIcon, interactive: false }).addTo(routeGroup);

        // Midpoint badge with km & minutes
        if (res.coordinates.length > 0) {
          const midIdx = Math.floor(res.coordinates.length / 2);
          const midCoord = res.coordinates[midIdx];

          const modeIcon = travelMode === 'foot' ? '🚶' : travelMode === 'bus' ? '🚌' : '🚗';
          const badgeIcon = L.divIcon({
            className: 'candelario-route-midpoint-icon',
            html: `
              <div class="px-3 py-1.5 rounded-xl bg-[#0f172a] text-white font-bold text-xs shadow-2xl flex items-center gap-1.5 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
                <span>${modeIcon} ${res.durationMinutes} min</span>
                <span class="text-amber-300 font-bold">·</span>
                <span>${res.distanceKm} km</span>
              </div>
            `,
            iconSize: [140, 32],
            iconAnchor: [70, 16],
          });
          L.marker(midCoord, { icon: badgeIcon, interactive: false }).addTo(routeGroup);
        }

        // Fit map bounds comfortably
        map.fitBounds([
          [origin.lat, origin.lng],
          [destination.lat, destination.lng],
        ], {
          padding: [80, 80],
          maxZoom: 16,
        });
      })
      .catch((err) => {
        if (isCancelled) return;
        setIsCalculatingRoute(false);
        console.warn('Erro ao carregar rota OSRM:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedStudentMarker, travelMode, isCustomPointsMode, customPointA, customPointB]);

  // Voice Synthesizer to Read Steps Aloud for Elderly Users
  const handleSpeakRoute = () => {
    if (!('speechSynthesis' in window)) {
      toast.error('Leitura em voz alta não é suportada pelo seu navegador.');
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    if (!routeData) {
      toast.info('Nenhuma rota calculada no momento.');
      return;
    }

    window.speechSynthesis.cancel();
    const modeLabel = travelMode === 'foot' ? 'a pé' : travelMode === 'bus' ? 'de ônibus' : 'de carro';
    const targetName = selectedStudentMarker ? selectedStudentMarker.student.name : 'ponto de partida';

    let speechText = `Caminho ${modeLabel} até a escola. Distância total: ${routeData.distanceKm} quilômetros. Tempo estimado: ${routeData.durationMinutes} minutos. `;

    routeData.steps.forEach((step, idx) => {
      speechText += `Passo ${idx + 1}: ${step.instruction}. `;
    });

    speechText += 'Você chegou ao seu destino!';

    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.88; // Calm and clear for seniors
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
    toast.success('Lendo instruções do caminho em voz alta...');
  };

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
    toast.success('Coordenadas copiadas!');
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  const navUrls = useMemo(() => {
    if (selectedStudentMarker) {
      return buildGoogleMapsNavigationUrls(
        selectedStudentMarker.lat,
        selectedStudentMarker.lng,
        selectedStudentMarker.fullAddress
      );
    }
    if (customPointA && customPointB) {
      return buildGoogleMapsNavigationUrls(
        customPointB.lat,
        customPointB.lng,
        customPointB.label,
        customPointA
      );
    }
    return null;
  }, [selectedStudentMarker, customPointA, customPointB]);

  return (
    <div className="space-y-4 pb-24 max-w-[1550px] mx-auto px-2 sm:px-4 lg:px-6 candelario-map-root font-sans">
      {/* Breadcrumb Limpo */}
      <div className="flex items-center justify-between text-xs text-slate-500 py-0.5">
        <div className="flex items-center gap-1.5">
          {onBack && (
            <>
              <button
                type="button"
                onClick={onBack}
                className="text-slate-600 hover:text-slate-900 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">arrow_back</span>
                <span>Voltar</span>
              </button>
              <span className="text-slate-300">/</span>
            </>
          )}
          <span className="font-semibold text-slate-800">Mapa &amp; Rotas</span>
          <span className="text-slate-400">·</span>
          <span>Trajetos e Distâncias dos Estudantes</span>
        </div>
        <span className="text-slate-400 text-xs hidden sm:inline">
          Geolocalização e Logística Escolar
        </span>
      </div>

      {/* Header Card */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-slate-950 text-white flex items-center justify-center shrink-0 shadow-md">
              <span className="material-symbols-outlined text-[32px]">map</span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 rounded-xl bg-emerald-100 text-emerald-950 text-xs font-bold uppercase tracking-wide">
                  100% Gratuito · Código Aberto
                </span>
                <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-900 text-xs font-bold">
                  OpenStreetMap + OSRM
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-950 tracking-tight leading-tight mt-1">
                Mapa e Caminho dos Alunos até a Escola
              </h1>
              <p className="text-sm sm:text-base text-slate-800 font-semibold mt-0.5">
                Toque no mapa ou escolha um aluno da lista para ver o trajeto pelas ruas, o tempo e a distância.
              </p>
            </div>
          </div>

          {/* Big Accessible Top Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleCenterOnSchool}
              className="min-h-[48px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-950 font-bold text-sm flex items-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <span className="material-symbols-outlined text-[20px] text-blue-700">my_location</span>
              <span>Ir para a Escola</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsCustomPointsMode((prev) => !prev);
                if (!isCustomPointsMode) {
                  setSelectedStudentMarker(null);
                  setCustomPointA(null);
                  setCustomPointB(null);
                  setSettingPointStep('pointA');
                  toast.info('Modo 2 Pontos ativado! Toque no mapa para marcar o Ponto 1 de partida.');
                } else {
                  setSettingPointStep('none');
                }
              }}
              className={`min-h-[48px] px-4 rounded-xl font-bold text-sm flex items-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95 ${
                isCustomPointsMode
                  ? 'bg-amber-100 text-amber-950'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-950'
              }`}
            >
              <span className="material-symbols-outlined text-[20px] text-amber-700">route</span>
              <span>{isCustomPointsMode ? 'Fechar Modo 2 Pontos' : 'Traçar Rota Entre 2 Pontos'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsListViewOpen((prev) => !prev)}
              className={`min-h-[48px] px-4 rounded-xl font-bold text-sm flex items-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95 ${
                isListViewOpen
                  ? 'bg-slate-950 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-950'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">format_list_bulleted</span>
              <span>Lista de Alunos ({filteredMarkers.length})</span>
            </button>
          </div>
        </div>

        {/* 2. Simplified Clean Filter Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2">
          {/* Big Search Input */}
          <div className="md:col-span-6 relative">
            <span className="material-symbols-outlined text-[22px] text-slate-600 absolute left-3.5 top-3.5">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Digite o nome da criança, rua ou bairro..."
              className="w-full min-h-[50px] pl-11 pr-4 rounded-2xl bg-slate-100 text-base font-bold text-slate-950 placeholder:text-slate-600 placeholder:font-normal focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-xs"
            />
          </div>

          {/* Class Selector */}
          <div className="md:col-span-3">
            <select
              value={filterClassId}
              onChange={(e) => setFilterClassId(e.target.value)}
              className="w-full min-h-[50px] px-3.5 rounded-2xl bg-slate-100 text-sm sm:text-base font-bold text-slate-950 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer shadow-xs"
            >
              <option value="all">Todas as {classes.length} Turmas</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  Turma {c.name} ({c.shift.replace('Turno ', '')})
                </option>
              ))}
            </select>
          </div>

          {/* Only Bus Toggle Button */}
          <div className="md:col-span-3">
            <button
              type="button"
              onClick={() => setFilterOnlyBus((prev) => !prev)}
              className={`w-full min-h-[50px] px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs active:scale-95 ${
                filterOnlyBus
                  ? 'bg-purple-900 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-950'
              }`}
            >
              <span className="material-symbols-outlined text-[20px] text-purple-600">directions_bus</span>
              <span>{filterOnlyBus ? 'Mostrando só Ônibus' : 'Ver só Alunos com Ônibus'}</span>
            </button>
          </div>
        </div>

        {/* 3. Summary Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="rounded-2xl bg-slate-100 p-4 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[26px] text-blue-700">straighten</span>
              <div>
                <span className="text-xs font-bold text-slate-700 uppercase block">Distância Média</span>
                <span className="text-lg font-bold text-slate-950">{stats.avgDistanceKm} km até a escola</span>
              </div>
            </div>
            <span className="text-xs font-bold text-slate-600">Pelas Ruas</span>
          </div>

          <div className="rounded-2xl bg-emerald-100/80 p-4 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[26px] text-emerald-800">directions_walk</span>
              <div>
                <span className="text-xs font-bold text-emerald-950 uppercase block">Tempo Médio a Pé</span>
                <span className="text-lg font-bold text-emerald-950">{stats.avgWalkMinutes} minutos</span>
              </div>
            </div>
            <span className="text-xs font-bold text-emerald-900">Caminhada</span>
          </div>

          <div className="rounded-2xl bg-purple-100/80 p-4 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[26px] text-purple-800">directions_bus</span>
              <div>
                <span className="text-xs font-bold text-purple-950 uppercase block">Transporte Escolar</span>
                <span className="text-lg font-bold text-purple-950">{stats.withBus} alunos</span>
              </div>
            </div>
            <span className="text-xs font-bold text-purple-900">Ônibus Fretado</span>
          </div>
        </div>
      </div>

      {/* Mobile Tab Selector (Big & Highly Visible) */}
      <div className="lg:hidden flex items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveMobileTab('map')}
          className={`flex-1 min-h-[50px] rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all shadow-xs ${
            activeMobileTab === 'map'
              ? 'bg-slate-950 text-white shadow-md'
              : 'bg-white text-slate-950'
          }`}
        >
          <span className="material-symbols-outlined text-[22px]">map</span>
          <span>Ver Mapa</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMobileTab('route')}
          className={`flex-1 min-h-[50px] rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all shadow-xs ${
            activeMobileTab === 'route'
              ? 'bg-blue-700 text-white shadow-md'
              : 'bg-white text-slate-950'
          }`}
        >
          <span className="material-symbols-outlined text-[22px]">directions</span>
          <span>Ver Caminho &amp; Aluno {selectedStudentMarker ? '✅' : ''}</span>
        </button>
      </div>

      {/* Main Grid: Interactive Leaflet Map (Left) & Route / Inspector Panel (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Leaflet Map Column */}
        <div className={`lg:col-span-7 space-y-3 ${activeMobileTab === 'route' ? 'hidden lg:block' : 'block'}`}>
          <div className="relative bg-white rounded-3xl p-3 sm:p-4 shadow-sm overflow-hidden">
            {/* Custom 2-Points Instructional Banner */}
            {isCustomPointsMode && (
              <div className="mb-3 p-4 rounded-2xl bg-amber-100 text-amber-950 flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[26px] text-amber-800">touch_app</span>
                  <div>
                    <span className="font-bold text-sm block">Modo: Traçar Rota Livre Entre 2 Pontos</span>
                    <span className="text-xs font-bold text-amber-900 block">
                      {settingPointStep === 'pointA' && '👉 Toque no mapa para marcar o Início (Ponto 1)'}
                      {settingPointStep === 'pointB' && '👉 Agora toque no mapa para marcar a Chegada (Ponto 2)'}
                      {settingPointStep === 'none' && customPointA && customPointB && '✅ Rota calculada com sucesso!'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomPointA(null);
                      setCustomPointB(null);
                      setSettingPointStep('pointA');
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs cursor-pointer"
                  >
                    Recomeçar
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCustomPointsMode(false)}
                    className="p-1.5 rounded-xl text-amber-800 hover:text-black cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>
              </div>
            )}

            {/* Map Canvas */}
            <div
              ref={mapContainerRef}
              className="w-full h-[520px] sm:h-[620px] rounded-2xl overflow-hidden z-0"
              style={{ minHeight: '500px' }}
            />

            {/* Quick Floating Hint Overlay on Map */}
            <div className="absolute bottom-5 left-5 z-10 bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-xl max-w-[280px]">
              <span className="font-bold text-slate-950 text-xs block mb-1">
                Legenda Simples:
              </span>
              <div className="space-y-1.5 text-xs font-bold text-slate-800">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-600" />
                  <span>Raio de 1 km da Escola</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-purple-600" />
                  <span>Criança com Ônibus Escolar</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-blue-600" />
                  <span>Transporte Individual / A pé</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Inspector & Full Turn-by-Turn Routing Panel */}
        <div className={`lg:col-span-5 space-y-4 ${activeMobileTab === 'map' ? 'hidden lg:block' : 'block'}`}>
          {selectedStudentMarker || (isCustomPointsMode && customPointA && customPointB) ? (
            <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm space-y-5 animate-in fade-in duration-200">
              {/* Top Banner of Selected Item */}
              <div className="flex items-start justify-between gap-3 pb-2">
                <div className="flex items-center gap-3">
                  {selectedStudentMarker ? (
                    <>
                      <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 shadow-sm shrink-0 flex items-center justify-center">
                        {selectedStudentMarker.photoUrl ? (
                          <img
                            src={selectedStudentMarker.photoUrl}
                            alt={selectedStudentMarker.student.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="font-mono font-bold text-xl text-slate-950">
                            {selectedStudentMarker.initials}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-xs font-bold uppercase text-blue-800 block">
                          Aluno(a) Selecionado(a)
                        </span>
                        <h2 className="text-lg sm:text-xl font-bold text-slate-950 leading-tight">
                          {selectedStudentMarker.student.name}
                        </h2>
                        <p className="text-sm font-bold text-slate-700 mt-0.5">
                          Turma {selectedStudentMarker.cls.name} • Nº {selectedStudentMarker.student.number}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div>
                      <span className="text-xs font-bold uppercase text-amber-800 block">
                        Rota Personalizada
                      </span>
                      <h2 className="text-lg font-bold text-slate-950">
                        {customPointA?.label} ➔ {customPointB?.label}
                      </h2>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedStudentMarker(null);
                    setCustomPointA(null);
                    setCustomPointB(null);
                    setIsCustomPointsMode(false);
                  }}
                  className="p-2 rounded-xl text-slate-500 hover:text-slate-950 hover:bg-slate-100 cursor-pointer"
                  title="Fechar rota"
                >
                  <span className="material-symbols-outlined text-[24px]">close</span>
                </button>
              </div>

              {/* Travel Mode Selector: 3 Big Buttons (Walking / Car / Bus) */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800 block">
                  Escolha como fazer o trajeto:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTravelMode('foot')}
                    className={`min-h-[52px] rounded-2xl font-bold text-sm flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer active:scale-95 ${
                      travelMode === 'foot'
                        ? 'bg-emerald-800 text-white shadow-md'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-950'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">directions_walk</span>
                    <span>🚶 A Pé</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTravelMode('driving')}
                    className={`min-h-[52px] rounded-2xl font-bold text-sm flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer active:scale-95 ${
                      travelMode === 'driving'
                        ? 'bg-blue-800 text-white shadow-md'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-950'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">directions_car</span>
                    <span>🚗 De Carro</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTravelMode('bus')}
                    className={`min-h-[52px] rounded-2xl font-bold text-sm flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer active:scale-95 ${
                      travelMode === 'bus'
                        ? 'bg-purple-900 text-white shadow-md'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-950'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">directions_bus</span>
                    <span>🚌 Ônibus</span>
                  </button>
                </div>
              </div>

              {/* Route Summary Box: Distance & Duration */}
              <div className="p-4 rounded-2xl bg-sky-100 text-sky-950 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-sky-950 tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">straighten</span>
                    <span>Distância Real Pelas Ruas</span>
                  </span>
                  {isCalculatingRoute && (
                    <span className="text-xs font-bold text-sky-800 animate-pulse">
                      Calculando trajeto...
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-white rounded-xl p-3 shadow-xs">
                    <span className="text-xs font-bold text-slate-700 block uppercase">Distância</span>
                    <span className="text-2xl font-bold text-slate-950">
                      {routeData ? `${routeData.distanceKm} km` : selectedStudentMarker ? `${selectedStudentMarker.estimates.distanceRoadKm} km` : '--'}
                    </span>
                  </div>

                  <div className="bg-white rounded-xl p-3 shadow-xs">
                    <span className="text-xs font-bold text-slate-700 block uppercase">Tempo Estimado</span>
                    <span className="text-2xl font-bold text-blue-900">
                      {routeData ? `${routeData.durationMinutes} min` : selectedStudentMarker ? `${selectedStudentMarker.estimates.walkMinutes} min` : '--'}
                    </span>
                  </div>
                </div>

                {/* Big Voice Synthesizer Button */}
                <button
                  type="button"
                  onClick={handleSpeakRoute}
                  className={`w-full min-h-[48px] px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs active:scale-95 ${
                    isSpeaking
                      ? 'bg-rose-700 text-white animate-pulse'
                      : 'bg-emerald-800 hover:bg-emerald-900 text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-[22px]">
                    {isSpeaking ? 'stop_circle' : 'volume_up'}
                  </span>
                  <span>{isSpeaking ? 'Parar Leitura de Voz' : '🔊 Ouvir Caminho em Voz Alta'}</span>
                </button>
              </div>

              {/* Turn-by-Turn Steps List (Numbered with clear instructions) */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800 block">
                  Passo a Passo pelas Ruas (Gratuito):
                </span>

                <div className="max-h-[220px] overflow-y-auto space-y-2 bg-slate-100 rounded-2xl p-3">
                  {routeData && routeData.steps.length > 0 ? (
                    routeData.steps.map((step, idx) => (
                      <div key={idx} className="py-2 px-2 flex items-start gap-3 bg-white rounded-xl shadow-xs">
                        <span className="w-6 h-6 rounded-full bg-slate-950 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-950 leading-snug">
                            {step.instruction}
                          </p>
                          <span className="text-xs font-bold text-slate-700 block mt-0.5">
                            {step.distanceMeters > 0 ? `${step.distanceMeters} metros` : ''} • {step.streetName}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-sm font-bold text-slate-600">
                      Calculando as ruas do trajeto...
                    </div>
                  )}
                </div>
              </div>

              {/* Student Details: Address, Contact, Ficha */}
              {selectedStudentMarker && (
                <div className="p-4 rounded-2xl bg-slate-100 space-y-3 shadow-xs">
                  <div>
                    <span className="text-xs font-bold text-slate-700 uppercase block">Endereço do Aluno:</span>
                    <p className="text-sm font-bold text-slate-950 mt-0.5">
                      {selectedStudentMarker.fullAddress}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-mono font-bold text-slate-700">
                        Lat: {selectedStudentMarker.lat.toFixed(5)}, Lng: {selectedStudentMarker.lng.toFixed(5)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyCoords(selectedStudentMarker.lat, selectedStudentMarker.lng)}
                        className="text-xs font-bold text-blue-800 hover:underline cursor-pointer"
                      >
                        {copiedCoords ? 'Copiado!' : 'Copiar'}
                      </button>
                    </div>
                  </div>

                  {/* Family Contact Buttons */}
                  {(() => {
                    const rawPhone =
                      selectedStudentMarker.student.telefones ||
                      selectedStudentMarker.student.guardianPhone;
                    const waList = buildWhatsAppLinksFromPhoneString(
                      rawPhone,
                      selectedStudentMarker.student.name,
                      `Olá! Somos da EMEB Prof. Joaquim Candelário de Freitas. Gostaríamos de conversar sobre o trajeto e presença escolar de ${selectedStudentMarker.student.name}.`
                    );

                    if (!rawPhone || waList.length === 0) {
                      return <span className="text-xs font-bold text-slate-600 italic">Sem telefone cadastrado</span>;
                    }

                    return (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <a
                          href={waList[0].waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 min-h-[44px] px-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs"
                        >
                          <span className="material-symbols-outlined text-[18px]">chat</span>
                          <span>WhatsApp Responsável</span>
                        </a>

                        <a
                          href={`tel:${rawPhone.replace(/\D/g, '')}`}
                          className="min-h-[44px] px-4 rounded-xl bg-white hover:bg-slate-200 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xs"
                          title="Fazer ligação"
                        >
                          <span className="material-symbols-outlined text-[18px]">call</span>
                          <span>Ligar</span>
                        </a>
                      </div>
                    );
                  })()}

                  {/* Ficha Completa and Ficha PDF buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-2">
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
                        className="min-h-[46px] px-3 rounded-xl bg-slate-950 hover:bg-black text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[18px]">open_in_full</span>
                        <span>Ficha Completa</span>
                      </button>
                    )}

                    {onOpenStudentPdf && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenStudentPdf(selectedStudentMarker.student, selectedStudentMarker.cls.name)
                        }
                        className="min-h-[46px] px-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                        <span>Abrir PDF</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Free Open Navigation Links (OpenStreetMap / Web Maps) */}
              {navUrls && (
                <div className="pt-2 space-y-2">
                  <span className="text-xs font-bold text-slate-800 block">
                    Abrir Trajeto em Aplicativos Externos (Sem API Keys):
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={navUrls.openStreetMapDirectionsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs"
                    >
                      <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                      <span>OpenStreetMap</span>
                    </a>

                    <a
                      href={navUrls.directionsToSchoolUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs"
                    >
                      <span className="material-symbols-outlined text-[16px]">navigation</span>
                      <span>Navegar no Celular</span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Empty State: Encouraging clear guidance for elderly users */
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-blue-100 text-blue-800 flex items-center justify-center mx-auto shadow-xs">
                <span className="material-symbols-outlined text-[36px]">touch_app</span>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-950">
                  Como Ver o Caminho e Distância
                </h3>
                <p className="text-sm sm:text-base font-semibold text-slate-800 mt-2 leading-relaxed">
                  1. Toque em qualquer foto de aluno no mapa à esquerda.<br />
                  2. Ou abra a lista abaixo e toque no nome do aluno desejado.<br />
                  3. O sistema calcula na hora a rota pelas ruas, tempo de caminhada, carro e ônibus, 100% grátis!
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setIsListViewOpen(true)}
                  className="w-full min-h-[50px] px-4 rounded-2xl bg-slate-950 hover:bg-black text-white text-base font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95"
                >
                  <span className="material-symbols-outlined text-[20px]">format_list_bulleted</span>
                  <span>Ver Lista com {filteredMarkers.length} Alunos</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick List Modal / Card */}
          {isListViewOpen && (
            <div className="bg-white rounded-3xl p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between pb-2">
                <span className="text-sm font-bold uppercase text-slate-950">
                  Lista de Alunos ({filteredMarkers.length})
                </span>
                <button
                  type="button"
                  onClick={() => setIsListViewOpen(false)}
                  className="p-1 rounded-xl text-slate-600 hover:text-black cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[22px]">close</span>
                </button>
              </div>

              <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
                {filteredMarkers.map((m) => {
                  const isSelected = selectedStudentMarker?.student.id === m.student.id;
                  return (
                    <div
                      key={m.student.id}
                      onClick={() => {
                        setSelectedStudentMarker(m);
                        setIsCustomPointsMode(false);
                        setActiveMobileTab('route');
                      }}
                      className={`p-3.5 rounded-2xl flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-100 text-blue-950 font-bold shadow-xs'
                          : 'bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 shrink-0 flex items-center justify-center font-bold text-xs">
                          {m.photoUrl ? (
                            <img src={m.photoUrl} alt={m.student.name} className="w-full h-full object-cover" />
                          ) : (
                            <span>{m.initials}</span>
                          )}
                        </div>
                        <div className="min-w-0 text-sm">
                          <span className="font-bold text-slate-950 block truncate">
                            {m.student.name}
                          </span>
                          <span className="text-xs font-bold text-slate-700 block truncate">
                            Turma {m.cls.name} • Nº {m.student.number}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-sm font-bold text-emerald-900 block">
                          🚶 {m.estimates.walkMinutes} min
                        </span>
                        <span className="text-xs font-bold text-slate-700 block">
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
