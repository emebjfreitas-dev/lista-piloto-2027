import React, { useState, useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  AuthorizedUser,
  ClassGroup,
  UserRole,
  AttendanceWindowConfig,
  UserAccessSessionLog,
} from '../types';
import { INSTITUTIONAL_EMAIL_DOMAIN, INITIAL_AUTHORIZED_USERS } from '../data/mockData';
import {
  isValidInstitutionalEmail,
  evaluateAttendanceLaunchWindow,
  formatDurationHuman,
  exportOfficialMatrixToXLS,
} from '../services/db';
import { StudentAvatar } from './StudentAvatar';

interface UsuariosAcessoScreenProps {
  authorizedUsers: AuthorizedUser[];
  accessSessionLogs?: UserAccessSessionLog[];
  onClearAccessLogs?: () => void;
  classes: ClassGroup[];
  onUpdateClasses?: (updatedClasses: ClassGroup[]) => void;
  currentUserEmail: string;
  userRole: UserRole;
  attendanceWindowConfig: AttendanceWindowConfig;
  onUpdateAttendanceWindowConfig: (nextConfig: AttendanceWindowConfig) => void;
  onSaveAuthorizedUsers: (updatedUsers: AuthorizedUser[]) => void;
  onSelectPreviewClassId?: (classId: string) => void;
  onSimulateTeacherProfile?: (teacher: AuthorizedUser) => void;
  onNavigateToDatabaseEmailsTab?: () => void;
  onBack: () => void;
}

type SubTabId = 'quadro_turmas' | 'contas_acesso' | 'monitoramento';

export const UsuariosAcessoScreen: React.FC<UsuariosAcessoScreenProps> = ({
  authorizedUsers,
  accessSessionLogs = [],
  onClearAccessLogs,
  classes,
  onUpdateClasses,
  currentUserEmail,
  userRole,
  attendanceWindowConfig,
  onUpdateAttendanceWindowConfig,
  onSaveAuthorizedUsers,
  onSelectPreviewClassId,
  onSimulateTeacherProfile,
  onNavigateToDatabaseEmailsTab,
  onBack,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('quadro_turmas');
  const [matrixShiftFilter, setMatrixShiftFilter] = useState<'ALL' | 'MANHÃ' | 'TARDE'>('ALL');
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

  const [emailPrefix, setEmailPrefix] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('usuario');
  const [assignedClassId, setAssignedClassId] = useState<string>(classes[0]?.id || 'g04a');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'usuario' | 'peb2' | 'admin'>('all');
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [onlyAccessedFilter, setOnlyAccessedFilter] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [addingSecondClassForUserId, setAddingSecondClassForUserId] = useState<string | null>(null);
  const [draftEdits, setDraftEdits] = useState<
    Record<
      string,
      {
        role: UserRole;
        assignedClassId: string;
        assignedClassName: string;
        assignedClassIds: string[];
        assignedClassNames: string[];
      }
    >
  >({});
  const [recentlySavedUserIds, setRecentlySavedUserIds] = useState<Record<string, boolean>>({});

  const canManage = userRole === 'admin';

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
    }, 3500);
  };

  // Find regente user for a class (100% unified instance)
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

    const updatedClasses = classes.map((c) =>
      c.id === cls.id
        ? {
            ...c,
            teacherName: matrixDraft.teacherName.trim().toUpperCase(),
            teacherPronoun: matrixDraft.teacherPronoun.trim().toUpperCase(),
            teacherFirstName: matrixDraft.teacherFirstName.trim().toUpperCase(),
            room: matrixDraft.room.trim().toUpperCase(),
            shift: matrixDraft.shift,
            turmaSedName: matrixDraft.turmaSedName.trim().toUpperCase(),
            classeSedCode: matrixDraft.classeSedCode.trim(),
            artTeacher: matrixDraft.artTeacher.trim().toUpperCase(),
            peTeacher: matrixDraft.peTeacher.trim().toUpperCase(),
            englishTeacher: matrixDraft.englishTeacher.trim().toUpperCase(),
          }
        : c
    );

    if (onUpdateClasses) {
      onUpdateClasses(updatedClasses);
    }

    // Keep regente AuthorizedUser in sync without redundancy
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
      `Quadro da turma ${cls.turmaAbrev || cls.name} atualizado e sincronizado em tempo real!`
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
        `Somente e-mails institucionais com final ${INSTITUTIONAL_EMAIL_DOMAIN} podem ser cadastrados.`
      );
      return;
    }

    const localPart = fullEmail.replace(INSTITUTIONAL_EMAIL_DOMAIN, '').trim();
    if (!localPart || localPart.length < 2) {
      triggerFeedback('error', 'Informe o identificador do e-mail antes do @educacao.jundiai.sp.gov.br.');
      return;
    }

    const exists = authorizedUsers.some(
      (u) => u.email.trim().toLowerCase() === fullEmail
    );
    if (exists) {
      triggerFeedback('error', `O e-mail ${fullEmail} já está cadastrado na lista de acessos.`);
      return;
    }

    const targetClass = classes.find((c) => c.id === assignedClassId);
    const assignedClassName =
      role === 'admin'
        ? `Todas as ${classes.length} Turmas (Acesso Pleno)`
        : role === 'peb2'
        ? 'Todas as Turmas (Somente Visualização)'
        : targetClass
        ? `${targetClass.name} (${targetClass.shift.replace('Turno ', '')})`
        : 'GRUPO 04 A (Manhã)';

    const newUser: AuthorizedUser = {
      id: `usr-${Date.now()}`,
      email: fullEmail,
      name: (name.trim() || `Servidor(a) ${localPart}`).toUpperCase(),
      role,
      teacherRoleType:
        role === 'admin' ? 'gestao' : role === 'peb2' ? 'especialista' : 'regente',
      assignedClassId: role === 'usuario' ? assignedClassId : 'all',
      assignedClassName,
      assignedClassIds: role === 'usuario' ? [assignedClassId] : ['all'],
      assignedClassNames: [assignedClassName],
      active: true,
      createdAt: new Date().toLocaleDateString('pt-BR'),
      updatedAtMs: Date.now(),
    };

    onSaveAuthorizedUsers([newUser, ...authorizedUsers]);
    setEmailPrefix('');
    setName('');
    triggerFeedback(
      'success',
      `Acesso concedido para ${fullEmail} (${
        role === 'admin'
          ? 'ADMIN'
          : role === 'usuario'
          ? `PEB I • ${assignedClassName}`
          : 'PEB II • Especialista'
      }).`
    );
  };

  const handleChangeUserRole = (userId: string, newRole: UserRole) => {
    if (!canManage) return;
    const origUser = authorizedUsers.find((u) => u.id === userId);
    if (!origUser) return;
    const currentClassIds = getUserEffectiveClassIds(origUser);
    const summary = buildClassSummaryFromIds(newRole, currentClassIds, origUser.subjectName);

    setDraftEdits((prev) => ({
      ...prev,
      [userId]: {
        role: newRole,
        ...summary,
      },
    }));

    const nowMs = Date.now();
    const next: AuthorizedUser[] = authorizedUsers.map((u) =>
      u.id === userId
        ? {
            ...u,
            role: newRole,
            teacherRoleType:
              newRole === 'admin'
                ? ('gestao' as const)
                : newRole === 'peb2'
                ? ('especialista' as const)
                : ('regente' as const),
            ...summary,
            updatedAtMs: nowMs,
          }
        : u
    );
    onSaveAuthorizedUsers(next);
    markUserSavedFlash([userId]);
  };

  const handleChangeUserClass = (userId: string, newClassId: string) => {
    if (!canManage) return;
    const origUser = authorizedUsers.find((u) => u.id === userId);
    const targetClass = classes.find((c) => c.id === newClassId);
    if (!origUser || !targetClass) return;

    const currentDraft = draftEdits[userId];
    const effectiveRole = currentDraft ? currentDraft.role : origUser.role;
    const existingIds = getUserEffectiveClassIds(origUser);
    const nextIds = [
      targetClass.id,
      ...existingIds.slice(1).filter((id) => id !== targetClass.id),
    ];
    const summary = buildClassSummaryFromIds(effectiveRole, nextIds, origUser.subjectName);

    setDraftEdits((prev) => ({
      ...prev,
      [userId]: {
        role: effectiveRole,
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
    if (onUpdateClasses && effectiveRole === 'usuario') {
      const updatedCls = classes.map((c) =>
        c.id === targetClass.id
          ? {
              ...c,
              teacherName: origUser.name,
              teacherPronoun: origUser.pronoun || c.teacherPronoun || 'PROFESSORA',
              teacherFirstName:
                origUser.firstName || origUser.name.split(' ')[0] || c.teacherFirstName,
            }
          : c
      );
      onUpdateClasses(updatedCls);
    }
    if (onSelectPreviewClassId) {
      onSelectPreviewClassId(targetClass.id);
    }
    markUserSavedFlash([userId]);
  };

  const handleAddExtraClassToUser = (userId: string, extraClassId: string) => {
    if (!canManage || !extraClassId) return;
    const origUser = authorizedUsers.find((u) => u.id === userId);
    if (!origUser) return;
    const currentDraft = draftEdits[userId];
    const effectiveRole = currentDraft ? currentDraft.role : origUser.role;
    const existingIds = getUserEffectiveClassIds(origUser);
    const nextIds = Array.from(new Set([...existingIds, extraClassId]));
    const summary = buildClassSummaryFromIds(effectiveRole, nextIds, origUser.subjectName);

    setDraftEdits((prev) => ({
      ...prev,
      [userId]: {
        role: effectiveRole,
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
    setAddingSecondClassForUserId(null);
    if (onSelectPreviewClassId) {
      onSelectPreviewClassId(extraClassId);
    }
    markUserSavedFlash([userId]);
  };

  const handleRemoveClassFromUser = (userId: string, classIdToRemove: string) => {
    if (!canManage) return;
    const origUser = authorizedUsers.find((u) => u.id === userId);
    if (!origUser) return;
    const currentDraft = draftEdits[userId];
    const effectiveRole = currentDraft ? currentDraft.role : origUser.role;
    const existingIds = getUserEffectiveClassIds(origUser);
    if (existingIds.length <= 1) return;
    const nextIds = existingIds.filter((id) => id !== classIdToRemove);
    const summary = buildClassSummaryFromIds(effectiveRole, nextIds, origUser.subjectName);

    setDraftEdits((prev) => ({
      ...prev,
      [userId]: {
        role: effectiveRole,
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
    markUserSavedFlash([userId]);
  };

  const handleToggleActive = (userId: string) => {
    if (!canManage) return;
    const next = authorizedUsers.map((u) =>
      u.id === userId ? { ...u, active: !u.active, updatedAtMs: Date.now() } : u
    );
    onSaveAuthorizedUsers(next);
  };

  const handleRemoveUser = (user: AuthorizedUser) => {
    if (!canManage) return;
    const adminsActive = authorizedUsers.filter((u) => u.role === 'admin' && u.active);
    if (user.role === 'admin' && adminsActive.length <= 1) {
      triggerFeedback('error', 'É obrigatório manter pelo menos 1 e-mail Administrador ativo.');
      return;
    }
    const next = authorizedUsers.filter((u) => u.id !== user.id);
    onSaveAuthorizedUsers(next);
    triggerFeedback('success', `Acesso de ${user.email} revogado.`);
  };

  const handleRestoreOfficialSchoolMatrix = () => {
    if (!canManage) return;
    // Preserve live session counters when restoring official matrix users
    const metricsByEmail = new Map(
      authorizedUsers.map((u) => [u.email.trim().toLowerCase(), u])
    );
    const mergedUsers = INITIAL_AUTHORIZED_USERS.map((off) => {
      const existing = metricsByEmail.get(off.email.trim().toLowerCase());
      return {
        ...off,
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
      `Quadro Oficial sincronizado: 39 Professores Regentes (PEB I) + 9 Especialistas (Arte, Ed. Física, Inglês) + Gestão!`
    );
  };

  // Filtered classes for Quadro de Turmas e Professores
  const filteredMatrixClasses = useMemo(() => {
    const q = matrixSearchTerm.toLowerCase().trim();
    return classes.filter((cls) => {
      if (matrixShiftFilter === 'MANHÃ' && cls.shift !== 'Turno Manhã') return false;
      if (matrixShiftFilter === 'TARDE' && cls.shift !== 'Turno Tarde') return false;
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

  // Unique Specialists Summary (Arte, Ed. Física, Inglês)
  const specialistsUsers = useMemo(
    () =>
      authorizedUsers.filter(
        (u) => u.role === 'peb2' || u.teacherRoleType === 'especialista'
      ),
    [authorizedUsers]
  );

  const filteredUsers = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return authorizedUsers.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (onlyAccessedFilter && (u.totalAccessCount || 0) === 0) return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.assignedClassName.toLowerCase().includes(q) ||
        (u.subjectName || '').toLowerCase().includes(q) ||
        (u.firstName || '').toLowerCase().includes(q)
      );
    });
  }, [authorizedUsers, roleFilter, onlyAccessedFilter, searchTerm]);

  const filteredLogs = accessSessionLogs.filter(
    (l) =>
      l.email.toLowerCase().includes(logSearchTerm.toLowerCase()) ||
      l.name.toLowerCase().includes(logSearchTerm.toLowerCase()) ||
      l.assignedClassName.toLowerCase().includes(logSearchTerm.toLowerCase())
  );

  // KPIs
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
        ? 'Botão "Lançar Faltas" LIBERADO EXCEPCIONALMENTE para todas as turmas!'
        : 'Liberação excepcional encerrada. O botão "Lançar Faltas" segue a regra automática do calendário.'
    );
  };

  const manhaTurmasCount = classes.filter((c) => c.shift === 'Turno Manhã').length;
  const tardeTurmasCount = classes.filter((c) => c.shift === 'Turno Tarde').length;
  const totalActiveStudentsAll = classes.reduce(
    (acc, c) =>
      acc +
      c.students.filter((s) => {
        const sit = (s.situacao || 'ATIVO').toUpperCase().trim();
        return !sit.includes('BXTR') && !sit.includes('TRANSF') && !sit.includes('REMAN');
      }).length,
    0
  );

  // Dados para o Gráfico de Rosca (Donut Chart) de Distribuição de Acessos (PEB I, PEB II e Admin)
  const roleDistributionData = useMemo(() => {
    const peb1Users = authorizedUsers.filter((u) => u.role === 'usuario');
    const peb2Users = authorizedUsers.filter((u) => u.role === 'peb2');
    const adminUsers = authorizedUsers.filter((u) => u.role === 'admin');
    const total = Math.max(authorizedUsers.length, 1);

    const peb1Logins = peb1Users.reduce((acc, u) => acc + (u.totalAccessCount || 0), 0);
    const peb2Logins = peb2Users.reduce((acc, u) => acc + (u.totalAccessCount || 0), 0);
    const adminLogins = adminUsers.reduce((acc, u) => acc + (u.totalAccessCount || 0), 0);

    return [
      {
        id: 'usuario' as const,
        name: 'PEB I (Regentes)',
        shortName: 'PEB I',
        value: peb1Users.length,
        activeCount: peb1Users.filter((u) => u.active).length,
        accessedCount: peb1Users.filter((u) => (u.totalAccessCount || 0) > 0).length,
        loginsCount: peb1Logins,
        percentage: Math.round((peb1Users.length / total) * 100),
        color: '#0071e3', // Apple Blue
        description: 'Acesso direto à sua turma e lançamento de faltas',
      },
      {
        id: 'peb2' as const,
        name: 'PEB II (Especialistas)',
        shortName: 'PEB II',
        value: peb2Users.length,
        activeCount: peb2Users.filter((u) => u.active).length,
        accessedCount: peb2Users.filter((u) => (u.totalAccessCount || 0) > 0).length,
        loginsCount: peb2Logins,
        percentage: Math.round((peb2Users.length / total) * 100),
        color: '#ff9500', // Apple Amber
        description: 'Arte, Ed. Física e Inglês (Visualização das turmas)',
      },
      {
        id: 'admin' as const,
        name: 'Admin / Gestão',
        shortName: 'Admin',
        value: adminUsers.length,
        activeCount: adminUsers.filter((u) => u.active).length,
        accessedCount: adminUsers.filter((u) => (u.totalAccessCount || 0) > 0).length,
        loginsCount: adminLogins,
        percentage: Math.round((adminUsers.length / total) * 100),
        color: '#1d1d1f', // Apple Carbon Black
        description: 'Direção, Coordenação e Secretaria (Acesso Pleno)',
      },
    ];
  }, [authorizedUsers]);

  return (
    <div className="flex flex-col w-full max-w-[1600px] mx-auto pb-12 space-y-4 animate-gentle-fade">
      {/* Feedback Toast */}
      {feedbackMsg && (
        <div
          className={`p-4 rounded-2xl border-2 font-bold text-[0.9rem] flex items-center justify-between gap-2 shadow-sm ${
            feedbackMsg.type === 'success'
              ? 'bg-[#e8f8ef] border-[#005035] text-[#003440]'
              : 'bg-[#ffdad6] border-[#ba1a1a] text-[#93000a]'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[22px]">
              {feedbackMsg.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-xs underline font-extrabold cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Top Executive Header */}
      <section className="card-welcoming bg-white rounded-3xl p-5 sm:p-6 border border-black/[0.06] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-[#003440] text-white text-[0.7rem] font-extrabold uppercase tracking-wider">
                Quadro Oficial Docente &amp; Controle de Acessos 2027
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-[#eaf6ef] text-[#005035] text-[0.72rem] font-bold">
                {classes.length} Turmas ({manhaTurmasCount} Manhã · {tardeTurmasCount} Tarde) · {authorizedUsers.length} Contas
              </span>
            </div>
            <h1 className="text-[1.4rem] sm:text-[1.6rem] font-extrabold text-[#003440] tracking-tight leading-tight">
              Professores, Turmas SED &amp; Gerenciamento de Acessos
            </h1>
            <p className="text-[0.84rem] text-[#436370] font-medium max-w-3xl">
              Base unificada sem redundâncias com as 39 turmas oficiais, professores regentes (PEB I), especialistas de Arte, Educação Física e Língua Inglesa (PEB II), códigos SED e monitoramento de acessos em tempo real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                exportOfficialMatrixToXLS(classes, authorizedUsers);
                triggerFeedback(
                  'success',
                  'Planilha do Quadro Oficial de Turmas, Professores e Acessos (.xls) baixada com sucesso!'
                );
              }}
              className="min-h-[44px] px-4 rounded-2xl bg-[#005035] hover:bg-[#003d28] text-white font-extrabold text-[0.82rem] flex items-center gap-2 shadow-xs cursor-pointer transition-all active:scale-97"
            >
              <span className="material-symbols-outlined text-[19px]">download</span>
              <span>Baixar Quadro Completo (.XLS)</span>
            </button>

            {canManage && (
              <button
                type="button"
                onClick={handleRestoreOfficialSchoolMatrix}
                title="Sincronizar todas as 39 professoras regentes e 9 especialistas com o Quadro Oficial 2027"
                className="min-h-[44px] px-3.5 rounded-2xl bg-[#f2f4f3] hover:bg-[#e3e8e6] text-[#003440] font-extrabold text-[0.8rem] flex items-center gap-1.5 border border-black/[0.08] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">sync_saved_locally</span>
                <span>Sincronizar Quadro Oficial</span>
              </button>
            )}

            {onNavigateToDatabaseEmailsTab && (
              <button
                type="button"
                onClick={onNavigateToDatabaseEmailsTab}
                className="min-h-[44px] px-3.5 rounded-2xl bg-[#eaf6ef] hover:bg-[#d4f0df] text-[#005035] font-extrabold text-[0.8rem] flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">table_chart</span>
                <span>Planilha</span>
              </button>
            )}
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
          <div className="p-3 rounded-2xl bg-[#f5f7f6] border border-black/[0.05]">
            <span className="text-[0.66rem] font-extrabold uppercase tracking-wider text-[#5a676b] block">
              Turmas Oficiais
            </span>
            <span className="text-[1.35rem] font-black text-[#003440] tabular-nums">
              {classes.length}
            </span>
            <span className="text-[0.68rem] font-semibold text-[#436370] block">
              {manhaTurmasCount} Manhã · {tardeTurmasCount} Tarde
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-[#eaf6ef]/70 border border-[#005035]/15">
            <span className="text-[0.66rem] font-extrabold uppercase tracking-wider text-[#005035] block">
              Regentes (PEB I)
            </span>
            <span className="text-[1.35rem] font-black text-[#005035] tabular-nums">
              {authorizedUsers.filter((u) => u.role === 'usuario').length}
            </span>
            <span className="text-[0.68rem] font-semibold text-[#003723] block">
              Acesso direto à sua turma
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-[#fff4e5]/80 border border-[#d97706]/25">
            <span className="text-[0.66rem] font-extrabold uppercase tracking-wider text-[#92400e] block">
              Especialistas (PEB II)
            </span>
            <span className="text-[1.35rem] font-black text-[#b45309] tabular-nums">
              {specialistsUsers.length}
            </span>
            <span className="text-[0.68rem] font-semibold text-[#78350f] block">
              Arte · Ed. Física · Inglês
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-[#eef6fa] border border-[#003440]/12">
            <span className="text-[0.66rem] font-extrabold uppercase tracking-wider text-[#003440] block">
              Estudantes Ativos
            </span>
            <span className="text-[1.35rem] font-black text-[#003440] tabular-nums">
              {totalActiveStudentsAll}
            </span>
            <span className="text-[0.68rem] font-semibold text-[#436370] block">
              Matrículas ativas SED
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-[#f5f7f6] border border-black/[0.05]">
            <span className="text-[0.66rem] font-extrabold uppercase tracking-wider text-[#5a676b] block">
              Já Acessaram
            </span>
            <span className="text-[1.35rem] font-black text-[#005035] tabular-nums">
              {totalUsersWhoAccessed}/{authorizedUsers.length}
            </span>
            <span className="text-[0.68rem] font-semibold text-[#436370] block">
              {totalAccessesCount} logins · {activeNowSessionsCount} online
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-[#eaf6ef]/80 border border-[#005035]/20">
            <span className="text-[0.66rem] font-extrabold uppercase tracking-wider text-[#005035] block">
              Tempo Total de Tela
            </span>
            <span className="text-[1.2rem] font-black text-[#003440] tabular-nums block mt-0.5">
              {formatDurationHuman(totalPlatformDurationSeconds)}
            </span>
            <span className="text-[0.68rem] font-semibold text-[#005035] block">
              Monitorado a cada 5s
            </span>
          </div>
        </div>

        {/* Gráfico de Rosca (Donut Chart Recharts): Distribuição Visual de Acessos (PEB I, PEB II e Admin) */}
        <div className="p-4 sm:p-5 rounded-3xl bg-[#f5f5f7] flex flex-col lg:flex-row items-center justify-between gap-5">
          {/* Lado Esquerdo: Donut Chart com Total Central */}
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full lg:w-auto">
            <div className="relative w-[176px] h-[176px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={roleDistributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={54}
                    outerRadius={78}
                    paddingAngle={4}
                    dataKey="value"
                    stroke="none"
                    isAnimationActive={true}
                  >
                    {roleDistributionData.map((entry) => (
                      <Cell
                        key={entry.id}
                        fill={entry.color}
                        className="cursor-pointer transition-opacity hover:opacity-85"
                        onClick={() => {
                          setActiveSubTab('contas_acesso');
                          setRoleFilter((prev) => (prev === entry.id ? 'all' : entry.id));
                        }}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any, _name: any, props: any) => {
                      const payload = props?.payload;
                      return [
                        `${value} contas (${payload?.percentage || 0}%) • ${payload?.loginsCount || 0} logins`,
                        payload?.name || '',
                      ];
                    }}
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.96)',
                      borderRadius: '16px',
                      border: 'none',
                      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.12)',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      color: '#1d1d1f',
                      padding: '8px 12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Centro da Rosca */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[1.45rem] font-extrabold text-[#1d1d1f] tabular-nums leading-none">
                  {authorizedUsers.length}
                </span>
                <span className="text-[0.64rem] font-bold uppercase tracking-wider text-[#6e6e73] mt-1">
                  Contas Ativas
                </span>
              </div>
            </div>

            <div className="space-y-1.5 text-center sm:text-left">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white text-[#1d1d1f] text-[0.68rem] font-bold shadow-2xs">
                <span className="material-symbols-outlined text-[14px] text-[#0071e3]">
                  donut_large
                </span>
                Distribuição de Perfis de Acesso
              </span>
              <h2 className="text-[1.05rem] sm:text-[1.15rem] font-bold text-[#1d1d1f] tracking-tight">
                Proporção entre PEB I, PEB II e Admin
              </h2>
              <p className="text-[0.76rem] text-[#6e6e73] max-w-sm leading-relaxed">
                Clique em qualquer fatia ou cartão ao lado para filtrar rapidamente a lista de e-mails e permissões por perfil.
              </p>
              {roleFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setRoleFilter('all')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1d1d1f] text-white text-[0.7rem] font-semibold cursor-pointer mt-1"
                >
                  <span>Filtro ativo: {roleFilter === 'usuario' ? 'PEB I' : roleFilter === 'peb2' ? 'PEB II' : 'Admin'}</span>
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              )}
            </div>
          </div>

          {/* Lado Direito: Cartões Interativos da Legenda (PEB I, PEB II, Admin) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full lg:flex-1">
            {roleDistributionData.map((item) => {
              const isSelected = roleFilter === item.id && activeSubTab === 'contas_acesso';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveSubTab('contas_acesso');
                    setRoleFilter((prev) => (prev === item.id ? 'all' : item.id));
                  }}
                  className={`text-left p-3.5 rounded-2xl transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                    isSelected
                      ? 'bg-[#1d1d1f] text-white shadow-sm scale-[1.01]'
                      : 'bg-white hover:bg-white/80 text-[#1d1d1f] shadow-2xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-[0.78rem] font-bold truncate">
                        {item.name}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[0.68rem] font-extrabold tabular-nums ${
                        isSelected
                          ? 'bg-white/15 text-white'
                          : 'bg-[#f5f5f7] text-[#1d1d1f]'
                      }`}
                    >
                      {item.percentage}%
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-2 pt-0.5">
                    <div>
                      <span className="text-[1.45rem] font-extrabold tabular-nums leading-none">
                        {item.value}
                      </span>
                      <span
                        className={`text-[0.7rem] font-medium ml-1 ${
                          isSelected ? 'text-white/80' : 'text-[#6e6e73]'
                        }`}
                      >
                        contas
                      </span>
                    </div>
                    <span
                      className={`text-[0.68rem] font-semibold tabular-nums ${
                        isSelected ? 'text-white/90' : 'text-[#0066cc]'
                      }`}
                    >
                      {item.accessedCount}/{item.value} acessaram ({item.loginsCount} logins)
                    </span>
                  </div>

                  <p
                    className={`text-[0.68rem] leading-snug ${
                      isSelected ? 'text-white/75' : 'text-[#86868b]'
                    }`}
                  >
                    {item.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Controle Rápido da Janela do Botão Lançar Faltas */}
        <div
          className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            windowEval.isAllowedToLaunch
              ? 'bg-[#eaf6ef]/70 border-[#005035]/30'
              : 'bg-[#fff8f0] border-[#d97706]/30'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white ${
                windowEval.isAllowedToLaunch ? 'bg-[#005035]' : 'bg-[#b45309]'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {windowEval.isAllowedToLaunch ? 'lock_open' : 'schedule'}
              </span>
            </span>
            <div className="min-w-0">
              <span className="text-[0.82rem] font-extrabold text-[#003440] block">
                {windowEval.statusTitle}
              </span>
              <span className="text-[0.74rem] text-[#436370] block truncate">
                {windowEval.statusDescription}
              </span>
            </div>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={handleToggleExceptionalLaunch}
              className={`min-h-[40px] px-4 rounded-xl font-extrabold text-[0.78rem] flex items-center gap-1.5 shrink-0 cursor-pointer transition-all ${
                attendanceWindowConfig.exceptionalOverrideOpen
                  ? 'bg-[#ba1a1a] hover:bg-[#93000a] text-white'
                  : 'bg-[#005035] hover:bg-[#003723] text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[17px]">
                {attendanceWindowConfig.exceptionalOverrideOpen ? 'lock_reset' : 'key'}
              </span>
              <span>
                {attendanceWindowConfig.exceptionalOverrideOpen
                  ? 'Encerrar Abertura Excepcional'
                  : 'Liberar Lançamento Excepcional'}
              </span>
            </button>
          )}
        </div>

        {/* Sub-Abas iOS Segmented Control */}
        <div className="ios-segmented w-full flex overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('quadro_turmas')}
            className={`flex-1 ios-segmented-item flex items-center justify-center gap-1.5 py-2 whitespace-nowrap ${
              activeSubTab === 'quadro_turmas' ? 'ios-segmented-item-active' : ''
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">school</span>
            <span>1. Quadro Oficial de Turmas &amp; Professores ({classes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('contas_acesso')}
            className={`flex-1 ios-segmented-item flex items-center justify-center gap-1.5 py-2 whitespace-nowrap ${
              activeSubTab === 'contas_acesso' ? 'ios-segmented-item-active' : ''
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
            <span>2. E-mails &amp; Permissões de Acesso ({authorizedUsers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('monitoramento')}
            className={`flex-1 ios-segmented-item flex items-center justify-center gap-1.5 py-2 whitespace-nowrap ${
              activeSubTab === 'monitoramento' ? 'ios-segmented-item-active' : ''
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">monitoring</span>
            <span>3. Tempo de Tela &amp; Sessões ({accessSessionLogs.length})</span>
          </button>
        </div>
      </section>

      {/* =====================================================================
          SUB-ABA 1: QUADRO OFICIAL DE TURMAS, PROFESSORES REGENTES E ESPECIALISTAS
          ===================================================================== */}
      {activeSubTab === 'quadro_turmas' && (
        <div className="space-y-5">
          {/* Barra de Filtro Rápido do Quadro de Turmas */}
          <section className="card-welcoming bg-white rounded-3xl p-4 sm:p-5 border border-black/[0.06] space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { id: 'ALL', label: `Todas (${classes.length})` },
                    { id: 'MANHÃ', label: `☀️ Manhã (${manhaTurmasCount})` },
                    { id: 'TARDE', label: `⛅ Tarde (${tardeTurmasCount})` },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setMatrixShiftFilter(item.id)}
                    className={`min-h-[38px] px-3.5 rounded-xl text-[0.78rem] font-extrabold transition-all cursor-pointer ${
                      matrixShiftFilter === item.id
                        ? 'bg-[#003440] text-white shadow-2xs'
                        : 'bg-[#f2f4f3] text-[#436370] hover:bg-[#e4e8e6]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 max-w-xl">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8e8e93] text-[19px]">
                  search
                </span>
                <input
                  type="text"
                  value={matrixSearchTerm}
                  onChange={(e) => setMatrixSearchTerm(e.target.value)}
                  placeholder="Filtrar por sigla (G4C, 1A), professora, sala, código SED ou especialista..."
                  className="w-full min-h-[42px] pl-10 pr-9 rounded-2xl bg-[#f5f7f6] border border-black/[0.08] text-[0.84rem] font-semibold text-[#1c1c1e] focus:outline-none focus:bg-white focus:border-[#003440]"
                />
                {matrixSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setMatrixSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8e8e93] hover:text-[#1c1c1e] cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">cancel</span>
                  </button>
                )}
              </div>
            </div>

            {/* Tabela Completa das 39 Turmas com todas as Colunas Oficiais e Ações Diretas */}
            <div className="border border-black/[0.08] rounded-2xl overflow-x-auto shadow-2xs">
              <table className="w-full text-left text-[0.76rem] border-collapse min-w-[1440px]">
                <thead className="bg-[#003440] text-white font-extrabold uppercase tracking-wider text-[0.67rem]">
                  <tr>
                    <th className="py-3 px-2.5 text-center">Turma Abrev</th>
                    <th className="py-3 px-3">Professor(a) Regente + E-mail de Acesso</th>
                    <th className="py-3 px-2.5">Turma</th>
                    <th className="py-3 px-2.5">Sala de Aula</th>
                    <th className="py-3 px-2 text-center">Período</th>
                    <th className="py-3 px-2.5">Turma SED</th>
                    <th className="py-3 px-2 text-center">Qtd</th>
                    <th className="py-3 px-2.5 text-center">Classe SED</th>
                    <th className="py-3 px-2">Pronome / Prenome</th>
                    <th className="py-3 px-2.5">Arte (PEB II)</th>
                    <th className="py-3 px-2.5">Educação Física (PEB II)</th>
                    <th className="py-3 px-2.5">Língua Inglesa (PEB II)</th>
                    <th className="py-3 px-3 text-center">Acesso &amp; Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06]">
                  {filteredMatrixClasses.map((cls, idx) => {
                    const regenteUser = findRegenteUserForClass(cls);
                    const isEditing = editingMatrixClassId === cls.id && matrixDraft !== null;
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
                        className={`transition-colors ${
                          isEditing
                            ? 'bg-[#eaf6ef]/80'
                            : idx % 2 === 0
                            ? 'bg-white hover:bg-[#f6f9f8]'
                            : 'bg-[#f9fbfa] hover:bg-[#f1f6f4]'
                        }`}
                      >
                        {/* TURMA ABREV */}
                        <td className="py-2.5 px-2.5 text-center">
                          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-xl bg-[#003440] text-white font-mono font-black text-[0.76rem]">
                            {cls.turmaAbrev || cls.name}
                          </span>
                        </td>

                        {/* PROFESSOR(A) + EMAIL */}
                        <td className="py-2.5 px-3">
                          {isEditing && matrixDraft ? (
                            <input
                              type="text"
                              value={matrixDraft.teacherName}
                              onChange={(e) =>
                                setMatrixDraft({ ...matrixDraft, teacherName: e.target.value })
                              }
                              className="w-full px-2 py-1 rounded-lg bg-white border border-[#005035] font-bold text-[#003440] text-[0.76rem]"
                            />
                          ) : (
                            <div>
                              <span className="font-extrabold text-[#003440] block">
                                {cls.teacherName || regenteUser?.name || '—'}
                              </span>
                              {regenteUser ? (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="font-mono text-[0.68rem] text-[#005035] font-bold">
                                    {regenteUser.email}
                                  </span>
                                  {(regenteUser.totalAccessCount || 0) > 0 && (
                                    <span className="px-1.5 py-0.2 rounded bg-[#eaf6ef] text-[#005035] font-mono font-bold text-[0.62rem]">
                                      {regenteUser.totalAccessCount}x ·{' '}
                                      {formatDurationHuman(regenteUser.totalDurationSeconds)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[0.66rem] text-[#ba1a1a] font-semibold">
                                  Sem e-mail vinculado
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* TURMA */}
                        <td className="py-2.5 px-2.5 font-extrabold text-[#003440] whitespace-nowrap">
                          {cls.name}
                        </td>

                        {/* SALA DE AULA */}
                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          {isEditing && matrixDraft ? (
                            <input
                              type="text"
                              value={matrixDraft.room}
                              onChange={(e) =>
                                setMatrixDraft({ ...matrixDraft, room: e.target.value })
                              }
                              className="w-36 px-2 py-1 rounded-lg bg-white border border-[#005035] font-semibold text-[0.74rem]"
                            />
                          ) : (
                            <span className="font-semibold text-[#374346]">{cls.room}</span>
                          )}
                        </td>

                        {/* PERÍODO */}
                        <td className="py-2.5 px-2 text-center whitespace-nowrap">
                          {isEditing && matrixDraft ? (
                            <select
                              value={matrixDraft.shift}
                              onChange={(e) =>
                                setMatrixDraft({
                                  ...matrixDraft,
                                  shift: e.target.value as 'Turno Manhã' | 'Turno Tarde',
                                })
                              }
                              className="px-2 py-1 rounded-lg bg-white border border-[#005035] font-bold text-[0.72rem]"
                            >
                              <option value="Turno Manhã">MANHÃ</option>
                              <option value="Turno Tarde">TARDE</option>
                            </select>
                          ) : (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[0.66rem] font-extrabold uppercase ${
                                cls.shift === 'Turno Manhã'
                                  ? 'bg-[#fef3c7] text-[#92400e]'
                                  : 'bg-[#e0f2fe] text-[#075985]'
                              }`}
                            >
                              {cls.shift.replace('Turno ', '').toUpperCase()}
                            </span>
                          )}
                        </td>

                        {/* TURMA SED */}
                        <td className="py-2.5 px-2.5">
                          {isEditing && matrixDraft ? (
                            <input
                              type="text"
                              value={matrixDraft.turmaSedName}
                              onChange={(e) =>
                                setMatrixDraft({ ...matrixDraft, turmaSedName: e.target.value })
                              }
                              className="w-48 px-2 py-1 rounded-lg bg-white border border-[#005035] font-mono text-[0.7rem]"
                            />
                          ) : (
                            <span className="font-mono text-[0.7rem] text-[#436370] block">
                              {cls.turmaSedName || '—'}
                            </span>
                          )}
                        </td>

                        {/* QTD */}
                        <td className="py-2.5 px-2 text-center font-mono">
                          <span className="font-black text-[#005035] text-[0.8rem]">
                            {activeCount}
                          </span>
                          {cls.students.length !== activeCount && (
                            <span className="block text-[0.62rem] text-[#5a676b]">
                              ({cls.students.length} total)
                            </span>
                          )}
                        </td>

                        {/* CLASSE SED */}
                        <td className="py-2.5 px-2.5 text-center font-mono">
                          {isEditing && matrixDraft ? (
                            <input
                              type="text"
                              value={matrixDraft.classeSedCode}
                              onChange={(e) =>
                                setMatrixDraft({
                                  ...matrixDraft,
                                  classeSedCode: e.target.value,
                                })
                              }
                              className="w-28 px-2 py-1 rounded-lg bg-white border border-[#005035] font-mono text-[0.72rem]"
                            />
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-[#f2f4f3] text-[#003440] font-bold text-[0.72rem]">
                              {cls.classeSedCode || '—'}
                            </span>
                          )}
                        </td>

                        {/* PRONOME TRAT / PRENOME */}
                        <td className="py-2.5 px-2 whitespace-nowrap">
                          {isEditing && matrixDraft ? (
                            <div className="flex items-center gap-1">
                              <select
                                value={matrixDraft.teacherPronoun}
                                onChange={(e) =>
                                  setMatrixDraft({
                                    ...matrixDraft,
                                    teacherPronoun: e.target.value,
                                  })
                                }
                                className="px-1.5 py-1 rounded bg-white border border-[#005035] text-[0.68rem] font-bold"
                              >
                                <option value="PROFESSORA">PROFESSORA</option>
                                <option value="PROFESSOR">PROFESSOR</option>
                              </select>
                              <input
                                type="text"
                                value={matrixDraft.teacherFirstName}
                                onChange={(e) =>
                                  setMatrixDraft({
                                    ...matrixDraft,
                                    teacherFirstName: e.target.value,
                                  })
                                }
                                className="w-24 px-1.5 py-1 rounded bg-white border border-[#005035] text-[0.7rem] font-bold"
                              />
                            </div>
                          ) : (
                            <div>
                              <span className="text-[0.64rem] font-bold text-[#5a676b] block">
                                {cls.teacherPronoun || 'PROFESSORA'}
                              </span>
                              <span className="font-extrabold text-[#005035] text-[0.74rem]">
                                {cls.teacherFirstName || '—'}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* ARTE */}
                        <td className="py-2.5 px-2.5">
                          {isEditing && matrixDraft ? (
                            <input
                              type="text"
                              value={matrixDraft.artTeacher}
                              onChange={(e) =>
                                setMatrixDraft({ ...matrixDraft, artTeacher: e.target.value })
                              }
                              className="w-40 px-2 py-1 rounded-lg bg-white border border-[#005035] text-[0.7rem] font-semibold"
                            />
                          ) : (
                            <span className="text-[0.71rem] font-semibold text-[#1c1c1e] block">
                              {cls.artTeacher || '—'}
                            </span>
                          )}
                        </td>

                        {/* EDUCAÇÃO FÍSICA */}
                        <td className="py-2.5 px-2.5">
                          {isEditing && matrixDraft ? (
                            <input
                              type="text"
                              value={matrixDraft.peTeacher}
                              onChange={(e) =>
                                setMatrixDraft({ ...matrixDraft, peTeacher: e.target.value })
                              }
                              className="w-40 px-2 py-1 rounded-lg bg-white border border-[#005035] text-[0.7rem] font-semibold"
                            />
                          ) : (
                            <span className="text-[0.71rem] font-semibold text-[#1c1c1e] block">
                              {cls.peTeacher || '—'}
                            </span>
                          )}
                        </td>

                        {/* LÍNGUA INGLESA */}
                        <td className="py-2.5 px-2.5">
                          {isEditing && matrixDraft ? (
                            <input
                              type="text"
                              value={matrixDraft.englishTeacher}
                              onChange={(e) =>
                                setMatrixDraft({
                                  ...matrixDraft,
                                  englishTeacher: e.target.value,
                                })
                              }
                              className="w-40 px-2 py-1 rounded-lg bg-white border border-[#005035] text-[0.7rem] font-semibold"
                            />
                          ) : (
                            <span className="text-[0.71rem] font-semibold text-[#1c1c1e] block">
                              {cls.englishTeacher || '—'}
                            </span>
                          )}
                        </td>

                        {/* AÇÕES DIRETAS (Editar Linha / Simular Visão da Professora / Abrir Turma) */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSaveMatrixRow(cls)}
                                  className="px-2.5 py-1 rounded-lg bg-[#005035] hover:bg-[#003723] text-white font-black text-[0.7rem] flex items-center gap-1 cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-[14px]">
                                    check
                                  </span>
                                  <span>Salvar</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMatrixClassId(null);
                                    setMatrixDraft(null);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-[#f2f4f3] text-[#436370] font-bold text-[0.7rem] cursor-pointer"
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
                                    title="Editar dados da turma e professores"
                                    className="px-2 py-1 rounded-lg bg-[#f2f4f3] hover:bg-[#003440] text-[#003440] hover:text-white font-bold text-[0.7rem] flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">
                                      edit
                                    </span>
                                    <span>Editar</span>
                                  </button>
                                )}

                                {regenteUser && onSimulateTeacherProfile && (
                                  <button
                                    type="button"
                                    onClick={() => onSimulateTeacherProfile(regenteUser)}
                                    title={`Entrar na visão de ${regenteUser.name} (${cls.name})`}
                                    className="px-2.5 py-1 rounded-lg bg-[#eaf6ef] hover:bg-[#005035] text-[#005035] hover:text-white font-extrabold text-[0.7rem] flex items-center gap-1 border border-[#005035]/25 cursor-pointer transition-colors"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">
                                      visibility
                                    </span>
                                    <span>Abrir Turma</span>
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
          </section>

          {/* Quadro Consolidado de Especialistas PEB II (Arte, Educação Física e Língua Inglesa) */}
          <section className="card-welcoming bg-white rounded-3xl p-5 border border-black/[0.06] space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#b45309] block">
                  Quadro de Especialistas PEB II (Arte · Educação Física · Língua Inglesa)
                </span>
                <h2 className="text-[1.15rem] font-extrabold text-[#003440]">
                  Professores Especialistas e Turmas Atendidas ({specialistsUsers.length} Especialistas)
                </h2>
              </div>
              <span className="text-[0.75rem] font-semibold text-[#5a676b]">
                Perfil PEB II: Visualização das turmas atribuídas · Sem duplicidade de cadastro
              </span>
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
                    className="p-3.5 rounded-2xl bg-[#f8faf9] border border-black/[0.06] flex flex-col justify-between gap-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <StudentAvatar name={spec.name} size="sm" />
                        <div className="min-w-0">
                          <span className="px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e] text-[0.64rem] font-black uppercase">
                            {spec.subjectName || 'ESPECIALISTA PEB II'}
                          </span>
                          <h3 className="font-extrabold text-[0.86rem] text-[#003440] truncate mt-0.5">
                            {spec.name}
                          </h3>
                          <p className="font-mono text-[0.7rem] text-[#005035] font-bold truncate">
                            {spec.email}
                          </p>
                        </div>
                      </div>

                      {onSimulateTeacherProfile && (
                        <button
                          type="button"
                          onClick={() => onSimulateTeacherProfile(spec)}
                          className="px-2.5 py-1 rounded-xl bg-white hover:bg-[#003440] text-[#003440] hover:text-white border border-black/[0.08] font-extrabold text-[0.7rem] shrink-0 cursor-pointer transition-colors"
                        >
                          Simular
                        </button>
                      )}
                    </div>

                    <div className="pt-2 border-t border-black/[0.05]">
                      <span className="text-[0.66rem] font-extrabold uppercase text-[#5a676b] block mb-1">
                        {specClasses.length} Turmas Vinculadas:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {specClasses.map((c) => (
                          <span
                            key={c.id}
                            className="px-2 py-0.5 rounded-md bg-white border border-black/[0.08] font-mono font-bold text-[0.68rem] text-[#003440]"
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
          SUB-ABA 2: GERENCIAMENTO DE CONTAS E PERMISSÕES (@educacao.jundiai.sp.gov.br)
          ===================================================================== */}
      {activeSubTab === 'contas_acesso' && (
        <div className="space-y-5">
          {/* Formulário Prático para Cadastrar Novo E-mail */}
          {canManage && (
            <section className="card-welcoming bg-white rounded-3xl p-5 border border-black/[0.06] space-y-3.5">
              <div className="flex items-center gap-2 text-[#003440]">
                <span className="material-symbols-outlined text-[22px] text-[#005035]">
                  person_add
                </span>
                <h2 className="text-[1.08rem] font-extrabold">
                  Adicionar Novo E-mail Institucional ({INSTITUTIONAL_EMAIL_DOMAIN})
                </h2>
              </div>

              <form
                onSubmit={handleAddUser}
                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 items-end"
              >
                <div className="xl:col-span-4 space-y-1">
                  <label className="block text-[0.74rem] font-extrabold text-[#003440] uppercase">
                    1. E-mail Institucional
                  </label>
                  <div className="flex items-center rounded-xl border border-black/[0.12] bg-[#f8faf9] focus-within:bg-white focus-within:border-[#003440] overflow-hidden">
                    <input
                      type="text"
                      required
                      value={emailPrefix}
                      onChange={(e) => setEmailPrefix(e.target.value)}
                      placeholder="nome.sobrenome"
                      className="w-full min-h-[42px] px-3 bg-transparent text-[#191c1b] font-bold text-[0.84rem] focus:outline-none"
                    />
                    {!emailPrefix.includes('@') && (
                      <span className="px-2.5 py-2 bg-[#e7ecea] text-[#003440] font-mono font-bold text-[0.7rem] shrink-0">
                        {INSTITUTIONAL_EMAIL_DOMAIN}
                      </span>
                    )}
                  </div>
                </div>

                <div className="xl:col-span-3 space-y-1">
                  <label className="block text-[0.74rem] font-extrabold text-[#003440] uppercase">
                    2. Nome Completo do(a) Educador(a)
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Maria Aparecida da Silva"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-black/[0.12] bg-[#f8faf9] focus:bg-white text-[#191c1b] font-semibold text-[0.84rem] focus:outline-none focus:border-[#003440]"
                  />
                </div>

                <div className="xl:col-span-2 space-y-1">
                  <label className="block text-[0.74rem] font-extrabold text-[#003440] uppercase">
                    3. Perfil de Acesso
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-black/[0.12] bg-[#f8faf9] text-[#003440] font-extrabold text-[0.82rem] focus:outline-none"
                  >
                    <option value="usuario">PEB I (Regente · Sua Turma)</option>
                    <option value="peb2">PEB II (Especialista · Leitura)</option>
                    <option value="admin">ADMIN (Gestão · 39 Turmas)</option>
                  </select>
                </div>

                <div className="xl:col-span-2 space-y-1">
                  <label className="block text-[0.74rem] font-extrabold text-[#003440] uppercase">
                    4. Turma Vinculada
                  </label>
                  {role === 'usuario' ? (
                    <select
                      value={assignedClassId}
                      onChange={(e) => setAssignedClassId(e.target.value)}
                      className="w-full min-h-[42px] px-2.5 rounded-xl border border-[#005035] bg-[#eaf6ef]/60 text-[#005035] font-extrabold text-[0.8rem] focus:outline-none"
                    >
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.turmaAbrev || cls.name} — {cls.name} ({cls.shift.replace('Turno ', '')})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="min-h-[42px] px-3 rounded-xl border border-black/[0.08] bg-[#f2f4f3] text-[#436370] font-bold text-[0.76rem] flex items-center">
                      {role === 'admin' ? 'Todas as 39 Turmas' : 'Turmas de Especialista'}
                    </div>
                  )}
                </div>

                <div className="xl:col-span-1">
                  <button
                    type="submit"
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#005035] hover:bg-[#003d28] text-white font-extrabold text-[0.82rem] flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    <span>Salvar</span>
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* Lista Unificada de Contas Cadastradas */}
          <section className="card-welcoming bg-white rounded-3xl p-5 border border-black/[0.06] space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: `Todos (${authorizedUsers.length})` },
                    {
                      id: 'usuario',
                      label: `PEB I Regentes (${authorizedUsers.filter((u) => u.role === 'usuario').length})`,
                    },
                    {
                      id: 'peb2',
                      label: `PEB II Especialistas (${authorizedUsers.filter((u) => u.role === 'peb2').length})`,
                    },
                    {
                      id: 'admin',
                      label: `Gestão / Admin (${authorizedUsers.filter((u) => u.role === 'admin').length})`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setRoleFilter(tab.id)}
                    className={`min-h-[36px] px-3 rounded-xl text-[0.76rem] font-extrabold cursor-pointer transition-all ${
                      roleFilter === tab.id
                        ? 'bg-[#003440] text-white'
                        : 'bg-[#f2f4f3] text-[#436370] hover:bg-[#e4e8e6]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setOnlyAccessedFilter(!onlyAccessedFilter)}
                  className={`min-h-[36px] px-3 rounded-xl text-[0.76rem] font-extrabold cursor-pointer transition-all ${
                    onlyAccessedFilter
                      ? 'bg-[#005035] text-white'
                      : 'bg-[#eaf6ef] text-[#005035]'
                  }`}
                >
                  ✓ Já Acessaram ({totalUsersWhoAccessed})
                </button>
              </div>

              <div className="relative w-full lg:w-80">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#8e8e93] text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por e-mail, nome ou turma..."
                  className="w-full min-h-[40px] pl-9 pr-3 rounded-xl bg-[#f5f7f6] border border-black/[0.08] text-[0.82rem] font-semibold focus:outline-none focus:bg-white"
                />
              </div>
            </div>

            <div className="border border-black/[0.08] rounded-2xl overflow-x-auto">
              <table className="w-full text-left text-[0.78rem] border-collapse min-w-[1100px]">
                <thead className="bg-[#003440] text-white font-extrabold uppercase text-[0.68rem]">
                  <tr>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">E-mail Institucional</th>
                    <th className="py-3 px-3">Educador(a) / Disciplina</th>
                    <th className="py-3 px-3">Perfil de Permissão</th>
                    <th className="py-3 px-3">Turma(s) Vinculada(s)</th>
                    <th className="py-3 px-2.5 text-center">Acessos</th>
                    <th className="py-3 px-3">Tempo de Uso</th>
                    <th className="py-3 px-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06]">
                  {filteredUsers.map((u) => {
                    const effectiveRole = draftEdits[u.id]?.role || u.role;
                    const effectiveClassId =
                      draftEdits[u.id]?.assignedClassId || u.assignedClassId;
                    const effectiveClassName =
                      draftEdits[u.id]?.assignedClassName || u.assignedClassName;
                    const wasRecentlySaved = Boolean(recentlySavedUserIds[u.id]);

                    return (
                      <tr
                        key={u.id}
                        className={`hover:bg-[#f6f9f8] transition-colors ${
                          !u.active ? 'opacity-60 bg-[#fff8f7]' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            disabled={!canManage}
                            onClick={() => handleToggleActive(u.id)}
                            className={`px-2.5 py-1 rounded-full text-[0.68rem] font-extrabold uppercase cursor-pointer ${
                              u.active
                                ? 'bg-[#eaf6ef] text-[#005035]'
                                : 'bg-[#ffdad6] text-[#ba1a1a]'
                            }`}
                          >
                            {u.active ? 'Liberado' : 'Bloqueado'}
                          </button>
                        </td>

                        <td className="py-2.5 px-3 font-mono font-bold text-[#003440]">
                          {u.email}
                        </td>

                        <td className="py-2.5 px-3">
                          <span className="font-extrabold text-[#1c1c1e] block">
                            {u.name}
                          </span>
                          {u.subjectName && (
                            <span className="text-[0.66rem] font-bold text-[#b45309]">
                              Especialista: {u.subjectName}
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3">
                          {canManage ? (
                            <select
                              value={effectiveRole}
                              onChange={(e) =>
                                handleChangeUserRole(u.id, e.target.value as UserRole)
                              }
                              className="px-2.5 py-1 rounded-xl border border-black/[0.12] bg-white font-extrabold text-[0.74rem] text-[#003440] cursor-pointer"
                            >
                              <option value="usuario">PEB I (Regente)</option>
                              <option value="peb2">PEB II (Especialista)</option>
                              <option value="admin">ADMIN (Pleno)</option>
                            </select>
                          ) : (
                            <span className="font-bold">{effectiveRole.toUpperCase()}</span>
                          )}
                        </td>

                        <td className="py-2.5 px-3">
                          {effectiveRole === 'usuario' && canManage ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <select
                                  value={
                                    effectiveClassId === 'all'
                                      ? classes[0]?.id || 'g04a'
                                      : effectiveClassId
                                  }
                                  onChange={(e) =>
                                    handleChangeUserClass(u.id, e.target.value)
                                  }
                                  className="px-2.5 py-1 rounded-xl border border-[#005035]/40 bg-[#eaf6ef]/70 text-[#005035] font-extrabold text-[0.74rem] cursor-pointer"
                                >
                                  {classes.map((cls) => (
                                    <option key={cls.id} value={cls.id}>
                                      {cls.turmaAbrev || cls.name} — {cls.name} (
                                      {cls.shift.replace('Turno ', '')})
                                    </option>
                                  ))}
                                </select>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setAddingSecondClassForUserId(
                                      addingSecondClassForUserId === u.id ? null : u.id
                                    )
                                  }
                                  className="px-2 py-1 rounded-lg bg-[#f2f4f3] hover:bg-[#003440] text-[#003440] hover:text-white font-bold text-[0.68rem] cursor-pointer"
                                >
                                  + 2ª Turma
                                </button>

                                {wasRecentlySaved && (
                                  <span className="text-[0.68rem] font-extrabold text-[#005035]">
                                    ✓ Salvo
                                  </span>
                                )}
                              </div>

                              {getUserEffectiveClassIds(u).length > 1 && (
                                <div className="flex flex-wrap gap-1">
                                  {getUserEffectiveClassIds(u).map((cid) => {
                                    const cObj = classes.find((c) => c.id === cid);
                                    if (!cObj) return null;
                                    return (
                                      <span
                                        key={cid}
                                        className="px-2 py-0.5 rounded bg-[#eaf6ef] text-[#005035] font-bold text-[0.66rem] inline-flex items-center gap-1"
                                      >
                                        <span>{cObj.turmaAbrev || cObj.name}</span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleRemoveClassFromUser(u.id, cid)
                                          }
                                          className="hover:text-[#ba1a1a] font-black cursor-pointer"
                                        >
                                          ×
                                        </button>
                                      </span>
                                    );
                                  })}
                                </div>
                              )}

                              {addingSecondClassForUserId === u.id && (
                                <select
                                  defaultValue=""
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      handleAddExtraClassToUser(u.id, e.target.value);
                                    }
                                  }}
                                  className="px-2 py-1 rounded-lg bg-white border border-[#005035] text-[0.72rem] font-bold"
                                >
                                  <option value="" disabled>
                                    Escolher 2ª turma...
                                  </option>
                                  {classes
                                    .filter(
                                      (c) => !getUserEffectiveClassIds(u).includes(c.id)
                                    )
                                    .map((c) => (
                                      <option key={c.id} value={c.id}>
                                        + {c.turmaAbrev || c.name} — {c.name}
                                      </option>
                                    ))}
                                </select>
                              )}
                            </div>
                          ) : (
                            <span className="font-semibold text-[#374346] text-[0.74rem]">
                              {effectiveClassName}
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-2.5 text-center font-mono font-black">
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[0.72rem] ${
                              (u.totalAccessCount || 0) > 0
                                ? 'bg-[#eaf6ef] text-[#005035]'
                                : 'bg-[#f2f4f3] text-[#8e8e93]'
                            }`}
                          >
                            {u.totalAccessCount || 0}x
                          </span>
                        </td>

                        <td className="py-2.5 px-3 font-mono text-[0.72rem]">
                          <span className="font-bold text-[#005035] block">
                            {formatDurationHuman(u.totalDurationSeconds)}
                          </span>
                          {u.lastLoginAt && (
                            <span className="text-[0.65rem] text-[#5a676b] block">
                              {u.lastLoginAt}
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {onSimulateTeacherProfile && (
                              <button
                                type="button"
                                onClick={() => onSimulateTeacherProfile(u)}
                                className="px-2.5 py-1 rounded-lg bg-[#eaf6ef] hover:bg-[#005035] text-[#005035] hover:text-white font-extrabold text-[0.7rem] cursor-pointer transition-colors"
                              >
                                Abrir Visão
                              </button>
                            )}
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => handleRemoveUser(u)}
                                className="px-2 py-1 rounded-lg bg-[#ffdad6]/60 hover:bg-[#ba1a1a] text-[#ba1a1a] hover:text-white font-bold text-[0.7rem] cursor-pointer transition-colors"
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
          </section>
        </div>
      )}

      {/* =====================================================================
          SUB-ABA 3: MONITORAMENTO EM TEMPO REAL DE TEMPO DE TELA E SESSÕES
          ===================================================================== */}
      {activeSubTab === 'monitoramento' && (
        <section className="card-welcoming bg-white rounded-3xl p-5 border border-black/[0.06] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[0.68rem] font-extrabold uppercase tracking-wider text-[#005035] block">
                Auditoria Real-Time (Heartbeat a cada 5 segundos)
              </span>
              <h2 className="text-[1.15rem] font-extrabold text-[#003440]">
                Histórico de Sessões, Horário de Entrada/Saída e Tempo de Permanência
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={logSearchTerm}
                onChange={(e) => setLogSearchTerm(e.target.value)}
                placeholder="Filtrar sessão por e-mail ou turma..."
                className="min-h-[38px] px-3 rounded-xl bg-[#f5f7f6] border border-black/[0.08] text-[0.78rem] font-semibold"
              />
              {canManage && onClearAccessLogs && accessSessionLogs.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAccessLogs}
                  className="min-h-[38px] px-3 rounded-xl bg-[#fff8f7] hover:bg-[#ffdad6] text-[#ba1a1a] font-bold text-[0.74rem] border border-[#ba1a1a]/20 cursor-pointer"
                >
                  Limpar Logs
                </button>
              )}
            </div>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#f8faf9] text-center text-[#5a676b] font-semibold text-[0.86rem]">
              Nenhuma sessão registrada para o filtro informado. Assim que os educadores entram no aplicativo, o tempo de tela é contabilizado automaticamente.
            </div>
          ) : (
            <div className="border border-black/[0.08] rounded-2xl overflow-x-auto max-h-[520px]">
              <table className="w-full text-left text-[0.76rem] border-collapse min-w-[960px]">
                <thead className="bg-[#003440] text-white font-extrabold uppercase text-[0.67rem] sticky top-0">
                  <tr>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Educador(a) / E-mail</th>
                    <th className="py-3 px-3">Turma / Perfil</th>
                    <th className="py-3 px-3">Início da Sessão</th>
                    <th className="py-3 px-3">Última Atividade</th>
                    <th className="py-3 px-3">Tela Visitada</th>
                    <th className="py-3 px-3 text-center">Tempo na Sessão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {filteredLogs.map((log) => {
                    const isOnline =
                      !log.logoutTimeISO &&
                      Date.now() - new Date(log.lastHeartbeatISO).getTime() < 120000;
                    return (
                      <tr key={log.id} className="hover:bg-[#f6f9f8]">
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[0.66rem] font-extrabold uppercase ${
                              isOnline
                                ? 'bg-[#eaf6ef] text-[#005035]'
                                : 'bg-[#f2f4f3] text-[#5a676b]'
                            }`}
                          >
                            {isOnline ? '● Online' : 'Finalizada'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-extrabold text-[#003440] block">
                            {log.name}
                          </span>
                          <span className="font-mono text-[0.68rem] text-[#005035]">
                            {log.email}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#374346]">
                          {log.assignedClassName}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[0.72rem]">
                          {new Date(log.loginTimeISO).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[0.72rem]">
                          {new Date(log.lastHeartbeatISO).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-[#005035]">
                          {log.lastScreen || '1. Turmas'}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-black text-[#003440]">
                          {formatDurationHuman(log.durationSeconds)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
