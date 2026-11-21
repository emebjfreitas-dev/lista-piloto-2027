import React, { useState, useMemo, useEffect, Suspense } from 'react';
import {
  AuthorizedUser,
  ClassGroup,
  ScreenType,
  UserRole,
  AttendanceWindowConfig,
  UserAccessSessionLog,
  SecurityAuditLogEntry,
  LgpdProtectionConfig,
  FcmSystemConfig,
} from '../types';
import { INSTITUTIONAL_EMAIL_DOMAIN, INITIAL_AUTHORIZED_USERS } from '../data/mockData';
import {
  isOfficialSchoolAdminEmail,
  isValidInstitutionalEmail,
  evaluateAttendanceLaunchWindow,
  formatDurationHuman,
  exportOfficialMatrixToXLS,
  getStoredSecurityAuditLogs,
  addSecurityAuditLog,
  clearStoredSecurityAuditLogs,
  getStoredLgpdConfig,
  saveStoredLgpdConfig,
  exportSecurityAuditLogsCSV,
  RBAC_ROLE_DEFINITIONS,
  getLocalTodayDateISO,
  isUserAccessExpired,
  isUserAccessEffectivelyActive,
  formatAccessExpirationDateBR,
  getStoredOfficialCalendarConfig,
} from '../services/db';
import { SyncStatusSnapshot } from '../services/firebaseSync';
import { StudentAvatar } from './StudentAvatar';
import { CustomSelect } from './CustomSelect';

const AdminArrasteFotosModal = React.lazy(() =>
  import('./AdminArrasteFotosModal').then((m) => ({ default: m.AdminArrasteFotosModal }))
);
const AdminArrastePdfsModal = React.lazy(() =>
  import('./AdminArrastePdfsModal').then((m) => ({ default: m.AdminArrastePdfsModal }))
);
const ImportarDeficienciasHtmScreen = React.lazy(() =>
  import('./ImportarDeficienciasHtmScreen').then((m) => ({
    default: m.ImportarDeficienciasHtmScreen,
  }))
);
const DiagnosticoBancoDadosScreen = React.lazy(() =>
  import('./DiagnosticoBancoDadosScreen').then((m) => ({
    default: m.DiagnosticoBancoDadosScreen,
  }))
);
const DiasLetivosScreen = React.lazy(() =>
  import('./DiasLetivosScreen').then((m) => ({ default: m.DiasLetivosScreen }))
);
const AtualizarDadosJsonModal = React.lazy(() =>
  import('./AtualizarDadosJsonModal').then((m) => ({ default: m.AtualizarDadosJsonModal }))
);
const PwaIconsHealthScanner = React.lazy(() =>
  import('./PwaIconsHealthScanner').then((m) => ({ default: m.PwaIconsHealthScanner }))
);
const IndexedDbPhotoStorageModal = React.lazy(() =>
  import('./IndexedDbPhotoStorageModal').then((m) => ({ default: m.IndexedDbPhotoStorageModal }))
);
import {
  ArrowLeft,
  School,
  Users,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Activity,
  Search,
  X,
  Check,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Download,
  Upload,
  RefreshCw,
  UserPlus,
  Edit3,
  Eye,
  Trash2,
  Sun,
  Sunset,
  Clock,
  Key,
  History,
  Plus,
  Ban,
  Info,
  Database,
  FileCode2,
  HardDrive,
  HeartHandshake,
  BellRing,
  Send,
  Images,
  FileText,
  CalendarClock,
  CalendarDays,
  Loader2,
  Smartphone,
} from 'lucide-react';
import {
  FcmBackendStatus,
  dispatchWindowClosingFcmAlert,
  fetchFcmBackendStatus,
  getStoredFcmSystemConfig,
  saveFcmSystemConfiguration,
} from '../services/fcmService';
import { AdminPaginationBar } from './admin/AdminPaginationBar';
import { AdminSecurityLogsTab } from './admin/AdminSecurityLogsTab';
import { AdminSessionLogsSection } from './admin/AdminSessionLogsSection';
import { AdminUserAssignModal } from './admin/AdminUserAssignModal';

type AccessLevelKey = 'admin' | 'usuario' | 'peb2' | 'aee';

interface AccessLevelMeta {
  key: AccessLevelKey;
  shortLabel: string;
  badgeLabel: string;
  description: string;
  badgeClass: string;
  activeSegmentClass: string;
}

const ACCESS_LEVEL_META: Record<AccessLevelKey, AccessLevelMeta> = {
  admin: {
    key: 'admin',
    shortLabel: 'ADMIN',
    badgeLabel: 'ADMIN',
    description: 'Acesso pleno e gestão',
    badgeClass: 'bg-[#111827] text-white',
    activeSegmentClass: 'bg-[#111827] text-white shadow-xs',
  },
  usuario: {
    key: 'usuario',
    shortLabel: 'PEB I',
    badgeLabel: 'PEB I (Usuário)',
    description: 'Regente · Sua turma',
    badgeClass: 'bg-[#eaf6ef] text-[#005035]',
    activeSegmentClass: 'bg-[#047857] text-white shadow-xs',
  },
  peb2: {
    key: 'peb2',
    shortLabel: 'PEB II',
    badgeLabel: 'PEB II (Visualização)',
    description: 'Especialista · Leitura',
    badgeClass: 'bg-[#e8f0fe] text-[#1a4fa3]',
    activeSegmentClass: 'bg-[#1a4fa3] text-white shadow-xs',
  },
  aee: {
    key: 'aee',
    shortLabel: 'AEE',
    badgeLabel: 'AEE',
    description: 'Educação Especial · Leitura',
    badgeClass: 'bg-[#fef3c7] text-[#92400e]',
    activeSegmentClass: 'bg-[#b45309] text-white shadow-xs',
  },
};

const ACCESS_LEVEL_ORDER: AccessLevelKey[] = ['admin', 'usuario', 'peb2', 'aee'];
const NEW_USER_LEVEL_ORDER: AccessLevelKey[] = ['usuario', 'peb2', 'aee'];

const normalizeSearchText = (value?: string): string =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const resolveAccessLevel = (
  u: Pick<AuthorizedUser, 'email' | 'role' | 'teacherRoleType' | 'subjectName'>,
  draftLevel?: AccessLevelKey
): AccessLevelKey => {
  if (draftLevel) {
    if (draftLevel === 'admin' && !isOfficialSchoolAdminEmail(u.email)) {
      return 'usuario';
    }
    return draftLevel;
  }
  if (isOfficialSchoolAdminEmail(u.email)) {
    return 'admin';
  }
  if (
    u.teacherRoleType === 'aee' ||
    (u.subjectName || '').toUpperCase().includes('AEE') ||
    (u.subjectName || '').toUpperCase().includes('EDUCAÇÃO ESPECIAL')
  ) {
    return 'aee';
  }
  if (u.role === 'peb2' || u.teacherRoleType === 'apoio') {
    return 'peb2';
  }
  return 'usuario';
};

const renderAccessLevelIcon = (level: AccessLevelKey, className = 'w-3 h-3 shrink-0') => {
  switch (level) {
    case 'admin':
      return <ShieldCheck className={className} />;
    case 'usuario':
      return <Users className={className} />;
    case 'peb2':
      return <Eye className={className} />;
    case 'aee':
      return <HeartHandshake className={className} />;
  }
};

interface ToggleSwitchProps {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  activeText: string;
  inactiveText: string;
  ariaLabel: string;
  activeColorClass?: string;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  disabled = false,
  onChange,
  activeText,
  inactiveText,
  ariaLabel,
  activeColorClass = 'bg-[#047857]',
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={onChange}
    className={`inline-flex items-center gap-2 text-left transition-opacity duration-100 ${
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
    }`}
  >
    <span
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 ${
        checked ? activeColorClass : 'bg-[#d1d5db]'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transform transition-transform duration-150 ${
          checked ? 'translate-x-5.5' : 'translate-x-0.5'
        }`}
      />
    </span>
    <span
      className={`text-xs font-semibold whitespace-nowrap ${
        checked ? 'text-[#005035]' : 'text-[#991b1b]'
      }`}
    >
      {checked ? activeText : inactiveText}
    </span>
  </button>
);

export type AdminCenterSection = 'acesso' | 'calendario' | 'seguranca' | 'uploads' | 'diagnostico';
export type AdminUploadTool = 'fotos' | 'pdfs' | 'htm' | 'json';
export type AdminCenterSubTab =
  | 'quadro_turmas'
  | 'contas_acesso'
  | 'rbac_matriz'
  | 'seguranca_lgpd'
  | 'monitoramento'
  | 'pwa_identidade';

type SubTabId = AdminCenterSubTab;

interface UsuariosAcessoScreenProps {
  authorizedUsers: AuthorizedUser[];
  accessSessionLogs?: UserAccessSessionLog[];
  onClearAccessLogs?: () => void;
  classes: ClassGroup[];
  onUpdateClasses?: (updatedClasses: ClassGroup[]) => void;
  currentUserEmail: string;
  userRole: UserRole;
  teacherRoleType?: AuthorizedUser['teacherRoleType'];
  syncSnapshot?: SyncStatusSnapshot;
  attendanceWindowConfig: AttendanceWindowConfig;
  onUpdateAttendanceWindowConfig: (nextConfig: AttendanceWindowConfig) => void;
  onSaveAuthorizedUsers: (updatedUsers: AuthorizedUser[]) => void;
  onSelectPreviewClassId?: (classId: string) => void;
  onSimulateTeacherProfile?: (teacher: AuthorizedUser) => void;
  onNavigateScreen?: (screen: ScreenType) => void;
  onOpenClassDetails?: (cls: ClassGroup) => void;
  initialSection?: AdminCenterSection;
  initialSubTab?: AdminCenterSubTab;
  initialUploadTool?: AdminUploadTool;
  onBack: () => void;
}

export const UsuariosAcessoScreen: React.FC<UsuariosAcessoScreenProps> = ({
  authorizedUsers,
  accessSessionLogs = [],
  onClearAccessLogs,
  classes,
  onUpdateClasses,
  currentUserEmail,
  userRole,
  teacherRoleType,
  syncSnapshot,
  attendanceWindowConfig,
  onUpdateAttendanceWindowConfig,
  onSaveAuthorizedUsers,
  onSelectPreviewClassId,
  onSimulateTeacherProfile,
  onNavigateScreen,
  onOpenClassDetails,
  initialSection = 'acesso',
  initialSubTab,
  initialUploadTool = 'fotos',
  onBack,
}) => {
  const [activeSection, setActiveSection] = useState<AdminCenterSection>(initialSection);
  const [activeUploadTool, setActiveUploadTool] = useState<AdminUploadTool>(initialUploadTool);
  const [isPhotoStorageModalOpen, setIsPhotoStorageModalOpen] = useState(false);
  const [activeSchoolYear, setActiveSchoolYear] = useState<number>(
    () => getStoredOfficialCalendarConfig().year || 2027
  );
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>(
    initialSubTab || (initialSection === 'seguranca' ? 'seguranca_lgpd' : 'quadro_turmas')
  );
  const [matrixShiftFilter, setMatrixShiftFilter] = useState<'ALL' | 'MANHÃ' | 'TARDE' | 'VAGAS'>('ALL');
  const [matrixSearchTerm, setMatrixSearchTerm] = useState('');
  const [editingMatrixClassId, setEditingMatrixClassId] = useState<string | null>(null);
  const [matrixDraft, setMatrixDraft] = useState<{
    teacherName: string;
    teacherPronoun: string;
    teacherFirstName: string;
    room: string;
    shift: 'Turno Manhã' | 'Turno Tarde';
    turmaSedName: string;
    classeSedCode: string;
    artTeacher: string;
    peTeacher: string;
    englishTeacher: string;
  } | null>(null);

  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [emailPrefix, setEmailPrefix] = useState('');
  const [name, setName] = useState('');
  const [newAccessLevel, setNewAccessLevel] = useState<AccessLevelKey>('usuario');
  const [assignedClassId, setAssignedClassId] = useState<string>(classes[0]?.id || 'g04a');
  const [newExpirationDate, setNewExpirationDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | AccessLevelKey>('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'blocked' | 'temporary' | 'expired'
  >('all');
  const [userSortBy, setUserSortBy] = useState<'default' | 'name_asc' | 'email_asc' | 'access_desc'>('default');
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [onlyAccessedFilter, setOnlyAccessedFilter] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [assignModalUserId, setAssignModalUserId] = useState<string | null>(null);
  const [assignModalSearch, setAssignModalSearch] = useState('');
  const [visibleMatrixLimit, setVisibleMatrixLimit] = useState(20);
  const USERS_PAGE_SIZE = 25;
  const LOGS_PAGE_SIZE = 25;
  const SECURITY_PAGE_SIZE = 25;
  const [usersPage, setUsersPage] = useState(1);
  const [logsPage, setLogsPage] = useState(1);
  const [securityPage, setSecurityPage] = useState(1);
  const [draftEdits, setDraftEdits] = useState<
    Record<
      string,
      {
        role: UserRole;
        accessLevel: AccessLevelKey;
        assignedClassId: string;
        assignedClassName: string;
        assignedClassIds: string[];
        assignedClassNames: string[];
      }
    >
  >({});
  const [recentlySavedUserIds, setRecentlySavedUserIds] = useState<Record<string, boolean>>({});

  // Estados de Segurança, LGPD, Matriz RBAC e Modais Inline
  const [securityLogs, setSecurityLogs] = useState<SecurityAuditLogEntry[]>(() =>
    getStoredSecurityAuditLogs()
  );
  const [lgpdConfig, setLgpdConfig] = useState<LgpdProtectionConfig>(() => getStoredLgpdConfig());
  const [securitySearchTerm, setSecuritySearchTerm] = useState('');
  const [securitySeverityFilter, setSecuritySeverityFilter] = useState<
    'all' | 'info' | 'warning' | 'security_alert'
  >('all');
  const [selectedRbacRoleKey, setSelectedRbacRoleKey] = useState<string>('admin');

  // Estados da Central Firebase Cloud Messaging (FCM)
  const [fcmStatus, setFcmStatus] = useState<FcmBackendStatus | null>(null);
  const [fcmConfigDraft, setFcmConfigDraft] = useState<FcmSystemConfig>(() =>
    getStoredFcmSystemConfig()
  );
  const [fcmAudienceTarget, setFcmAudienceTarget] = useState<'pending_only' | 'all'>('pending_only');
  const [isSendingFcmAlert, setIsSendingFcmAlert] = useState(false);
  const [isSavingFcmConfig, setIsSavingFcmConfig] = useState(false);

  useEffect(() => {
    setActiveSection(initialSection);
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
      return;
    }
    if (initialSection === 'seguranca') {
      setActiveSubTab((prev) =>
        prev === 'seguranca_lgpd' || prev === 'monitoramento' || prev === 'pwa_identidade'
          ? prev
          : 'seguranca_lgpd'
      );
    } else if (initialSection === 'acesso') {
      setActiveSubTab((prev) =>
        prev === 'quadro_turmas' || prev === 'contas_acesso' || prev === 'rbac_matriz'
          ? prev
          : 'quadro_turmas'
      );
    }
  }, [initialSection, initialSubTab]);

  useEffect(() => {
    setActiveUploadTool(initialUploadTool);
  }, [initialUploadTool]);

  const handleSelectSection = (section: AdminCenterSection, preferredSubTab?: SubTabId) => {
    setActiveSection(section);
    if (section === 'acesso') {
      if (
        preferredSubTab &&
        (preferredSubTab === 'quadro_turmas' ||
          preferredSubTab === 'contas_acesso' ||
          preferredSubTab === 'rbac_matriz')
      ) {
        setActiveSubTab(preferredSubTab);
      } else if (
        activeSubTab !== 'quadro_turmas' &&
        activeSubTab !== 'contas_acesso' &&
        activeSubTab !== 'rbac_matriz'
      ) {
        setActiveSubTab('quadro_turmas');
      }
    } else if (section === 'seguranca') {
      if (
        preferredSubTab &&
        (preferredSubTab === 'seguranca_lgpd' ||
          preferredSubTab === 'monitoramento' ||
          preferredSubTab === 'pwa_identidade')
      ) {
        setActiveSubTab(preferredSubTab);
      } else if (
        activeSubTab !== 'seguranca_lgpd' &&
        activeSubTab !== 'monitoramento' &&
        activeSubTab !== 'pwa_identidade'
      ) {
        setActiveSubTab('seguranca_lgpd');
      }
    }
  };

  useEffect(() => {
    let active = true;
    fetchFcmBackendStatus().then((status) => {
      if (!active || !status) return;
      setFcmStatus(status);
      if (status.fcmConfig) {
        setFcmConfigDraft(status.fcmConfig);
      }
    });
    return () => {
      active = false;
    };
  }, [activeSection, activeSubTab]);

  const canManage = userRole === 'admin';

  const triggerFeedback = (type: 'success' | 'error', text: string) => {
    setFeedbackMsg({ type, text });
    window.setTimeout(() => setFeedbackMsg(null), 4500);
  };

  const markUserSavedFlash = (userIds: string[]) => {
    setRecentlySavedUserIds((prev) => {
      const next = { ...prev };
      userIds.forEach((id) => {
        next[id] = true;
      });
      return next;
    });
    window.setTimeout(() => {
      setRecentlySavedUserIds((prev) => {
        const next = { ...prev };
        userIds.forEach((id) => {
          delete next[id];
        });
        return next;
      });
    }, 3000);
  };

  const handleToggleMasking = () => {
    if (!canManage) return;
    const nextVal = !lgpdConfig.maskSensitiveDataByDefault;
    const updated = saveStoredLgpdConfig({ maskSensitiveDataByDefault: nextVal });
    setLgpdConfig(updated);
    const newEntry = addSecurityAuditLog({
      userEmail: currentUserEmail,
      userName: 'Administrador Escolar',
      userRole: 'admin',
      eventType: 'DATA_MASKING_TOGGLED',
      actionTitle: nextVal
        ? 'Mascaramento LGPD Ativado'
        : 'Mascaramento LGPD Desativado (Modo Auditoria)',
      details: nextVal
        ? 'Dados sensíveis de menores (CPF, NIS, Endereço, Laudos) ocultados automaticamente.'
        : 'Mascaramento desativado temporariamente para conferência administrativa.',
      targetResource: 'Cadastro de Estudantes SED',
      severity: nextVal ? 'info' : 'warning',
    });
    setSecurityLogs((prev) => [newEntry, ...prev]);
    triggerFeedback(
      'success',
      nextVal
        ? 'Mascaramento de dados sensíveis ativado.'
        : 'Mascaramento temporariamente desativado para conferência.'
    );
  };

  const handleExportSecurityAudit = () => {
    exportSecurityAuditLogsCSV();
    const newEntry = addSecurityAuditLog({
      userEmail: currentUserEmail,
      userName: 'Administrador Escolar',
      userRole: 'admin',
      eventType: 'STUDENT_DATA_EXPORTED',
      actionTitle: 'Relatório de Auditoria LGPD Exportado',
      details: 'Download completo do log de acessos e eventos de segurança em formato CSV.',
      targetResource: 'Auditoria de Segurança',
      severity: 'info',
    });
    setSecurityLogs((prev) => [newEntry, ...prev]);
    triggerFeedback('success', 'Relatório de Auditoria LGPD exportado (.CSV).');
  };

  const handleClearSecurityLogs = () => {
    if (!canManage) return;
    clearStoredSecurityAuditLogs();
    setSecurityLogs([]);
    triggerFeedback('success', 'Logs de auditoria limpos.');
  };

  const getUserEffectiveClassIds = (u: AuthorizedUser): string[] => {
    const d = draftEdits[u.id];
    if (d && d.assignedClassIds && d.assignedClassIds.length > 0) {
      return d.assignedClassIds;
    }
    if (u.assignedClassIds && u.assignedClassIds.length > 0) {
      return u.assignedClassIds.filter((id) => id !== 'all');
    }
    if (u.assignedClassId && u.assignedClassId !== 'all') {
      return [u.assignedClassId];
    }
    return [classes[0]?.id || 'g04a'];
  };

  const buildClassSummaryFromIds = (
    roleVal: UserRole,
    classIds: string[],
    subjectLabel?: string
  ): {
    assignedClassId: string;
    assignedClassName: string;
    assignedClassIds: string[];
    assignedClassNames: string[];
  } => {
    if (roleVal === 'admin') {
      return {
        assignedClassId: 'all',
        assignedClassName: `Todas as ${classes.length} Turmas (Acesso Pleno)`,
        assignedClassIds: ['all'],
        assignedClassNames: [`Todas as ${classes.length} Turmas (Acesso Pleno)`],
      };
    }
    if (roleVal === 'peb2') {
      const cleanIds = Array.from(new Set(classIds.filter((id) => id && id !== 'all')));
      if (cleanIds.length > 0) {
        const matched = cleanIds
          .map((id) => classes.find((c) => c.id === id))
          .filter((c): c is ClassGroup => Boolean(c));
        const abrevList = matched.map((c) => c.turmaAbrev || c.name).join(', ');
        return {
          assignedClassId: 'all',
          assignedClassName: `${subjectLabel || 'Especialista'} (${matched.length} turmas: ${abrevList})`,
          assignedClassIds: cleanIds,
          assignedClassNames: matched.map((c) => c.turmaAbrev || c.name),
        };
      }
      return {
        assignedClassId: 'all',
        assignedClassName: 'Todas as Turmas (Somente Visualização)',
        assignedClassIds: ['all'],
        assignedClassNames: ['Todas as Turmas (Somente Visualização)'],
      };
    }
    const cleanIds = Array.from(new Set(classIds.filter((id) => id && id !== 'all')));
    const matched = cleanIds
      .map((id) => classes.find((c) => c.id === id))
      .filter((c): c is ClassGroup => Boolean(c));
    const finalClasses = matched.length > 0 ? matched : [classes[0]].filter(Boolean);
    const ids = finalClasses.map((c) => c.id);
    const names = finalClasses.map(
      (c) => `${c.name} (${c.shift.replace('Turno ', '')})`
    );
    return {
      assignedClassId: ids[0] || 'g04a',
      assignedClassName: names.join(' + ') || 'GRUPO 04 A (Manhã)',
      assignedClassIds: ids.length > 0 ? ids : ['g04a'],
      assignedClassNames: names.length > 0 ? names : ['GRUPO 04 A (Manhã)'],
    };
  };

  const findRegenteUserForClass = (cls: ClassGroup): AuthorizedUser | undefined => {
    const byClassId = authorizedUsers.find(
      (u) =>
        u.role === 'usuario' &&
        (u.assignedClassId === cls.id ||
          (u.assignedClassIds && u.assignedClassIds.includes(cls.id)))
    );
    if (byClassId) return byClassId;
    if (cls.teacherName) {
      const normName = cls.teacherName.trim().toUpperCase();
      return authorizedUsers.find((u) => u.name.trim().toUpperCase() === normName);
    }
    return undefined;
  };

  const handleStartEditMatrixRow = (cls: ClassGroup) => {
    if (!canManage) return;
    setEditingMatrixClassId(cls.id);
    setMatrixDraft({
      teacherName: cls.teacherName || '',
      teacherPronoun: cls.teacherPronoun || 'PROFESSORA',
      teacherFirstName:
        cls.teacherFirstName || (cls.teacherName || '').split(' ')[0] || '',
      room: cls.room || '',
      shift: cls.shift === 'Turno Tarde' ? 'Turno Tarde' : 'Turno Manhã',
      turmaSedName: cls.turmaSedName || '',
      classeSedCode: cls.classeSedCode || '',
      artTeacher: cls.artTeacher || '',
      peTeacher: cls.peTeacher || '',
      englishTeacher: cls.englishTeacher || '',
    });
  };

  const handleSaveMatrixRow = (cls: ClassGroup) => {
    if (!canManage || !matrixDraft) return;

    const trimmedTeacher = matrixDraft.teacherName.trim().toUpperCase();
    const isVagaNow = trimmedTeacher === 'TURMA VAGA' || trimmedTeacher === '';

    const updatedClasses = classes.map((c) =>
      c.id === cls.id
        ? {
            ...c,
            teacherName: trimmedTeacher || 'TURMA VAGA',
            teacherPronoun: matrixDraft.teacherPronoun.trim().toUpperCase(),
            teacherFirstName: matrixDraft.teacherFirstName.trim().toUpperCase(),
            room: matrixDraft.room.trim().toUpperCase(),
            shift: matrixDraft.shift,
            turmaSedName: matrixDraft.turmaSedName.trim().toUpperCase(),
            classeSedCode: matrixDraft.classeSedCode.trim(),
            artTeacher: matrixDraft.artTeacher.trim().toUpperCase(),
            peTeacher: matrixDraft.peTeacher.trim().toUpperCase(),
            englishTeacher: matrixDraft.englishTeacher.trim().toUpperCase(),
            isVaga: isVagaNow,
          }
        : c
    );

    if (onUpdateClasses) {
      onUpdateClasses(updatedClasses);
    }

    const regenteUser = findRegenteUserForClass(cls);
    if (regenteUser && matrixDraft.teacherName.trim()) {
      const nextUsers = authorizedUsers.map((u) =>
        u.id === regenteUser.id
          ? {
              ...u,
              name: matrixDraft.teacherName.trim().toUpperCase(),
              pronoun: matrixDraft.teacherPronoun.trim().toUpperCase(),
              firstName: matrixDraft.teacherFirstName.trim().toUpperCase(),
              assignedClassName: `${cls.name} (${matrixDraft.shift.replace('Turno ', '')})`,
              updatedAtMs: Date.now(),
            }
          : u
      );
      onSaveAuthorizedUsers(nextUsers);
    }

    setEditingMatrixClassId(null);
    setMatrixDraft(null);
    triggerFeedback(
      'success',
      `Quadro da turma ${cls.turmaAbrev || cls.name} atualizado.`
    );
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    let fullEmail = emailPrefix.trim().toLowerCase();
    if (!fullEmail.includes('@')) {
      fullEmail = `${fullEmail}${INSTITUTIONAL_EMAIL_DOMAIN}`;
    }

    if (!isValidInstitutionalEmail(fullEmail)) {
      triggerFeedback(
        'error',
        `Somente e-mails com final ${INSTITUTIONAL_EMAIL_DOMAIN} podem ser cadastrados.`
      );
      return;
    }

    const localPart = fullEmail.replace(INSTITUTIONAL_EMAIL_DOMAIN, '').trim();
    if (!localPart || localPart.length < 2) {
      triggerFeedback('error', 'Informe o identificador do e-mail institucional.');
      return;
    }

    const exists = authorizedUsers.some(
      (u) => u.email.trim().toLowerCase() === fullEmail
    );
    if (exists) {
      triggerFeedback('error', `O e-mail ${fullEmail} já está cadastrado.`);
      return;
    }

    if (newAccessLevel === 'admin' && !isOfficialSchoolAdminEmail(fullEmail)) {
      triggerFeedback(
        'error',
        'O perfil de Administrador é exclusivo da conta institucional da escola (emebjfreitas@jundiai.sp.gov.br).'
      );
      return;
    }

    const targetRole: UserRole =
      newAccessLevel === 'admin'
        ? 'admin'
        : newAccessLevel === 'usuario'
        ? 'usuario'
        : 'peb2';
    const targetTeacherRoleType: AuthorizedUser['teacherRoleType'] =
      newAccessLevel === 'admin'
        ? 'gestao'
        : newAccessLevel === 'aee'
        ? 'aee'
        : newAccessLevel === 'peb2'
        ? 'especialista'
        : 'regente';
    const targetSubjectName: AuthorizedUser['subjectName'] =
      newAccessLevel === 'admin'
        ? 'GESTÃO / ADMIN'
        : newAccessLevel === 'aee'
        ? 'EDUCAÇÃO ESPECIAL (AEE)'
        : newAccessLevel === 'usuario'
        ? 'REGENTE PEB I'
        : undefined;

    const targetClass = classes.find((c) => c.id === assignedClassId);
    const assignedClassName =
      newAccessLevel === 'admin'
        ? `Todas as ${classes.length} Turmas (Acesso Pleno)`
        : newAccessLevel === 'aee'
        ? 'Educação Especial AEE (Visualização)'
        : newAccessLevel === 'peb2'
        ? 'Todas as Turmas (Somente Visualização)'
        : targetClass
        ? `${targetClass.name} (${targetClass.shift.replace('Turno ', '')})`
        : 'GRUPO 04 A (Manhã)';

    const cleanExp = newExpirationDate.trim();
    const hasValidExp = /^\d{4}-\d{2}-\d{2}$/.test(cleanExp);
    const isAlreadyExpired = hasValidExp && getLocalTodayDateISO() > cleanExp;

    const newUser: AuthorizedUser = {
      id: `usr-${Date.now()}`,
      email: fullEmail,
      name: (name.trim() || `Servidor(a) ${localPart}`).toUpperCase(),
      role: targetRole,
      teacherRoleType: targetTeacherRoleType,
      subjectName: targetSubjectName,
      assignedClassId: targetRole === 'usuario' ? assignedClassId : 'all',
      assignedClassName,
      assignedClassIds: targetRole === 'usuario' ? [assignedClassId] : ['all'],
      assignedClassNames: [assignedClassName],
      active: !isAlreadyExpired,
      ...(hasValidExp ? { accessExpiresAt: cleanExp } : {}),
      createdAt: new Date().toLocaleDateString('pt-BR'),
      updatedAtMs: Date.now(),
    };

    onSaveAuthorizedUsers([newUser, ...authorizedUsers]);
    setEmailPrefix('');
    setName('');
    setNewExpirationDate('');
    setShowAddUserForm(false);
    triggerFeedback(
      isAlreadyExpired ? 'error' : 'success',
      hasValidExp
        ? isAlreadyExpired
          ? `Conta ${fullEmail} cadastrada com data vencida (${formatAccessExpirationDateBR(cleanExp)}) — acesso revogado.`
          : `Acesso ${ACCESS_LEVEL_META[newAccessLevel].badgeLabel} liberado para ${fullEmail} até ${formatAccessExpirationDateBR(cleanExp)}.`
        : `Acesso ${ACCESS_LEVEL_META[newAccessLevel].badgeLabel} liberado para ${fullEmail}.`
    );
  };

  const handleSelectAccessLevel = (userId: string, level: AccessLevelKey) => {
    if (!canManage) return;
    const origUser = authorizedUsers.find((u) => u.id === userId);
    if (!origUser) return;

    const currentLevel = resolveAccessLevel(origUser, draftEdits[userId]?.accessLevel);
    if (currentLevel === level) return;

    const isSchoolAdmin = isOfficialSchoolAdminEmail(origUser.email);
    if (level === 'admin' && !isSchoolAdmin) {
      triggerFeedback(
        'error',
        'O perfil de Administrador é exclusivo da conta institucional da escola (emebjfreitas@jundiai.sp.gov.br).'
      );
      return;
    }
    if (isSchoolAdmin && level !== 'admin') {
      triggerFeedback(
        'error',
        'A conta institucional da escola (emebjfreitas@jundiai.sp.gov.br) deve permanecer como Administrador.'
      );
      return;
    }

    if (currentLevel === 'admin' && level !== 'admin') {
      const activeAdmins = authorizedUsers.filter(
        (u) => u.active && resolveAccessLevel(u) === 'admin'
      );
      if (activeAdmins.length <= 1 && origUser.active) {
        triggerFeedback('error', 'É obrigatório manter pelo menos 1 Administrador ativo.');
        return;
      }
    }

    const newRole: UserRole =
      level === 'admin' ? 'admin' : level === 'usuario' ? 'usuario' : 'peb2';
    const nextTeacherRoleType: AuthorizedUser['teacherRoleType'] =
      level === 'admin'
        ? 'gestao'
        : level === 'aee'
        ? 'aee'
        : level === 'peb2'
        ? 'especialista'
        : 'regente';
    const nextSubjectName: AuthorizedUser['subjectName'] =
      level === 'admin'
        ? 'GESTÃO / ADMIN'
        : level === 'aee'
        ? 'EDUCAÇÃO ESPECIAL (AEE)'
        : level === 'usuario'
        ? 'REGENTE PEB I'
        : origUser.subjectName &&
          origUser.subjectName !== 'GESTÃO / ADMIN' &&
          origUser.subjectName !== 'REGENTE PEB I' &&
          origUser.subjectName !== 'EDUCAÇÃO ESPECIAL (AEE)'
        ? origUser.subjectName
        : undefined;

    const currentClassIds = getUserEffectiveClassIds(origUser);
    const summary = buildClassSummaryFromIds(newRole, currentClassIds, nextSubjectName);
    if (level === 'aee') {
      summary.assignedClassName = 'Educação Especial AEE (Visualização)';
      summary.assignedClassNames = ['Educação Especial AEE (Visualização)'];
    }

    setDraftEdits((prev) => ({
      ...prev,
      [userId]: {
        role: newRole,
        accessLevel: level,
        ...summary,
      },
    }));

    const nowMs = Date.now();
    const next: AuthorizedUser[] = authorizedUsers.map((u) =>
      u.id === userId
        ? {
            ...u,
            role: newRole,
            teacherRoleType: nextTeacherRoleType,
            subjectName: nextSubjectName,
            ...summary,
            updatedAtMs: nowMs,
          }
        : u
    );
    onSaveAuthorizedUsers(next);
    const auditEntry = addSecurityAuditLog({
      userEmail: currentUserEmail,
      userName: 'Administrador Escolar',
      userRole: 'admin',
      eventType: 'ROLE_PERMISSION_CHANGED',
      actionTitle: `Nível alterado para ${ACCESS_LEVEL_META[level].badgeLabel}`,
      details: `${origUser.name} (${origUser.email}) atualizado de ${ACCESS_LEVEL_META[currentLevel].badgeLabel} para ${ACCESS_LEVEL_META[level].badgeLabel}.`,
      targetResource: origUser.email,
      severity: level === 'admin' ? 'warning' : 'info',
    });
    setSecurityLogs((prev) => [auditEntry, ...prev]);
    markUserSavedFlash([userId]);
  };

  const handleToggleUserExtraClass = (userId: string, classId: string) => {
    if (!canManage || !classId) return;
    const origUser = authorizedUsers.find((u) => u.id === userId);
    if (!origUser) return;
    const currentDraft = draftEdits[userId];
    const effectiveRole = currentDraft ? currentDraft.role : origUser.role;
    const effectiveLevel = resolveAccessLevel(origUser, currentDraft?.accessLevel);
    const existingIds = getUserEffectiveClassIds(origUser);
    const exists = existingIds.includes(classId);
    let nextIds: string[];
    if (exists) {
      if (existingIds.length <= 1) return;
      nextIds = existingIds.filter((id) => id !== classId);
    } else {
      nextIds = Array.from(new Set([...existingIds, classId]));
    }
    const summary = buildClassSummaryFromIds(effectiveRole, nextIds, origUser.subjectName);

    setDraftEdits((prev) => ({
      ...prev,
      [userId]: {
        role: effectiveRole,
        accessLevel: effectiveLevel,
        ...summary,
      },
    }));

    const nowMs = Date.now();
    const next = authorizedUsers.map((u) =>
      u.id === userId
        ? {
            ...u,
            role: effectiveRole,
            ...summary,
            updatedAtMs: nowMs,
          }
        : u
    );
    onSaveAuthorizedUsers(next);
    if (!exists && onSelectPreviewClassId) {
      onSelectPreviewClassId(classId);
    }
    markUserSavedFlash([userId]);
  };

  const handleSetUserFunctionPreset = (
    userId: string,
    preset: 'regente' | 'especialista' | 'aee' | 'apoio' | 'admin'
  ) => {
    if (!canManage) return;
    const origUser = authorizedUsers.find((u) => u.id === userId);
    if (!origUser) return;
    const currentLevel = resolveAccessLevel(origUser, draftEdits[userId]?.accessLevel);
    const isSchoolAdmin = isOfficialSchoolAdminEmail(origUser.email);
    if (preset === 'admin' && !isSchoolAdmin) {
      triggerFeedback(
        'error',
        'O perfil de Administrador é exclusivo da conta institucional da escola (emebjfreitas@jundiai.sp.gov.br).'
      );
      return;
    }
    if (isSchoolAdmin && preset !== 'admin') {
      triggerFeedback(
        'error',
        'A conta institucional da escola (emebjfreitas@jundiai.sp.gov.br) deve permanecer como Administrador.'
      );
      return;
    }
    if (currentLevel === 'admin' && preset !== 'admin') {
      const activeAdmins = authorizedUsers.filter(
        (u) => u.active && resolveAccessLevel(u) === 'admin'
      );
      if (activeAdmins.length <= 1 && origUser.active) {
        triggerFeedback('error', 'É obrigatório manter pelo menos 1 Administrador ativo.');
        return;
      }
    }

    const targetRole: UserRole =
      preset === 'admin' ? 'admin' : preset === 'regente' ? 'usuario' : 'peb2';
    const nextLevel: AccessLevelKey =
      preset === 'admin'
        ? 'admin'
        : preset === 'regente'
        ? 'usuario'
        : preset === 'aee'
        ? 'aee'
        : 'peb2';
    const nextTeacherRoleType: AuthorizedUser['teacherRoleType'] =
      preset === 'admin'
        ? 'gestao'
        : preset === 'regente'
        ? 'regente'
        : preset === 'aee'
        ? 'aee'
        : preset === 'apoio'
        ? 'apoio'
        : 'especialista';
    const nextSubjectName: AuthorizedUser['subjectName'] =
      preset === 'admin'
        ? 'GESTÃO / ADMIN'
        : preset === 'regente'
        ? 'REGENTE PEB I'
        : preset === 'aee'
        ? 'EDUCAÇÃO ESPECIAL (AEE)'
        : origUser.subjectName &&
          origUser.subjectName !== 'GESTÃO / ADMIN' &&
          origUser.subjectName !== 'REGENTE PEB I' &&
          origUser.subjectName !== 'EDUCAÇÃO ESPECIAL (AEE)'
        ? origUser.subjectName
        : undefined;

    const currentClassIds = getUserEffectiveClassIds(origUser);
    const summary = buildClassSummaryFromIds(targetRole, currentClassIds, nextSubjectName);
    if (preset === 'aee') {
      summary.assignedClassName = 'Educação Especial AEE (Visualização)';
      summary.assignedClassNames = ['Educação Especial AEE (Visualização)'];
    } else if (preset === 'apoio') {
      summary.assignedClassName = 'Apoio Pedagógico (Leitura)';
      summary.assignedClassNames = ['Apoio Pedagógico (Leitura)'];
    }

    setDraftEdits((prev) => ({
      ...prev,
      [userId]: {
        role: targetRole,
        accessLevel: nextLevel,
        ...summary,
      },
    }));

    const nowMs = Date.now();
    const next = authorizedUsers.map((u) =>
      u.id === userId
        ? {
            ...u,
            role: targetRole,
            teacherRoleType: nextTeacherRoleType,
            subjectName: nextSubjectName,
            ...summary,
            updatedAtMs: nowMs,
          }
        : u
    );
    onSaveAuthorizedUsers(next);
    markUserSavedFlash([userId]);
  };

  const handleToggleActive = (userId: string) => {
    if (!canManage) return;
    const target = authorizedUsers.find((u) => u.id === userId);
    if (!target) return;
    if (!target.active && isUserAccessExpired(target)) {
      triggerFeedback(
        'error',
        `A validade de ${target.name} expirou após ${formatAccessExpirationDateBR(
          target.accessExpiresAt
        )}. Atualize ou remova a data de validade para reativar o acesso.`
      );
      return;
    }
    if (target.active && resolveAccessLevel(target) === 'admin') {
      const activeAdmins = authorizedUsers.filter(
        (u) => u.active && resolveAccessLevel(u) === 'admin'
      );
      if (activeAdmins.length <= 1) {
        triggerFeedback('error', 'É obrigatório manter pelo menos 1 Administrador ativo.');
        return;
      }
    }
    const next = authorizedUsers.map((u) =>
      u.id === userId ? { ...u, active: !u.active, updatedAtMs: Date.now() } : u
    );
    onSaveAuthorizedUsers(next);
    markUserSavedFlash([userId]);
  };

  const handleUpdateUserExpiration = (userId: string, rawDate: string) => {
    if (!canManage) return;
    const target = authorizedUsers.find((u) => u.id === userId);
    if (!target) return;

    const cleanDate = rawDate.trim();
    if (cleanDate && !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return;

    const isPastDate = Boolean(cleanDate) && getLocalTodayDateISO() > cleanDate;
    if (isPastDate && resolveAccessLevel(target) === 'admin' && target.active) {
      const activeAdmins = authorizedUsers.filter(
        (u) => u.active && resolveAccessLevel(u) === 'admin'
      );
      if (activeAdmins.length <= 1) {
        triggerFeedback(
          'error',
          'É obrigatório manter pelo menos 1 Administrador ativo com acesso válido.'
        );
        return;
      }
    }

    const wasExpired = isUserAccessExpired(target);
    const nowMs = Date.now();
    const nextUsers: AuthorizedUser[] = authorizedUsers.map((u) => {
      if (u.id !== userId) return u;
      if (!cleanDate) {
        const { accessExpiresAt: _removed, ...rest } = u;
        return {
          ...rest,
          active: wasExpired ? true : u.active,
          updatedAtMs: nowMs,
        };
      }
      return {
        ...u,
        accessExpiresAt: cleanDate,
        active: isPastDate ? false : wasExpired ? true : u.active,
        updatedAtMs: nowMs,
      };
    });

    onSaveAuthorizedUsers(nextUsers);
    markUserSavedFlash([userId]);

    const auditEntry = addSecurityAuditLog({
      userEmail: currentUserEmail,
      userName: 'Administrador Escolar',
      userRole: 'admin',
      eventType: 'ROLE_PERMISSION_CHANGED',
      actionTitle: !cleanDate
        ? 'Validade de acesso removida (acesso permanente)'
        : isPastDate
        ? 'Data de expiração vencida — acesso revogado'
        : `Validade de acesso definida até ${formatAccessExpirationDateBR(cleanDate)}`,
      details: `${target.name} (${target.email}) atualizado para ${
        !cleanDate
          ? 'acesso sem data de expiração'
          : `validade até ${formatAccessExpirationDateBR(cleanDate)}`
      }.`,
      targetResource: target.email,
      severity: isPastDate ? 'warning' : 'info',
    });
    setSecurityLogs((prev) => [auditEntry, ...prev]);

    triggerFeedback(
      isPastDate ? 'error' : 'success',
      !cleanDate
        ? `Validade removida: ${target.name} agora possui acesso permanente.`
        : isPastDate
        ? `Data ${formatAccessExpirationDateBR(cleanDate)} já vencida — acesso de ${target.name} revogado automaticamente.`
        : `Validade de ${target.name} definida até ${formatAccessExpirationDateBR(cleanDate)}.`
    );
  };

  const handleRemoveUser = (user: AuthorizedUser) => {
    if (!canManage) return;
    const adminsActive = authorizedUsers.filter((u) => u.role === 'admin' && u.active);
    if (user.role === 'admin' && adminsActive.length <= 1) {
      triggerFeedback('error', 'É obrigatório manter pelo menos 1 Administrador ativo.');
      return;
    }
    const next = authorizedUsers.filter((u) => u.id !== user.id);
    onSaveAuthorizedUsers(next);
    triggerFeedback('success', `Acesso de ${user.email} removido.`);
  };

  const handleRestoreOfficialSchoolMatrix = () => {
    if (!canManage) return;
    const metricsByEmail = new Map(
      authorizedUsers.map((u) => [u.email.trim().toLowerCase(), u])
    );
    const mergedUsers = INITIAL_AUTHORIZED_USERS.map((off) => {
      const existing = metricsByEmail.get(off.email.trim().toLowerCase());
      return {
        ...off,
        ...(existing?.accessExpiresAt ? { accessExpiresAt: existing.accessExpiresAt } : {}),
        totalAccessCount: existing?.totalAccessCount || 0,
        totalDurationSeconds: existing?.totalDurationSeconds || 0,
        lastSessionDurationSeconds: existing?.lastSessionDurationSeconds || 0,
        lastLoginAt: existing?.lastLoginAt,
        lastActiveAt: existing?.lastActiveAt,
        lastScreenVisited: existing?.lastScreenVisited,
        updatedAtMs: Date.now(),
      };
    });
    onSaveAuthorizedUsers(mergedUsers);
    triggerFeedback(
      'success',
      `Quadro Oficial sincronizado com ${classes.length} turmas e especialistas.`
    );
  };

  // Filtered classes for Quadro Docente (mantendo estritamente a ordem oficial do array `classes`)
  const filteredMatrixClasses = useMemo(() => {
    const q = matrixSearchTerm.toLowerCase().trim();
    return classes.filter((cls) => {
      if (matrixShiftFilter === 'MANHÃ' && cls.shift !== 'Turno Manhã') return false;
      if (matrixShiftFilter === 'TARDE' && cls.shift !== 'Turno Tarde') return false;
      if (
        matrixShiftFilter === 'VAGAS' &&
        !cls.isVaga &&
        cls.teacherName !== 'TURMA VAGA'
      ) {
        return false;
      }
      if (!q) return true;
      return (
        cls.name.toLowerCase().includes(q) ||
        (cls.turmaAbrev || '').toLowerCase().includes(q) ||
        (cls.teacherName || '').toLowerCase().includes(q) ||
        (cls.teacherFirstName || '').toLowerCase().includes(q) ||
        (cls.room || '').toLowerCase().includes(q) ||
        (cls.turmaSedName || '').toLowerCase().includes(q) ||
        (cls.classeSedCode || '').toLowerCase().includes(q) ||
        (cls.artTeacher || '').toLowerCase().includes(q) ||
        (cls.peTeacher || '').toLowerCase().includes(q) ||
        (cls.englishTeacher || '').toLowerCase().includes(q)
      );
    });
  }, [classes, matrixShiftFilter, matrixSearchTerm]);

  const specialistsUsers = useMemo(
    () =>
      authorizedUsers.filter((u) => resolveAccessLevel(u) === 'peb2'),
    [authorizedUsers]
  );

  const activeUsersCount = useMemo(
    () => authorizedUsers.filter((u) => isUserAccessEffectivelyActive(u)).length,
    [authorizedUsers]
  );

  const blockedUsersCount = useMemo(
    () => authorizedUsers.filter((u) => !isUserAccessEffectivelyActive(u)).length,
    [authorizedUsers]
  );

  const temporaryUsersCount = useMemo(
    () => authorizedUsers.filter((u) => Boolean(u.accessExpiresAt)).length,
    [authorizedUsers]
  );

  const expiredUsersCount = useMemo(
    () => authorizedUsers.filter((u) => isUserAccessExpired(u)).length,
    [authorizedUsers]
  );

  const hasActiveUserFilters =
    searchTerm.trim().length > 0 ||
    roleFilter !== 'all' ||
    statusFilter !== 'all' ||
    onlyAccessedFilter ||
    userSortBy !== 'default';

  const handleResetUserFilters = () => {
    setSearchTerm('');
    setRoleFilter('all');
    setStatusFilter('all');
    setOnlyAccessedFilter(false);
    setUserSortBy('default');
    setUsersPage(1);
  };

  const filteredUsers = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchTerm);
    const queryTokens = normalizedQuery ? normalizedQuery.split(/\s+/).filter(Boolean) : [];

    const matched = authorizedUsers.filter((u) => {
      const level = resolveAccessLevel(u, draftEdits[u.id]?.accessLevel);
      if (roleFilter !== 'all' && level !== roleFilter) return false;
      if (statusFilter === 'active' && !isUserAccessEffectivelyActive(u)) return false;
      if (statusFilter === 'blocked' && isUserAccessEffectivelyActive(u)) return false;
      if (statusFilter === 'temporary' && !u.accessExpiresAt) return false;
      if (statusFilter === 'expired' && !isUserAccessExpired(u)) return false;
      if (onlyAccessedFilter && (u.totalAccessCount || 0) === 0) return false;
      if (queryTokens.length === 0) return true;

      const haystack = normalizeSearchText(
        [
          u.name,
          u.email,
          u.firstName,
          u.subjectName,
          draftEdits[u.id]?.assignedClassName || u.assignedClassName,
          ...(draftEdits[u.id]?.assignedClassNames || u.assignedClassNames || []),
        ]
          .filter(Boolean)
          .join(' ')
      );
      return queryTokens.every((token) => haystack.includes(token));
    });

    if (userSortBy === 'default') return matched;

    return [...matched].sort((a, b) => {
      if (userSortBy === 'name_asc') {
        return (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' });
      }
      if (userSortBy === 'email_asc') {
        return (a.email || '').localeCompare(b.email || '', 'pt-BR', { sensitivity: 'base' });
      }
      return (b.totalAccessCount || 0) - (a.totalAccessCount || 0);
    });
  }, [authorizedUsers, draftEdits, roleFilter, statusFilter, onlyAccessedFilter, searchTerm, userSortBy]);

  const filteredLogs = useMemo(() => {
    const q = logSearchTerm.toLowerCase().trim();
    if (!q) return accessSessionLogs;
    return accessSessionLogs.filter(
      (l) =>
        l.email.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        l.assignedClassName.toLowerCase().includes(q)
    );
  }, [accessSessionLogs, logSearchTerm]);

  const filteredSecurityLogs = useMemo(() => {
    const q = securitySearchTerm.toLowerCase().trim();
    return securityLogs.filter((entry) => {
      if (
        securitySeverityFilter !== 'all' &&
        entry.severity !== securitySeverityFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        entry.userEmail.toLowerCase().includes(q) ||
        entry.actionTitle.toLowerCase().includes(q) ||
        entry.details.toLowerCase().includes(q) ||
        entry.eventType.toLowerCase().includes(q) ||
        (entry.userName || '').toLowerCase().includes(q)
      );
    });
  }, [securityLogs, securitySearchTerm, securitySeverityFilter]);

  // KPIs & Contagens
  const totalUsersWhoAccessed = authorizedUsers.filter(
    (u) => (u.totalAccessCount || 0) > 0
  ).length;
  const totalAccessesCount = authorizedUsers.reduce(
    (acc, u) => acc + (u.totalAccessCount || 0),
    0
  );
  const totalPlatformDurationSeconds = authorizedUsers.reduce(
    (acc, u) => acc + (u.totalDurationSeconds || 0),
    0
  );
  const activeNowSessionsCount = accessSessionLogs.filter((l) => {
    if (l.logoutTimeISO) return false;
    const diffMs = Date.now() - new Date(l.lastHeartbeatISO).getTime();
    return diffMs < 120000;
  }).length;

  const peb1Count = authorizedUsers.filter((u) => resolveAccessLevel(u) === 'usuario').length;
  const peb2Count = specialistsUsers.length;
  const aeeCount = authorizedUsers.filter((u) => resolveAccessLevel(u) === 'aee').length;
  const adminCount = authorizedUsers.filter((u) => resolveAccessLevel(u) === 'admin').length;

  const windowEval = evaluateAttendanceLaunchWindow(attendanceWindowConfig);

  const handleToggleExceptionalLaunch = () => {
    if (!canManage) return;
    const nextState = !attendanceWindowConfig.exceptionalOverrideOpen;
    onUpdateAttendanceWindowConfig({
      ...attendanceWindowConfig,
      exceptionalOverrideOpen: nextState,
      updatedByEmail: currentUserEmail,
      updatedAt: new Date().toLocaleString('pt-BR'),
    });
    triggerFeedback(
      'success',
      nextState
        ? 'Lançamento de faltas liberado excepcionalmente.'
        : 'Liberação excepcional encerrada.'
    );
  };

  const handleSendWindowClosingFcmFromAcessos = async (
    audienceOverride?: 'pending_only' | 'all'
  ) => {
    if (!canManage || isSendingFcmAlert) return;
    setIsSendingFcmAlert(true);
    try {
      const targetAud = audienceOverride || fcmAudienceTarget;
      const res = await dispatchWindowClosingFcmAlert({
        targetAudience: targetAud,
        attendanceWindowConfig,
        classes,
        senderEmail: currentUserEmail,
        senderName: 'Coordenação / Direção Escolar',
      });
      triggerFeedback('success', res.message);
      const updatedStatus = await fetchFcmBackendStatus();
      if (updatedStatus) setFcmStatus(updatedStatus);
    } catch {
      triggerFeedback('error', 'Não foi possível disparar o alerta FCM agora.');
    } finally {
      setIsSendingFcmAlert(false);
    }
  };

  const handleSaveFcmConfigFromAcessos = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canManage || isSavingFcmConfig) return;
    setIsSavingFcmConfig(true);
    try {
      const ok = await saveFcmSystemConfiguration(fcmConfigDraft);
      triggerFeedback(
        ok ? 'success' : 'error',
        ok
          ? 'Configurações do Firebase Cloud Messaging (FCM) salvas.'
          : 'Erro ao salvar configurações FCM no servidor.'
      );
      const updatedStatus = await fetchFcmBackendStatus();
      if (updatedStatus) setFcmStatus(updatedStatus);
    } finally {
      setIsSavingFcmConfig(false);
    }
  };

  const manhaTurmasCount = classes.filter((c) => c.shift === 'Turno Manhã').length;
  const tardeTurmasCount = classes.filter((c) => c.shift === 'Turno Tarde').length;
  const vacantTurmasCount = classes.filter(
    (c) => c.isVaga || c.teacherName === 'TURMA VAGA'
  ).length;
  const totalActiveStudentsAll = classes.reduce(
    (acc, c) =>
      acc +
      c.students.filter((s) => {
        const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
        return !sit.includes('BXTR') && !sit.includes('TRANSF') && !sit.includes('REMAN');
      }).length,
    0
  );

  const effectiveSyncSnapshot: SyncStatusSnapshot = syncSnapshot ?? {
    status: 'synced',
    pendingCount: 0,
    lastSyncedAtISO: null,
    lastError: null,
    queue: [],
  };

  const primarySections: {
    id: AdminCenterSection;
    label: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'acesso',
      label: 'Acesso & Docentes',
      icon: <Users className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'calendario',
      label: 'Ano Letivo & 200 Dias',
      icon: <CalendarDays className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'seguranca',
      label: 'Segurança & Auditoria',
      icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'uploads',
      label: 'Central de Uploads',
      icon: <Upload className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'diagnostico',
      label: 'Diagnóstico do Banco',
      icon: <Database className="w-4 h-4 shrink-0" />,
    },
  ];

  const accessSubTabs: { id: SubTabId; label: string; count?: number; icon: React.ReactNode }[] = [
    {
      id: 'quadro_turmas',
      label: 'Quadro Docente',
      count: classes.length,
      icon: <School className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'contas_acesso',
      label: 'E-mails Autorizados & Perfis',
      count: authorizedUsers.length,
      icon: <Users className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'rbac_matriz',
      label: 'Permissões (RBAC)',
      icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
    },
  ];

  const securitySubTabs: { id: SubTabId; label: string; count?: number; icon: React.ReactNode }[] = [
    {
      id: 'seguranca_lgpd',
      label: 'Segurança, LGPD & FCM',
      icon: <Lock className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'monitoramento',
      label: 'Tempo de Tela & Sessões',
      count: accessSessionLogs.length,
      icon: <Activity className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'pwa_identidade',
      label: 'Ícones iOS & PWA',
      icon: <Smartphone className="w-4 h-4 shrink-0" />,
    },
  ];

  const uploadTools: {
    id: AdminUploadTool;
    label: string;
    subtitle: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'fotos',
      label: 'Fotos em Lote',
      subtitle: 'Vincular imagens por RA ou nome',
      icon: <Images className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'pdfs',
      label: 'Fichas PDF em Lote',
      subtitle: 'Vincular PDFs nominais',
      icon: <FileText className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'htm',
      label: 'Deficiências .HTM (AEE)',
      subtitle: 'Importar registros SED',
      icon: <FileCode2 className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'json',
      label: 'Backup & JSON',
      subtitle: 'Exportar, restaurar ou limpar dados',
      icon: <Upload className="w-4 h-4 shrink-0" />,
    },
  ];

  const rbacModules = [
    {
      module: 'Visualizar Turmas e Estudantes',
      subtitle: 'Identificação e fotos escolares',
      admin: 'Acesso total',
      peb1: 'Sua turma',
      peb2: '40 turmas',
      apoio: 'Acesso total',
    },
    {
      module: 'Lançamento de Faltas do Mês',
      subtitle: 'Registro de ausências e atestados',
      admin: 'Acesso total',
      peb1: 'Sua turma',
      peb2: 'Bloqueado',
      apoio: 'Bloqueado',
    },
    {
      module: 'Busca Ativa e Devolutivas',
      subtitle: 'Alertas de 3, 5 e 10 dias',
      admin: 'Acesso total',
      peb1: 'Registra e lê',
      peb2: 'Bloqueado',
      apoio: 'Acesso total',
    },
    {
      module: 'Dados Sensíveis (LGPD Art. 14)',
      subtitle: 'CPF, NIS, endereço e laudos',
      admin: 'Auditado',
      peb1: 'Mascarado',
      peb2: 'Mascarado',
      apoio: 'Auditado',
    },
    {
      module: 'Dias Letivos Oficiais',
      subtitle: 'Calendário de 200 dias e feriados',
      admin: 'Acesso total',
      peb1: 'Bloqueado',
      peb2: 'Bloqueado',
      apoio: 'Bloqueado',
    },
    {
      module: 'Gestão de Acessos e Auditoria',
      subtitle: 'Contas, perfis e logs',
      admin: 'Acesso total',
      peb1: 'Bloqueado',
      peb2: 'Bloqueado',
      apoio: 'Bloqueado',
    },
    {
      module: 'Diagnóstico BD e Upload .HTM (AEE)',
      subtitle: 'Consistência de dados e importação SED',
      admin: 'Acesso total',
      peb1: 'Bloqueado',
      peb2: 'Bloqueado',
      apoio: 'Bloqueado',
    },
  ];

  const visibleMatrixClasses = useMemo(
    () => filteredMatrixClasses.slice(0, visibleMatrixLimit),
    [filteredMatrixClasses, visibleMatrixLimit]
  );

  const totalUsersPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PAGE_SIZE));
  const safeUsersPage = Math.min(usersPage, totalUsersPages);
  const visibleFilteredUsers = useMemo(() => {
    const start = (safeUsersPage - 1) * USERS_PAGE_SIZE;
    return filteredUsers.slice(start, start + USERS_PAGE_SIZE);
  }, [filteredUsers, safeUsersPage]);

  const totalLogsPages = Math.max(1, Math.ceil(filteredLogs.length / LOGS_PAGE_SIZE));
  const safeLogsPage = Math.min(logsPage, totalLogsPages);
  const visibleSessionLogs = useMemo(() => {
    const start = (safeLogsPage - 1) * LOGS_PAGE_SIZE;
    return filteredLogs.slice(start, start + LOGS_PAGE_SIZE);
  }, [filteredLogs, safeLogsPage]);

  const totalSecurityPages = Math.max(
    1,
    Math.ceil(filteredSecurityLogs.length / SECURITY_PAGE_SIZE)
  );
  const safeSecurityPage = Math.min(securityPage, totalSecurityPages);
  const visibleSecurityAuditLogs = useMemo(() => {
    const start = (safeSecurityPage - 1) * SECURITY_PAGE_SIZE;
    return filteredSecurityLogs.slice(start, start + SECURITY_PAGE_SIZE);
  }, [filteredSecurityLogs, safeSecurityPage]);

  const assignModalUser = useMemo(
    () => authorizedUsers.find((u) => u.id === assignModalUserId) || null,
    [authorizedUsers, assignModalUserId]
  );

  return (
    <div className="flex flex-col w-full min-w-0 max-w-[1600px] mx-auto space-y-4 pb-20 animate-gentle-fade text-[#111827] overflow-x-clip">
      {/* Feedback Toast Flutuante Limpo */}
      {feedbackMsg && (
        <div
          role="status"
          className={`rounded-2xl px-4 py-3 text-sm font-medium flex items-center justify-between gap-3 shadow-sm transition-all duration-100 ${
            feedbackMsg.type === 'success'
              ? 'bg-[#eaf6ef] text-[#005035]'
              : 'bg-[#fee2e2] text-[#991b1b]'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="break-words">{feedbackMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer shrink-0"
            aria-label="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. CABEÇALHO UNIFICADO DA CENTRAL ADMINISTRATIVA */}
      <section className="bg-white rounded-3xl px-4 py-4 sm:px-6 sm:py-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4 min-w-0">
        <div className="space-y-1 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950 transition-colors duration-150 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar</span>
          </button>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-950 break-words">
            Central Administrativa
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-700 tabular-nums">
            <span className="font-semibold text-[#0b3b8c]">Ano Letivo {activeSchoolYear}</span>
            <span aria-hidden="true">·</span>
            <span>{classes.length} turmas ({manhaTurmasCount} manhã · {tardeTurmasCount} tarde)</span>
            <span aria-hidden="true">·</span>
            <span>{authorizedUsers.length} contas</span>
            <span aria-hidden="true">·</span>
            <span>{totalActiveStudentsAll} alunos ativos</span>
            {activeNowSessionsCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#047857] font-semibold">
                  {activeNowSessionsCount} online agora
                </span>
              </>
            )}
          </div>
        </div>

        {/* 4 Indicadores Simples & Clicáveis */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => handleSelectSection('acesso', 'quadro_turmas')}
            className="text-left p-3.5 rounded-2xl bg-[#f4f7fb] hover:bg-[#edf2f7] card-interactive cursor-pointer min-w-0 break-words"
          >
            <span className="text-xs font-semibold text-slate-700 block">Turmas Oficiais</span>
            <span className="text-2xl sm:text-3xl font-bold text-slate-950 tabular-nums block mt-0.5">
              {classes.length}
            </span>
            <span className="text-xs text-slate-700 tabular-nums block mt-0.5 break-words">
              {manhaTurmasCount} manhã · {tardeTurmasCount} tarde
              {vacantTurmasCount > 0 ? ` · ${vacantTurmasCount} vagas` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleSelectSection('acesso', 'contas_acesso');
              setRoleFilter('all');
            }}
            className="text-left p-3.5 rounded-2xl bg-[#f4f7fb] hover:bg-[#edf2f7] card-interactive cursor-pointer min-w-0 break-words"
          >
            <span className="text-xs font-semibold text-slate-700 block">Perfis Cadastrados</span>
            <span className="text-2xl sm:text-3xl font-bold text-slate-950 tabular-nums block mt-0.5">
              {authorizedUsers.length}
            </span>
            <span className="text-xs text-slate-700 tabular-nums block mt-0.5 break-words">
              Admin: {adminCount} · PEB I: {peb1Count} · PEB II: {peb2Count} · AEE: {aeeCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectSection('seguranca', 'monitoramento')}
            className="text-left p-3.5 rounded-2xl bg-[#f4f7fb] hover:bg-[#edf2f7] card-interactive cursor-pointer min-w-0 break-words"
          >
            <span className="text-xs font-semibold text-slate-700 block">Acessos &amp; Sessões</span>
            <span className="text-2xl sm:text-3xl font-bold text-slate-950 tabular-nums block mt-0.5">
              {totalUsersWhoAccessed}/{authorizedUsers.length}
            </span>
            <span className="text-xs text-[#046c4e] font-semibold tabular-nums block mt-0.5 break-words">
              {totalAccessesCount} entradas · {activeNowSessionsCount} online
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectSection('seguranca', 'seguranca_lgpd')}
            className="text-left p-3.5 rounded-2xl bg-[#f4f7fb] hover:bg-[#edf2f7] card-interactive cursor-pointer min-w-0 break-words"
          >
            <span className="text-xs font-semibold text-slate-700 block">Tempo Total &amp; LGPD</span>
            <span className="text-2xl sm:text-3xl font-bold text-slate-950 tabular-nums block mt-0.5 break-words">
              {formatDurationHuman(totalPlatformDurationSeconds)}
            </span>
            <span className="text-xs text-slate-700 block mt-0.5 break-words">
              {lgpdConfig.maskSensitiveDataByDefault ? 'Mascaramento LGPD ativo' : 'Modo auditoria aberto'}
            </span>
          </button>
        </div>

        {/* Controle da Janela de Lançamento de Faltas + Alerta Push FCM */}
        <div
          className={`p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            windowEval.isAllowedToLaunch ? 'bg-[#eaf6ef]' : 'bg-[#fef3c7]/80'
          }`}
        >
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white ${
                windowEval.isAllowedToLaunch ? 'bg-[#047857]' : 'bg-[#b45309]'
              }`}
            >
              {windowEval.isAllowedToLaunch ? (
                <Unlock className="w-4 h-4" />
              ) : (
                <Clock className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-slate-950">
                {windowEval.statusTitle}
              </p>
              <p className="text-xs text-slate-700 break-words">
                {windowEval.statusDescription}
              </p>
            </div>
          </div>

          {canManage && (
            <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setIsPhotoStorageModalOpen(true)}
                title="Visualizar uso do IndexedDB de fotos e limpar cache de turmas antigas"
                className="min-h-[38px] px-3 rounded-xl bg-white hover:bg-[#edf2f7] text-[#092e70] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 shadow-[0_2px_8px_rgba(9,15,29,0.06)]"
              >
                <HardDrive className="w-3.5 h-3.5 shrink-0" />
                <span>Cache Fotos (IndexedDB)</span>
              </button>

              <button
                type="button"
                disabled={isSendingFcmAlert}
                onClick={() => handleSendWindowClosingFcmFromAcessos('pending_only')}
                title="Enviar notificação push Firebase Cloud Messaging para turmas pendentes sobre o fechamento da janela"
                className="min-h-[38px] px-3 rounded-xl bg-[#111827] hover:bg-black text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 transition-colors"
              >
                <BellRing className="w-3.5 h-3.5" />
                <span>{isSendingFcmAlert ? 'Enviando FCM...' : 'Alertar Pendentes (FCM)'}</span>
              </button>

              <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/90">
                <Key className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                <ToggleSwitch
                  checked={attendanceWindowConfig.exceptionalOverrideOpen}
                  onChange={handleToggleExceptionalLaunch}
                  activeText="Liberação Ativa"
                  inactiveText="Liberação Desligada"
                  ariaLabel="Alternar liberação excepcional de lançamento de faltas"
                />
              </div>
            </div>
          )}
        </div>

        {/* Barra Primária da Central Única Admin (5 Pilares) */}
        <nav
          aria-label="Seções da central administrativa"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 p-1.5 bg-[#edf2f7] rounded-2xl"
        >
          {primarySections.map((sec) => {
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => handleSelectSection(sec.id)}
                className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-medium inline-flex items-center justify-center gap-2 text-center cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                  isActive
                    ? 'bg-[#0b3b8c] text-white font-semibold shadow-xs'
                    : 'text-slate-700 hover:text-slate-950 hover:bg-white/80'
                }`}
              >
                {sec.icon}
                <span className="truncate">{sec.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Sub-navegação contextual para Acesso & Docentes ou Segurança & Auditoria */}
        {activeSection === 'acesso' && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {accessSubTabs.map((t) => {
              const isActive = activeSubTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveSubTab(t.id)}
                  className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                    isActive
                      ? 'bg-[#091b3b] text-white shadow-xs'
                      : 'bg-[#edf2f7] text-slate-800 hover:bg-[#dce7fb]'
                  }`}
                >
                  {t.icon}
                  <span>{t.label}</span>
                  {typeof t.count === 'number' && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[11px] tabular-nums ${
                        isActive ? 'bg-white/20 text-white' : 'bg-white/80 text-slate-700'
                      }`}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {activeSection === 'seguranca' && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {securitySubTabs.map((t) => {
              const isActive = activeSubTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveSubTab(t.id)}
                  className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                    isActive
                      ? 'bg-[#091b3b] text-white shadow-xs'
                      : 'bg-[#edf2f7] text-slate-800 hover:bg-[#dce7fb]'
                  }`}
                >
                  {t.icon}
                  <span>{t.label}</span>
                  {typeof t.count === 'number' && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[11px] tabular-nums ${
                        isActive ? 'bg-white/20 text-white' : 'bg-white/80 text-slate-700'
                      }`}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* =====================================================================
          SEÇÃO 1 · SUB-ABA 1: QUADRO DOCENTE (MOBILE CARDS + TABELA DESKTOP)
          ===================================================================== */}
      {activeSection === 'acesso' && activeSubTab === 'quadro_turmas' && (
        <div className="space-y-4">
          <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
            {/* Barra de Filtros, Busca e Exportação Oficial */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMatrixShiftFilter('ALL')}
                  className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors duration-150 ${
                    matrixShiftFilter === 'ALL'
                      ? 'bg-[#091b3b] text-white'
                      : 'bg-[#edf2f7] text-slate-800 hover:bg-[#dce7fb]'
                  }`}
                >
                  Todas ({classes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMatrixShiftFilter('MANHÃ')}
                  className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors duration-150 ${
                    matrixShiftFilter === 'MANHÃ'
                      ? 'bg-[#091b3b] text-white'
                      : 'bg-[#edf2f7] text-slate-800 hover:bg-[#dce7fb]'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5 text-[#d97706]" />
                  <span>Manhã ({manhaTurmasCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMatrixShiftFilter('TARDE')}
                  className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors duration-150 ${
                    matrixShiftFilter === 'TARDE'
                      ? 'bg-[#091b3b] text-white'
                      : 'bg-[#edf2f7] text-slate-800 hover:bg-[#dce7fb]'
                  }`}
                >
                  <Sunset className="w-3.5 h-3.5 text-[#0071e3]" />
                  <span>Tarde ({tardeTurmasCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMatrixShiftFilter('VAGAS')}
                  className={`min-h-[38px] px-3.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors duration-100 ${
                    matrixShiftFilter === 'VAGAS'
                      ? 'bg-[#b45309] text-white font-semibold'
                      : 'bg-[#fef3c7] text-[#92400e] hover:bg-[#fde68a]'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Turmas Vagas ({vacantTurmasCount})</span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 xl:max-w-2xl justify-end">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-700 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={matrixSearchTerm}
                    onChange={(e) => setMatrixSearchTerm(e.target.value)}
                    placeholder="Buscar turma, professor, sala ou código SED..."
                    className="w-full min-h-[40px] pl-10 pr-9 rounded-xl bg-[#f4f7fb] focus:bg-white text-sm text-slate-950 placeholder:text-slate-600"
                  />
                  {matrixSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setMatrixSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-700 hover:text-slate-950 p-1 cursor-pointer"
                      aria-label="Limpar busca"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      exportOfficialMatrixToXLS(classes, authorizedUsers);
                      triggerFeedback('success', 'Arquivo do Quadro Oficial (.xls) baixado.');
                    }}
                    className="min-h-[40px] px-3 rounded-xl bg-[#f2f2f7] hover:bg-[#e5e5ea] text-[#111827] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>Baixar XLS</span>
                  </button>

                  {canManage && (
                    <button
                      type="button"
                      onClick={handleRestoreOfficialSchoolMatrix}
                      className="min-h-[40px] px-3 rounded-xl bg-[#f2f2f7] hover:bg-[#e5e5ea] text-[#111827] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                      <span>Sincronizar Quadro</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {filteredMatrixClasses.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[#f4f7fb] text-center text-sm font-medium text-slate-700">
                Nenhuma turma encontrada para o filtro informado.
              </div>
            ) : (
              <>
                {/* VISÃO MOBILE & TABLET (CARDS LEGÍVEIS, ZERO CORTE HORIZONTAL) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:hidden">
                  {visibleMatrixClasses.map((cls) => {
                    const regenteUser = findRegenteUserForClass(cls);
                    const isEditing =
                      editingMatrixClassId === cls.id && matrixDraft !== null;
                    const isVaga = cls.isVaga || cls.teacherName === 'TURMA VAGA';
                    const activeCount = cls.students.filter((s) => {
                      const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
                      return (
                        !sit.includes('BXTR') &&
                        !sit.includes('TRANSF') &&
                        !sit.includes('REMAN')
                      );
                    }).length;

                    return (
                      <article
                        key={cls.id}
                        className={`rounded-2xl p-4 space-y-3 transition-colors duration-100 min-w-0 break-words ${
                          isEditing ? 'bg-[#eaf6ef]' : 'bg-[#f5f5f7]/80'
                        }`}
                      >
                        {/* Topo do Card: Turma + Turno + Alunos */}
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span
                              className={`px-2.5 py-1.5 rounded-xl font-semibold text-xs tabular-nums shrink-0 ${
                                isVaga
                                  ? 'bg-[#fef3c7] text-[#92400e]'
                                  : 'bg-white text-[#1d1d1f]'
                              }`}
                            >
                              {cls.turmaAbrev || cls.name}
                            </span>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-semibold text-slate-950 break-words leading-snug">
                                {cls.name}
                              </h3>
                              <p className="text-xs text-slate-700 break-words leading-snug">
                                {cls.shift.replace('Turno ', '')} · {cls.room}
                              </p>
                            </div>
                          </div>

                          <span className="text-xs font-semibold text-[#047857] bg-white px-2.5 py-1 rounded-xl tabular-nums shrink-0">
                            {activeCount} alunos
                          </span>
                        </div>

                        {isEditing && matrixDraft ? (
                          <div className="space-y-2.5 pt-1">
                            <div>
                              <label className="text-xs font-medium text-slate-700 block mb-1">
                                Professor(a) Regente
                              </label>
                              <input
                                type="text"
                                value={matrixDraft.teacherName}
                                onChange={(e) =>
                                  setMatrixDraft({
                                    ...matrixDraft,
                                    teacherName: e.target.value,
                                  })
                                }
                                className="w-full min-h-[40px] px-3 rounded-xl bg-white text-xs font-medium text-slate-950"
                              />
                            </div>

                            <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs font-medium text-slate-700 block mb-1">
                                  Pronome
                                </label>
                                <CustomSelect
                                  value={matrixDraft.teacherPronoun}
                                  onChange={(val) =>
                                    setMatrixDraft({
                                      ...matrixDraft,
                                      teacherPronoun: val,
                                    })
                                  }
                                  ariaLabel="Pronome"
                                  className="w-full bg-white text-xs font-medium text-slate-950"
                                  options={[
                                    { value: 'PROFESSORA', label: 'PROFESSORA' },
                                    { value: 'PROFESSOR', label: 'PROFESSOR' },
                                  ]}
                                />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-slate-700 block mb-1">
                                  Prenome
                                </label>
                                <input
                                  type="text"
                                  value={matrixDraft.teacherFirstName}
                                  onChange={(e) =>
                                    setMatrixDraft({
                                      ...matrixDraft,
                                      teacherFirstName: e.target.value,
                                    })
                                  }
                                  className="w-full min-h-[40px] px-3 rounded-xl bg-white text-xs font-medium text-slate-950"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs font-medium text-slate-700 block mb-1">
                                  Sala
                                </label>
                                <input
                                  type="text"
                                  value={matrixDraft.room}
                                  onChange={(e) =>
                                    setMatrixDraft({ ...matrixDraft, room: e.target.value })
                                  }
                                  className="w-full min-h-[40px] px-3 rounded-xl bg-white text-xs font-medium text-slate-950"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-slate-700 block mb-1">
                                  Período
                                </label>
                                <CustomSelect
                                  value={matrixDraft.shift}
                                  onChange={(val) =>
                                    setMatrixDraft({
                                      ...matrixDraft,
                                      shift: val as 'Turno Manhã' | 'Turno Tarde',
                                    })
                                  }
                                  ariaLabel="Período"
                                  className="w-full bg-white text-xs font-medium text-slate-950"
                                  options={[
                                    { value: 'Turno Manhã', label: 'Manhã' },
                                    { value: 'Turno Tarde', label: 'Tarde' },
                                  ]}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs font-medium text-slate-700 block mb-1">
                                  Turma SED
                                </label>
                                <input
                                  type="text"
                                  value={matrixDraft.turmaSedName}
                                  onChange={(e) =>
                                    setMatrixDraft({
                                      ...matrixDraft,
                                      turmaSedName: e.target.value,
                                    })
                                  }
                                  className="w-full min-h-[40px] px-3 rounded-xl bg-white text-xs font-medium text-slate-950"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-slate-700 block mb-1">
                                  Código SED
                                </label>
                                <input
                                  type="text"
                                  value={matrixDraft.classeSedCode}
                                  onChange={(e) =>
                                    setMatrixDraft({
                                      ...matrixDraft,
                                      classeSedCode: e.target.value,
                                    })
                                  }
                                  className="w-full min-h-[40px] px-3 rounded-xl bg-white text-xs font-medium text-[#1d1d1f]"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-2">
                              <input
                                type="text"
                                placeholder="Professor(a) Arte"
                                value={matrixDraft.artTeacher}
                                onChange={(e) =>
                                  setMatrixDraft({
                                    ...matrixDraft,
                                    artTeacher: e.target.value,
                                  })
                                }
                                className="w-full min-h-[38px] px-3 rounded-xl bg-white text-xs text-[#1d1d1f]"
                              />
                              <input
                                type="text"
                                placeholder="Professor(a) Ed. Física"
                                value={matrixDraft.peTeacher}
                                onChange={(e) =>
                                  setMatrixDraft({
                                    ...matrixDraft,
                                    peTeacher: e.target.value,
                                  })
                                }
                                className="w-full min-h-[38px] px-3 rounded-xl bg-white text-xs text-[#1d1d1f]"
                              />
                              <input
                                type="text"
                                placeholder="Professor(a) Língua Inglesa"
                                value={matrixDraft.englishTeacher}
                                onChange={(e) =>
                                  setMatrixDraft({
                                    ...matrixDraft,
                                    englishTeacher: e.target.value,
                                  })
                                }
                                className="w-full min-h-[38px] px-3 rounded-xl bg-white text-xs text-[#1d1d1f]"
                              />
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleSaveMatrixRow(cls)}
                                className="flex-1 min-h-[42px] rounded-xl bg-[#047857] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Check className="w-4 h-4" />
                                <span>Salvar</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMatrixClassId(null);
                                  setMatrixDraft(null);
                                }}
                                className="min-h-[42px] px-4 rounded-xl bg-white hover:bg-[#edf2f7] text-slate-700 text-xs font-semibold cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Dados do Regente e E-mail sem Corte */}
                            <div className="bg-white rounded-xl p-3 space-y-1">
                              {isVaga ? (
                                <div className="flex items-center gap-2 text-[#b45309] text-xs font-semibold">
                                  <AlertTriangle className="w-4 h-4 shrink-0" />
                                  <span>Turma vaga · Aguardando atribuição</span>
                                </div>
                              ) : (
                                <>
                                  <p className="text-xs font-semibold text-slate-950 break-words">
                                    {cls.teacherName || regenteUser?.name || '—'}
                                  </p>
                                  {regenteUser ? (
                                    <p className="text-xs text-[#047857] break-all">
                                      {regenteUser.email}
                                    </p>
                                  ) : (
                                    <p className="text-xs text-[#b3261e]">
                                      Sem e-mail vinculado
                                    </p>
                                  )}
                                </>
                              )}
                            </div>

                            {/* Informações SED + Especialistas */}
                            <div className="text-xs text-slate-700 space-y-1">
                              {(cls.turmaSedName || cls.classeSedCode) && (
                                <p className="tabular-nums break-words">
                                  SED: {cls.turmaSedName || '—'} · Cód. {cls.classeSedCode || '—'}
                                </p>
                              )}
                              {(cls.artTeacher || cls.peTeacher || cls.englishTeacher) && (
                                <p className="break-words">
                                  Especialistas:{' '}
                                  {[
                                    cls.artTeacher && `Arte: ${cls.artTeacher}`,
                                    cls.peTeacher && `Ed. Física: ${cls.peTeacher}`,
                                    cls.englishTeacher && `Inglês: ${cls.englishTeacher}`,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              )}
                            </div>

                            {/* Botões de Ação */}
                            <div className="flex flex-wrap items-center gap-2 pt-0.5">
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditMatrixRow(cls)}
                                  className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white hover:bg-[#ededf0] text-[#1d1d1f] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-normal text-center"
                                >
                                  <Edit3 className="w-3.5 h-3.5 shrink-0" />
                                  <span>{isVaga ? 'Designar' : 'Editar'}</span>
                                </button>
                              )}

                              {regenteUser && onSimulateTeacherProfile && (
                                <button
                                  type="button"
                                  onClick={() => onSimulateTeacherProfile(regenteUser)}
                                  className="flex-1 min-w-0 min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#eaf6ef] hover:bg-[#d5efe0] text-[#005035] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-normal text-center"
                                >
                                  <Eye className="w-3.5 h-3.5 shrink-0" />
                                  <span>Abrir Visão</span>
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>

                {/* VISÃO DESKTOP (TABELA CLEAN MINIMALISTA, SEM FUNDO ESCURO PESADO) */}
                <div className="hidden lg:block overflow-x-auto rounded-2xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#edf2f7] text-slate-800 font-semibold text-xs">
                      <tr>
                        <th className="py-3 px-3 rounded-tl-xl">Turma</th>
                        <th className="py-3 px-3">Professor(a) Regente e E-mail</th>
                        <th className="py-3 px-3">Sala e Período</th>
                        <th className="py-3 px-3">Identificação SED</th>
                        <th className="py-3 px-3 text-center">Alunos</th>
                        <th className="py-3 px-3">Especialistas (PEB II)</th>
                        <th className="py-3 px-3 text-right rounded-tr-xl">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleMatrixClasses.map((cls) => {
                        const regenteUser = findRegenteUserForClass(cls);
                        const isEditing =
                          editingMatrixClassId === cls.id && matrixDraft !== null;
                        const isVaga = cls.isVaga || cls.teacherName === 'TURMA VAGA';
                        const activeCount = cls.students.filter((s) => {
                          const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
                          return (
                            !sit.includes('BXTR') &&
                            !sit.includes('TRANSF') &&
                            !sit.includes('REMAN')
                          );
                        }).length;

                        return (
                          <tr
                            key={cls.id}
                            className={`transition-colors duration-100 ${
                              isEditing
                                ? 'bg-[#eaf6ef]'
                                : 'odd:bg-[#f4f7fb] even:bg-white hover:bg-[#dce7fb]/50'
                            }`}
                          >
                            {/* TURMA */}
                            <td className="py-3 px-3 align-top whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-1 rounded-lg font-semibold text-xs tabular-nums ${
                                    isVaga
                                      ? 'bg-[#fef3c7] text-[#92400e]'
                                      : 'bg-[#f5f5f7] text-[#1d1d1f]'
                                  }`}
                                >
                                  {cls.turmaAbrev || cls.name}
                                </span>
                                <span className="font-semibold text-[#1d1d1f]">
                                  {cls.name}
                                </span>
                              </div>
                            </td>

                            {/* REGENTE + EMAIL */}
                            <td className="py-3 px-3 align-top">
                              {isEditing && matrixDraft ? (
                                <div className="space-y-1.5 min-w-[230px]">
                                  <input
                                    type="text"
                                    value={matrixDraft.teacherName}
                                    onChange={(e) =>
                                      setMatrixDraft({
                                        ...matrixDraft,
                                        teacherName: e.target.value,
                                      })
                                    }
                                    placeholder="Nome completo"
                                    className="w-full px-2.5 py-1.5 rounded-lg bg-white text-xs font-medium text-[#1d1d1f]"
                                  />
                                  <div className="flex gap-1.5">
                                    <CustomSelect
                                      value={matrixDraft.teacherPronoun}
                                      onChange={(val) =>
                                        setMatrixDraft({
                                          ...matrixDraft,
                                          teacherPronoun: val,
                                        })
                                      }
                                      size="sm"
                                      ariaLabel="Pronome"
                                      className="bg-white text-xs font-medium"
                                      options={[
                                        { value: 'PROFESSORA', label: 'PROFESSORA' },
                                        { value: 'PROFESSOR', label: 'PROFESSOR' },
                                      ]}
                                    />
                                    <input
                                      type="text"
                                      value={matrixDraft.teacherFirstName}
                                      onChange={(e) =>
                                        setMatrixDraft({
                                          ...matrixDraft,
                                          teacherFirstName: e.target.value,
                                        })
                                      }
                                      placeholder="Prenome"
                                      className="w-28 px-2.5 min-h-[36px] rounded-lg bg-white text-xs"
                                    />
                                  </div>
                                </div>
                              ) : isVaga ? (
                                <div className="space-y-1">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#fef3c7] text-[#92400e] font-medium text-xs">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Turma Vaga
                                  </span>
                                  {canManage && (
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditMatrixRow(cls)}
                                      className="block text-xs text-[#047857] hover:underline font-medium cursor-pointer"
                                    >
                                      Designar docente
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <span className="font-semibold text-[#1d1d1f] block break-words">
                                    {cls.teacherName || regenteUser?.name || '—'}
                                  </span>
                                  {regenteUser ? (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-xs text-[#047857] break-all">
                                        {regenteUser.email}
                                      </span>
                                      {(regenteUser.totalAccessCount || 0) > 0 && (
                                        <span className="px-2 py-0.5 rounded-md bg-[#eaf6ef] text-[#005035] text-xs font-medium tabular-nums">
                                          {regenteUser.totalAccessCount}x ·{' '}
                                          {formatDurationHuman(regenteUser.totalDurationSeconds)}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-[#b3261e]">
                                      Sem e-mail vinculado
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* SALA E PERÍODO */}
                            <td className="py-3 px-3 align-top whitespace-nowrap">
                              {isEditing && matrixDraft ? (
                                <div className="space-y-1.5">
                                  <input
                                    type="text"
                                    value={matrixDraft.room}
                                    onChange={(e) =>
                                      setMatrixDraft({ ...matrixDraft, room: e.target.value })
                                    }
                                    className="w-32 px-2.5 min-h-[36px] rounded-lg bg-white text-xs"
                                  />
                                  <CustomSelect
                                    value={matrixDraft.shift}
                                    onChange={(val) =>
                                      setMatrixDraft({
                                        ...matrixDraft,
                                        shift: val as 'Turno Manhã' | 'Turno Tarde',
                                      })
                                    }
                                    size="sm"
                                    ariaLabel="Período"
                                    className="w-32 bg-white text-xs font-medium"
                                    options={[
                                      { value: 'Turno Manhã', label: 'Manhã' },
                                      { value: 'Turno Tarde', label: 'Tarde' },
                                    ]}
                                  />
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <span className="text-[#1d1d1f] font-medium block">
                                    {cls.room}
                                  </span>
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${
                                      cls.shift === 'Turno Manhã'
                                        ? 'bg-[#fef3c7] text-[#92400e]'
                                        : 'bg-[#e0f2fe] text-[#075985]'
                                    }`}
                                  >
                                    {cls.shift.replace('Turno ', '')}
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* SED */}
                            <td className="py-3 px-3 align-top">
                              {isEditing && matrixDraft ? (
                                <div className="space-y-1.5">
                                  <input
                                    type="text"
                                    value={matrixDraft.turmaSedName}
                                    onChange={(e) =>
                                      setMatrixDraft({
                                        ...matrixDraft,
                                        turmaSedName: e.target.value,
                                      })
                                    }
                                    placeholder="Turma SED"
                                    className="w-36 px-2.5 py-1.5 rounded-lg bg-white text-xs"
                                  />
                                  <input
                                    type="text"
                                    value={matrixDraft.classeSedCode}
                                    onChange={(e) =>
                                      setMatrixDraft({
                                        ...matrixDraft,
                                        classeSedCode: e.target.value,
                                      })
                                    }
                                    placeholder="Código SED"
                                    className="block w-36 px-2.5 min-h-[36px] rounded-lg bg-white text-xs tabular-nums"
                                  />
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <span className="text-slate-950 block">
                                    {cls.turmaSedName || '—'}
                                  </span>
                                  <span className="text-xs text-slate-700 tabular-nums block">
                                    Cód. {cls.classeSedCode || '—'}
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* QTD */}
                            <td className="py-3 px-3 align-top text-center tabular-nums">
                              <span className="font-semibold text-[#047857] text-sm">
                                {activeCount}
                              </span>
                              {cls.students.length !== activeCount && (
                                <span className="block text-xs text-slate-700">
                                  ({cls.students.length})
                                </span>
                              )}
                            </td>

                            {/* ESPECIALISTAS */}
                            <td className="py-3 px-3 align-top">
                              {isEditing && matrixDraft ? (
                                <div className="space-y-1 min-w-[200px]">
                                  <input
                                    type="text"
                                    placeholder="Arte"
                                    value={matrixDraft.artTeacher}
                                    onChange={(e) =>
                                      setMatrixDraft({
                                        ...matrixDraft,
                                        artTeacher: e.target.value,
                                      })
                                    }
                                    className="w-full px-2.5 min-h-[36px] rounded-lg bg-white text-xs"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Ed. Física"
                                    value={matrixDraft.peTeacher}
                                    onChange={(e) =>
                                      setMatrixDraft({
                                        ...matrixDraft,
                                        peTeacher: e.target.value,
                                      })
                                    }
                                    className="w-full px-2.5 min-h-[36px] rounded-lg bg-white text-xs"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Inglês"
                                    value={matrixDraft.englishTeacher}
                                    onChange={(e) =>
                                      setMatrixDraft({
                                        ...matrixDraft,
                                        englishTeacher: e.target.value,
                                      })
                                    }
                                    className="w-full px-2.5 min-h-[36px] rounded-lg bg-white text-xs"
                                  />
                                </div>
                              ) : (
                                <div className="text-xs text-slate-700 space-y-1 max-w-[260px]">
                                  {cls.artTeacher && (
                                    <p className="break-words leading-snug">
                                      <span className="text-slate-950 font-semibold">Arte:</span>{' '}
                                      {cls.artTeacher}
                                    </p>
                                  )}
                                  {cls.peTeacher && (
                                    <p className="break-words leading-snug">
                                      <span className="text-slate-950 font-semibold">Ed. Fís:</span>{' '}
                                      {cls.peTeacher}
                                    </p>
                                  )}
                                  {cls.englishTeacher && (
                                    <p className="break-words leading-snug">
                                      <span className="text-slate-950 font-semibold">Inglês:</span>{' '}
                                      {cls.englishTeacher}
                                    </p>
                                  )}
                                  {!cls.artTeacher && !cls.peTeacher && !cls.englishTeacher && (
                                    <span>—</span>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* AÇÕES */}
                            <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                {isEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveMatrixRow(cls)}
                                      className="px-3 py-1.5 rounded-lg bg-[#047857] text-white font-semibold text-xs inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Salvar</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingMatrixClassId(null);
                                        setMatrixDraft(null);
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#edf2f7] text-slate-700 font-medium text-xs cursor-pointer"
                                    >
                                      Cancelar
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {canManage && (
                                      <button
                                        type="button"
                                        onClick={() => handleStartEditMatrixRow(cls)}
                                        className="px-2.5 py-1.5 rounded-lg bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] font-medium text-xs inline-flex items-center gap-1 cursor-pointer"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                        <span>Editar</span>
                                      </button>
                                    )}
                                    {regenteUser && onSimulateTeacherProfile && (
                                      <button
                                        type="button"
                                        onClick={() => onSimulateTeacherProfile(regenteUser)}
                                        className="px-2.5 py-1.5 rounded-lg bg-[#eaf6ef] hover:bg-[#d5efe0] text-[#005035] font-semibold text-xs inline-flex items-center gap-1 cursor-pointer"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                        <span>Abrir</span>
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {filteredMatrixClasses.length > visibleMatrixLimit && (
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setVisibleMatrixLimit((prev) => prev + 20)}
                      className="min-h-[40px] px-4 rounded-xl bg-[#f2f2f7] hover:bg-[#e5e5ea] text-[#111827] text-xs font-semibold cursor-pointer"
                    >
                      Carregar mais turmas ({filteredMatrixClasses.length - visibleMatrixLimit} restantes)
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleMatrixLimit(filteredMatrixClasses.length)}
                      className="min-h-[40px] px-4 rounded-xl bg-white hover:bg-[#edf2f7] text-slate-700 hover:text-slate-950 text-xs font-semibold cursor-pointer"
                    >
                      Exibir todas ({filteredMatrixClasses.length})
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Quadro Consolidado de Especialistas PEB II */}
          <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  Especialistas PEB II ({specialistsUsers.length})
                </h2>
                <p className="text-xs text-slate-700">
                  Arte, Educação Física e Língua Inglesa com visualização das turmas atribuídas
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {specialistsUsers.map((spec) => {
                const specClasses = classes.filter(
                  (c) =>
                    (c.artTeacher || '').toUpperCase() === spec.name.toUpperCase() ||
                    (c.peTeacher || '').toUpperCase() === spec.name.toUpperCase() ||
                    (c.englishTeacher || '').toUpperCase() === spec.name.toUpperCase() ||
                    (spec.assignedClassIds && spec.assignedClassIds.includes(c.id))
                );
                return (
                  <div
                    key={spec.id}
                    className="p-4 rounded-2xl bg-[#f4f7fb] flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <StudentAvatar name={spec.name} size="xs" expandableOnClick={false} />
                        <div className="min-w-0 flex-1">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-[#fef3c7] text-[#92400e] text-xs font-semibold uppercase">
                            {spec.subjectName || 'ESPECIALISTA PEB II'}
                          </span>
                          <h3 className="font-semibold text-sm text-slate-950 break-words leading-snug mt-0.5">
                            {spec.name}
                          </h3>
                          <p className="text-xs text-[#047857] break-all">
                            {spec.email}
                          </p>
                        </div>
                      </div>

                      {onSimulateTeacherProfile && (
                        <button
                          type="button"
                          onClick={() => onSimulateTeacherProfile(spec)}
                          className="min-h-[38px] px-3.5 rounded-xl bg-white hover:bg-[#091b3b] text-slate-950 hover:text-white font-semibold text-xs shrink-0 cursor-pointer transition-colors duration-150"
                        >
                          Abrir
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-xs font-medium text-slate-700 block">
                        {specClasses.length} turmas vinculadas
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {specClasses.map((c) => (
                          <span
                            key={c.id}
                            className="px-2 py-0.5 rounded-md bg-white text-xs font-medium text-[#1d1d1f] tabular-nums"
                          >
                            {c.turmaAbrev || c.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* =====================================================================
          SEÇÃO 1 · SUB-ABA 2: CONTAS E PERFIS (@educacao.jundiai.sp.gov.br)
          ===================================================================== */}
      {activeSection === 'acesso' && activeSubTab === 'contas_acesso' && (
        <div className="space-y-4">
          <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
            {/* Barra de Busca por Nome/E-mail, Status, Ordenação e Novo E-mail */}
            <div className="space-y-3">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-700 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setUsersPage(1);
                    }}
                    aria-label="Buscar usuários autorizados por nome, e-mail ou turma"
                    placeholder="Buscar servidor por nome, e-mail (@educacao.jundiai...), disciplina ou turma..."
                    className="w-full min-h-[44px] pl-10 pr-10 rounded-2xl bg-[#f4f7fb] focus:bg-white text-sm text-slate-950 placeholder:text-slate-600 transition-all"
                  />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm('');
                          setUsersPage(1);
                        }}
                        aria-label="Limpar busca de usuários"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-700 hover:text-slate-950 p-1 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div
                      role="group"
                      aria-label="Filtrar por status de acesso"
                      className="inline-flex flex-wrap items-center p-1 rounded-xl bg-[#f2f2f7] gap-1"
                    >
                      {(
                        [
                          { id: 'all', label: `Todos (${authorizedUsers.length})` },
                          { id: 'active', label: `Liberados (${activeUsersCount})` },
                          { id: 'blocked', label: `Bloqueados (${blockedUsersCount})` },
                          { id: 'temporary', label: `Temporários (${temporaryUsersCount})` },
                          { id: 'expired', label: `Expirados (${expiredUsersCount})` },
                        ] as const
                      ).map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => {
                            setStatusFilter(st.id);
                            setUsersPage(1);
                          }}
                        className={`min-h-[34px] px-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                          statusFilter === st.id
                            ? st.id === 'blocked' || st.id === 'expired'
                              ? 'bg-[#991b1b] text-white shadow-2xs'
                              : st.id === 'temporary'
                              ? 'bg-[#b45309] text-white shadow-2xs'
                              : st.id === 'active'
                              ? 'bg-[#047857] text-white shadow-2xs'
                              : 'bg-white text-slate-950 shadow-2xs'
                            : 'text-slate-700 hover:text-slate-950'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  <CustomSelect
                    value={userSortBy}
                    onChange={(val) =>
                      setUserSortBy(
                        val as 'default' | 'name_asc' | 'email_asc' | 'access_desc'
                      )
                    }
                    ariaLabel="Ordenar lista de usuários"
                    className="min-h-[42px] bg-[#f5f5f7] text-xs font-semibold text-[#111827]"
                    options={[
                      { value: 'default', label: 'Ordem padrão' },
                      { value: 'name_asc', label: 'Nome (A–Z)' },
                      { value: 'email_asc', label: 'E-mail (A–Z)' },
                      { value: 'access_desc', label: 'Mais acessos' },
                    ]}
                  />

                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setShowAddUserForm((prev) => !prev)}
                      className="min-h-[42px] px-4 rounded-2xl bg-[#047857] hover:bg-[#065f46] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-colors duration-100"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>{showAddUserForm ? 'Fechar Cadastro' : 'Novo E-mail'}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      {
                        id: 'all',
                        label: `Todos (${authorizedUsers.length})`,
                        activeClass: 'bg-[#111827] text-white font-semibold',
                      },
                      {
                        id: 'admin',
                        label: `ADMIN (${adminCount})`,
                        activeClass: 'bg-[#111827] text-white font-semibold',
                      },
                      {
                        id: 'usuario',
                        label: `PEB I · Usuário (${peb1Count})`,
                        activeClass: 'bg-[#047857] text-white font-semibold',
                      },
                      {
                        id: 'peb2',
                        label: `PEB II · Visualização (${peb2Count})`,
                        activeClass: 'bg-[#1a4fa3] text-white font-semibold',
                      },
                      {
                        id: 'aee',
                        label: `AEE (${aeeCount})`,
                        activeClass: 'bg-[#b45309] text-white font-semibold',
                      },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setRoleFilter(tab.id);
                        setUsersPage(1);
                      }}
                      className={`min-h-[36px] px-3 rounded-xl text-xs font-medium cursor-pointer transition-colors duration-100 ${
                        roleFilter === tab.id
                          ? tab.activeClass
                          : 'bg-[#f2f2f7] text-[#374151] hover:bg-[#e5e5ea]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}

                  <div className="px-3 py-1.5 rounded-xl bg-[#f2f2f7] inline-flex items-center">
                    <ToggleSwitch
                      checked={onlyAccessedFilter}
                      onChange={() => {
                        setOnlyAccessedFilter((prev) => !prev);
                        setUsersPage(1);
                      }}
                      activeText={`Já acessaram (${totalUsersWhoAccessed})`}
                      inactiveText={`Somente quem acessou (${totalUsersWhoAccessed})`}
                      ariaLabel="Filtrar contas que já acessaram"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-700 tabular-nums shrink-0">
                  <span>
                    Exibindo <strong className="text-slate-950">{filteredUsers.length}</strong> de{' '}
                    <strong className="text-slate-950">{authorizedUsers.length}</strong> contas
                  </span>
                  {hasActiveUserFilters && (
                    <button
                      type="button"
                      onClick={handleResetUserFilters}
                      className="px-2.5 py-1 rounded-lg bg-[#edf2f7] hover:bg-[#dce7fb] text-[#0b3b8c] font-semibold cursor-pointer transition-colors"
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Legenda Visual Rápida dos 4 Níveis de Acesso */}
            <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-slate-700">
              <span className="font-semibold text-slate-950">Níveis:</span>
              {ACCESS_LEVEL_ORDER.map((lvl) => {
                const meta = ACCESS_LEVEL_META[lvl];
                return (
                  <span
                    key={lvl}
                    className="inline-flex items-center gap-1.5"
                  >
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold ${meta.badgeClass}`}
                    >
                      {renderAccessLevelIcon(lvl)}
                      <span>{meta.badgeLabel}</span>
                    </span>
                    <span className="hidden sm:inline">{meta.description}</span>
                  </span>
                );
              })}
            </div>

            {/* Formulário Expansível Limpo de Cadastro com Seletor Segmentado */}
            {canManage && showAddUserForm && (
              <form
                onSubmit={handleAddUser}
                className="p-4 rounded-2xl bg-[#edf2f7] space-y-3 animate-gentle-fade"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-950 break-words">
                    Liberar Novo E-mail Institucional ({INSTITUTIONAL_EMAIL_DOMAIN})
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 items-end">
                  <div className="xl:col-span-3 space-y-1">
                    <label className="block text-xs font-medium text-slate-700">
                      E-mail institucional
                    </label>
                    <div className="flex items-center rounded-xl bg-white overflow-hidden">
                      <input
                        type="text"
                        required
                        value={emailPrefix}
                        onChange={(e) => setEmailPrefix(e.target.value)}
                        placeholder="nome.sobrenome"
                        className="w-full min-h-[42px] px-3 bg-transparent text-slate-950 placeholder:text-slate-600 text-sm min-w-0"
                      />
                      {!emailPrefix.includes('@') && (
                        <span className="px-2.5 py-2 bg-[#dfe7f3] text-slate-800 text-xs font-medium shrink-0">
                          {INSTITUTIONAL_EMAIL_DOMAIN}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="xl:col-span-3 space-y-1">
                    <label className="block text-xs font-medium text-slate-700">
                      Nome completo
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Maria Aparecida da Silva"
                      className="w-full min-h-[42px] px-3 rounded-xl bg-white text-slate-950 placeholder:text-slate-600 text-sm"
                    />
                  </div>

                  <div className="xl:col-span-3 space-y-1">
                    <label className="block text-xs font-medium text-slate-700">
                      Nível de Permissão (Docente / Equipe)
                    </label>
                    <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white">
                      {NEW_USER_LEVEL_ORDER.map((lvl) => {
                        const meta = ACCESS_LEVEL_META[lvl];
                        const isSelected = newAccessLevel === lvl;
                        return (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setNewAccessLevel(lvl)}
                            className={`min-w-0 min-h-[38px] px-2 py-1 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors duration-100 whitespace-normal text-center ${
                              isSelected
                                ? meta.activeSegmentClass
                                : 'text-slate-800 hover:bg-[#edf2f7]'
                            }`}
                          >
                            {renderAccessLevelIcon(lvl)}
                            <span>{meta.shortLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                    <div className="xl:col-span-2 space-y-1">
                      <label className="block text-xs font-medium text-slate-700">
                        Turma vinculada
                      </label>
                      {newAccessLevel === 'usuario' ? (
                        <CustomSelect
                          value={assignedClassId}
                          onChange={(val) => setAssignedClassId(val)}
                          ariaLabel="Turma vinculada"
                          searchPlaceholder="Buscar turma..."
                          className="w-full min-h-[42px] bg-[#eaf6ef] hover:bg-[#ddf0e5] text-[#005035] text-xs font-semibold"
                          options={classes.map((cls) => ({
                            value: cls.id,
                            label: `${cls.turmaAbrev || cls.name} — ${cls.name} (${cls.shift.replace('Turno ', '')})`,
                          }))}
                        />
                      ) : (
                        <div className="min-h-[42px] px-3 rounded-xl bg-white text-slate-700 text-xs flex items-center">
                          {ACCESS_LEVEL_META[newAccessLevel].description}
                        </div>
                      )}
                    </div>

                    <div className="xl:col-span-1">
                      <button
                        type="submit"
                        className="w-full min-h-[42px] px-3 rounded-xl bg-[#047857] hover:bg-[#065f46] text-white font-semibold text-xs inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Salvar</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 pt-1">
                    <label
                      htmlFor="new-user-expiration-date"
                      className="text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 shrink-0"
                    >
                      <CalendarClock className="w-3.5 h-3.5 text-slate-700" />
                      <span>Data de expiração (opcional para temporários):</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        id="new-user-expiration-date"
                        type="date"
                        value={newExpirationDate}
                        onChange={(e) => setNewExpirationDate(e.target.value)}
                        className="min-h-[38px] px-3 rounded-xl bg-white text-xs font-medium text-slate-950 tabular-nums"
                      />
                      {newExpirationDate && (
                        <button
                          type="button"
                          onClick={() => setNewExpirationDate('')}
                          className="min-h-[34px] px-2.5 rounded-lg bg-white text-xs font-semibold text-slate-700 hover:text-slate-950 cursor-pointer"
                        >
                          Limpar data (Permanente)
                        </button>
                      )}
                      <span className="text-xs text-slate-700">
                        {newExpirationDate
                          ? `Acesso será revogado automaticamente após ${formatAccessExpirationDateBR(
                              newExpirationDate
                            )}.`
                          : 'Deixe em branco para acesso permanente.'}
                      </span>
                    </div>
                  </div>
                </form>
              )}

            {filteredUsers.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[#f4f7fb] text-center space-y-2.5">
                <p className="text-sm font-semibold text-slate-950">
                  Nenhuma conta encontrada para os critérios informados.
                </p>
                <p className="text-xs text-slate-700">
                  Verifique a grafia do nome ou e-mail, ou limpe os filtros ativos.
                </p>
                {hasActiveUserFilters && (
                  <button
                    type="button"
                    onClick={handleResetUserFilters}
                    className="min-h-[38px] px-4 rounded-xl bg-[#111827] hover:bg-black text-white text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Limpar busca e filtros
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* VISÃO MOBILE & TABLET (CARDS FLUIDOS COM TOGGLE SWITCH + SELETOR DE NÍVEL) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:hidden">
                  {visibleFilteredUsers.map((u) => {
                    const effectiveLevel = resolveAccessLevel(
                      u,
                      draftEdits[u.id]?.accessLevel
                    );
                    const levelMeta = ACCESS_LEVEL_META[effectiveLevel];
                    const effectiveClassName =
                      draftEdits[u.id]?.assignedClassName || u.assignedClassName;
                    const wasRecentlySaved = Boolean(recentlySavedUserIds[u.id]);
                    const isExpired = isUserAccessExpired(u);
                    const isEffectivelyActive = isUserAccessEffectivelyActive(u);

                    return (
                      <article
                        key={u.id}
                        className={`rounded-2xl p-4 space-y-3 bg-[#f2f2f7] transition-opacity duration-150 min-w-0 break-words ${
                          !isEffectivelyActive ? 'opacity-75' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${levelMeta.badgeClass}`}
                              >
                                {renderAccessLevelIcon(effectiveLevel)}
                                <span>{levelMeta.badgeLabel}</span>
                              </span>
                              {u.accessExpiresAt && (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${
                                    isExpired
                                      ? 'bg-[#fee2e2] text-[#991b1b]'
                                      : 'bg-[#fef3c7] text-[#92400e]'
                                  }`}
                                >
                                  <CalendarClock className="w-3 h-3 shrink-0" />
                                  <span>
                                    {isExpired
                                      ? `Expirado (${formatAccessExpirationDateBR(u.accessExpiresAt)})`
                                      : `Até ${formatAccessExpirationDateBR(u.accessExpiresAt)}`}
                                  </span>
                                </span>
                              )}
                              {u.subjectName &&
                                u.subjectName !== 'GESTÃO / ADMIN' &&
                                u.subjectName !== 'REGENTE PEB I' &&
                                u.subjectName !== 'EDUCAÇÃO ESPECIAL (AEE)' && (
                                  <span className="px-2 py-0.5 rounded-md bg-white text-[#374151] text-xs font-medium">
                                    {u.subjectName}
                                  </span>
                                )}
                            </div>

                            <h3 className="text-sm font-semibold text-[#111827] break-words">
                              {u.name}
                            </h3>
                            <p className="text-xs text-[#047857] break-all">
                              {u.email}
                            </p>
                          </div>

                          <ToggleSwitch
                            checked={isEffectivelyActive}
                            disabled={!canManage}
                            onChange={() => handleToggleActive(u.id)}
                            activeText="Ativo"
                            inactiveText={isExpired ? 'Expirado' : 'Bloq.'}
                            ariaLabel={`Alternar acesso de ${u.name}`}
                          />
                        </div>

                        {/* Seletor Fluido de Nível de Acesso (ADMIN | PEB I | PEB II | AEE) */}
                        <div className="space-y-1">
                          <span className="text-xs font-medium text-slate-700 block">
                            Nível de acesso
                          </span>
                          <div className="grid grid-cols-2 min-[420px]:grid-cols-4 gap-1 p-1 rounded-xl bg-white">
                            {ACCESS_LEVEL_ORDER.map((lvl) => {
                              const meta = ACCESS_LEVEL_META[lvl];
                              const isSelected = effectiveLevel === lvl;
                              const isSchoolAdmin = isOfficialSchoolAdminEmail(u.email);
                              const isLockedAdmin = !isSchoolAdmin && lvl === 'admin';
                              const isLockedSchoolAdmin = isSchoolAdmin && lvl !== 'admin';
                              const isDisabled = !canManage || isLockedAdmin || isLockedSchoolAdmin;
                              const btnTitle = isLockedAdmin
                                ? 'Perfil Administrador é exclusivo de emebjfreitas@jundiai.sp.gov.br'
                                : isLockedSchoolAdmin
                                ? 'Conta oficial da escola é o Administrador titular'
                                : meta.description;

                              return (
                                <button
                                  key={lvl}
                                  type="button"
                                  disabled={isDisabled}
                                  onClick={() => handleSelectAccessLevel(u.id, lvl)}
                                  title={btnTitle}
                                  className={`min-w-0 min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1 transition-all duration-100 whitespace-normal text-center ${
                                    isSelected
                                      ? meta.activeSegmentClass
                                      : isLockedAdmin
                                      ? 'text-slate-600 bg-slate-100/70 opacity-75 cursor-not-allowed'
                                      : 'text-slate-800 hover:bg-[#edf2f7]'
                                  } ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                  {renderAccessLevelIcon(lvl)}
                                  <span className="break-words leading-tight">{meta.shortLabel}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <span className="text-xs font-medium text-slate-700 block mb-1">
                            Turma(s) e Função
                          </span>
                          {canManage ? (
                            <button
                              type="button"
                              onClick={() => {
                                setAssignModalSearch('');
                                setAssignModalUserId(u.id);
                              }}
                              className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white hover:bg-[#dce7fb]/60 text-left text-xs font-semibold text-slate-950 flex items-center justify-between gap-2 cursor-pointer transition-colors duration-100"
                            >
                              <span className="break-words leading-snug min-w-0 flex-1 text-left">{effectiveClassName}</span>
                              <Edit3 className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                            </button>
                          ) : (
                            <p className="text-xs text-slate-950 bg-white rounded-xl px-3 py-2.5 break-words">
                              {effectiveClassName}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <span className="text-xs font-medium text-slate-700 block">
                            Validade de acesso (temporário)
                          </span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="date"
                              value={u.accessExpiresAt || ''}
                              disabled={!canManage}
                              onChange={(e) => handleUpdateUserExpiration(u.id, e.target.value)}
                              aria-label={`Data de expiração de ${u.name}`}
                              className="flex-1 min-w-0 min-h-[38px] px-2.5 rounded-xl bg-white text-xs font-medium text-slate-950 tabular-nums disabled:opacity-60"
                            />
                            {canManage && u.accessExpiresAt && (
                              <button
                                type="button"
                                onClick={() => handleUpdateUserExpiration(u.id, '')}
                                className="min-h-[38px] px-2.5 rounded-xl bg-white text-xs font-semibold text-slate-700 hover:text-slate-950 cursor-pointer shrink-0"
                              >
                                Permanente
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 tabular-nums">
                          <span>
                            {u.totalAccessCount || 0} acessos ·{' '}
                            {formatDurationHuman(u.totalDurationSeconds)}
                          </span>
                          {wasRecentlySaved && (
                            <span className="text-[#047857] font-semibold">Salvo</span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          {onSimulateTeacherProfile && (
                            <button
                              type="button"
                              onClick={() => onSimulateTeacherProfile(u)}
                              className="flex-1 min-w-0 min-h-[40px] px-3 py-1.5 rounded-xl bg-[#eaf6ef] text-[#005035] font-semibold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-normal text-center"
                            >
                              <Eye className="w-3.5 h-3.5 shrink-0" />
                              <span>Abrir Visão</span>
                            </button>
                          )}
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => handleRemoveUser(u)}
                              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white text-[#b3261e] font-semibold text-xs inline-flex items-center justify-center gap-1 cursor-pointer whitespace-normal text-center"
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Remover</span>
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {/* VISÃO DESKTOP (TOGGLE SWITCH + BADGE VISUAL + SELETOR SEGMENTADO INSTANTÂNEO) */}
                <div className="hidden lg:block overflow-x-auto rounded-2xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#edf2f7] text-slate-800 font-semibold text-xs">
                      <tr>
                        <th className="py-3 px-3 rounded-tl-xl">Status</th>
                        <th className="py-3 px-3">Educador(a) e Nível</th>
                        <th className="py-3 px-3">Alternar Nível de Acesso</th>
                        <th className="py-3 px-3">Turma(s) &amp; Vínculo</th>
                        <th className="py-3 px-3">Validade</th>
                        <th className="py-3 px-3 text-center">Acessos</th>
                        <th className="py-3 px-3">Tempo de Uso</th>
                        <th className="py-3 px-3 text-right rounded-tr-xl">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleFilteredUsers.map((u) => {
                        const effectiveLevel = resolveAccessLevel(
                          u,
                          draftEdits[u.id]?.accessLevel
                        );
                        const levelMeta = ACCESS_LEVEL_META[effectiveLevel];
                        const effectiveClassName =
                          draftEdits[u.id]?.assignedClassName || u.assignedClassName;
                        const wasRecentlySaved = Boolean(recentlySavedUserIds[u.id]);
                        const isExpired = isUserAccessExpired(u);
                        const isEffectivelyActive = isUserAccessEffectivelyActive(u);

                        return (
                          <tr
                            key={u.id}
                            className={`odd:bg-[#f4f7fb] even:bg-white hover:bg-[#dce7fb]/50 transition-colors duration-100 ${
                              !isEffectivelyActive ? 'opacity-80' : ''
                            }`}
                          >
                            <td className="py-3 px-3 align-middle whitespace-nowrap">
                              <ToggleSwitch
                                checked={isEffectivelyActive}
                                disabled={!canManage}
                                onChange={() => handleToggleActive(u.id)}
                                activeText="Liberado"
                                inactiveText={isExpired ? 'Expirado' : 'Bloqueado'}
                                ariaLabel={`Alternar acesso de ${u.name}`}
                              />
                            </td>

                            <td className="py-3 px-3 align-top">
                              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${levelMeta.badgeClass}`}
                                >
                                  {renderAccessLevelIcon(effectiveLevel)}
                                  <span>{levelMeta.badgeLabel}</span>
                                </span>
                                {u.subjectName &&
                                  u.subjectName !== 'GESTÃO / ADMIN' &&
                                  u.subjectName !== 'REGENTE PEB I' &&
                                  u.subjectName !== 'EDUCAÇÃO ESPECIAL (AEE)' && (
                                    <span className="px-2 py-0.5 rounded-md bg-[#f2f2f7] text-[#374151] text-xs font-medium">
                                      {u.subjectName}
                                    </span>
                                  )}
                              </div>
                              <span className="font-semibold text-[#111827] block break-words">
                                {u.name}
                              </span>
                              <span className="text-xs text-[#047857] block break-all">
                                {u.email}
                              </span>
                            </td>

                            <td className="py-3 px-3 align-middle whitespace-nowrap">
                              <div
                                role="group"
                                aria-label={`Nível de permissão para ${u.name}`}
                                className="inline-flex items-center p-1 rounded-xl bg-[#e9e9ef] gap-0.5"
                              >
                                {ACCESS_LEVEL_ORDER.map((lvl) => {
                                  const meta = ACCESS_LEVEL_META[lvl];
                                  const isSelected = effectiveLevel === lvl;
                                  const isSchoolAdmin = isOfficialSchoolAdminEmail(u.email);
                                  const isLockedAdmin = !isSchoolAdmin && lvl === 'admin';
                                  const isLockedSchoolAdmin = isSchoolAdmin && lvl !== 'admin';
                                  const isDisabled = !canManage || isLockedAdmin || isLockedSchoolAdmin;
                                  const btnTitle = isLockedAdmin
                                    ? 'Perfil Administrador é exclusivo de emebjfreitas@jundiai.sp.gov.br'
                                    : isLockedSchoolAdmin
                                    ? 'Conta oficial da escola é o Administrador titular'
                                    : meta.description;

                                  return (
                                    <button
                                      key={lvl}
                                      type="button"
                                      disabled={isDisabled}
                                      onClick={() => handleSelectAccessLevel(u.id, lvl)}
                                      title={btnTitle}
                                      className={`min-h-[36px] px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-all duration-100 ${
                                        isSelected
                                          ? meta.activeSegmentClass
                                          : isLockedAdmin
                                          ? 'text-slate-600 bg-slate-100/70 opacity-75 cursor-not-allowed'
                                          : 'text-slate-800 hover:bg-white/80'
                                      } ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                    >
                                      {renderAccessLevelIcon(lvl)}
                                      <span>{meta.shortLabel}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </td>

                            <td className="py-3 px-3 align-middle max-w-xs">
                              {canManage ? (
                                <div className="flex items-center gap-2 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAssignModalSearch('');
                                      setAssignModalUserId(u.id);
                                    }}
                                    className="px-3 py-1.5 min-h-[36px] rounded-xl bg-[#eaf6ef] hover:bg-[#d5efe0] text-[#005035] font-semibold text-xs inline-flex items-center gap-1.5 max-w-[260px] cursor-pointer transition-colors duration-100 text-left whitespace-normal"
                                  >
                                    <span className="break-words leading-snug">{effectiveClassName}</span>
                                    <Edit3 className="w-3.5 h-3.5 shrink-0" />
                                  </button>
                                  {wasRecentlySaved && (
                                    <span className="text-xs font-semibold text-[#047857] shrink-0">
                                      Salvo
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-700 text-xs break-words">
                                  {effectiveClassName}
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-3 align-middle whitespace-nowrap">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="date"
                                    value={u.accessExpiresAt || ''}
                                    disabled={!canManage}
                                    onChange={(e) =>
                                      handleUpdateUserExpiration(u.id, e.target.value)
                                    }
                                    aria-label={`Validade de ${u.name}`}
                                    className={`min-h-[32px] px-2 rounded-lg text-xs font-medium tabular-nums ${
                                      isExpired
                                        ? 'bg-[#fee2e2] text-[#991b1b]'
                                        : u.accessExpiresAt
                                        ? 'bg-[#fef3c7] text-[#92400e]'
                                        : 'bg-[#edf2f7] text-slate-700'
                                    }`}
                                  />
                                  {canManage && u.accessExpiresAt && (
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateUserExpiration(u.id, '')}
                                      title="Remover validade (tornar acesso permanente)"
                                      aria-label={`Remover data de expiração de ${u.name}`}
                                      className="w-7 h-7 rounded-lg bg-[#edf2f7] hover:bg-[#dce7fb] text-slate-700 hover:text-slate-950 flex items-center justify-center cursor-pointer transition-colors"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                                <span
                                  className={`text-[11px] font-medium block tabular-nums ${
                                    isExpired
                                      ? 'text-[#991b1b]'
                                      : u.accessExpiresAt
                                      ? 'text-[#92400e]'
                                      : 'text-slate-700'
                                  }`}
                                >
                                  {isExpired
                                    ? `Expirado (${formatAccessExpirationDateBR(u.accessExpiresAt)})`
                                    : u.accessExpiresAt
                                    ? `Temporário até ${formatAccessExpirationDateBR(u.accessExpiresAt)}`
                                    : 'Permanente'}
                                </span>
                              </div>
                            </td>

                            <td className="py-3 px-3 align-middle text-center tabular-nums">
                              <span
                                className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                                  (u.totalAccessCount || 0) > 0
                                    ? 'bg-[#eaf6ef] text-[#005035]'
                                    : 'bg-[#edf2f7] text-slate-700'
                                }`}
                              >
                                {u.totalAccessCount || 0}x
                              </span>
                            </td>

                            <td className="py-3 px-3 align-middle tabular-nums">
                              <span className="font-semibold text-slate-950 block">
                                {formatDurationHuman(u.totalDurationSeconds)}
                              </span>
                              {u.lastLoginAt && (
                                <span className="text-xs text-slate-700 block">
                                  {u.lastLoginAt}
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-3 align-middle text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                {onSimulateTeacherProfile && (
                                  <button
                                    type="button"
                                    onClick={() => onSimulateTeacherProfile(u)}
                                    className="px-2.5 py-1.5 rounded-lg bg-[#eaf6ef] hover:bg-[#d5efe0] text-[#005035] font-semibold text-xs cursor-pointer"
                                  >
                                    Abrir Visão
                                  </button>
                                )}
                                {canManage && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveUser(u)}
                                    className="px-2.5 py-1.5 rounded-lg bg-[#fee2e2] hover:bg-[#fecaca] text-[#991b1b] font-semibold text-xs cursor-pointer"
                                  >
                                    Remover
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <AdminPaginationBar
                  currentPage={safeUsersPage}
                  totalItems={filteredUsers.length}
                  pageSize={USERS_PAGE_SIZE}
                  itemLabel="contas autorizadas"
                  onPageChange={setUsersPage}
                />
              </>
            )}
          </section>
        </div>
      )}

      {/* =====================================================================
          SEÇÃO 1 · SUB-ABA 3: MATRIZ RBAC (ZERO CONTORNOS, RESPONSIVA)
          ===================================================================== */}
      {activeSection === 'acesso' && activeSubTab === 'rbac_matriz' && (
        <div className="space-y-4">
          <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-slate-950">
                  Perfis e Permissões de Acesso (RBAC)
                </h2>
                <p className="text-xs text-slate-700">
                  Cada servidor acessa apenas os recursos autorizados para sua função.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleSelectSection('seguranca', 'seguranca_lgpd')}
                className="min-h-[40px] px-4 rounded-xl bg-[#edf2f7] hover:bg-[#dce7fb] text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto transition-colors"
              >
                <History className="w-3.5 h-3.5" />
                <span>Ver Auditoria LGPD</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {RBAC_ROLE_DEFINITIONS.map((r) => {
                const isSelected = selectedRbacRoleKey === r.roleKey;
                return (
                  <button
                    key={r.roleKey}
                    type="button"
                    onClick={() => setSelectedRbacRoleKey(r.roleKey)}
                    className={`text-left p-4 rounded-2xl transition-all duration-150 card-interactive cursor-pointer flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-[#091b3b] text-white shadow-[0_12px_28px_-10px_rgba(9,27,59,0.45)]'
                        : 'bg-[#f4f7fb] hover:bg-[#edf2f7] text-slate-950'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-md text-xs font-semibold uppercase ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-white text-slate-700'
                          }`}
                        >
                          {r.badgeLabel}
                        </span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-[#34d399] shrink-0" />}
                      </div>
                      <h3 className="font-semibold text-sm">{r.name}</h3>
                      <p
                        className={`text-xs leading-relaxed ${
                          isSelected ? 'text-slate-200' : 'text-slate-700'
                        }`}
                      >
                        {r.description}
                      </p>
                    </div>

                    <div
                      className={`pt-2 text-xs flex items-center justify-between gap-2 ${
                        isSelected ? 'text-slate-200' : 'text-slate-700'
                      }`}
                    >
                      <span>
                        {r.roleKey === 'admin'
                          ? 'Acesso pleno'
                          : r.roleKey === 'usuario'
                          ? 'Turma atribuída'
                          : r.roleKey === 'peb2'
                          ? '40 turmas (leitura)'
                          : 'Acompanhamento'}
                      </span>
                      <span className="font-semibold">
                        {r.canEditAttendance ? 'Edita chamada' : 'Somente leitura'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
            <div>
              <h3 className="text-base font-semibold text-slate-950">
                Permissões por Módulo
              </h3>
              <p className="text-xs text-slate-700">
                Comparativo detalhado entre os quatro perfis institucionais
              </p>
            </div>

            {/* Cards Mobile para Permissões */}
            <div className="grid grid-cols-1 gap-2.5 md:hidden">
              {rbacModules.map((row) => (
                <div key={row.module} className="p-3.5 rounded-2xl bg-[#f4f7fb] space-y-2.5">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-950 break-words">{row.module}</h4>
                    <p className="text-xs text-slate-700 break-words">{row.subtitle}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div className="bg-white rounded-xl p-2">
                      <span className="text-slate-700 block">Admin</span>
                      <span className="font-semibold text-[#047857]">{row.admin}</span>
                    </div>
                    <div className="bg-white rounded-xl p-2">
                      <span className="text-slate-700 block">PEB I</span>
                      <span className="font-semibold text-slate-950">{row.peb1}</span>
                    </div>
                    <div className="bg-white rounded-xl p-2">
                      <span className="text-slate-700 block">PEB II</span>
                      <span className="font-semibold text-slate-950">{row.peb2}</span>
                    </div>
                    <div className="bg-white rounded-xl p-2">
                      <span className="text-slate-700 block">Coordenação</span>
                      <span className="font-semibold text-slate-950">{row.apoio}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tabela Desktop para Permissões */}
            <div className="hidden md:block overflow-x-auto rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#edf2f7] text-slate-800 text-xs font-semibold">
                  <tr>
                    <th className="py-3 px-4 rounded-tl-xl">Recurso do Sistema</th>
                    <th className="py-3 px-4 text-center">Admin</th>
                    <th className="py-3 px-4 text-center">PEB I</th>
                    <th className="py-3 px-4 text-center">PEB II</th>
                    <th className="py-3 px-4 text-center rounded-tr-xl">Coordenação</th>
                  </tr>
                </thead>
                <tbody>
                  {rbacModules.map((row) => {
                    const renderVal = (val: string) => {
                      if (val === 'Bloqueado') {
                        return (
                          <span className="inline-flex items-center gap-1 text-slate-700">
                            <Ban className="w-3.5 h-3.5" />
                            <span>Não</span>
                          </span>
                        );
                      }
                      if (val === 'Mascarado') {
                        return (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#fef3c7] text-[#92400e] font-medium">
                            <Lock className="w-3 h-3" />
                            <span>Mascarado</span>
                          </span>
                        );
                      }
                      return (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#eaf6ef] text-[#005035] font-medium">
                          <Check className="w-3 h-3" />
                          <span>{val}</span>
                        </span>
                      );
                    };

                    return (
                      <tr key={row.module} className="odd:bg-[#f4f7fb] even:bg-white hover:bg-[#dce7fb]/50 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-950 block">
                            {row.module}
                          </span>
                          <span className="text-xs text-slate-700">{row.subtitle}</span>
                        </td>
                        <td className="py-3 px-4 text-center">{renderVal(row.admin)}</td>
                        <td className="py-3 px-4 text-center">{renderVal(row.peb1)}</td>
                        <td className="py-3 px-4 text-center">{renderVal(row.peb2)}</td>
                        <td className="py-3 px-4 text-center">{renderVal(row.apoio)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* =====================================================================
          SEÇÃO 2 · SUB-ABA 4: SEGURANÇA & LGPD (ZERO CONTORNOS, RESPONSIVA)
          ===================================================================== */}
      {activeSection === 'seguranca' && activeSubTab === 'seguranca_lgpd' && (
        <div className="space-y-4">
          <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-base sm:text-lg font-semibold text-slate-950">
                  Segurança, Privacidade e LGPD (Art. 14)
                </h2>
                <p className="text-xs text-slate-700 max-w-2xl">
                  Proteção contínua de dados de crianças e adolescentes com mascaramento automático e trilha de auditoria.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleExportSecurityAudit}
                  className="min-h-[40px] px-4 rounded-xl bg-[#091b3b] hover:bg-[#0b3b8c] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportar Auditoria (.CSV)</span>
                </button>

                {canManage && (
                  <div className="px-3.5 py-2 rounded-xl bg-[#edf2f7] inline-flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-slate-700" />
                    <ToggleSwitch
                      checked={lgpdConfig.maskSensitiveDataByDefault}
                      onChange={handleToggleMasking}
                      activeText="Mascaramento LGPD Ativo"
                      inactiveText="Mascaramento Desativado"
                      ariaLabel="Alternar mascaramento LGPD de dados sensíveis"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="p-3.5 rounded-2xl bg-[#f4f7fb] space-y-1">
                <span className="text-xs font-semibold text-[#047857] block">Criptografia</span>
                <span className="text-sm font-semibold text-slate-950 block">TLS 1.3 / HTTPS</span>
                <p className="text-xs text-slate-700">
                  Dados protegidos em trânsito e armazenamento local.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#f4f7fb] space-y-1">
                <span className="text-xs font-semibold text-[#0b3b8c] block">Autenticação</span>
                <span className="text-sm font-semibold text-slate-950 block">
                  Domínio Institucional
                </span>
                <p className="text-xs text-slate-700 break-words">
                  Apenas e-mails {INSTITUTIONAL_EMAIL_DOMAIN}.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#f4f7fb] space-y-1">
                <span className="text-xs font-semibold text-slate-700 block">Proteção LGPD</span>
                <span className="text-sm font-semibold text-slate-950 block">
                  {lgpdConfig.maskSensitiveDataByDefault ? 'Dados Mascarados' : 'Modo Auditoria'}
                </span>
                <p className="text-xs text-slate-700">
                  CPF, NIS, endereços e laudos protegidos.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#f4f7fb] space-y-1">
                <span className="text-xs font-semibold text-slate-700 block">Retenção Legal</span>
                <span className="text-sm font-semibold text-slate-950 tabular-nums block">
                  5 Anos Letivos
                </span>
                <p className="text-xs text-slate-700">
                  Guarda de 1.825 dias para auditoria escolar.
                </p>
              </div>
            </div>
          </section>

          {/* Central Firebase Cloud Messaging (FCM) — Alertas de Fechamento da Janela */}
          <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-semibold text-slate-950">
                    Central Firebase Cloud Messaging (FCM) · Prazos da Janela
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                      fcmStatus?.fcmHttpV1Ready
                        ? 'bg-[#eaf6ef] text-[#005035]'
                        : fcmStatus?.hasFirebaseAdminAccount
                        ? 'bg-[#e8f0fe] text-[#1a4fa3]'
                        : 'bg-[#fef3c7] text-[#92400e]'
                    }`}
                  >
                    {fcmStatus?.fcmHttpV1Ready
                      ? 'FCM HTTP v1 + VAPID Configurados'
                      : fcmStatus?.hasFirebaseAdminAccount
                      ? 'Service Account Ativa · Web Push Pronto'
                      : 'Modo Web Push / Tempo Real Ativo'}
                  </span>
                </div>
                <p className="text-xs text-slate-700 max-w-2xl">
                  Integração oficial via Firebase Cloud Messaging (VAPID + Service Account) com monitoramento automático para lembrar professores antes do fechamento da chamada ({windowEval.closingDateFormatted}).
                </p>
              </div>

              {canManage && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="px-3.5 py-2 rounded-xl bg-emerald-50 text-[#047857] text-xs font-bold inline-flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#047857]" />
                    <span>Notificações FCM Compulsórias Ativas</span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="p-3.5 rounded-2xl bg-[#f4f7fb] space-y-1">
                <span className="text-xs font-semibold text-slate-700 block">
                  Dispositivos Inscritos
                </span>
                <span className="text-xl font-semibold text-slate-950 tabular-nums block">
                  {fcmStatus?.totalRegisteredDevices ?? 0} dispositivo(s)
                </span>
                <span className="text-xs text-[#047857] font-medium block">
                  {fcmStatus?.realFcmTokensCount ?? fcmStatus?.activeFcmTokensCount ?? 0} token(s) FCM pronto(s) em segundo plano
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#f4f7fb] space-y-1">
                <span className="text-xs font-semibold text-slate-700 block">
                  Turmas Pendentes Agora
                </span>
                <span className="text-xl font-semibold text-slate-950 tabular-nums block">
                  {classes.filter((c) => c.isPending).length} de {classes.length}
                </span>
                <span className="text-xs text-slate-700 block">
                  Encerramento oficial: {windowEval.closingDateFormatted}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#f4f7fb] space-y-1">
                <span className="text-xs font-semibold text-slate-700 block">
                  Disparos Realizados
                </span>
                <span className="text-xl font-semibold text-slate-950 tabular-nums block">
                  {fcmStatus?.recentDispatches?.length ?? 0} alerta(s)
                </span>
                <span className="text-xs text-slate-700 block">
                  Navegação direta para Frequência Mensal
                </span>
              </div>
            </div>

            {canManage && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-[#f4f7fb] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-950">
                      Disparo Manual Imediato (Push / FCM)
                    </span>
                    <div className="inline-flex rounded-xl bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => setFcmAudienceTarget('pending_only')}
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                          fcmAudienceTarget === 'pending_only'
                            ? 'bg-[#091b3b] text-white'
                            : 'text-slate-700 hover:text-slate-950'
                        }`}
                      >
                        Só Pendentes
                      </button>
                      <button
                        type="button"
                        onClick={() => setFcmAudienceTarget('all')}
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                          fcmAudienceTarget === 'all'
                            ? 'bg-[#091b3b] text-white'
                            : 'text-slate-700 hover:text-slate-950'
                        }`}
                      >
                        Todos Professores
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Envia notificação push imediata lembrando a data de fechamento da janela e abrindo a tela de lançamento ao tocar.
                  </p>
                  <button
                    type="button"
                    disabled={isSendingFcmAlert}
                    onClick={() => handleSendWindowClosingFcmFromAcessos()}
                    className="w-full min-h-[42px] px-4 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    <Send className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {isSendingFcmAlert
                        ? 'Disparando Alerta Push...'
                        : fcmAudienceTarget === 'pending_only'
                        ? `Alertar Professores Pendentes (${classes.filter((c) => c.isPending).length} turmas)`
                        : 'Alertar Todos os Professores Agora'}
                    </span>
                  </button>
                </div>

                <form
                  onSubmit={handleSaveFcmConfigFromAcessos}
                  className="p-4 rounded-2xl bg-[#eaf6ef]/70 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#005035]">
                        Regras de Alerta Automático (FCM HTTP v1)
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-white text-[#047857] text-xs font-semibold">
                        {fcmStatus?.hasViteVapidKey ? 'VAPID Ativo' : 'Web Push Ativo'}
                      </span>
                    </div>
                    <p className="text-xs text-[#374151] leading-relaxed">
                      Credenciais de projeto (ListaPilotoCandelario2027 · Firebase) e chave VAPID conectadas no servidor. O monitor verifica automaticamente a janela a cada 15 minutos.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <label className="space-y-1 block">
                      <span className="text-xs font-semibold text-[#1d1d1f] block">
                        Antecedência do Aviso
                      </span>
                      <CustomSelect
                        value={fcmConfigDraft.notifyDaysBeforeClose}
                        onChange={(val) =>
                          setFcmConfigDraft((prev) => ({
                            ...prev,
                            notifyDaysBeforeClose: Number(val),
                          }))
                        }
                        ariaLabel="Antecedência do Aviso"
                        className="w-full bg-white text-xs font-semibold text-[#1d1d1f]"
                        options={[1, 2, 3, 4, 5].map((d) => ({
                          value: String(d),
                          label: `${d} ${d === 1 ? 'dia' : 'dias'} antes de abrir`,
                        }))}
                      />
                    </label>

                    <label className="space-y-1 block">
                      <span className="text-xs font-semibold text-[#1d1d1f] block">
                        Público-Alvo Automático
                      </span>
                      <CustomSelect
                        value={fcmConfigDraft.remindPendingTeachersOnly ? 'pending' : 'all'}
                        onChange={(val) =>
                          setFcmConfigDraft((prev) => ({
                            ...prev,
                            remindPendingTeachersOnly: val === 'pending',
                          }))
                        }
                        ariaLabel="Público-Alvo Automático"
                        className="w-full bg-white text-xs font-semibold text-[#1d1d1f]"
                        options={[
                          { value: 'pending', label: 'Apenas turmas pendentes' },
                          { value: 'all', label: 'Todos os docentes' },
                        ]}
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-xs text-[#374151]">
                      {fcmStatus?.hasFirebaseAdminAccount
                        ? 'Service Account verificada para envio em segundo plano.'
                        : 'Envio em tempo real via Service Worker ativo.'}
                    </span>
                    <button
                      type="submit"
                      disabled={isSavingFcmConfig}
                      className="min-h-[38px] px-3.5 rounded-xl bg-[#1d1d1f] hover:bg-black text-white text-xs font-semibold cursor-pointer disabled:opacity-60 shrink-0"
                    >
                      {isSavingFcmConfig ? 'Salvando...' : 'Salvar Regras'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {fcmStatus && fcmStatus.recentDispatches.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-[#374151] block">
                  Últimos Alertas FCM Disparados
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {fcmStatus.recentDispatches.slice(0, 4).map((item) => (
                    <div key={item.id} className="p-3 rounded-2xl bg-[#f8f8fb] space-y-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                            item.urgency === 'urgent'
                              ? 'bg-[#fee2e2] text-[#991b1b]'
                              : 'bg-[#fef3c7] text-[#92400e]'
                          }`}
                        >
                          {item.urgency === 'urgent' ? 'Crítico' : 'Prazo'}
                        </span>
                        <span className="text-xs text-slate-700 tabular-nums">
                          {new Date(item.createdAtMs).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-950 break-words">{item.title}</p>
                      <p className="text-xs text-slate-700 break-words leading-relaxed">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <AdminSecurityLogsTab
            securityLogsTotal={securityLogs.length}
            filteredSecurityLogs={filteredSecurityLogs}
            pagedSecurityLogs={visibleSecurityAuditLogs}
            currentPage={safeSecurityPage}
            pageSize={SECURITY_PAGE_SIZE}
            searchTerm={securitySearchTerm}
            severityFilter={securitySeverityFilter}
            canManage={canManage}
            onChangeSearchTerm={(val) => {
              setSecuritySearchTerm(val);
              setSecurityPage(1);
            }}
            onChangeSeverityFilter={(val) => {
              setSecuritySeverityFilter(val);
              setSecurityPage(1);
            }}
            onPageChange={setSecurityPage}
            onClearLogs={handleClearSecurityLogs}
          />
        </div>
      )}

      {/* =====================================================================
          SEÇÃO 2 · SUB-ABA 5: TEMPO DE TELA E SESSÕES (RESPONSIVA)
          ===================================================================== */}
      {activeSection === 'seguranca' && activeSubTab === 'monitoramento' && (
        <AdminSessionLogsSection
          totalLogsCount={accessSessionLogs.length}
          filteredLogs={filteredLogs}
          pagedLogs={visibleSessionLogs}
          currentPage={safeLogsPage}
          pageSize={LOGS_PAGE_SIZE}
          searchTerm={logSearchTerm}
          canManage={canManage}
          hasClearAction={Boolean(onClearAccessLogs)}
          onChangeSearchTerm={(val) => {
            setLogSearchTerm(val);
            setLogsPage(1);
          }}
          onPageChange={setLogsPage}
          onClearLogs={onClearAccessLogs}
        />
      )}

      {/* =====================================================================
          SEÇÃO 2 · SUB-ABA 6: VERIFICADOR DE ÍCONES PWA & COMPATIBILIDADE iOS
          ===================================================================== */}
      {activeSection === 'seguranca' && activeSubTab === 'pwa_identidade' && (
        <Suspense
          fallback={
            <div className="bg-white rounded-3xl p-8 flex items-center justify-center gap-2.5 text-xs font-semibold text-slate-700 shadow-xs">
              <Loader2 className="w-5 h-5 text-[#092e70] animate-spin" />
              <span>Carregando verificador PWA...</span>
            </div>
          }
        >
          <PwaIconsHealthScanner />
        </Suspense>
      )}

      {/* =====================================================================
          SEÇÃO 3: CENTRAL DE UPLOADS & IMPORTAÇÕES (FOTOS, PDFs, .HTM, JSON)
          ===================================================================== */}
      {activeSection === 'uploads' && (
        <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {uploadTools.map((tool) => {
              const isActive = activeUploadTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setActiveUploadTool(tool.id)}
                  className={`min-w-0 text-left p-3.5 rounded-2xl transition-all duration-150 card-interactive cursor-pointer flex items-center gap-3 ${
                    isActive
                      ? 'bg-[#091b3b] text-white shadow-xs'
                      : 'bg-[#f4f7fb] hover:bg-[#edf2f7] text-slate-950'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-white/20 text-white' : 'bg-white text-[#0b3b8c]'
                    }`}
                  >
                    {tool.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs sm:text-sm font-semibold block break-words leading-snug">
                      {tool.label}
                    </span>
                    <span
                      className={`text-[11px] block break-words leading-snug mt-0.5 ${
                        isActive ? 'text-slate-200' : 'text-slate-700'
                      }`}
                    >
                      {tool.subtitle}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="pt-1">
            <Suspense
              fallback={
                <div className="rounded-2xl bg-[#f4f7fb] p-8 flex items-center justify-center gap-2.5 text-xs font-semibold text-slate-700">
                  <Loader2 className="w-5 h-5 text-[#092e70] animate-spin" />
                  <span>Carregando ferramenta de importação...</span>
                </div>
              }
            >
            {activeUploadTool === 'fotos' && (
              <AdminArrasteFotosModal
                isOpen
                embedded
                onOpenStorageManager={() => setIsPhotoStorageModalOpen(true)}
                onClose={() => handleSelectSection('acesso', 'quadro_turmas')}
                classes={classes}
                onBatchPhotosSaved={(updatedClasses) => {
                  if (onUpdateClasses) onUpdateClasses(updatedClasses);
                  triggerFeedback('success', 'Lote de fotos salvo e sincronizado.');
                }}
              />
            )}

            {activeUploadTool === 'pdfs' && (
              <AdminArrastePdfsModal
                isOpen
                embedded
                onClose={() => handleSelectSection('acesso', 'quadro_turmas')}
                classes={classes}
                onBatchPdfsSaved={(updatedClasses) => {
                  if (onUpdateClasses) onUpdateClasses(updatedClasses);
                  triggerFeedback('success', 'Lote de Fichas PDF vinculado com sucesso.');
                }}
              />
            )}

            {activeUploadTool === 'htm' && (
              <ImportarDeficienciasHtmScreen
                embedded
                classes={classes}
                userRole={userRole}
                userEmail={currentUserEmail}
                teacherRoleType={teacherRoleType}
                onUpdateClasses={(updatedClasses) => {
                  if (onUpdateClasses) onUpdateClasses(updatedClasses);
                }}
                onBack={() => handleSelectSection('acesso', 'quadro_turmas')}
              />
            )}

            {activeUploadTool === 'json' && (
              <AtualizarDadosJsonModal
                isOpen
                embedded
                onClose={() => handleSelectSection('acesso', 'quadro_turmas')}
                classes={classes}
                onUpdateClasses={(updatedClasses) => {
                  if (onUpdateClasses) onUpdateClasses(updatedClasses);
                  triggerFeedback('success', 'Base de dados atualizada via JSON.');
                }}
                currentUserEmail={currentUserEmail}
              />
            )}
            </Suspense>
          </div>
        </section>
      )}

      {/* =====================================================================
          SEÇÃO 2.5: CONFIGURADOR DO CALENDÁRIO OFICIAL (200 DIAS & FERIADOS)
          ===================================================================== */}
      {activeSection === 'calendario' && (
        <Suspense
          fallback={
            <div className="bg-white rounded-3xl p-8 flex items-center justify-center gap-2.5 text-xs font-semibold text-slate-700 shadow-xs">
              <Loader2 className="w-5 h-5 text-[#092e70] animate-spin" />
              <span>Carregando configurador oficial de 200 dias...</span>
            </div>
          }
        >
          <DiasLetivosScreen
            embedded
            userRole={userRole}
            userEmail={currentUserEmail}
            userName="Administrador Escolar"
            classes={classes}
            onUpdateClasses={(updatedClasses) => {
              const latestCal = getStoredOfficialCalendarConfig();
              if (latestCal?.year) {
                setActiveSchoolYear(latestCal.year);
              }
              if (onUpdateClasses) onUpdateClasses(updatedClasses);
              triggerFeedback(
                'success',
                `Ano letivo ${latestCal?.year || activeSchoolYear} (200 dias) publicado e sincronizado com as turmas.`
              );
            }}
            onNavigateToSheet={() => onNavigateScreen?.('planilha')}
            onBack={() => handleSelectSection('acesso', 'quadro_turmas')}
          />
        </Suspense>
      )}

      {/* =====================================================================
          SEÇÃO 4: DIAGNÓSTICO DO BANCO & INTEGRIDADE DE SINCRONIZAÇÃO
          ===================================================================== */}
      {activeSection === 'diagnostico' && (
        <Suspense
          fallback={
            <div className="bg-white rounded-3xl p-8 flex items-center justify-center gap-2.5 text-xs font-semibold text-slate-700 shadow-xs">
              <Loader2 className="w-5 h-5 text-[#092e70] animate-spin" />
              <span>Carregando diagnóstico do banco de dados...</span>
            </div>
          }
        >
          <DiagnosticoBancoDadosScreen
            embedded
            classes={classes}
            authorizedUsers={authorizedUsers}
            syncSnapshot={effectiveSyncSnapshot}
            userRole={userRole}
            userEmail={currentUserEmail}
            teacherRoleType={teacherRoleType}
            onUpdateClasses={(updatedClasses) => {
              if (onUpdateClasses) onUpdateClasses(updatedClasses);
            }}
            onOpenClassDetails={(cls) => {
              if (onOpenClassDetails) {
                onOpenClassDetails(cls);
              } else if (onNavigateScreen) {
                onNavigateScreen('detalhes');
              }
            }}
            onNavigateScreen={onNavigateScreen || (() => {})}
            onOpenHtmUpload={() => {
              setActiveSection('uploads');
              setActiveUploadTool('htm');
            }}
            onOpenPhotoCacheModal={() => setIsPhotoStorageModalOpen(true)}
            onBack={() => handleSelectSection('acesso', 'quadro_turmas')}
          />
        </Suspense>
      )}

      <AdminUserAssignModal
        user={assignModalUser}
        classes={classes}
        canManage={canManage}
        searchQuery={assignModalSearch}
        onChangeSearchQuery={setAssignModalSearch}
        resolveAccessLevel={(u) => resolveAccessLevel(u)}
        getUserEffectiveClassIds={getUserEffectiveClassIds}
        onToggleActive={handleToggleActive}
        onUpdateExpiration={handleUpdateUserExpiration}
        onSetFunctionPreset={handleSetUserFunctionPreset}
        onToggleExtraClass={handleToggleUserExtraClass}
        onClose={() => setAssignModalUserId(null)}
      />

      {isPhotoStorageModalOpen && (
        <Suspense fallback={null}>
          <IndexedDbPhotoStorageModal
            isOpen={isPhotoStorageModalOpen}
            onClose={() => setIsPhotoStorageModalOpen(false)}
            classes={classes}
            currentUserEmail={currentUserEmail}
            onCacheUpdated={(msg) => triggerFeedback('success', msg)}
          />
        </Suspense>
      )}
    </div>
  );
};
