import { Student } from '../types';

export type GenderCode = 'M' | 'F';

export interface NameGenderEntry {
  name: string;
  gender: GenderCode;
  relationshipHint?: string;
}

export const GENDER_DICTIONARY_STORAGE_KEY =
  'emeb_candelario_consulta_genero_nomes_2027';

export const GENDER_SHEET_TAB_NAME = 'Consulta_Genero_Nomes_2027';

export const INITIAL_NAME_GENDER_ENTRIES: NameGenderEntry[] = [
  // Nomes Femininos Comuns (Estudantes, Mães, Tias, Avós, Educadoras)
  { name: 'ALICE', gender: 'F' },
  { name: 'HELENA', gender: 'F' },
  { name: 'LAURA', gender: 'F' },
  { name: 'MARIA', gender: 'F' },
  { name: 'MARIA ALICE', gender: 'F' },
  { name: 'MARIA CECILIA', gender: 'F' },
  { name: 'MARIA CLARA', gender: 'F' },
  { name: 'MARIA EDUARDA', gender: 'F' },
  { name: 'MARIA FERNANDA', gender: 'F' },
  { name: 'MARIA JULIA', gender: 'F' },
  { name: 'MARIA LUIZA', gender: 'F' },
  { name: 'MARIA VITORIA', gender: 'F' },
  { name: 'MAITE', gender: 'F' },
  { name: 'MANUELA', gender: 'F' },
  { name: 'SOPHIA', gender: 'F' },
  { name: 'SOFIA', gender: 'F' },
  { name: 'CECILIA', gender: 'F' },
  { name: 'ISABELLA', gender: 'F' },
  { name: 'ISABELA', gender: 'F' },
  { name: 'LUIZA', gender: 'F' },
  { name: 'ELOAH', gender: 'F' },
  { name: 'ELOA', gender: 'F' },
  { name: 'HELOISA', gender: 'F' },
  { name: 'JULIA', gender: 'F' },
  { name: 'VALENTINA', gender: 'F' },
  { name: 'LIVIA', gender: 'F' },
  { name: 'ANTONELA', gender: 'F' },
  { name: 'ANTONELLA', gender: 'F' },
  { name: 'LORENA', gender: 'F' },
  { name: 'MELISSA', gender: 'F' },
  { name: 'YASMIN', gender: 'F' },
  { name: 'IASMIN', gender: 'F' },
  { name: 'BEATRIZ', gender: 'F' },
  { name: 'REBECA', gender: 'F' },
  { name: 'REBECCA', gender: 'F' },
  { name: 'ESTHER', gender: 'F' },
  { name: 'ESTER', gender: 'F' },
  { name: 'SARAH', gender: 'F' },
  { name: 'SARA', gender: 'F' },
  { name: 'ANA', gender: 'F' },
  { name: 'ANA CLARA', gender: 'F' },
  { name: 'ANA JULIA', gender: 'F' },
  { name: 'ANA LAURA', gender: 'F' },
  { name: 'ANA LUIZA', gender: 'F' },
  { name: 'ANA BEATRIZ', gender: 'F' },
  { name: 'ANA PAULA', gender: 'F' },
  { name: 'GABRIELA', gender: 'F' },
  { name: 'RAFAELA', gender: 'F' },
  { name: 'RAUANNY', gender: 'F' },
  { name: 'LARISSA', gender: 'F' },
  { name: 'LETICIA', gender: 'F' },
  { name: 'NICOLE', gender: 'F' },
  { name: 'EMANUELLY', gender: 'F' },
  { name: 'EMANUELA', gender: 'F' },
  { name: 'VITORIA', gender: 'F' },
  { name: 'ISADORA', gender: 'F' },
  { name: 'MARIANA', gender: 'F' },
  { name: 'CAMILA', gender: 'F' },
  { name: 'AMANDA', gender: 'F' },
  { name: 'BRUNA', gender: 'F' },
  { name: 'FERNANDA', gender: 'F' },
  { name: 'PATRICIA', gender: 'F' },
  { name: 'ADRIANA', gender: 'F' },
  { name: 'JULIANA', gender: 'F' },
  { name: 'LUCIANA', gender: 'F' },
  { name: 'VANESSA', gender: 'F' },
  { name: 'TATIANE', gender: 'F' },
  { name: 'TATIANA', gender: 'F' },
  { name: 'CRISTIANE', gender: 'F' },
  { name: 'SIMONE', gender: 'F' },
  { name: 'ELIANE', gender: 'F' },
  { name: 'ROSANGELA', gender: 'F' },
  { name: 'APARECIDA', gender: 'F' },
  { name: 'SANDRA', gender: 'F' },
  { name: 'CLAUDIA', gender: 'F' },
  { name: 'MARCIA', gender: 'F' },
  { name: 'SONIA', gender: 'F' },
  { name: 'SOLANGE', gender: 'F' },
  { name: 'RENATA', gender: 'F' },
  { name: 'DANIELA', gender: 'F' },
  { name: 'DANIELE', gender: 'F' },
  { name: 'PRISCILA', gender: 'F' },
  { name: 'CARLA', gender: 'F' },
  { name: 'PAULA', gender: 'F' },
  { name: 'ALINE', gender: 'F' },
  { name: 'JESSICA', gender: 'F' },
  { name: 'JAQUELINE', gender: 'F' },
  { name: 'DAIANE', gender: 'F' },
  { name: 'DEBORA', gender: 'F' },
  { name: 'RAQUEL', gender: 'F' },
  { name: 'RUTE', gender: 'F' },
  { name: 'NOEMI', gender: 'F' },
  { name: 'TALITA', gender: 'F' },
  { name: 'THAIS', gender: 'F' },
  { name: 'TAINARA', gender: 'F' },
  { name: 'SABRINA', gender: 'F' },
  { name: 'BIANCA', gender: 'F' },
  { name: 'CAROLINA', gender: 'F' },
  { name: 'CAROLINE', gender: 'F' },
  { name: 'NATALIA', gender: 'F' },
  { name: 'NATHALIA', gender: 'F' },
  { name: 'MILENA', gender: 'F' },
  { name: 'MIRELLA', gender: 'F' },
  { name: 'MIRELA', gender: 'F' },
  { name: 'STELLA', gender: 'F' },
  { name: 'LUNA', gender: 'F' },
  { name: 'MAYA', gender: 'F' },
  { name: 'AYLA', gender: 'F' },
  { name: 'AURORA', gender: 'F' },
  { name: 'IRIS', gender: 'F' },
  { name: 'INES', gender: 'F' },
  { name: 'LURDES', gender: 'F' },
  { name: 'LOURDES', gender: 'F' },
  { name: 'FATIMA', gender: 'F' },
  { name: 'CONCEICAO', gender: 'F' },
  { name: 'SOCORRO', gender: 'F' },
  { name: 'TEREZA', gender: 'F' },
  { name: 'TEREZINHA', gender: 'F' },
  { name: 'VERA', gender: 'F' },
  { name: 'REGINA', gender: 'F' },
  { name: 'SILVIA', gender: 'F' },
  { name: 'SILVANA', gender: 'F' },
  { name: 'SUELI', gender: 'F' },
  { name: 'NEUSA', gender: 'F' },
  { name: 'IVONE', gender: 'F' },
  { name: 'IRENE', gender: 'F' },
  { name: 'EDNA', gender: 'F' },
  { name: 'VALDIRENE', gender: 'F' },
  { name: 'ELISANGELA', gender: 'F' },
  { name: 'FABIANA', gender: 'F' },
  { name: 'VIVIANE', gender: 'F' },
  { name: 'KARINA', gender: 'F' },
  { name: 'KELLY', gender: 'F' },
  { name: 'MICHELE', gender: 'F' },
  { name: 'MICHELLE', gender: 'F' },
  { name: 'ELAINE', gender: 'F' },
  { name: 'GISELE', gender: 'F' },
  { name: 'DENISE', gender: 'F' },
  { name: 'MONICA', gender: 'F' },
  { name: 'ANDREA', gender: 'F' },
  { name: 'ANDREIA', gender: 'F' },
  { name: 'FLAVIA', gender: 'F' },
  { name: 'CINTIA', gender: 'F' },

  // Nomes Masculinos Comuns (Estudantes, Pais, Tios, Avôs, Educadores)
  { name: 'MIGUEL', gender: 'M' },
  { name: 'ARTHUR', gender: 'M' },
  { name: 'ARTUR', gender: 'M' },
  { name: 'GAEL', gender: 'M' },
  { name: 'THEO', gender: 'M' },
  { name: 'TEO', gender: 'M' },
  { name: 'HEITOR', gender: 'M' },
  { name: 'RAVI', gender: 'M' },
  { name: 'DAVI', gender: 'M' },
  { name: 'DAVID', gender: 'M' },
  { name: 'BERNARDO', gender: 'M' },
  { name: 'NOAH', gender: 'M' },
  { name: 'GABRIEL', gender: 'M' },
  { name: 'SAMUEL', gender: 'M' },
  { name: 'PEDRO', gender: 'M' },
  { name: 'PEDRO HENRIQUE', gender: 'M' },
  { name: 'ANTHONY', gender: 'M' },
  { name: 'ISAAC', gender: 'M' },
  { name: 'BENICIO', gender: 'M' },
  { name: 'BENJAMIN', gender: 'M' },
  { name: 'MATHEUS', gender: 'M' },
  { name: 'MATEUS', gender: 'M' },
  { name: 'LUCAS', gender: 'M' },
  { name: 'JOAO', gender: 'M' },
  { name: 'JOAO PEDRO', gender: 'M' },
  { name: 'JOAO MIGUEL', gender: 'M' },
  { name: 'JOAO LUCAS', gender: 'M' },
  { name: 'JOAO GUILHERME', gender: 'M' },
  { name: 'JOAO VITOR', gender: 'M' },
  { name: 'NICOLAS', gender: 'M' },
  { name: 'JOAQUIM', gender: 'M' },
  { name: 'HENRIQUE', gender: 'M' },
  { name: 'RAFAEL', gender: 'M' },
  { name: 'GUILHERME', gender: 'M' },
  { name: 'ENZO', gender: 'M' },
  { name: 'ENZO GABRIEL', gender: 'M' },
  { name: 'MURILO', gender: 'M' },
  { name: 'GUSTAVO', gender: 'M' },
  { name: 'FELIPE', gender: 'M' },
  { name: 'FILIPE', gender: 'M' },
  { name: 'PIETRO', gender: 'M' },
  { name: 'LUCCA', gender: 'M' },
  { name: 'LUCA', gender: 'M' },
  { name: 'DANIEL', gender: 'M' },
  { name: 'BRYAN', gender: 'M' },
  { name: 'BRIAN', gender: 'M' },
  { name: 'LEONARDO', gender: 'M' },
  { name: 'VICENTE', gender: 'M' },
  { name: 'EDUARDO', gender: 'M' },
  { name: 'VITOR', gender: 'M' },
  { name: 'VICTOR', gender: 'M' },
  { name: 'CAIO', gender: 'M' },
  { name: 'ANTONIO', gender: 'M' },
  { name: 'CARLOS', gender: 'M' },
  { name: 'JOSE', gender: 'M' },
  { name: 'PAULO', gender: 'M' },
  { name: 'MARCOS', gender: 'M' },
  { name: 'LUIS', gender: 'M' },
  { name: 'LUIZ', gender: 'M' },
  { name: 'FRANCISCO', gender: 'M' },
  { name: 'RODRIGO', gender: 'M' },
  { name: 'MARCELO', gender: 'M' },
  { name: 'BRUNO', gender: 'M' },
  { name: 'ANDRE', gender: 'M' },
  { name: 'FERNANDO', gender: 'M' },
  { name: 'FABIO', gender: 'M' },
  { name: 'ALEXANDRE', gender: 'M' },
  { name: 'MARCIO', gender: 'M' },
  { name: 'LEANDRO', gender: 'M' },
  { name: 'TIAGO', gender: 'M' },
  { name: 'THIAGO', gender: 'M' },
  { name: 'DIEGO', gender: 'M' },
  { name: 'RICARDO', gender: 'M' },
  { name: 'SERGIO', gender: 'M' },
  { name: 'ROBERTO', gender: 'M' },
  { name: 'CLAUDIO', gender: 'M' },
  { name: 'ADRIANO', gender: 'M' },
  { name: 'LUCIANO', gender: 'M' },
  { name: 'RENATO', gender: 'M' },
  { name: 'ALEX', gender: 'M' },
  { name: 'CRISTIANO', gender: 'M' },
  { name: 'ROGERIO', gender: 'M' },
  { name: 'EDSON', gender: 'M' },
  { name: 'GILBERTO', gender: 'M' },
  { name: 'VALDIR', gender: 'M' },
  { name: 'VANDERLEI', gender: 'M' },
  { name: 'MILTON', gender: 'M' },
  { name: 'NELSON', gender: 'M' },
  { name: 'WILSON', gender: 'M' },
  { name: 'WELLINGTON', gender: 'M' },
  { name: 'WESLEY', gender: 'M' },
  { name: 'DOUGLAS', gender: 'M' },
  { name: 'JEFFERSON', gender: 'M' },
  { name: 'ANDERSON', gender: 'M' },
  { name: 'EMERSON', gender: 'M' },
  { name: 'ROBSON', gender: 'M' },
  { name: 'EVERTON', gender: 'M' },
  { name: 'CLEBER', gender: 'M' },
  { name: 'WAGNER', gender: 'M' },
  { name: 'VAGNER', gender: 'M' },
  { name: 'VINICIUS', gender: 'M' },
  { name: 'IGOR', gender: 'M' },
  { name: 'YURI', gender: 'M' },
  { name: 'CAUA', gender: 'M' },
  { name: 'KAUAN', gender: 'M' },
  { name: 'RUAN', gender: 'M' },
  { name: 'RYAN', gender: 'M' },
  { name: 'IAN', gender: 'M' },
  { name: 'YAN', gender: 'M' },
  { name: 'OTAVIO', gender: 'M' },
  { name: 'AUGUSTO', gender: 'M' },
  { name: 'CESAR', gender: 'M' },
  { name: 'JULIO', gender: 'M' },
  { name: 'MAURICIO', gender: 'M' },
  { name: 'REINALDO', gender: 'M' },
  { name: 'RONALDO', gender: 'M' },
  { name: 'SEBASTIAO', gender: 'M' },
  { name: 'MANOEL', gender: 'M' },
  { name: 'MANUEL', gender: 'M' },
  { name: 'RAIMUNDO', gender: 'M' },
  { name: 'GERALDO', gender: 'M' },
  { name: 'BENEDITO', gender: 'M' },
  { name: 'CICERO', gender: 'M' },
  { name: 'SEVERINO', gender: 'M' },
  { name: 'OSVALDO', gender: 'M' },
  { name: 'VALTER', gender: 'M' },
  { name: 'WALTER', gender: 'M' },
];

export const normalizePersonNameKey = (raw?: string): string => {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const extractFirstNameKey = (raw?: string): string => {
  const clean = normalizePersonNameKey(raw);
  if (!clean) return '';
  const tokens = clean
    .split(' ')
    .filter(
      (t) =>
        t &&
        ![
          'PAI',
          'MAE',
          'TIO',
          'TIA',
          'AVO',
          'VOVO',
          'VIZINHO',
          'VIZINHA',
          'IRMAO',
          'IRMA',
          'PADRASTO',
          'MADRASTA',
          'PRIMO',
          'PRIMA',
          'RESPONSAVEL',
          'RESP',
          'SR',
          'SRA',
          'DONA',
          'SEU',
          'PROF',
          'PROFA',
          'PROFESSOR',
          'PROFESSORA',
          'DR',
          'DRA',
        ].includes(t)
    );
  return tokens[0] || '';
};

export const parseGenderCode = (raw?: string): GenderCode | null => {
  if (!raw) return null;
  const up = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
  if (
    up === 'F' ||
    up.startsWith('FEM') ||
    up === 'MENINA' ||
    up === 'MULHER' ||
    up === 'MAE' ||
    up === 'TIA' ||
    up === 'AVO FEM'
  ) {
    return 'F';
  }
  if (
    up === 'M' ||
    up.startsWith('MASC') ||
    up === 'MENINO' ||
    up === 'HOMEM' ||
    up === 'PAI' ||
    up === 'TIO'
  ) {
    return 'M';
  }
  return null;
};

let inMemoryGenderMap: Map<string, GenderCode> | null = null;

const buildMapFromEntries = (entries: NameGenderEntry[]): Map<string, GenderCode> => {
  const map = new Map<string, GenderCode>();
  // Load base dictionary first
  INITIAL_NAME_GENDER_ENTRIES.forEach((item) => {
    const full = normalizePersonNameKey(item.name);
    const first = extractFirstNameKey(item.name);
    if (full) map.set(full, item.gender);
    if (first && !map.has(first)) map.set(first, item.gender);
  });
  // Override with custom / Google Sheet entries
  entries.forEach((item) => {
    const full = normalizePersonNameKey(item.name);
    const first = extractFirstNameKey(item.name);
    if (full) map.set(full, item.gender);
    if (first) map.set(first, item.gender);
  });
  return map;
};

export const getStoredNameGenderEntries = (): NameGenderEntry[] => {
  if (typeof window === 'undefined') return INITIAL_NAME_GENDER_ENTRIES;
  try {
    const raw = localStorage.getItem(GENDER_DICTIONARY_STORAGE_KEY);
    if (!raw) return INITIAL_NAME_GENDER_ENTRIES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return INITIAL_NAME_GENDER_ENTRIES;
};

export const saveStoredNameGenderEntries = (entries: NameGenderEntry[]): void => {
  const dedupMap = new Map<string, NameGenderEntry>();
  INITIAL_NAME_GENDER_ENTRIES.forEach((e) => {
    const k = normalizePersonNameKey(e.name);
    if (k) dedupMap.set(k, { name: k, gender: e.gender });
  });
  entries.forEach((e) => {
    const k = normalizePersonNameKey(e.name);
    const g = parseGenderCode(e.gender);
    if (k && g) {
      dedupMap.set(k, {
        name: k,
        gender: g,
        relationshipHint: e.relationshipHint,
      });
    }
  });
  const merged = Array.from(dedupMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR')
  );
  inMemoryGenderMap = buildMapFromEntries(merged);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(GENDER_DICTIONARY_STORAGE_KEY, JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent('emeb-gender-dictionary-updated'));
    } catch {
      // ignore
    }
  }
};

export const getGenderLookupMap = (): Map<string, GenderCode> => {
  if (!inMemoryGenderMap) {
    inMemoryGenderMap = buildMapFromEntries(getStoredNameGenderEntries());
  }
  return inMemoryGenderMap;
};

/**
 * Consulta o gênero ('M' ou 'F') de qualquer pessoa (Estudante, Pai, Mãe, Tio, Tia, Avô, Avó, Vizinho, Vizinha, Educador)
 * priorizando:
 * 1. A aba `Consulta_Genero_Nomes_2027` sincronizada da Planilha Google (Coluna A: Nome, Coluna B: M ou F)
 * 2. O campo explícito `explicitGender` (se preenchido no cadastro SED)
 * 3. Heurística morfológica da língua portuguesa como fallback seguro
 */
export const resolvePersonGender = (
  personName?: string,
  explicitGender?: string
): GenderCode => {
  const map = getGenderLookupMap();
  const fullKey = normalizePersonNameKey(personName);
  const firstKey = extractFirstNameKey(personName);

  // 1. Exact full name match in the Sheet / Dictionary
  if (fullKey && map.has(fullKey)) {
    return map.get(fullKey)!;
  }

  // 2. First name match in the Sheet / Dictionary
  if (firstKey && map.has(firstKey)) {
    return map.get(firstKey)!;
  }

  // 3. Explicit gender column from SED if valid
  const parsedExplicit = parseGenderCode(explicitGender);
  if (parsedExplicit) {
    return parsedExplicit;
  }

  // 4. Linguistic heuristic fallback on first name
  if (firstKey) {
    if (
      firstKey.endsWith('A') &&
      ![
        'LUCCA',
        'LUCA',
        'CAUA',
        'JOSHUA',
        'NOAH',
        'ELIA',
        'DJALMA',
        'UBIRAJARA',
        'JURACI',
      ].includes(firstKey)
    ) {
      return 'F';
    }
    if (
      firstKey.endsWith('LA') ||
      firstKey.endsWith('NA') ||
      firstKey.endsWith('RA') ||
      firstKey.endsWith('SA') ||
      firstKey.endsWith('TA') ||
      firstKey.endsWith('DA') ||
      firstKey.endsWith('IZ') ||
      firstKey.endsWith('ETH') ||
      firstKey.endsWith('ETE')
    ) {
      return 'F';
    }
  }

  return 'M';
};

export const resolveStudentGender = (student: Pick<Student, 'name' | 'estudante' | 'nomeSocial' | 'genero'>): GenderCode => {
  return resolvePersonGender(
    student.nomeSocial || student.estudante || student.name,
    student.genero
  );
};

export const getStudentGenderLabel = (
  student: Pick<Student, 'name' | 'estudante' | 'nomeSocial' | 'genero'>
): {
  code: GenderCode;
  label: 'Feminino' | 'Masculino';
  shortLabel: 'F' | 'M';
  article: 'a' | 'o';
  estudanteTerm: 'a estudante' | 'o estudante';
  estudanteTitle: 'Estudante (F)' | 'Estudante (M)';
  transferidoTerm: 'Transferida' | 'Transferido';
  remanejadoTerm: 'Remanejada' | 'Remanejado';
  matriculadoTerm: 'Matriculada' | 'Matriculado';
  ativoTerm: 'Ativa' | 'Ativo';
} => {
  const code = resolveStudentGender(student);
  if (code === 'F') {
    return {
      code: 'F',
      label: 'Feminino',
      shortLabel: 'F',
      article: 'a',
      estudanteTerm: 'a estudante',
      estudanteTitle: 'Estudante (F)',
      transferidoTerm: 'Transferida',
      remanejadoTerm: 'Remanejada',
      matriculadoTerm: 'Matriculada',
      ativoTerm: 'Ativa',
    };
  }
  return {
    code: 'M',
    label: 'Masculino',
    shortLabel: 'M',
    article: 'o',
    estudanteTerm: 'o estudante',
    estudanteTitle: 'Estudante (M)',
    transferidoTerm: 'Transferido',
    remanejadoTerm: 'Remanejado',
    matriculadoTerm: 'Matriculado',
    ativoTerm: 'Ativo',
  };
};

export type KinshipRoleType =
  | 'parent'
  | 'uncle_aunt'
  | 'grandparent'
  | 'neighbor'
  | 'sibling'
  | 'step_parent'
  | 'cousin'
  | 'godparent'
  | 'guardian';

const detectExplicitKinshipToken = (rawText?: string): KinshipRoleType | null => {
  if (!rawText) return null;
  const rawUpper = rawText.toUpperCase();
  const norm = rawUpper
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/\b(AVO|AVÔ|AVÓ|VOVO|VOVÔ|VOVÓ)\b/.test(norm)) return 'grandparent';
  if (/\b(TIO|TIA)\b/.test(norm)) return 'uncle_aunt';
  if (/\b(VIZINH[OA]|VIZINH)\b/.test(norm)) return 'neighbor';
  if (/\b(IRMA|IRMAO|IRMÃ|IRMÃO)\b/.test(norm)) return 'sibling';
  if (/\b(PADRASTO|MADRASTA)\b/.test(norm)) return 'step_parent';
  if (/\b(PRIM[OA])\b/.test(norm)) return 'cousin';
  if (/\b(PADRINHO|MADRINHA|DINDO|DINDA)\b/.test(norm)) return 'godparent';
  if (/\b(PAI|MAE|MÃE)\b/.test(norm)) return 'parent';
  return null;
};

/**
 * Determina dinamicamente o parentesco/vínculo flexionado pelo gênero consultado na planilha
 * (Mãe / Pai, Tia / Tio, Avó / Avô, Vizinha / Vizinho, Irmã / Irmão, Madrasta / Padrasto, Prima / Primo, Madrinha / Padrinho, Responsável).
 */
export const resolveGuardianRelationshipInfo = (
  rawGuardianName?: string,
  slotDefault: 'filiacao1' | 'filiacao2' | 'responsavel' = 'filiacao1',
  explicitRoleOrNotes?: string
): {
  gender: GenderCode;
  roleLabel: string;
  shortRoleLabel: string;
  cleanName: string;
  badgeText: string;
} => {
  if (!rawGuardianName || !rawGuardianName.trim() || rawGuardianName.trim() === '—') {
    const fallbackGender: GenderCode = slotDefault === 'filiacao2' ? 'M' : 'F';
    const fallbackRole =
      slotDefault === 'filiacao1'
        ? 'Mãe / Filiação 1'
        : slotDefault === 'filiacao2'
        ? 'Pai / Filiação 2'
        : 'Responsável';
    return {
      gender: fallbackGender,
      roleLabel: fallbackRole,
      shortRoleLabel: slotDefault === 'filiacao2' ? 'Pai' : 'Mãe',
      cleanName: 'Não informado',
      badgeText: `${fallbackRole}`,
    };
  }

  const gender = resolvePersonGender(rawGuardianName);
  const explicitKinship =
    detectExplicitKinshipToken(rawGuardianName) ||
    detectExplicitKinshipToken(explicitRoleOrNotes);

  // Clean out parenthetical relationship tags if typed inside the name field, e.g. "MARIA SILVA (AVÓ)" -> "MARIA SILVA"
  const cleanName = rawGuardianName
    .replace(
      /\s*[\(\[-]\s*(PAI|M[ÃA]E|TI[OA]|AV[ÔÓO]|VOV[ÔÓO]|VIZINH[OA]|IRM[ÃA]O?|PADRASTO|MADRASTA|PRIM[OA]|PADRINHO|MADRINHA|RESPONS[ÁA]VEL)\s*[\)\]]?\s*$/i,
      ''
    )
    .trim();

  const roleType: KinshipRoleType = explicitKinship || 'parent';

  let shortRoleLabel = '';
  let roleLabel = '';

  switch (roleType) {
    case 'grandparent':
      shortRoleLabel = gender === 'F' ? 'Avó' : 'Avô';
      roleLabel = gender === 'F' ? 'Avó (Responsável)' : 'Avô (Responsável)';
      break;
    case 'uncle_aunt':
      shortRoleLabel = gender === 'F' ? 'Tia' : 'Tio';
      roleLabel = gender === 'F' ? 'Tia (Responsável)' : 'Tio (Responsável)';
      break;
    case 'neighbor':
      shortRoleLabel = gender === 'F' ? 'Vizinha' : 'Vizinho';
      roleLabel =
        gender === 'F'
          ? 'Vizinha / Contato Autorizado'
          : 'Vizinho / Contato Autorizado';
      break;
    case 'sibling':
      shortRoleLabel = gender === 'F' ? 'Irmã' : 'Irmão';
      roleLabel = gender === 'F' ? 'Irmã (Responsável)' : 'Irmão (Responsável)';
      break;
    case 'step_parent':
      shortRoleLabel = gender === 'F' ? 'Madrasta' : 'Padrasto';
      roleLabel = gender === 'F' ? 'Madrasta' : 'Padrasto';
      break;
    case 'cousin':
      shortRoleLabel = gender === 'F' ? 'Prima' : 'Primo';
      roleLabel = gender === 'F' ? 'Prima (Contato)' : 'Primo (Contato)';
      break;
    case 'godparent':
      shortRoleLabel = gender === 'F' ? 'Madrinha' : 'Padrinho';
      roleLabel = gender === 'F' ? 'Madrinha' : 'Padrinho';
      break;
    case 'parent':
    default:
      shortRoleLabel = gender === 'F' ? 'Mãe' : 'Pai';
      roleLabel =
        slotDefault === 'filiacao1'
          ? `${shortRoleLabel} (Filiação 1)`
          : slotDefault === 'filiacao2'
          ? `${shortRoleLabel} (Filiação 2)`
          : `${shortRoleLabel} / Responsável`;
      break;
  }

  return {
    gender,
    roleLabel,
    shortRoleLabel,
    cleanName: cleanName || rawGuardianName.trim(),
    badgeText: `${shortRoleLabel} (${gender})`,
  };
};

/**
 * Constrói os valores da aba `Consulta_Genero_Nomes_2027` para a Planilha Google:
 * - 1ª Coluna (A): NOME (inserido manualmente ou consolidado do banco de dados)
 * - 2ª Coluna (B): GENERO (M ou F)
 * - 3ª Coluna (C): EXEMPLOS DE CONCORDÂNCIA NO APP (Estudante, Pai/Mãe, Tio/Tia, Avô/Avó, Vizinho/Vizinha)
 */
export const buildGenderLookupSheetValues = (
  classes: Array<{ students: Student[]; teacherName?: string; artTeacher?: string; peTeacher?: string; englishTeacher?: string }>,
  customEntries: NameGenderEntry[] = getStoredNameGenderEntries()
): any[][] => {
  const headers = [
    'NOME (COLUNA 1 - DIGITE O NOME MANUALMENTE)',
    'M OU F (COLUNA 2 - GÊNERO)',
    'APLICAÇÃO AUTOMÁTICA EM TODO O APP (ESTUDANTE / PAI / MÃE / TIO / TIA / AVÔ / AVÓ / VIZINHO / VIZINHA)',
  ];

  const mergedMap = new Map<string, GenderCode>();

  // 1. Add stored dictionary entries
  customEntries.forEach((e) => {
    const first = extractFirstNameKey(e.name);
    const full = normalizePersonNameKey(e.name);
    if (first) mergedMap.set(first, e.gender);
    if (full && full.includes(' ')) mergedMap.set(full, e.gender);
  });

  // 2. Harvest all student names, Filiação 1, Filiação 2, and educator names from current classes
  classes.forEach((cls) => {
    [cls.teacherName, cls.artTeacher, cls.peTeacher, cls.englishTeacher].forEach(
      (tName) => {
        const first = extractFirstNameKey(tName);
        if (first && !mergedMap.has(first)) {
          mergedMap.set(first, resolvePersonGender(first));
        }
      }
    );

    cls.students.forEach((st) => {
      const stFirst = extractFirstNameKey(st.estudante || st.name);
      if (stFirst && !mergedMap.has(stFirst)) {
        mergedMap.set(stFirst, resolvePersonGender(st.estudante || st.name, st.genero));
      }
      const f1First = extractFirstNameKey(st.filiacao1);
      if (f1First && !mergedMap.has(f1First)) {
        mergedMap.set(f1First, resolvePersonGender(st.filiacao1, 'F'));
      }
      const f2First = extractFirstNameKey(st.filiacao2);
      if (f2First && !mergedMap.has(f2First)) {
        mergedMap.set(f2First, resolvePersonGender(st.filiacao2, 'M'));
      }
    });
  });

  const sortedNames = Array.from(mergedMap.keys()).sort((a, b) =>
    a.localeCompare(b, 'pt-BR')
  );

  const rows: any[][] = [headers];
  sortedNames.forEach((nameKey) => {
    const g = mergedMap.get(nameKey) || 'F';
    const concordanceDesc =
      g === 'F'
        ? 'Feminino (F) → A Estudante • Mãe • Tia • Avó • Vizinha • Irmã • Professora'
        : 'Masculino (M) → O Estudante • Pai • Tio • Avô • Vizinho • Irmão • Professor';
    rows.push([nameKey, g, concordanceDesc]);
  });

  return rows;
};
