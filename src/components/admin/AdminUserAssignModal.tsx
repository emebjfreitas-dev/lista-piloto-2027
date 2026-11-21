import React from 'react';
import {
  CalendarClock,
  Check,
  Eye,
  HeartHandshake,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { AuthorizedUser, ClassGroup } from '../../types';
import {
  formatAccessExpirationDateBR,
  isOfficialSchoolAdminEmail,
  isUserAccessEffectivelyActive,
  isUserAccessExpired,
} from '../../services/db';
import { ModalPortal } from '../ui/ModalPortal';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';

export type AccessLevelKey = 'admin' | 'usuario' | 'peb2' | 'aee';

const LEVEL_META: Record<
  AccessLevelKey,
  {
    badgeLabel: string;
    badgeClass: string;
    activeSegmentClass: string;
  }
> = {
  admin: {
    badgeLabel: 'ADMIN',
    badgeClass: 'bg-[#111827] text-white',
    activeSegmentClass: 'bg-[#111827] text-white shadow-xs',
  },
  usuario: {
    badgeLabel: 'PEB I (Usuário)',
    badgeClass: 'bg-[#eaf6ef] text-[#005035]',
    activeSegmentClass: 'bg-[#047857] text-white shadow-xs',
  },
  peb2: {
    badgeLabel: 'PEB II (Visualização)',
    badgeClass: 'bg-[#e8f0fe] text-[#1a4fa3]',
    activeSegmentClass: 'bg-[#1a4fa3] text-white shadow-xs',
  },
  aee: {
    badgeLabel: 'AEE',
    badgeClass: 'bg-[#fef3c7] text-[#92400e]',
    activeSegmentClass: 'bg-[#b45309] text-white shadow-xs',
  },
};

const renderLevelIcon = (level: AccessLevelKey, className = 'w-3 h-3 shrink-0') => {
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

interface AdminUserAssignModalProps {
  user: AuthorizedUser | null;
  classes: ClassGroup[];
  canManage: boolean;
  searchQuery: string;
  onChangeSearchQuery: (val: string) => void;
  resolveAccessLevel: (u: AuthorizedUser) => AccessLevelKey;
  getUserEffectiveClassIds: (u: AuthorizedUser) => string[];
  onToggleActive: (userId: string) => void;
  onUpdateExpiration: (userId: string, nextDate: string) => void;
  onSetFunctionPreset: (
    userId: string,
    preset: 'admin' | 'regente' | 'especialista' | 'aee' | 'apoio'
  ) => void;
  onToggleExtraClass: (userId: string, classId: string) => void;
  onClose: () => void;
}

export const AdminUserAssignModal: React.FC<AdminUserAssignModalProps> = ({
  user,
  classes,
  canManage,
  searchQuery,
  onChangeSearchQuery,
  resolveAccessLevel,
  getUserEffectiveClassIds,
  onToggleActive,
  onUpdateExpiration,
  onSetFunctionPreset,
  onToggleExtraClass,
  onClose,
}) => {
  useModalScrollLock(Boolean(user));

  if (!user) return null;

  const currentLevel = resolveAccessLevel(user);
  const isExpired = isUserAccessExpired(user);
  const isEffectivelyActive = isUserAccessEffectivelyActive(user);

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[110] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-5 overflow-hidden animate-backdrop-in"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="modal-shell animate-apple-pop bg-white rounded-3xl w-full max-w-lg max-h-[86dvh] flex flex-col overflow-hidden shadow-2xl min-w-0"
        >
        <div className="modal-header-surface p-4 sm:p-5 bg-[#f4f7fb] flex items-start justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-950 break-words leading-snug">
              {user.name}
            </h2>
            <p className="text-xs text-emerald-800 font-medium break-all">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white text-slate-700 hover:text-slate-950 flex items-center justify-center shrink-0 cursor-pointer transition-all duration-150 active:scale-[0.95]"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 flex-1 min-h-0 modal-scroll-body space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl surface-secondary bg-[#f2f2f7]">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                  LEVEL_META[currentLevel].badgeClass
                }`}
              >
                {renderLevelIcon(currentLevel)}
                <span>{LEVEL_META[currentLevel].badgeLabel}</span>
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isEffectivelyActive}
              aria-label={`Alternar acesso de ${user.name}`}
              disabled={!canManage}
              onClick={() => onToggleActive(user.id)}
              className={`inline-flex items-center gap-2 text-left transition-opacity duration-100 ${
                !canManage ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <span
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 ${
                  isEffectivelyActive ? 'bg-[#047857]' : 'bg-[#d1d5db]'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transform transition-transform duration-150 ${
                    isEffectivelyActive ? 'translate-x-5.5' : 'translate-x-0.5'
                  }`}
                />
              </span>
              <span
                className={`text-xs font-semibold whitespace-nowrap ${
                  isEffectivelyActive ? 'text-[#005035]' : 'text-[#991b1b]'
                }`}
              >
                {isEffectivelyActive ? 'Acesso Liberado' : isExpired ? 'Expirado' : 'Bloqueado'}
              </span>
            </button>
          </div>

          {/* Validade / Expiração Automática */}
          <div className="p-3.5 rounded-2xl surface-secondary bg-[#f2f2f7] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5 text-slate-700" />
                <span>Validade do Acesso (Temporários / Substitutos)</span>
              </span>
              {user.accessExpiresAt && (
                <span
                  className={`px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${
                    isExpired ? 'bg-rose-100 text-rose-950' : 'bg-amber-100 text-amber-950'
                  }`}
                >
                  {isExpired
                    ? `Expirado (${formatAccessExpirationDateBR(user.accessExpiresAt)})`
                    : `Até ${formatAccessExpirationDateBR(user.accessExpiresAt)}`}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={user.accessExpiresAt || ''}
                disabled={!canManage}
                onChange={(e) => onUpdateExpiration(user.id, e.target.value)}
                className="min-h-[38px] px-3 rounded-xl bg-white text-xs font-medium text-slate-950 tabular-nums"
              />
              {canManage && user.accessExpiresAt && (
                <button
                  type="button"
                  onClick={() => onUpdateExpiration(user.id, '')}
                  className="min-h-[38px] px-3 rounded-xl bg-white hover:bg-[#dce7fb] text-xs font-semibold text-slate-950 cursor-pointer transition-all duration-150 active:scale-[0.97]"
                >
                  Tornar Permanente
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-700">
              O usuário mantém acesso até o fim da data selecionada; após essa data, o sistema
              revoga o acesso automaticamente.
            </p>
          </div>

          {/* Presets de Função */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-[#374151] block">
              Nível de Permissão e Função Institucional
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'admin', label: 'ADMIN (Acesso Pleno)', lvl: 'admin' as AccessLevelKey },
                  { id: 'regente', label: 'PEB I (Usuário)', lvl: 'usuario' as AccessLevelKey },
                  { id: 'especialista', label: 'PEB II (Visualização)', lvl: 'peb2' as AccessLevelKey },
                  { id: 'aee', label: 'AEE (Educação Especial)', lvl: 'aee' as AccessLevelKey },
                  { id: 'apoio', label: 'Apoio Pedagógico (Leitura)', lvl: 'peb2' as AccessLevelKey },
                ] as const
              ).map((preset) => {
                const isSchoolAdmin = isOfficialSchoolAdminEmail(user.email);
                const isLockedAdmin = preset.id === 'admin' && !isSchoolAdmin;
                const isLockedSchoolAdmin = isSchoolAdmin && preset.id !== 'admin';
                const isDisabled = !canManage || isLockedAdmin || isLockedSchoolAdmin;
                const isCurrent =
                  (preset.id === 'admin' && currentLevel === 'admin') ||
                  (preset.id === 'regente' && currentLevel === 'usuario') ||
                  (preset.id === 'aee' && user.teacherRoleType === 'aee') ||
                  (preset.id === 'apoio' && user.teacherRoleType === 'apoio') ||
                  (preset.id === 'especialista' &&
                    currentLevel === 'peb2' &&
                    user.teacherRoleType !== 'apoio');

                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={isDisabled}
                    title={
                      isLockedAdmin
                        ? 'Perfil Administrador é exclusivo de emebjfreitas@jundiai.sp.gov.br'
                        : isLockedSchoolAdmin
                        ? 'A conta da escola é o Administrador titular'
                        : undefined
                    }
                    onClick={() => onSetFunctionPreset(user.id, preset.id)}
                    className={`min-w-0 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold text-left inline-flex items-center gap-1.5 transition-all duration-150 whitespace-normal ${
                      isCurrent
                        ? LEVEL_META[preset.lvl].activeSegmentClass
                        : isLockedAdmin || isLockedSchoolAdmin
                        ? 'bg-[#edf2f7] text-slate-600 opacity-50 cursor-not-allowed'
                        : 'bg-[#f4f7fb] hover:bg-[#dce7fb] text-slate-950 cursor-pointer active:scale-[0.97]'
                    }`}
                  >
                    {renderLevelIcon(preset.lvl)}
                    <span className="break-words leading-snug text-left">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seleção de Turmas */}
          {user.role === 'usuario' ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  Turma(s) Atribuída(s) ({getUserEffectiveClassIds(user).length})
                </span>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-700 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onChangeSearchQuery(e.target.value)}
                  placeholder="Filtrar turma (ex: G4A, 1º ANO)..."
                  className="w-full min-h-[38px] pl-9 pr-3 rounded-xl bg-[#f4f7fb] focus:bg-white text-xs text-slate-950 placeholder:text-slate-600 transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1">
                {classes
                  .filter((c) => {
                    const q = searchQuery.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      c.name.toLowerCase().includes(q) ||
                      (c.turmaAbrev || '').toLowerCase().includes(q)
                    );
                  })
                  .map((cls) => {
                    const selectedIds = getUserEffectiveClassIds(user);
                    const isAssigned = selectedIds.includes(cls.id);
                    return (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => onToggleExtraClass(user.id, cls.id)}
                        className={`min-w-0 min-h-[40px] px-3 py-2 rounded-xl text-left text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors duration-100 whitespace-normal ${
                          isAssigned
                            ? 'bg-[#eaf6ef] text-[#005035] font-semibold'
                            : 'bg-[#f2f2f7] hover:bg-[#e5e5ea] text-[#111827] font-medium'
                        }`}
                      >
                        <span className="break-words leading-snug text-left min-w-0 flex-1">
                          {cls.turmaAbrev || cls.name} · {cls.name} (
                          {cls.shift.replace('Turno ', '')})
                        </span>
                        {isAssigned && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-[#f2f2f7] text-xs text-[#374151]">
              {user.role === 'admin'
                ? `Perfil Administrador possui acesso pleno a todas as ${classes.length} turmas e módulos de gestão.`
                : `Perfil ${
                    user.teacherRoleType === 'aee'
                      ? 'Educação Especial (AEE)'
                      : 'PEB II / Especialista'
                  } visualiza turmas e estudantes sem acesso às telas exclusivas de Administração (Diagnóstico BD e Importação .HTM).`}
            </div>
          )}
        </div>

        <div className="p-4 bg-[#f2f2f7] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-5 rounded-xl bg-[#111827] text-white text-xs font-semibold cursor-pointer"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};
