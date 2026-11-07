import rawStudentsJson from '../../public/assets/aistudio/lista_piloto_f00eab1e.json';
import { OFFICIAL_SCHOOL_MATRIX_2027 } from './officialMatrix2027';
import { Student } from '../types';
import { resolveStudentGender } from '../utils/genderDictionary';

export interface RawSedStudent {
  TURMA: string;
  ESTUDANTE: string;
  RA: string;
  SITUAÇÃO: string;
  'DATA MATRÍCULA': string;
  ESCOLA: string;
  'TIPO SANGUÍNEO': string;
  CPF: string;
}

/**
 * Normaliza qualquer nomenclatura de turma da SED para o ID canônico das 40 turmas da EMEB Candelário
 */
export function resolveCanonicalClassId(turmaStr: string): string {
  const t = (turmaStr || '').trim().toUpperCase();
  const isManha = t.includes('MANHA') || t.includes('MANHÃ');
  const shift = isManha ? 'MANHÃ' : 'TARDE';

  // 1. Busca exata por sedClassName
  const exact = OFFICIAL_SCHOOL_MATRIX_2027.find(
    (c) => c.sedClassName.toUpperCase() === t
  );
  if (exact) return exact.id;

  // 2. Pré-escola G4 (1ª Etapa)
  if (t.includes('1ª ETAPA') || t.includes('PRÉ-ESCOLA 4') || t.includes('G4')) {
    if (t.includes('4A') || t.includes(' A ')) return 'g04a';
    if (t.includes('4B') || t.includes(' B ')) return isManha ? 'g04b' : 'g04d';
    if (t.includes('4C') || t.includes(' C ')) return isManha ? 'g04c' : 'g04d';
    if (t.includes('4D') || t.includes(' D ')) return 'g04d';
    if (t.includes('4E') || t.includes(' E ')) return 'g04e';
    return isManha ? 'g04a' : 'g04d';
  }

  // 3. Pré-escola G5 (2ª Etapa)
  if (t.includes('2ª ETAPA') || t.includes('PRÉ-ESCOLA 5') || t.includes('G5')) {
    if (t.includes('5A') || t.includes(' A ')) return 'g05a';
    if (t.includes('5B') || t.includes(' B ')) return 'g05b';
    if (t.includes('5C') || t.includes(' C ')) return isManha ? 'g05a' : 'g05c';
    if (t.includes('5D') || t.includes(' D ')) return 'g05d';
    if (t.includes('5E') || t.includes(' E ')) return 'g05e';
    return isManha ? 'g05a' : 'g05d';
  }

  // 4. 1º Ano
  if (t.includes('1° ANO') || t.includes('1º ANO')) {
    if (t.includes('1A') || t.includes(' A ')) return isManha ? '1a' : '1d';
    if (t.includes('1B') || t.includes(' B ')) return isManha ? '1b' : '1e';
    if (t.includes('1C') || t.includes(' C ')) return isManha ? '1c' : '1f';
    if (t.includes('1D') || t.includes(' D ')) return '1d';
    if (t.includes('1E') || t.includes(' E ')) return '1e';
    if (t.includes('1F') || t.includes(' F ')) return '1f';
    return isManha ? '1a' : '1d';
  }

  // 5. 2º Ano
  if (t.includes('2° ANO') || t.includes('2º ANO')) {
    if (t.includes('2A') || t.includes(' A ')) return isManha ? '2a' : '2d';
    if (t.includes('2B') || t.includes(' B ') || t.includes('BM')) return isManha ? '2b' : '2e';
    if (t.includes('2C') || t.includes(' C ')) return isManha ? '2c' : '2f';
    if (t.includes('2D') || t.includes(' D ')) return '2d';
    if (t.includes('2E') || t.includes(' E ')) return '2e';
    if (t.includes('2F') || t.includes(' F ')) return '2f';
    return isManha ? '2a' : '2d';
  }

  // 6. 3º Ano
  if (t.includes('3° ANO') || t.includes('3º ANO')) {
    if (t.includes('3A') || t.includes(' A ')) return isManha ? '3a' : '3d';
    if (t.includes('3B') || t.includes(' B ')) return isManha ? '3b' : '3e';
    if (t.includes('3C') || t.includes(' C ')) return isManha ? '3c' : '3f';
    if (t.includes('3D') || t.includes(' D ')) return '3d';
    if (t.includes('3E') || t.includes(' E ')) return '3e';
    if (t.includes('3F') || t.includes(' F ') || t.includes('FI')) return '3f';
    if (t.includes('3G') || t.includes(' G ')) return '3f';
    return isManha ? '3a' : '3d';
  }

  // 7. 4º Ano
  if (t.includes('4° ANO') || t.includes('4º ANO')) {
    if (t.includes('4A') || t.includes(' A ')) return isManha ? '4a' : '4d';
    if (t.includes('4B') || t.includes(' B ')) return isManha ? '4b' : '4e';
    if (t.includes('4C') || t.includes(' C ')) return isManha ? '4c' : '4f';
    if (t.includes('4D') || t.includes(' D ')) return '4d';
    if (t.includes('4E') || t.includes(' E ')) return '4e';
    if (t.includes('4F') || t.includes(' F ')) return '4f';
    if (t.includes('4G') || t.includes(' G ')) return '4g';
    return isManha ? '4a' : '4d';
  }

  // 8. 5º Ano
  if (t.includes('5° ANO') || t.includes('5º ANO')) {
    if (t.includes('5A') || t.includes(' A ')) return isManha ? '5a' : '5d';
    if (t.includes('5B') || t.includes(' B ')) return isManha ? '5b' : '5e';
    if (t.includes('5C') || t.includes(' C ') || t.includes('CM')) return isManha ? '5c' : '5e';
    if (t.includes('5D') || t.includes(' D ')) return '5d';
    if (t.includes('5E') || t.includes(' E ')) return '5e';
    return isManha ? '5a' : '5d';
  }

  return '1a';
}

/**
 * Mapeia todos os 1.237 alunos oficiais fornecidos pela SED agrupados por ID canônico de turma
 */
export function buildOfficialSedStudentsMap(): Record<string, Student[]> {
  const rawList: RawSedStudent[] = rawStudentsJson as RawSedStudent[];
  const grouped: Record<string, RawSedStudent[]> = {};

  for (const item of rawList) {
    const classId = resolveCanonicalClassId(item.TURMA);
    if (!grouped[classId]) {
      grouped[classId] = [];
    }
    grouped[classId].push(item);
  }

  const result: Record<string, Student[]> = {};

  for (const matrixRow of OFFICIAL_SCHOOL_MATRIX_2027) {
    const classId = matrixRow.id;
    const rawItems = grouped[classId] || [];

    // Ordenação alfabética oficial
    const sorted = [...rawItems].sort((a, b) =>
      (a.ESTUDANTE || '').localeCompare(b.ESTUDANTE || '', 'pt-BR')
    );

    const isInfantil =
      matrixRow.turmaAbrev.startsWith('G4') || matrixRow.turmaAbrev.startsWith('G5');

    result[classId] = sorted.map((item, index) => {
      const studentName = (item.ESTUDANTE || '').trim().toUpperCase();
      const rawRa = (item.RA || '').trim();
      const cleanedRa = rawRa.replace(/\D/g, '');
      const digRa = cleanedRa.length > 0 ? cleanedRa.slice(-1) : '0';
      const cleanRaOnly = cleanedRa.length > 1 ? cleanedRa.slice(0, -1) : cleanedRa;
      const isAtivo = (item.SITUAÇÃO || '').toUpperCase() === 'ATIVO';

      return {
        id: `sed-${classId}-${cleanedRa || index + 1}`,
        number: index + 1,
        numeroChamada: index + 1,
        name: studentName,
        estudante: studentName,
        ra: cleanRaOnly || cleanedRa,
        digRa: digRa,
        ufRa: 'SP',
        dataNascimento: '01/01/2018',
        cpf: item.CPF || '',
        tipoSanguineo: item['TIPO SANGUÍNEO'] || '',
        dataMatriculaSed: item['DATA MATRÍCULA'] || '03/02/2026',
        situacao: (item.SITUAÇÃO || 'ATIVO').toUpperCase(),
        status: isAtivo ? ('present' as const) : ('absent' as const),
        turma: matrixRow.turmaAbrev,
        periodo: matrixRow.periodo,
        tipoEnsino: isInfantil ? 'EDUCACAO INFANTIL' : 'ENSINO FUNDAMENTAL',
        serie: matrixRow.name,
        classesHeld: 20,
        classesAttended: isAtivo ? 19 : 0,
        absences: isAtivo ? 1 : 20,
        totalAbsencesMonth: isAtivo ? 1 : 20,
        attendanceRate: isAtivo ? 95 : 0,
        consecutiveAbsences: 0,
        active: isAtivo,
        genero: resolveStudentGender({ name: studentName, estudante: studentName }),
        schoolDaysCount: 20,
        hasPhoto: false,
        hasScannedPdf: false,
      };
    });
  }

  return result;
}

export const OFFICIAL_SED_STUDENTS_MAP = buildOfficialSedStudentsMap();
