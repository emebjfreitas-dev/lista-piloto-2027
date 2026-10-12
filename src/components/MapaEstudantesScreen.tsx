import React, { useState, useMemo } from 'react';
import { ClassGroup, Student, UserRole } from '../types';
import {
  CANDELARIO_SCHOOL_LOCATION,
  resolveStudentCoordinates,
  calculateTravelEstimates,
  buildGoogleMapsNavigationUrls,
  RouteTravelEstimates,
} from '../utils/geoRouting';
import { getStudentGenderLabel, resolveGuardianRelationshipInfo } from '../utils/genderDictionary';
import { StudentAvatar } from './StudentAvatar';

interface MapaEstudantesScreenProps {
  classes: ClassGroup[];
  userRole?: UserRole;
  selectedClassId?: string;
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
}

export const MapaEstudantesScreen: React.FC<MapaEstudantesScreenProps> = ({
  classes,
  userRole = 'admin',
  selectedClassId,
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
  const [mapZoom, setMapZoom] = useState<number>(14);
  const [showSchoolRadiusCircle, setShowSchoolRadiusCircle] = useState(true);

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

        list.push({
          student,
          cls,
          lat: coords.lat,
          lng: coords.lng,
          fullAddress: coords.fullAddress,
          estimates,
          guardianInfo,
          genderInfo,
        });
      });
    });

    return list;
  }, [classes]);

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
        return matchName || matchBairro || matchLogradouro || matchRota || matchTurma;
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

  // SVG interactive coordinate projection
  // School is at the center: (-23.16781, -46.89922)
  // Bounding box around Jundiaí northern sector (~6km width, ~6km height)
  const mapCenter = useMemo(() => {
    if (selectedStudentMarker) {
      return {
        lat: (CANDELARIO_SCHOOL_LOCATION.lat + selectedStudentMarker.lat) / 2,
        lng: (CANDELARIO_SCHOOL_LOCATION.lng + selectedStudentMarker.lng) / 2,
      };
    }
    return {
      lat: CANDELARIO_SCHOOL_LOCATION.lat,
      lng: CANDELARIO_SCHOOL_LOCATION.lng,
    };
  }, [selectedStudentMarker]);

  const projectToSvg = (lat: number, lng: number) => {
    // Map width 1000, height 700
    // Zoom factor scaling
    const scale = (mapZoom / 14) * 14000;
    const x = 500 + (lng - mapCenter.lng) * scale;
    // Invert Y axis because SVG y goes down
    const y = 350 - (lat - mapCenter.lat) * scale;
    return { x, y };
  };

  const schoolSvg = projectToSvg(CANDELARIO_SCHOOL_LOCATION.lat, CANDELARIO_SCHOOL_LOCATION.lng);

  return (
    <div className="space-y-4 pb-20 animate-gentle-fade max-w-[1600px] mx-auto px-2 sm:px-4 lg:px-6">
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
                  {stats.total} estudantes mapeados
                </span>
              </div>
              <h1 className="text-[1.35rem] sm:text-[1.6rem] font-black text-[#1d1d1f] tracking-tight leading-tight mt-0.5">
                Pontos de Endereço &amp; Tempo de Percurso até a EMEB Candelário
              </h1>
              <p className="text-[0.82rem] text-[#6e6e73] mt-0.5">
                Cálculo de km rodado, tempo a pé, de carro e ônibus escolar para cada estudante em relação à escola.
              </p>
            </div>
          </div>

          {/* Quick Actions: Open School on Google Maps */}
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                'EMEB Professor Joaquim Candelário de Freitas, Vila Hortolândia, Jundiaí'
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-[38px] px-3.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white text-[0.76rem] font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-97 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[17px]">location_on</span>
              <span>Abrir Escola no Google Maps</span>
              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
            </a>
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
            <span className="text-[0.68rem] text-[#6e6e73] block mt-0.5">Trajeto urbano</span>
          </div>

          <div className="rounded-2xl bg-[#f5f5f7] p-3 border border-black/[0.04]">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#86868b] block">
              Tempo Médio a Pé
            </span>
            <span className="text-[1.35rem] font-black text-[#0071e3] tabular-nums leading-tight">
              {stats.avgWalkMinutes} <span className="text-[0.8rem] font-semibold text-[#6e6e73]">min</span>
            </span>
            <span className="text-[0.68rem] text-[#6e6e73] block mt-0.5">Caminhada diária</span>
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
            <span className="text-[0.68rem] text-[#b25000] font-bold block mt-0.5">Prioritários</span>
          </div>

          <div className="rounded-2xl bg-[#f5f5f7] p-3 border border-black/[0.04]">
            <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#86868b] block">
              Transporte Escolar
            </span>
            <span className="text-[1.35rem] font-black text-[#5856d6] tabular-nums leading-tight">
              {stats.comTransporteEscolar}
            </span>
            <span className="text-[0.68rem] text-[#4f46e5] font-bold block mt-0.5">Rotas de Ônibus</span>
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
              placeholder="Buscar por estudante, rua ou bairro..."
              className="w-full h-10 pl-9 pr-3 rounded-2xl bg-[#f5f5f7] text-[0.82rem] font-semibold text-[#1d1d1f] placeholder:text-[#86868b] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30"
            />
          </div>

          {/* Filter by Class */}
          <div>
            <select
              value={filterClassId}
              onChange={(e) => setFilterClassId(e.target.value)}
              className="w-full h-10 px-3 rounded-2xl bg-[#f5f5f7] text-[0.82rem] font-semibold text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30"
            >
              <option value="all">Todas as 40 Turmas</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.shift.replace('Turno ', '')})
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Shift */}
          <div>
            <select
              value={filterShift}
              onChange={(e) => setFilterShift(e.target.value as any)}
              className="w-full h-10 px-3 rounded-2xl bg-[#f5f5f7] text-[0.82rem] font-semibold text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30"
            >
              <option value="all">Turno (Manhã e Tarde)</option>
              <option value="MANHÃ">Manhã</option>
              <option value="TARDE">Tarde</option>
            </select>
          </div>

          {/* Filter by Distance Tier */}
          <div>
            <select
              value={filterDistanceTier}
              onChange={(e) => setFilterDistanceTier(e.target.value as any)}
              className="w-full h-10 px-3 rounded-2xl bg-[#f5f5f7] text-[0.82rem] font-semibold text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30"
            >
              <option value="all">Todas as Distâncias</option>
              <option value="perto">&lt; 1.0 km (Raio Escolar)</option>
              <option value="medio">1.0 a 2.0 km (Médio)</option>
              <option value="distante">2.0 a 3.5 km (Distante)</option>
              <option value="muito_distante">&gt; 3.5 km (Muito Distante)</option>
            </select>
          </div>

          {/* Filter by Bus Route */}
          <div>
            <select
              value={filterTransporte}
              onChange={(e) => setFilterTransporte(e.target.value as any)}
              className="w-full h-10 px-3 rounded-2xl bg-[#f5f5f7] text-[0.82rem] font-semibold text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30"
            >
              <option value="all">Transporte Escolar (Todos)</option>
              <option value="com_onibus">Com Rota de Ônibus</option>
              <option value="sem_onibus">Sem Rota de Ônibus</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Grid: Interactive Geographic Map Canvas + Detail Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left/Main Column: Visual Geographic Map Container */}
        <div className="lg:col-span-8 bg-white rounded-3xl p-4 sm:p-5 border border-black/[0.06] shadow-xs flex flex-col space-y-3 min-h-[560px]">
          {/* Map Header Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#0071e3] animate-pulse" />
              <span className="text-[0.78rem] font-bold text-[#1d1d1f]">
                Centro: EMEB Joaquim Candelário de Freitas (Vila Hortolândia)
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowSchoolRadiusCircle(!showSchoolRadiusCircle)}
                className={`h-7 px-2.5 rounded-full text-[0.7rem] font-bold transition-colors cursor-pointer ${
                  showSchoolRadiusCircle
                    ? 'bg-[#0071e3]/10 text-[#0071e3]'
                    : 'bg-[#f5f5f7] text-[#6e6e73]'
                }`}
              >
                {showSchoolRadiusCircle ? 'Raios 1km & 2km: Ativos' : 'Mostrar Raios'}
              </button>

              <div className="flex items-center bg-[#f5f5f7] rounded-full p-0.5">
                <button
                  type="button"
                  onClick={() => setMapZoom(Math.max(11, mapZoom - 1))}
                  title="Diminuir zoom"
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[#1d1d1f] hover:bg-white cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">remove</span>
                </button>
                <span className="text-[0.7rem] font-bold px-2 tabular-nums">{mapZoom}x</span>
                <button
                  type="button"
                  onClick={() => setMapZoom(Math.min(18, mapZoom + 1))}
                  title="Aumentar zoom"
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[#1d1d1f] hover:bg-white cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                </button>
              </div>

              {selectedStudentMarker && (
                <button
                  type="button"
                  onClick={() => setSelectedStudentMarker(null)}
                  className="h-7 px-2.5 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#6e6e73] text-[0.7rem] font-bold cursor-pointer"
                >
                  Resetar Foco
                </button>
              )}
            </div>
          </div>

          {/* SVG Map Canvas with School and Student Pins */}
          <div className="relative w-full h-[500px] sm:h-[580px] bg-[#f8f9fa] rounded-2xl overflow-hidden border border-black/[0.04] select-none">
            {/* Background Map Grid & Roads Styling */}
            <svg
              className="w-full h-full cursor-grab active:cursor-grabbing"
              viewBox="0 0 1000 700"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                {/* School Gradient Pin */}
                <linearGradient id="schoolGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#0071e3" />
                  <stop offset="100%" stopColor="#003d80" />
                </linearGradient>
                {/* Student Pin Gradients */}
                <radialGradient id="radiusGrad1km" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#0071e3" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#0071e3" stopOpacity="0.01" />
                </radialGradient>
              </defs>

              {/* Grid Lines for reference */}
              <g stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3 3">
                <line x1="0" y1="175" x2="1000" y2="175" />
                <line x1="0" y1="350" x2="1000" y2="350" />
                <line x1="0" y1="525" x2="1000" y2="525" />
                <line x1="250" y1="0" x2="250" y2="700" />
                <line x1="500" y1="0" x2="500" y2="700" />
                <line x1="750" y1="0" x2="750" y2="700" />
              </g>

              {/* Simulated Primary Arteries & Avenidas of Northern Jundiaí */}
              <g stroke="#d1d5db" strokeWidth="4" strokeLinecap="round" opacity="0.65">
                {/* Av. Prefeito Luiz Latorre / Rio Jundiaí axis */}
                <path d="M 120 620 Q 380 480 620 380 T 920 180" fill="none" stroke="#93c5fd" strokeWidth="6" />
                {/* Av. Itatiba / Rod. Vereador Geraldo Dias */}
                <path d="M 480 50 Q 510 320 540 650" fill="none" stroke="#cbd5e1" strokeWidth="5" />
                {/* Rod. João Cereser */}
                <path d="M 80 180 Q 450 200 950 140" fill="none" stroke="#fcd34d" strokeWidth="4" />
                {/* Rua Joaquim Candelário de Freitas */}
                <path d="M 420 330 L 590 370" fill="none" stroke="#0071e3" strokeWidth="3" />
              </g>

              {/* School Distance Circles (1km & 2km radius around EMEB Candelário) */}
              {showSchoolRadiusCircle && (
                <g>
                  {/* 1km Radius Circle (~110 SVG units at default zoom) */}
                  <circle
                    cx={schoolSvg.x}
                    cy={schoolSvg.y}
                    r={110 * (mapZoom / 14)}
                    fill="url(#radiusGrad1km)"
                    stroke="#0071e3"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    opacity="0.8"
                  />
                  <text
                    x={schoolSvg.x}
                    y={schoolSvg.y - 110 * (mapZoom / 14) - 4}
                    textAnchor="middle"
                    fill="#0071e3"
                    fontSize="11"
                    fontWeight="bold"
                  >
                    Raio 1.0 km (Caminhada rápida)
                  </text>

                  {/* 2km Radius Circle */}
                  <circle
                    cx={schoolSvg.x}
                    cy={schoolSvg.y}
                    r={220 * (mapZoom / 14)}
                    fill="none"
                    stroke="#ff9500"
                    strokeWidth="1.2"
                    strokeDasharray="6 6"
                    opacity="0.6"
                  />
                  <text
                    x={schoolSvg.x}
                    y={schoolSvg.y - 220 * (mapZoom / 14) - 4}
                    textAnchor="middle"
                    fill="#b25000"
                    fontSize="11"
                    fontWeight="bold"
                  >
                    Raio 2.0 km (Transporte recomendado)
                  </text>
                </g>
              )}

              {/* Trajectory Route Line to Selected Student */}
              {selectedStudentMarker && (() => {
                const sPos = projectToSvg(selectedStudentMarker.lat, selectedStudentMarker.lng);
                return (
                  <g>
                    <line
                      x1={schoolSvg.x}
                      y1={schoolSvg.y}
                      x2={sPos.x}
                      y2={sPos.y}
                      stroke="#0071e3"
                      strokeWidth="3.5"
                      strokeDasharray="6 4"
                      className="animate-pulse"
                    />
                    {/* Distance Pill in the middle of line */}
                    <rect
                      x={(schoolSvg.x + sPos.x) / 2 - 42}
                      y={(schoolSvg.y + sPos.y) / 2 - 14}
                      width="84"
                      height="24"
                      rx="12"
                      fill="#1d1d1f"
                      opacity="0.92"
                    />
                    <text
                      x={(schoolSvg.x + sPos.x) / 2}
                      y={(schoolSvg.y + sPos.y) / 2 + 2}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="11"
                      fontWeight="bold"
                    >
                      {selectedStudentMarker.estimates.distanceRoadKm} km
                    </text>
                  </g>
                );
              })()}

              {/* Student Markers Pins */}
              {filteredMarkers.map((marker) => {
                const pos = projectToSvg(marker.lat, marker.lng);
                const isSelected = selectedStudentMarker?.student.id === marker.student.id;
                const hasBus = Boolean(marker.student.rotaOnibus);

                let pinColor = '#34c759'; // perto
                if (marker.estimates.routeTier === 'muito_distante') pinColor = '#ff3b30';
                else if (marker.estimates.routeTier === 'distante') pinColor = '#ff9500';
                else if (marker.estimates.routeTier === 'medio') pinColor = '#0071e3';

                return (
                  <g
                    key={marker.student.id}
                    onClick={() => setSelectedStudentMarker(marker)}
                    className="cursor-pointer transition-transform"
                    style={{ transformOrigin: `${pos.x}px ${pos.y}px` }}
                  >
                    {/* Outer Glow when selected */}
                    {isSelected && (
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r="18"
                        fill={pinColor}
                        opacity="0.3"
                        className="animate-ping"
                      />
                    )}

                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={isSelected ? '10' : hasBus ? '6.5' : '5'}
                      fill={pinColor}
                      stroke="#ffffff"
                      strokeWidth={isSelected ? '3' : '1.5'}
                    />

                    {/* Small inner dot if student has bus route */}
                    {hasBus && !isSelected && (
                      <circle cx={pos.x} cy={pos.y} r="2" fill="#ffffff" />
                    )}
                  </g>
                );
              })}

              {/* Central Pin: EMEB Joaquim Candelário de Freitas */}
              <g transform={`translate(${schoolSvg.x}, ${schoolSvg.y})`} className="cursor-pointer">
                {/* Pulsing ring */}
                <circle cx="0" cy="0" r="22" fill="#0071e3" opacity="0.25" className="animate-ping" />
                <circle cx="0" cy="0" r="14" fill="url(#schoolGrad)" stroke="#ffffff" strokeWidth="3" />
                {/* School Flag Icon */}
                <text
                  x="0"
                  y="4"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="10"
                  fontWeight="bold"
                >
                  ★
                </text>
                {/* School Label */}
                <rect
                  x="-90"
                  y="-34"
                  width="180"
                  height="22"
                  rx="6"
                  fill="#1d1d1f"
                  opacity="0.92"
                />
                <text
                  x="0"
                  y="-19"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="10.5"
                  fontWeight="bold"
                >
                  EMEB Joaquim Candelário
                </text>
              </g>
            </svg>

            {/* Floating Map Legend (iOS Style) */}
            <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-md rounded-2xl p-2.5 sm:p-3 border border-black/[0.08] shadow-md text-[0.72rem] space-y-1.5 max-w-[280px]">
              <span className="font-extrabold text-[#1d1d1f] block text-[0.7rem] uppercase tracking-wider">
                Legenda de Distância até a Escola:
              </span>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#34c759] shrink-0" />
                <span className="text-[#6e6e73]">&lt; 1.0 km (Caminhada rápida)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0071e3] shrink-0" />
                <span className="text-[#6e6e73]">1.0 a 2.0 km (Distância Média)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff9500] shrink-0" />
                <span className="text-[#6e6e73]">2.0 a 3.5 km (Rota Transporte)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff3b30] shrink-0" />
                <span className="text-[#6e6e73]">&gt; 3.5 km (Prioridade Ônibus)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Selected Student Detail Drawer & Percurso Estimates */}
        <div className="lg:col-span-4 space-y-4">
          {selectedStudentMarker ? (
            <div className="bg-white rounded-3xl p-5 border border-black/[0.06] shadow-xs space-y-4 animate-gentle-fade">
              {/* Header with Photo & Name */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <StudentAvatar
                    photo={selectedStudentMarker.student.photo}
                    name={selectedStudentMarker.student.name}
                    initials={selectedStudentMarker.student.initials}
                    size="lg"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[0.68rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#0071e3]/10 text-[#0071e3]">
                        {selectedStudentMarker.cls.name} · Nº {selectedStudentMarker.student.number}
                      </span>
                      <span className="text-[0.68rem] font-semibold text-[#86868b]">
                        RA {selectedStudentMarker.student.ra}-{selectedStudentMarker.student.digRa}
                      </span>
                    </div>
                    <h2 className="text-[1.05rem] font-bold text-[#1d1d1f] leading-snug mt-0.5">
                      {selectedStudentMarker.student.name}
                    </h2>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedStudentMarker(null)}
                  className="w-8 h-8 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#6e6e73] flex items-center justify-center cursor-pointer"
                  title="Fechar detalhes"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Box dos Dados de KM e Tempo de Percurso */}
              <div className="p-4 rounded-2xl bg-[#f5f5f7] space-y-3">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[0.7rem] font-black uppercase tracking-wider text-[#0071e3] flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">route</span>
                    <span>Percurso até a EMEB Candelário</span>
                  </span>
                  <span className="text-[0.72rem] font-extrabold text-[#1d1d1f] bg-white px-2 py-0.5 rounded-full shadow-2xs">
                    {selectedStudentMarker.estimates.distanceRoadKm} km
                  </span>
                </div>

                {/* 3 Travel Modes (A Pé, Carro, Ônibus) */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white rounded-xl p-2.5 text-center shadow-2xs">
                    <span className="material-symbols-outlined text-[20px] text-[#0071e3] block mx-auto">
                      directions_walk
                    </span>
                    <span className="text-[1.1rem] font-black text-[#1d1d1f] block leading-tight mt-0.5">
                      {selectedStudentMarker.estimates.walkMinutes}
                    </span>
                    <span className="text-[0.64rem] font-semibold text-[#6e6e73] block">minutos a pé</span>
                  </div>

                  <div className="bg-white rounded-xl p-2.5 text-center shadow-2xs">
                    <span className="material-symbols-outlined text-[20px] text-[#34c759] block mx-auto">
                      directions_car
                    </span>
                    <span className="text-[1.1rem] font-black text-[#1d1d1f] block leading-tight mt-0.5">
                      {selectedStudentMarker.estimates.carMinutes}
                    </span>
                    <span className="text-[0.64rem] font-semibold text-[#6e6e73] block">min de carro</span>
                  </div>

                  <div className="bg-white rounded-xl p-2.5 text-center shadow-2xs">
                    <span className="material-symbols-outlined text-[20px] text-[#5856d6] block mx-auto">
                      directions_bus
                    </span>
                    <span className="text-[1.1rem] font-black text-[#1d1d1f] block leading-tight mt-0.5">
                      {selectedStudentMarker.estimates.busMinutes}
                    </span>
                    <span className="text-[0.64rem] font-semibold text-[#6e6e73] block">min de ônibus</span>
                  </div>
                </div>

                <div className="text-[0.72rem] text-[#6e6e73] flex items-center gap-1.5 pt-0.5">
                  <span className="material-symbols-outlined text-[15px] text-[#0071e3]">info</span>
                  <span>{selectedStudentMarker.estimates.routeTierLabel}</span>
                </div>
              </div>

              {/* Endereço Completo do Estudante */}
              <div className="p-3.5 rounded-2xl bg-white border border-black/[0.06] space-y-1">
                <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#86868b] block">
                  Endereço Residencial Cadastrado (SED)
                </span>
                <p className="text-[0.82rem] font-semibold text-[#1d1d1f] leading-snug">
                  {selectedStudentMarker.fullAddress}
                </p>
                {selectedStudentMarker.student.cep && (
                  <span className="text-[0.72rem] text-[#6e6e73] block">
                    CEP: {selectedStudentMarker.student.cep}
                  </span>
                )}
              </div>

              {/* Status de Rota de Ônibus Escolar */}
              {selectedStudentMarker.student.rotaOnibus ? (
                <div className="p-3 rounded-2xl bg-[#eaf6ef] border border-[#005035]/15 space-y-1">
                  <span className="text-[0.66rem] font-bold uppercase tracking-wider text-[#005035] flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px]">directions_bus</span>
                    <span>Transporte Escolar Ativo</span>
                  </span>
                  <p className="text-[0.76rem] font-bold text-[#005035] leading-snug">
                    {selectedStudentMarker.student.rotaOnibus}
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-[#f5f5f7] text-[0.74rem] text-[#6e6e73] flex items-center justify-between">
                  <span>Sem rota de ônibus atribuída</span>
                  {selectedStudentMarker.estimates.distanceRoadKm >= 2.0 && (
                    <span className="text-[0.68rem] font-bold text-[#ff9500]">
                      Elegível para transporte
                    </span>
                  )}
                </div>
              )}

              {/* Responsável Familiar & WhatsApp */}
              <div className="p-3.5 rounded-2xl bg-[#f5f5f7] space-y-2">
                <div className="flex items-center justify-between gap-1 text-[0.7rem] text-[#6e6e73]">
                  <span className="font-semibold">Responsável Principal:</span>
                  <span className="px-2 py-0.5 rounded-md bg-white text-[#1d1d1f] font-bold text-[0.68rem]">
                    {selectedStudentMarker.guardianInfo.roleLabel}
                  </span>
                </div>
                <p className="text-[0.82rem] font-bold text-[#1d1d1f] truncate">
                  {selectedStudentMarker.guardianInfo.cleanName}
                </p>
                {selectedStudentMarker.student.telefones && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[0.74rem] font-mono text-[#6e6e73]">
                      {selectedStudentMarker.student.telefones}
                    </span>
                    <a
                      href={`https://wa.me/55${selectedStudentMarker.student.telefones.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-7 px-2.5 rounded-full bg-[#25d366] hover:bg-[#20ba5a] text-white text-[0.68rem] font-bold flex items-center gap-1 shadow-2xs"
                    >
                      <span>WhatsApp</span>
                      <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                    </a>
                  </div>
                )}
              </div>

              {/* Botões de Ação Direta no Google Maps e na Ficha Escolar */}
              {(() => {
                const navUrls = buildGoogleMapsNavigationUrls(
                  selectedStudentMarker.lat,
                  selectedStudentMarker.lng,
                  selectedStudentMarker.fullAddress
                );
                return (
                  <div className="space-y-2 pt-1">
                    <a
                      href={navUrls.directionsFromSchoolUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full h-10 px-4 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white text-[0.78rem] font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-97 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">directions</span>
                      <span>Traçar Rota no Google Maps</span>
                      <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                    </a>

                    <div className="grid grid-cols-2 gap-2">
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
                          className="h-9 px-2 rounded-xl bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] text-[0.73rem] font-bold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">id_card</span>
                          <span>Ficha Completa</span>
                        </button>
                      )}

                      {onOpenStudentPdf && selectedStudentMarker.student.fichaPdfDriveUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenStudentPdf(
                              selectedStudentMarker.student,
                              selectedStudentMarker.cls.name
                            )
                          }
                          className="h-9 px-2 rounded-xl bg-[#fff2f2] hover:bg-[#ffe5e5] text-[#ff3b30] text-[0.73rem] font-bold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                          <span>Ficha PDF</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            /* Empty State Drawer: Instructs to click any marker */
            <div className="bg-white rounded-3xl p-6 border border-black/[0.06] shadow-xs text-center space-y-3 flex flex-col items-center justify-center min-h-[320px]">
              <div className="w-14 h-14 rounded-2xl bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center">
                <span className="material-symbols-outlined text-[30px]">pin_drop</span>
              </div>
              <h3 className="text-[1.05rem] font-bold text-[#1d1d1f]">
                Selecione um Estudante no Mapa
              </h3>
              <p className="text-[0.78rem] text-[#6e6e73] max-w-xs leading-relaxed">
                Clique em qualquer ponto colorido no mapa ou na lista abaixo para visualizar os dados de distância em km, tempos de trajeto a pé, carro e ônibus até a EMEB Joaquim Candelário de Freitas.
              </p>
            </div>
          )}

          {/* Quick List of Closest / Furthest Students in Filtered Selection */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-black/[0.06] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[0.74rem] font-extrabold uppercase tracking-wider text-[#1d1d1f]">
                Estudantes no Filtro ({filteredMarkers.length})
              </span>
              <span className="text-[0.68rem] text-[#86868b]">Mais distantes primeiro</span>
            </div>

            <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
              {[...filteredMarkers]
                .sort((a, b) => b.estimates.distanceRoadKm - a.estimates.distanceRoadKm)
                .slice(0, 15)
                .map((m) => {
                  const isSelected = selectedStudentMarker?.student.id === m.student.id;
                  return (
                    <div
                      key={m.student.id}
                      onClick={() => setSelectedStudentMarker(m)}
                      className={`p-2.5 rounded-2xl flex items-center justify-between gap-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#0071e3]/10 border border-[#0071e3]/30'
                          : 'bg-[#f5f5f7] hover:bg-[#e8e8ed]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[0.68rem] text-[#6e6e73]">
                          <span className="font-bold text-[#1d1d1f]">{m.cls.name}</span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{m.student.bairro || 'Jundiaí'}</span>
                        </div>
                        <p className="text-[0.78rem] font-bold text-[#1d1d1f] truncate">
                          {m.student.name}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[0.8rem] font-black text-[#1d1d1f] tabular-nums block">
                          {m.estimates.distanceRoadKm} km
                        </span>
                        <span className="text-[0.66rem] font-semibold text-[#0071e3] block">
                          {m.estimates.walkMinutes} min a pé
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
