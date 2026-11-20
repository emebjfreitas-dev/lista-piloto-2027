import {
  LgpdProtectionConfig,
  RbacRoleDefinition,
  SecurityAuditLogEntry,
  Student,
} from '../types';
import { isBackendApiAvailable } from './apiEnvironment';
import { getActiveUserAuthHeadersAsync } from './authSessionService';

export const SECURITY_AUDIT_STORAGE_KEY = 'emeb_candelario_security_audit_logs_2027_v1';
export const LGPD_CONFIG_STORAGE_KEY = 'emeb_candelario_lgpd_config_2027_v1';

export const RBAC_ROLE_DEFINITIONS: RbacRoleDefinition[] = [
  {
    roleKey: 'admin',
    name: 'Administrador / Gestão Escolar Plena',
    badgeLabel: 'ADMIN GESTÃO',
    description:
      'Direção escolar e secretaria com controle pleno de parâmetros, turmas, acessos, homologação de 200 dias e auditoria completa.',
    color: '#1d1d1f',
    canViewStudents: true,
    canEditAttendance: true,
    canAccessReports: true,
    canViewSensitiveData: true,
    canManageCalendar: true,
    canManageAccess: true,
    canSyncGoogleSheets: true,
  },
  {
    roleKey: 'usuario',
    name: 'Professor(a) Regente (PEB I)',
    badgeLabel: 'PEB I REGENTE',
    description:
      'Acesso estrito e exclusivo aos estudantes e chamadas da(s) sua(s) turma(s) atribuída(s), conforme o Princípio do Menor Privilégio.',
    color: '#0071e3',
    canViewStudents: true,
    canEditAttendance: true,
    canAccessReports: true,
    canViewSensitiveData: false,
    canManageCalendar: false,
    canManageAccess: false,
    canSyncGoogleSheets: false,
  },
  {
    roleKey: 'peb2',
    name: 'Professor(a) Especialista (PEB II)',
    badgeLabel: 'PEB II ESPECIALISTA',
    description:
      'Docentes de Arte, Educação Física e Língua Inglesa. Visualização das 40 turmas para planejamento pedagógico, sem permissão de alteração estrutural.',
    color: '#ff9500',
    canViewStudents: true,
    canEditAttendance: false,
    canAccessReports: true,
    canViewSensitiveData: false,
    canManageCalendar: false,
    canManageAccess: false,
    canSyncGoogleSheets: false,
  },
  {
    roleKey: 'coordenacao',
    name: 'Coordenação Pedagógica / Apoio',
    badgeLabel: 'COORDENAÇÃO',
    description:
      'Acompanhamento de faltas consecutivas, busca ativa e desempenho escolar com restrição a configurações críticas de sistema.',
    color: '#10b981',
    canViewStudents: true,
    canEditAttendance: false,
    canAccessReports: true,
    canViewSensitiveData: true,
    canManageCalendar: false,
    canManageAccess: false,
    canSyncGoogleSheets: false,
  },
];

const INITIAL_SECURITY_AUDIT_LOGS: SecurityAuditLogEntry[] = [];

let memorySecurityAuditLogs: SecurityAuditLogEntry[] | null = null;
let memoryLgpdConfig: LgpdProtectionConfig | null = null;

export const getStoredSecurityAuditLogs = (): SecurityAuditLogEntry[] => {
  if (memorySecurityAuditLogs) return memorySecurityAuditLogs;
  try {
    const raw = localStorage.getItem(SECURITY_AUDIT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memorySecurityAuditLogs = parsed;
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  memorySecurityAuditLogs = INITIAL_SECURITY_AUDIT_LOGS;
  return INITIAL_SECURITY_AUDIT_LOGS;
};

export const addSecurityAuditLog = (
  entry: Omit<SecurityAuditLogEntry, 'id' | 'timestampISO'>
): SecurityAuditLogEntry => {
  const currentLogs = getStoredSecurityAuditLogs();
  const newEntry: SecurityAuditLogEntry = {
    ...entry,
    id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestampISO: new Date().toISOString(),
  };

  const updatedLogs = [newEntry, ...currentLogs].slice(0, 300);
  memorySecurityAuditLogs = updatedLogs;

  try {
    localStorage.setItem(SECURITY_AUDIT_STORAGE_KEY, JSON.stringify(updatedLogs));
  } catch {
    // ignore
  }

  if (isBackendApiAvailable()) {
    try {
      void getActiveUserAuthHeadersAsync().then((headers) => {
        if (!headers.Authorization) return;
        fetch('/api/security-logs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          credentials: 'include',
          body: JSON.stringify(newEntry),
        }).catch(() => {});
      });
    } catch {
      // offline safe
    }
  }

  return newEntry;
};

export const clearStoredSecurityAuditLogs = (): void => {
  memorySecurityAuditLogs = [];
  try {
    localStorage.removeItem(SECURITY_AUDIT_STORAGE_KEY);
  } catch {
    // ignore
  }
};

export const getStoredLgpdConfig = (): LgpdProtectionConfig => {
  if (memoryLgpdConfig) return memoryLgpdConfig;
  try {
    const raw = localStorage.getItem(LGPD_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.maskSensitiveDataByDefault === 'boolean') {
        memoryLgpdConfig = parsed;
        return parsed;
      }
    }
  } catch {
    // fallback
  }

  const defaultConfig: LgpdProtectionConfig = {
    maskSensitiveDataByDefault: true,
    requireMfaForAdmin: true,
    dataRetentionDays: 1825,
    lastAuditedAtISO: new Date().toISOString(),
    complianceOfficer: 'Encarregado de Dados DPO / EMEB Candelário',
    anonymizeExportedSpreadsheets: true,
  };
  memoryLgpdConfig = defaultConfig;
  return defaultConfig;
};

export const saveStoredLgpdConfig = (
  updates: Partial<LgpdProtectionConfig>
): LgpdProtectionConfig => {
  const current = getStoredLgpdConfig();
  const nextConfig: LgpdProtectionConfig = {
    ...current,
    ...updates,
    lastAuditedAtISO: new Date().toISOString(),
  };
  memoryLgpdConfig = nextConfig;
  try {
    localStorage.setItem(LGPD_CONFIG_STORAGE_KEY, JSON.stringify(nextConfig));
  } catch {
    // ignore
  }
  return nextConfig;
};

export const maskSensitiveText = (
  text: string | undefined | null,
  type: 'cpf' | 'nis' | 'phone' | 'rg' | 'address' | 'sus' | 'cep' = 'cpf'
): string => {
  if (!text || typeof text !== 'string') return '—';
  const clean = text.trim();
  if (clean.length < 3) return '***';

  if (type === 'cpf') {
    const digits = clean.replace(/\D/g, '');
    if (digits.length === 11) {
      return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
    }
    return `***.***.***-${digits.slice(-2) || '**'}`;
  }

  if (type === 'nis') {
    const digits = clean.replace(/\D/g, '');
    if (digits.length >= 10) {
      return `***.${digits.slice(3, 8)}.***-*`;
    }
    return `***.*****.***-*`;
  }

  if (type === 'sus') {
    const digits = clean.replace(/\D/g, '');
    if (digits.length >= 4) {
      return `*** **** **** ${digits.slice(-4)}`;
    }
    return `*** **** **** ****`;
  }

  if (type === 'phone') {
    const parts = clean
      .split(/[/;,|]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      return parts
        .map((part) => {
          const digits = part.replace(/\D/g, '');
          if (digits.length >= 10) return `(${digits.slice(0, 2)}) *****-${digits.slice(-4)}`;
          if (digits.length >= 4) return `*****-${digits.slice(-4)}`;
          return '(**) *****-****';
        })
        .join(' · ');
    }
    const digits = clean.replace(/\D/g, '');
    if (digits.length >= 10) {
      return `(${digits.slice(0, 2)}) *****-${digits.slice(-4)}`;
    }
    if (digits.length >= 4) {
      return `(11) *****-${digits.slice(-4)}`;
    }
    return '(**) *****-****';
  }

  if (type === 'rg') {
    const alnum = clean.replace(/[^a-zA-Z0-9]/g, '');
    if (alnum.length >= 3) {
      return `**.***.***-${alnum.slice(-1).toUpperCase()}`;
    }
    return `**.***.***-*`;
  }

  if (type === 'cep') {
    const digits = clean.replace(/\D/g, '');
    if (digits.length === 8) {
      return `*****-${digits.slice(-3)}`;
    }
    return `*****-***`;
  }

  if (type === 'address') {
    return clean.replace(/\d+/g, '***');
  }

  return `***${clean.slice(Math.ceil(clean.length / 2))}`;
};

export const sanitizeStudentForLgpd = (
  student: Student,
  maskActive: boolean
): Student => {
  if (!maskActive) return student;

  return {
    ...student,
    cpf: student.cpf ? maskSensitiveText(student.cpf, 'cpf') : undefined,
    nis: student.nis ? maskSensitiveText(student.nis, 'nis') : undefined,
    rg: student.rg ? maskSensitiveText(student.rg, 'rg') : undefined,
    telefones: student.telefones ? maskSensitiveText(student.telefones, 'phone') : undefined,
    guardianPhone: student.guardianPhone
      ? maskSensitiveText(student.guardianPhone, 'phone')
      : undefined,
    cartaoSus: student.cartaoSus ? maskSensitiveText(student.cartaoSus, 'nis') : undefined,
    logradouro: student.logradouro ? maskSensitiveText(student.logradouro, 'address') : undefined,
    numeroResidencia: student.numeroResidencia ? '***' : undefined,
    complemento: student.complemento ? '***' : undefined,
  };
};

export const exportSecurityAuditLogsCSV = (): void => {
  const logs = getStoredSecurityAuditLogs();
  const header = [
    'ID',
    'Data/Hora (ISO)',
    'Usuário (E-mail)',
    'Nome',
    'Perfil',
    'Evento',
    'Ação',
    'Severidade',
    'Detalhes',
    'IP',
  ];
  const rows = logs.map((l) => [
    l.id,
    new Date(l.timestampISO).toLocaleString('pt-BR'),
    l.userEmail,
    `"${(l.userName || '').replace(/"/g, '""')}"`,
    l.userRole.toUpperCase(),
    l.eventType,
    `"${(l.actionTitle || '').replace(/"/g, '""')}"`,
    l.severity.toUpperCase(),
    `"${(l.details || '').replace(/"/g, '""')}"`,
    l.clientIp || '127.0.0.1',
  ]);

  const csvContent =
    '\uFEFF' + [header.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    `auditoria_seguranca_lgpd_candelario_${new Date().toISOString().slice(0, 10)}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
