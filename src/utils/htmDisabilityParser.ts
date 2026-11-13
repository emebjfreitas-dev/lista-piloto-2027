import { ClassGroup, Student } from '../types';

export interface ParsedHtmDisabilityRow {
  rowKey: string;
  sourceFileName: string;
  rawName: string;
  rawRa: string;
  rawCpf: string;
  rawTurma: string;
  rawDeficiencia: string;
  normalizedDeficiencia: string;
  isClearSignal: boolean;
  matchStatus: 'matched' | 'unmatched' | 'ambiguous';
  matchConfidence: 'ra' | 'cpf' | 'name_turma' | 'name_exact' | 'none';
  matchedClassId?: string;
  matchedClassName?: string;
  matchedStudentId?: string;
  matchedStudentNumber?: number;
  matchedStudentName?: string;
  matchedStudentRa?: string;
  currentDeficiencia: string;
  willChange: boolean;
}

export interface ParsedHtmFileResult {
  fileName: string;
  detectedCharset: string;
  detectedReportTitle: string;
  detectedDisabilityHint: string;
  totalRowsExtracted: number;
  rows: ParsedHtmDisabilityRow[];
}

export function normalizeTextKey(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function normalizeDigits(value: string): string {
  return (value || '').replace(/\D/g, '');
}

const NOISE_DISABILITY_VALUES = new Set([
  '',
  '-',
  '--',
  '---',
  '.',
  '0',
  'N/A',
  'NA',
  'NAO',
  'NAO POSSUI',
  'NAO DECLARADA',
  'NAO INFORMADO',
  'NAO INFORMADA',
  'NENHUM',
  'NENHUMA',
  'NENHUMA DEFICIENCIA',
  'SEM DEFICIENCIA',
  'SEM NECESSIDADE ESPECIAL',
  'SEM NEE',
  'SEM LAUDO',
  'NORMAL',
]);

export function classifyDisabilityValue(raw: string): {
  cleanValue: string;
  isClearSignal: boolean;
} {
  const collapsed = (raw || '').replace(/\s+/g, ' ').trim();
  const normalized = normalizeTextKey(collapsed);
  if (!normalized || NOISE_DISABILITY_VALUES.has(normalized)) {
    return { cleanValue: '', isClearSignal: Boolean(normalized) };
  }
  return { cleanValue: collapsed, isClearSignal: false };
}

export async function decodeHtmBuffer(buffer: ArrayBuffer): Promise<{
  html: string;
  charset: string;
}> {
  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const metaMatch = utf8Text
    .slice(0, 4000)
    .match(/charset\s*=\s*["']?\s*([a-zA-Z0-9_-]+)/i);
  const declaredCharset = (metaMatch?.[1] || '').toLowerCase();

  const hasReplacementChars = utf8Text.includes('\uFFFD');
  if (
    hasReplacementChars ||
    declaredCharset.includes('iso-8859-1') ||
    declaredCharset.includes('windows-1252') ||
    declaredCharset.includes('latin1')
  ) {
    try {
      const win1252Text = new TextDecoder('windows-1252').decode(buffer);
      return {
        html: win1252Text,
        charset: declaredCharset || 'windows-1252 / ISO-8859-1',
      };
    } catch {
      return { html: utf8Text, charset: 'utf-8' };
    }
  }

  return { html: utf8Text, charset: declaredCharset || 'utf-8' };
}

interface ExtractedRawRecord {
  name: string;
  ra: string;
  cpf: string;
  turma: string;
  deficiencia: string;
}

type ColumnRole = 'ra' | 'digRa' | 'cpf' | 'name' | 'turma' | 'deficiencia' | 'situacao' | null;

function detectColumnRole(headerText: string): ColumnRole {
  const h = normalizeTextKey(headerText);
  if (!h) return null;

  if (h.includes('MAE') || h.includes('PAI') || h.includes('FILIACAO') || h.includes('RESPONSAVEL')) {
    return null;
  }

  if (
    h === 'RA' ||
    h === 'R.A' ||
    h === 'R.A.' ||
    h.includes('REGISTRO DO ALUNO') ||
    h.includes('REGISTRO ALUNO') ||
    h.includes('REGISTRO DO ESTUDANTE') ||
    h.includes('COD. ALUNO') ||
    h.includes('CODIGO DO ALUNO') ||
    (h.startsWith('RA ') && !h.includes('DIG'))
  ) {
    return 'ra';
  }
  if (h.includes('DIG') && h.includes('RA')) return 'digRa';
  if (h === 'DIG' || h === 'DIGITO') return 'digRa';
  if (h === 'CPF' || h.includes('CPF DO ALUNO') || h.includes('CPF ALUNO')) return 'cpf';

  if (
    h.includes('DEFICIENCIA') ||
    h.includes('NECESSIDADE') ||
    h.includes('EDUCACAO ESPECIAL') ||
    h.includes('ESPECIAL') ||
    h.includes('TRANSTORNO') ||
    h.includes('ALTAS HABILIDADES') ||
    h.includes('SUPERDOTACAO') ||
    h === 'NEE' ||
    h === 'AEE' ||
    h === 'PCD' ||
    h.includes('CID') ||
    h.includes('LAUDO') ||
    h.includes('TIPO DE DEF') ||
    h.includes('RECURSO') ||
    h.includes('ATENDIMENTO')
  ) {
    return 'deficiencia';
  }

  if (
    h === 'NOME' ||
    h === 'ALUNO' ||
    h === 'ESTUDANTE' ||
    h.includes('NOME DO ALUNO') ||
    h.includes('NOME DO ESTUDANTE') ||
    h.includes('NOME COMPLETO') ||
    h.includes('ALUNO(A)')
  ) {
    return 'name';
  }

  if (
    h === 'TURMA' ||
    h === 'CLASSE' ||
    h.includes('ANO/SERIE') ||
    h.includes('SERIE/TURMA') ||
    h.includes('NOME DA TURMA')
  ) {
    return 'turma';
  }

  if (h.includes('SITUACAO') || h.includes('STATUS')) return 'situacao';

  return null;
}

const KNOWN_DISABILITY_KEYWORDS = [
  'TRANSTORNO DO ESPECTRO AUTISTA',
  'AUTISMO',
  'TEA',
  'DEFICIENCIA INTELECTUAL',
  'DEFICIENCIA FISICA',
  'DEFICIENCIA VISUAL',
  'DEFICIENCIA AUDITIVA',
  'SURDEZ',
  'CEGUEIRA',
  'BAIXA VISAO',
  'DEFICIENCIA MULTIPLA',
  'ALTAS HABILIDADES',
  'SUPERDOTACAO',
  'SINDROME DE DOWN',
  'TDAH',
  'DISLEXIA',
  'PARALISIA CEREBRAL',
  'SURDOCEGUEIRA',
];

function detectDisabilityHintFromDoc(doc: Document): {
  title: string;
  hint: string;
} {
  const candidates = Array.from(
    doc.querySelectorAll('title, h1, h2, h3, h4, caption, .titulo, .subtitle, th, b, strong')
  )
    .slice(0, 40)
    .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length >= 3 && t.length <= 160);

  const title = candidates[0] || doc.title || '';
  let hint = '';

  for (const text of candidates) {
    const norm = normalizeTextKey(text);
    const matchedKw = KNOWN_DISABILITY_KEYWORDS.find((kw) => norm.includes(kw));
    if (matchedKw) {
      hint = text;
      break;
    }
    const labelMatch = text.match(/(?:Defici[êe]ncia|Necessidade Especial|Tipo|AEE)\s*[:\-–]\s*(.+)$/i);
    if (labelMatch?.[1]) {
      const cleaned = classifyDisabilityValue(labelMatch[1]);
      if (cleaned.cleanValue) {
        hint = cleaned.cleanValue;
        break;
      }
    }
  }

  return { title, hint };
}

function getDirectCells(tr: Element): HTMLTableCellElement[] {
  return Array.from(tr.children).filter(
    (el): el is HTMLTableCellElement => el.tagName === 'TD' || el.tagName === 'TH'
  );
}

function extractRecordsFromTables(doc: Document, fallbackHint: string): ExtractedRawRecord[] {
  const records: ExtractedRawRecord[] = [];
  const tables = Array.from(doc.querySelectorAll('table'));

  for (const table of tables) {
    // Ignora tabelas wrapper externas que contêm sub-tabelas grandes
    const rows = Array.from(table.querySelectorAll('tr')).filter(
      (tr) => tr.closest('table') === table
    );
    if (rows.length < 2) continue;

    let headerIndex = -1;
    let roleMap: ColumnRole[] = [];

    for (let i = 0; i < Math.min(rows.length, 8); i++) {
      const cells = getDirectCells(rows[i]);
      if (cells.length < 2) continue;
      const mapped = cells.map((c) => detectColumnRole(c.textContent || ''));
      const hasIdentity = mapped.includes('name') || mapped.includes('ra') || mapped.includes('cpf');
      const hasDisabilityOrExtra = mapped.includes('deficiencia') || (mapped.includes('ra') && mapped.includes('name'));
      if (hasIdentity && hasDisabilityOrExtra) {
        headerIndex = i;
        roleMap = mapped;
        break;
      }
    }

    if (headerIndex === -1) continue;

    for (let r = headerIndex + 1; r < rows.length; r++) {
      const cells = getDirectCells(rows[r]);
      if (cells.length === 0) continue;

      let name = '';
      let ra = '';
      let digRa = '';
      let cpf = '';
      let turma = '';
      let deficiencia = '';

      cells.forEach((cell, idx) => {
        const text = (cell.textContent || '').replace(/\s+/g, ' ').trim();
        const role = roleMap[idx];
        if (!role || !text) return;
        if (role === 'name' && !name) name = text;
        else if (role === 'ra' && !ra) ra = text;
        else if (role === 'digRa' && !digRa) digRa = text;
        else if (role === 'cpf' && !cpf) cpf = text;
        else if (role === 'turma' && !turma) turma = text;
        else if (role === 'deficiencia') {
          deficiencia = deficiencia ? `${deficiencia} / ${text}` : text;
        }
      });

      if (digRa && ra && !ra.includes('-')) {
        ra = `${ra}-${digRa}`;
      }

      const normName = normalizeTextKey(name);
      if (
        !name &&
        !normalizeDigits(ra) &&
        !normalizeDigits(cpf)
      ) {
        continue;
      }
      if (normName === 'NOME' || normName === 'ESTUDANTE' || normName === 'TOTAL') {
        continue;
      }

      if (!deficiencia && fallbackHint) {
        deficiencia = fallbackHint;
      }

      records.push({
        name,
        ra,
        cpf,
        turma,
        deficiencia,
      });
    }
  }

  return records;
}

function extractRecordFromKeyValueBlocks(doc: Document): ExtractedRawRecord[] {
  const candidates: ExtractedRawRecord[] = [];
  const containers = Array.from(doc.querySelectorAll('table, form, section, fieldset, div.ficha, div.card'));
  const targetRoots = containers.length > 0 ? [doc.body] : [doc.body];

  for (const root of targetRoots) {
    if (!root) continue;
    let name = '';
    let ra = '';
    let cpf = '';
    let turma = '';
    let deficiencia = '';

    const rows = Array.from(root.querySelectorAll('tr, p, li, div'));
    for (const el of rows) {
      if (el.children.length > 4) continue;
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length > 220) continue;

      const kvMatch = text.match(/^([^:]{2,55}):\s*(.+)$/);
      if (kvMatch) {
        const label = kvMatch[1];
        const value = kvMatch[2].trim();
        const role = detectColumnRole(label);
        if (role === 'name' && !name) name = value;
        else if (role === 'ra' && !ra) ra = value;
        else if (role === 'cpf' && !cpf) cpf = value;
        else if (role === 'turma' && !turma) turma = value;
        else if (role === 'deficiencia' && !deficiencia) deficiencia = value;
      } else if (el.tagName === 'TR') {
        const cells = getDirectCells(el);
        for (let i = 0; i < cells.length - 1; i += 2) {
          const role = detectColumnRole(cells[i].textContent || '');
          const value = (cells[i + 1].textContent || '').replace(/\s+/g, ' ').trim();
          if (!value) continue;
          if (role === 'name' && !name) name = value;
          else if (role === 'ra' && !ra) ra = value;
          else if (role === 'cpf' && !cpf) cpf = value;
          else if (role === 'turma' && !turma) turma = value;
          else if (role === 'deficiencia' && !deficiencia) deficiencia = value;
        }
      }
    }

    if ((name || normalizeDigits(ra) || normalizeDigits(cpf)) && deficiencia) {
      candidates.push({ name, ra, cpf, turma, deficiencia });
    }
  }

  return candidates;
}

interface StudentIndexEntry {
  cls: ClassGroup;
  student: Student;
  raDigits: string;
  raBaseDigits: string;
  raWithDigDigits: string;
  cpfDigits: string;
  normName: string;
  normClassName: string;
}

function buildStudentIndex(classes: ClassGroup[]): StudentIndexEntry[] {
  const entries: StudentIndexEntry[] = [];
  for (const cls of classes) {
    const normClassName = normalizeTextKey(`${cls.name} ${cls.turmaAbrev || ''} ${cls.turmaSedName || ''}`);
    for (const st of cls.students || []) {
      const raBaseDigits = normalizeDigits(st.ra || '');
      const digDigits = normalizeDigits(st.digRa || '');
      const raWithDigDigits = raBaseDigits && digDigits ? `${raBaseDigits}${digDigits}` : raBaseDigits;
      entries.push({
        cls,
        student: st,
        raDigits: raBaseDigits.replace(/^0+/, ''),
        raBaseDigits,
        raWithDigDigits,
        cpfDigits: normalizeDigits(st.cpf || ''),
        normName: normalizeTextKey(st.name || st.estudante || ''),
        normClassName,
      });
    }
  }
  return entries;
}

function matchRecordToStudent(
  record: ExtractedRawRecord,
  index: StudentIndexEntry[]
): {
  entry: StudentIndexEntry | null;
  status: 'matched' | 'unmatched' | 'ambiguous';
  confidence: 'ra' | 'cpf' | 'name_turma' | 'name_exact' | 'none';
} {
  const rawRaDigits = normalizeDigits(record.ra);
  const rawRaNoZero = rawRaDigits.replace(/^0+/, '');

  if (rawRaNoZero.length >= 5) {
    const raMatches = index.filter(
      (e) =>
        (e.raBaseDigits && (e.raBaseDigits === rawRaDigits || e.raDigits === rawRaNoZero)) ||
        (e.raWithDigDigits && e.raWithDigDigits === rawRaDigits)
    );
    if (raMatches.length === 1) {
      return { entry: raMatches[0], status: 'matched', confidence: 'ra' };
    }
    if (raMatches.length > 1) {
      const normRecName = normalizeTextKey(record.name);
      const exactName = raMatches.find((m) => m.normName === normRecName);
      if (exactName) return { entry: exactName, status: 'matched', confidence: 'ra' };
      return { entry: raMatches[0], status: 'matched', confidence: 'ra' };
    }
  }

  const rawCpfDigits = normalizeDigits(record.cpf);
  if (rawCpfDigits.length === 11) {
    const cpfMatches = index.filter((e) => e.cpfDigits === rawCpfDigits);
    if (cpfMatches.length === 1) {
      return { entry: cpfMatches[0], status: 'matched', confidence: 'cpf' };
    }
  }

  const normRecName = normalizeTextKey(record.name);
  if (normRecName.length >= 4) {
    const nameMatches = index.filter((e) => e.normName === normRecName);
    if (nameMatches.length === 1) {
      return { entry: nameMatches[0], status: 'matched', confidence: 'name_exact' };
    }
    if (nameMatches.length > 1) {
      const normTurma = normalizeTextKey(record.turma);
      if (normTurma) {
        const turmaMatch = nameMatches.find(
          (m) => m.normClassName.includes(normTurma) || normTurma.includes(normalizeTextKey(m.cls.name))
        );
        if (turmaMatch) {
          return { entry: turmaMatch, status: 'matched', confidence: 'name_turma' };
        }
      }
      return { entry: nameMatches[0], status: 'ambiguous', confidence: 'name_exact' };
    }
  }

  return { entry: null, status: 'unmatched', confidence: 'none' };
}

export async function parseSedHtmDisabilitiesFile(
  file: File,
  classes: ClassGroup[],
  manualFallbackDisability = ''
): Promise<ParsedHtmFileResult> {
  const buffer = await file.arrayBuffer();
  const { html, charset } = await decodeHtmBuffer(buffer);
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const { title, hint } = detectDisabilityHintFromDoc(doc);
  const effectiveHint = manualFallbackDisability.trim() || hint;

  let extracted = extractRecordsFromTables(doc, effectiveHint);
  if (extracted.length === 0) {
    extracted = extractRecordFromKeyValueBlocks(doc);
  }

  const studentIndex = buildStudentIndex(classes);

  const rows: ParsedHtmDisabilityRow[] = extracted.map((rec, idx) => {
    const matched = matchRecordToStudent(rec, studentIndex);
    const classified = classifyDisabilityValue(rec.deficiencia);
    const currentDeficiencia = (matched.entry?.student.deficiencia || '').trim();
    const targetValue = classified.cleanValue;
    const willChange =
      matched.status === 'matched' &&
      ((targetValue !== '' && targetValue.toUpperCase() !== currentDeficiencia.toUpperCase()) ||
        (classified.isClearSignal && currentDeficiencia !== ''));

    return {
      rowKey: `${file.name}-${idx}-${rec.ra || rec.name}`,
      sourceFileName: file.name,
      rawName: rec.name || matched.entry?.student.name || '—',
      rawRa: rec.ra || (matched.entry ? `${matched.entry.student.ra}-${matched.entry.student.digRa}` : '—'),
      rawCpf: rec.cpf || '',
      rawTurma: rec.turma || matched.entry?.cls.name || '—',
      rawDeficiencia: rec.deficiencia || '',
      normalizedDeficiencia: targetValue,
      isClearSignal: classified.isClearSignal,
      matchStatus: matched.status,
      matchConfidence: matched.confidence,
      matchedClassId: matched.entry?.cls.id,
      matchedClassName: matched.entry?.cls.name,
      matchedStudentId: matched.entry?.student.id,
      matchedStudentNumber: matched.entry?.student.number,
      matchedStudentName: matched.entry?.student.name,
      matchedStudentRa: matched.entry
        ? `${matched.entry.student.ra}${matched.entry.student.digRa ? `-${matched.entry.student.digRa}` : ''}`
        : undefined,
      currentDeficiencia,
      willChange,
    };
  });

  return {
    fileName: file.name,
    detectedCharset: charset,
    detectedReportTitle: title,
    detectedDisabilityHint: hint,
    totalRowsExtracted: rows.length,
    rows,
  };
}
