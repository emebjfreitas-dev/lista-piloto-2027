import { ClassGroup, Student } from '../types';
import { getStoredClasses } from '../services/db';
import { resolveGuardianRelationshipInfo } from './genderDictionary';

export type SiblingRelationType = 'both' | 'mother' | 'father' | 'guardian' | 'manual';

export interface DetectedSibling {
  student: Student;
  classId: string;
  className: string;
  grade?: string;
  shift?: string;
  relationType: SiblingRelationType;
  relationLabel: string;
  matchedReason: string;
  matchedNames: {
    mother?: string;
    father?: string;
    guardian?: string;
  };
  isSameClass: boolean;
}

const INVALID_PARENT_NAMES = new Set([
  '',
  'NAO INFORMADO',
  'NAO CONSTA',
  'SEM DECLARACAO',
  'DESCONHECIDO',
  'EM BRANCO',
  'N A',
  'NA',
  'N D',
  'ND',
  'NAO DECLARADO',
  'SEM INFORMACAO',
  'SEM INFORMACAO CADASTRADA',
  'IGNORADO',
  'FALECIDO',
  'FALECIDA',
  'DEVOLUTIVA',
  'CONSELHO TUTELAR',
  'ABRIGO',
  'MENOR SOB GUARDA',
  'SEM FILIACAO',
  'PAI NAO DECLARADO',
  'MAE NAO DECLARADA',
  '—',
  '-',
  '...',
]);

/**
 * Normaliza o nome do pai, mãe ou responsável removendo acentuação,
 * prefixos (Mãe:, Pai:, Sr., Dona, etc.) e caracteres especiais.
 */
export function normalizeParentName(raw?: string): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(
      /^(?:m[aã]e|pai|respons[aá]vel(?:\s*\d*)?|filia[cç][aã]o(?:\s*\d*)?|sr[a]?\.?|dona|devolutiva)\s*[:\-\u2013\.\/]?\s*/gi,
      ''
    )
    .replace(/\((?:m[aã]e|pai|respons[aá]vel|av[oó][a]?|ti[oó][a]?|padrasto|madrasta)\)/gi, '')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Avalia se o nome é suficientemente específico para permitir cruzamento
 * sem gerar falsos positivos (ex: termos genéricos ou apenas um primeiro nome comum).
 */
export function isUsableParentName(name: string): boolean {
  if (!name || name.length < 5) return false;
  if (INVALID_PARENT_NAMES.has(name)) return false;

  const words = name.split(' ').filter((w) => w.length > 1);
  // Deve possuir ao menos 2 palavras (ex: "ANA SILVA") ou ter 8+ letras caso seja nome composto
  return words.length >= 2 || name.length >= 8;
}

/**
 * Compara dois nomes de responsáveis com tolerância para pequenas variações de sobrenome,
 * abreviações e inversão de prenomes.
 */
export function areParentNamesMatching(nameA: string, nameB: string): boolean {
  if (!nameA || !nameB) return false;
  if (nameA === nameB) return true;

  // Inclusão direta para nomes completos com mais de 9 letras
  if (nameA.length >= 10 && nameB.length >= 10) {
    if (nameA.includes(nameB) || nameB.includes(nameA)) {
      return true;
    }
  }

  const wordsA = nameA.split(' ').filter((w) => w.length > 2);
  const wordsB = nameB.split(' ').filter((w) => w.length > 2);

  if (wordsA.length >= 2 && wordsB.length >= 2) {
    // Primeiro nome idêntico E último sobrenome idêntico
    const sameFirst = wordsA[0] === wordsB[0];
    const sameLast = wordsA[wordsA.length - 1] === wordsB[wordsB.length - 1];
    if (sameFirst && sameLast) {
      return true;
    }

    // 3 ou mais palavras em comum
    const commonWords = wordsA.filter((w) => wordsB.includes(w));
    if (commonWords.length >= 3) {
      return true;
    }
  }

  return false;
}

export interface StudentParentInfo {
  mother: string;
  father: string;
  guardian: string;
  rawP1: string;
  rawP2: string;
  allValidNames: string[];
}

/**
 * Extrai e classifica os pais do estudante (Mãe e Pai), usando o dicionário
 * de gêneros e relacionamentos para desambiguação precisa.
 */
export function getStudentParentInfo(student: Student): StudentParentInfo {
  const p1 = normalizeParentName(student.filiacao1);
  const p2 = normalizeParentName(student.filiacao2);
  const g = normalizeParentName(student.guardianName);

  const valid1 = isUsableParentName(p1) ? p1 : '';
  const valid2 = isUsableParentName(p2) ? p2 : '';
  const validG = isUsableParentName(g) ? g : '';

  const g1Info = resolveGuardianRelationshipInfo(
    student.filiacao1 || student.guardianName,
    'filiacao1',
    student.notes
  );
  const g2Info = resolveGuardianRelationshipInfo(student.filiacao2, 'filiacao2', student.notes);

  let mother = '';
  let father = '';

  if (g1Info.shortRoleLabel === 'Mãe' && valid1) {
    mother = valid1;
  } else if (g1Info.shortRoleLabel === 'Pai' && valid1) {
    father = valid1;
  }

  if (g2Info.shortRoleLabel === 'Pai' && valid2) {
    father = valid2;
  } else if (g2Info.shortRoleLabel === 'Mãe' && valid2) {
    mother = valid2;
  }

  // Fallback convencional caso o gênero não tenha sido determinado
  if (!mother && valid1) mother = valid1;
  if (!father && valid2) father = valid2;

  const allValidNames = Array.from(
    new Set([mother, father, valid1, valid2, validG].filter(Boolean))
  );

  return {
    mother,
    father,
    guardian: validG,
    rawP1: valid1,
    rawP2: valid2,
    allValidNames,
  };
}

/**
 * Cruza dois estudantes para verificar se são irmãos por Mãe, Pai ou Ambos.
 */
export function compareStudentsForSiblingMatch(
  studentA: Student,
  studentB: Student
): { isSibling: boolean; relationType: SiblingRelationType; relationLabel: string; matchedReason: string } | null {
  if (!studentA || !studentB || studentA.id === studentB.id) return null;

  const parentsA = getStudentParentInfo(studentA);
  const parentsB = getStudentParentInfo(studentB);

  // 1. Verificação direta por Mãe e Pai
  const motherMatched = Boolean(
    parentsA.mother &&
      parentsB.mother &&
      areParentNamesMatching(parentsA.mother, parentsB.mother)
  );

  const fatherMatched = Boolean(
    parentsA.father &&
      parentsB.father &&
      areParentNamesMatching(parentsA.father, parentsB.father)
  );

  // 2. Verificação com inversão de slots (caso um cadastro tenha pai em filiacao1 e outro em filiacao2)
  const crossMatch1 = Boolean(
    !motherMatched &&
      parentsA.mother &&
      parentsB.father &&
      areParentNamesMatching(parentsA.mother, parentsB.father)
  );

  const crossMatch2 = Boolean(
    !fatherMatched &&
      parentsA.father &&
      parentsB.mother &&
      areParentNamesMatching(parentsA.father, parentsB.mother)
  );

  const effectiveMotherMatched = motherMatched || crossMatch2;
  const effectiveFatherMatched = fatherMatched || crossMatch1;

  if (effectiveMotherMatched && effectiveFatherMatched) {
    return {
      isSibling: true,
      relationType: 'both',
      relationLabel: 'Mesma Mãe e Mesmo Pai (Ambos)',
      matchedReason: `Mãe: ${parentsA.mother || parentsB.mother} · Pai: ${parentsA.father || parentsB.father}`,
    };
  }

  if (effectiveMotherMatched) {
    return {
      isSibling: true,
      relationType: 'mother',
      relationLabel: 'Mesma Mãe',
      matchedReason: `Mãe: ${parentsA.mother || parentsB.mother}`,
    };
  }

  if (effectiveFatherMatched) {
    return {
      isSibling: true,
      relationType: 'father',
      relationLabel: 'Mesmo Pai',
      matchedReason: `Pai: ${parentsA.father || parentsB.father}`,
    };
  }

  // 3. Cruzamento por Responsável Comum (caso a filiação tenha sido inserida apenas no campo responsável)
  for (const nameA of parentsA.allValidNames) {
    for (const nameB of parentsB.allValidNames) {
      if (areParentNamesMatching(nameA, nameB)) {
        return {
          isSibling: true,
          relationType: 'guardian',
          relationLabel: 'Mesmo Responsável',
          matchedReason: `Responsável em Comum: ${nameA}`,
        };
      }
    }
  }

  // 4. Verificação por menção textual no campo 'irmaos' (se houver nota registrada da secretaria)
  const checkNote = (noteText?: string, targetName?: string) => {
    if (!noteText || !targetName || targetName.length < 5) return false;
    const cleanNote = noteText
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
    const cleanTarget = targetName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
    return cleanNote.includes(cleanTarget);
  };

  if (checkNote(studentA.irmaos, studentB.name) || checkNote(studentB.irmaos, studentA.name)) {
    return {
      isSibling: true,
      relationType: 'manual',
      relationLabel: 'Irmão Indicado no Cadastro',
      matchedReason: 'Registro Nominal no Histórico Escolar',
    };
  }

  return null;
}

/**
 * Localiza todos os irmãos de um estudante em toda a escola (todas as turmas),
 * cruzando dados de filiação (mãe, pai ou ambos).
 */
export function findStudentSiblings(
  targetStudent: Student,
  allClasses?: ClassGroup[]
): DetectedSibling[] {
  if (!targetStudent) return [];

  const classes = allClasses || getStoredClasses();
  const siblingMap = new Map<string, DetectedSibling>();

  for (const cls of classes) {
    for (const otherStudent of cls.students || []) {
      if (otherStudent.id === targetStudent.id) continue;

      const match = compareStudentsForSiblingMatch(targetStudent, otherStudent);
      if (match && match.isSibling) {
        const isSameClass = otherStudent.turma === targetStudent.turma;
        siblingMap.set(otherStudent.id, {
          student: otherStudent,
          classId: cls.id,
          className: cls.name,
          grade: cls.grade,
          shift: cls.shift,
          relationType: match.relationType,
          relationLabel: match.relationLabel,
          matchedReason: match.matchedReason,
          matchedNames: {},
          isSameClass,
        });
      }
    }
  }

  // Ordenação:
  // 1. Irmãos em outras turmas primeiro (foco principal do usuário)
  // 2. Grau de correspondência: 'both' (ambos) > 'mother' (mãe) > 'father' (pai) > 'guardian' > 'manual'
  // 3. Ordem alfabética do nome do irmão
  const relationPriority: Record<SiblingRelationType, number> = {
    both: 1,
    mother: 2,
    father: 3,
    guardian: 4,
    manual: 5,
  };

  return Array.from(siblingMap.values()).sort((a, b) => {
    if (a.isSameClass !== b.isSameClass) {
      return a.isSameClass ? 1 : -1;
    }
    const prioDiff = relationPriority[a.relationType] - relationPriority[b.relationType];
    if (prioDiff !== 0) return prioDiff;
    return a.student.name.localeCompare(b.student.name);
  });
}

export interface FamilyMemberEntry {
  student: Student;
  classGroup: ClassGroup;
  classId: string;
  className: string;
  grade: string;
  shift: string;
  parentInfo: StudentParentInfo;
}

export interface MultiStudentFamilyGroup {
  id: string;
  members: FamilyMemberEntry[];
  sharedGuardians: Array<{ roleLabel: string; name: string }>;
  relationType: SiblingRelationType;
  relationSummary: string;
  phones: string[];
  rawPhonesJoined: string;
  addressSummary: string;
  distinctClassNames: string[];
  distinctShifts: string[];
  hasMultipleClasses: boolean;
  hasMultipleShifts: boolean;
}

/**
 * Agrupa automaticamente todos os estudantes da escola que compartilham os mesmos
 * responsáveis (mãe, pai ou ambos) em núcleos familiares com 2 ou mais alunos.
 * Utiliza índice invertido + Union-Find para desempenho instantâneo em larga escala.
 */
export function groupSchoolFamiliesByGuardians(
  allClasses?: ClassGroup[]
): MultiStudentFamilyGroup[] {
  const classes = allClasses || getStoredClasses();
  const entries: FamilyMemberEntry[] = [];
  const seenStudentIds = new Set<string>();

  for (const cls of classes) {
    for (const st of cls.students || []) {
      if (!st || !st.id || seenStudentIds.has(st.id)) continue;
      seenStudentIds.add(st.id);
      entries.push({
        student: st,
        classGroup: cls,
        classId: cls.id,
        className: cls.name,
        grade: cls.grade,
        shift: cls.shift,
        parentInfo: getStudentParentInfo(st),
      });
    }
  }

  const n = entries.length;
  if (n < 2) return [];

  // Union-Find
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;

  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };

  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  // Índice invertido por nome exato e chave primeiro+último sobrenome para candidatos rápidos
  const bucketMap = new Map<string, number[]>();
  const addBucket = (key: string, idx: number) => {
    if (!key) return;
    let list = bucketMap.get(key);
    if (!list) {
      list = [];
      bucketMap.set(key, list);
    }
    list.push(idx);
  };

  for (let i = 0; i < n; i++) {
    const pInfo = entries[i].parentInfo;
    for (const pName of pInfo.allValidNames) {
      addBucket(`exact:${pName}`, i);
      const words = pName.split(' ').filter((w) => w.length > 2);
      if (words.length >= 2) {
        addBucket(`fl:${words[0]}_${words[words.length - 1]}`, i);
      }
    }
  }

  // Valida pares dentro dos mesmos buckets com compareStudentsForSiblingMatch
  const checkedPairs = new Set<string>();
  const pairMatches = new Map<string, SiblingRelationType>();

  for (const indices of bucketMap.values()) {
    if (indices.length < 2) continue;
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        const i = indices[a];
        const j = indices[b];
        if (i === j) continue;
        const pairKey = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (checkedPairs.has(pairKey)) continue;
        checkedPairs.add(pairKey);

        const match = compareStudentsForSiblingMatch(entries[i].student, entries[j].student);
        if (match && match.isSibling) {
          union(i, j);
          pairMatches.set(pairKey, match.relationType);
        }
      }
    }
  }

  // Coleta componentes conexos com 2+ estudantes
  const groupsMap = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    let grp = groupsMap.get(root);
    if (!grp) {
      grp = [];
      groupsMap.set(root, grp);
    }
    grp.push(i);
  }

  const families: MultiStudentFamilyGroup[] = [];

  for (const memberIndices of groupsMap.values()) {
    if (memberIndices.length < 2) continue;

    const members = memberIndices
      .map((idx) => entries[idx])
      .sort((a, b) => a.className.localeCompare(b.className) || a.student.name.localeCompare(b.student.name));

    // Determina a relação predominante no núcleo familiar
    let hasBoth = false;
    let hasMother = false;
    let hasFather = false;
    for (let a = 0; a < memberIndices.length; a++) {
      for (let b = a + 1; b < memberIndices.length; b++) {
        const i = memberIndices[a];
        const j = memberIndices[b];
        const pairKey = i < j ? `${i}:${j}` : `${j}:${i}`;
        const rel = pairMatches.get(pairKey);
        if (rel === 'both') hasBoth = true;
        else if (rel === 'mother') hasMother = true;
        else if (rel === 'father') hasFather = true;
      }
    }

    let relationType: SiblingRelationType = 'guardian';
    let relationSummary = 'Mesmo Responsável';
    if (hasBoth || (hasMother && hasFather)) {
      relationType = 'both';
      relationSummary = 'Mesma Mãe e Mesmo Pai';
    } else if (hasMother) {
      relationType = 'mother';
      relationSummary = 'Mesma Mãe';
    } else if (hasFather) {
      relationType = 'father';
      relationSummary = 'Mesmo Pai';
    }

    // Extrai nomes dos responsáveis compartilhados de forma limpa
    const sharedGuardians: Array<{ roleLabel: string; name: string }> = [];
    const seenGuardianKeys = new Set<string>();

    const addSharedGuardian = (roleLabel: string, rawName?: string) => {
      const normalized = normalizeParentName(rawName);
      if (!isUsableParentName(normalized)) return;
      // Verifica se aparece em pelo menos 2 membros (ou compatível)
      const count = members.filter((m) =>
        m.parentInfo.allValidNames.some((vn) => areParentNamesMatching(vn, normalized))
      ).length;
      if (count >= 2 && !seenGuardianKeys.has(normalized)) {
        seenGuardianKeys.add(normalized);
        sharedGuardians.push({ roleLabel, name: (rawName || normalized).trim() });
      }
    };

    for (const m of members) {
      if (m.parentInfo.mother) {
        addSharedGuardian('Mãe', m.student.filiacao1 || m.parentInfo.mother);
      }
      if (m.parentInfo.father) {
        addSharedGuardian('Pai', m.student.filiacao2 || m.parentInfo.father);
      }
      if (!m.parentInfo.mother && !m.parentInfo.father && m.parentInfo.guardian) {
        addSharedGuardian('Responsável', m.student.guardianName || m.parentInfo.guardian);
      }
    }

    // Fallback se nenhum responsável explícito atingiu contagem (ex: registro cruzado)
    if (sharedGuardians.length === 0) {
      const first = members[0];
      if (first.parentInfo.mother) {
        sharedGuardians.push({ roleLabel: 'Mãe', name: first.student.filiacao1 || first.parentInfo.mother });
      }
      if (first.parentInfo.father) {
        sharedGuardians.push({ roleLabel: 'Pai', name: first.student.filiacao2 || first.parentInfo.father });
      }
    }

    // Consolida telefones únicos
    const phonesSet = new Set<string>();
    for (const m of members) {
      const pStr = (m.student.telefones || m.student.guardianPhone || '').trim();
      if (pStr && pStr !== '—' && !pStr.toLowerCase().includes('não informado')) {
        phonesSet.add(pStr);
      }
    }
    const phones = Array.from(phonesSet);

    // Endereço representativo
    const memberWithAddress = members.find((m) => (m.student.logradouro || '').trim().length > 0);
    const addressSummary = memberWithAddress
      ? [
          memberWithAddress.student.logradouro
            ? `${memberWithAddress.student.logradouro}${
                memberWithAddress.student.numeroResidencia
                  ? `, nº ${memberWithAddress.student.numeroResidencia}`
                  : ''
              }`
            : null,
          memberWithAddress.student.bairro || null,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

    const distinctClassNames = Array.from(new Set(members.map((m) => m.className)));
    const distinctShifts = Array.from(
      new Set(members.map((m) => m.shift.replace('Turno ', '').trim()).filter(Boolean))
    );

    families.push({
      id: `fam-${members.map((m) => m.student.id).sort().join('_')}`,
      members,
      sharedGuardians,
      relationType,
      relationSummary,
      phones,
      rawPhonesJoined: phones.join(' / '),
      addressSummary,
      distinctClassNames,
      distinctShifts,
      hasMultipleClasses: distinctClassNames.length > 1,
      hasMultipleShifts: distinctShifts.length > 1,
    });
  }

  return families.sort((a, b) => {
    // 1. Famílias com mais filhos primeiro
    if (b.members.length !== a.members.length) {
      return b.members.length - a.members.length;
    }
    // 2. Famílias espalhadas em turmas diferentes primeiro
    if (a.hasMultipleClasses !== b.hasMultipleClasses) {
      return a.hasMultipleClasses ? -1 : 1;
    }
    // 3. Ordem alfabética do responsável principal ou primeiro estudante
    const nameA = a.sharedGuardians[0]?.name || a.members[0]?.student.name || '';
    const nameB = b.sharedGuardians[0]?.name || b.members[0]?.student.name || '';
    return nameA.localeCompare(nameB);
  });
}
