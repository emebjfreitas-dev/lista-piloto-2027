import React, { useState, useMemo } from 'react';
import { NoticePriority, SchoolNotice, UserRole } from '../types';

interface QuadroAvisosCardProps {
  notices: SchoolNotice[];
  userRole?: UserRole;
  userEmail?: string;
  userName?: string;
  variant?: 'login' | 'dashboard';
  onSaveNotices?: (updatedNotices: SchoolNotice[]) => void;
}

const READ_NOTICES_STORAGE_KEY = 'emeb_candelario_read_notices_2027_v1';

const getReadMap = (email: string): Record<string, boolean> => {
  try {
    const raw = localStorage.getItem(`${READ_NOTICES_STORAGE_KEY}_${email.toLowerCase()}`);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
};

const saveReadMap = (email: string, map: Record<string, boolean>) => {
  try {
    localStorage.setItem(
      `${READ_NOTICES_STORAGE_KEY}_${email.toLowerCase()}`,
      JSON.stringify(map)
    );
  } catch {
    // ignore
  }
};

export const QuadroAvisosCard: React.FC<QuadroAvisosCardProps> = ({
  notices,
  userRole = 'usuario',
  userEmail = 'educador@educacao.jundiai.sp.gov.br',
  userName = 'Direção & Secretaria Escolar',
  variant = 'dashboard',
  onSaveNotices,
}) => {
  const isAdmin = userRole === 'admin' && variant === 'dashboard' && Boolean(onSaveNotices);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<NoticePriority>('importante');
  const [targetAudience, setTargetAudience] = useState<'all' | 'peb1' | 'peb2'>('all');
  const [pinned, setPinned] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [readMap, setReadMap] = useState<Record<string, boolean>>(() =>
    getReadMap(userEmail)
  );

  const visibleNotices = useMemo(() => {
    return notices
      .filter((n) => {
        if (!n.active) return false;
        if (variant === 'login' || userRole === 'admin') return true;
        if (n.targetAudience === 'peb1' && userRole !== 'usuario') return false;
        if (n.targetAudience === 'peb2' && userRole !== 'peb2') return false;
        return true;
      })
      .sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) {
          return a.pinned ? -1 : 1;
        }
        const prioWeight: Record<NoticePriority, number> = {
          urgente: 3,
          importante: 2,
          informativo: 1,
        };
        if (prioWeight[a.priority] !== prioWeight[b.priority]) {
          return prioWeight[b.priority] - prioWeight[a.priority];
        }
        return (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
      });
  }, [notices, variant, userRole]);

  const unreadCount = useMemo(() => {
    return visibleNotices.filter((n) => !readMap[n.id]).length;
  }, [visibleNotices, readMap]);

  const handleMarkRead = (id: string) => {
    const next = { ...readMap, [id]: true };
    setReadMap(next);
    saveReadMap(userEmail, next);
  };

  const handleMarkAllRead = () => {
    const next = { ...readMap };
    visibleNotices.forEach((n) => {
      next[n.id] = true;
    });
    setReadMap(next);
    saveReadMap(userEmail, next);
  };

  const handleOpenNewNotice = () => {
    setEditingNoticeId(null);
    setTitle('');
    setContent('');
    setPriority('importante');
    setTargetAudience('all');
    setPinned(true);
    setIsComposerOpen(true);
  };

  const handleStartEdit = (notice: SchoolNotice) => {
    setEditingNoticeId(notice.id);
    setTitle(notice.title);
    setContent(notice.content);
    setPriority(notice.priority);
    setTargetAudience(notice.targetAudience || 'all');
    setPinned(Boolean(notice.pinned));
    setIsComposerOpen(true);
  };

  const handlePublishOrUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveNotices) return;
    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (!cleanTitle || !cleanContent) return;

    const nowMs = Date.now();
    const nowISO = new Date(nowMs).toISOString();

    if (editingNoticeId) {
      const updated = notices.map((n) =>
        n.id === editingNoticeId
          ? {
              ...n,
              title: cleanTitle,
              content: cleanContent,
              priority,
              targetAudience,
              pinned,
              updatedAtMs: nowMs,
            }
          : n
      );
      onSaveNotices(updated);
    } else {
      const newNotice: SchoolNotice = {
        id: `notice-${nowMs}-${Math.random().toString(36).slice(2, 6)}`,
        title: cleanTitle,
        content: cleanContent,
        priority,
        authorName: userName || 'Direção & Secretaria Escolar',
        authorEmail: userEmail,
        createdAtISO: nowISO,
        updatedAtMs: nowMs,
        pinned,
        active: true,
        targetAudience,
      };
      onSaveNotices([newNotice, ...notices]);
    }

    setIsComposerOpen(false);
    setEditingNoticeId(null);
    setTitle('');
    setContent('');
  };

  const handleTogglePin = (id: string) => {
    if (!onSaveNotices) return;
    const nowMs = Date.now();
    onSaveNotices(
      notices.map((n) =>
        n.id === id ? { ...n, pinned: !n.pinned, updatedAtMs: nowMs } : n
      )
    );
  };

  const handleDeleteNotice = (id: string) => {
    if (!onSaveNotices) return;
    onSaveNotices(notices.filter((n) => n.id !== id));
  };

  const getPriorityVisuals = (p: NoticePriority) => {
    if (p === 'urgente') {
      return {
        dotColor: 'bg-[#ff3b30]',
        textColor: 'text-[#d70015]',
        bgTint: 'bg-[#fff2f2]/85',
        icon: 'campaign',
        label: 'Urgente',
      };
    }
    if (p === 'importante') {
      return {
        dotColor: 'bg-[#ff9500]',
        textColor: 'text-[#b25000]',
        bgTint: 'bg-[#fff9eb]/90',
        icon: 'notifications_active',
        label: 'Importante',
      };
    }
    return {
      dotColor: 'bg-[#0071e3]',
      textColor: 'text-[#0066cc]',
      bgTint: 'bg-[#f5f5f7]',
      icon: 'info',
      label: 'Informativo',
    };
  };

  const formatNoticeDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  // MODO 1: Exibição Compacta e Elegante na Tela de Login (Aparece para todos os educadores ao entrar)
  if (variant === 'login') {
    if (visibleNotices.length === 0) return null;
    return (
      <section
        aria-label="Quadro de Avisos da Gestão"
        className="w-full text-left space-y-2 pt-1"
      >
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 text-[0.72rem] font-bold text-[#1d1d1f] tracking-tight">
            <span className="material-symbols-outlined text-[16px] text-[#0071e3]">
              campaign
            </span>
            <span>Quadro de Avisos da Gestão</span>
          </div>
          <span className="text-[0.68rem] text-[#86868b] tabular-nums">
            {visibleNotices.length}{' '}
            {visibleNotices.length === 1 ? 'comunicado' : 'comunicados'}
          </span>
        </div>

        <div className="space-y-2 max-h-[185px] overflow-y-auto pr-0.5">
          {visibleNotices.slice(0, 3).map((notice) => {
            const vis = getPriorityVisuals(notice.priority);
            return (
              <article
                key={notice.id}
                className={`p-3 rounded-2xl ${vis.bgTint} transition-all space-y-1`}
              >
                <div className="flex items-center justify-between gap-2 text-[0.66rem] text-[#6e6e73]">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <span className={`w-1.5 h-1.5 rounded-full ${vis.dotColor}`} />
                    <span className={vis.textColor}>{vis.label}</span>
                    {notice.pinned && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#1d1d1f]">Fixado</span>
                      </>
                    )}
                  </div>
                  <span className="tabular-nums">{formatNoticeDate(notice.createdAtISO)}</span>
                </div>

                <h3 className="text-[0.8rem] font-bold text-[#1d1d1f] leading-snug">
                  {notice.title}
                </h3>
                <p className="text-[0.73rem] text-[#6e6e73] leading-relaxed">
                  {notice.content}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  // MODO 2: Painel Completo na Tela de Início (Admin publica/edita/exclui · Educadores leem e confirmam leitura)
  if (visibleNotices.length === 0 && !isAdmin) {
    return null;
  }

  return (
    <section
      aria-label="Quadro Oficial de Avisos e Comunicados"
      className="card-welcoming bg-white rounded-3xl p-4 sm:p-5 space-y-3.5"
    >
      {/* Barra Superior do Quadro de Avisos */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-2xl bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">campaign</span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[0.7rem] text-[#6e6e73]">
              <span className="font-semibold text-[#0066cc]">Comunicados Oficiais</span>
              <span aria-hidden="true">·</span>
              <span>Visível no Login e Painel Inicial</span>
              {unreadCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-[#ff3b30] tabular-nums">
                    {unreadCount} novo(s)
                  </span>
                </>
              )}
            </div>
            <h2 className="text-[1.05rem] sm:text-[1.15rem] font-bold text-[#1d1d1f] tracking-tight leading-tight">
              Quadro de Avisos da Gestão
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="h-8 px-3 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] text-[0.73rem] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[15px] text-[#1d8338]">
                done_all
              </span>
              <span>Marcar como ciente</span>
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={handleOpenNewNotice}
              className="h-8 px-3.5 rounded-full bg-[#0071e3] hover:bg-[#0077ed] text-white text-[0.74rem] font-semibold flex items-center gap-1 cursor-pointer ios-spring-btn shadow-2xs"
            >
              <span className="material-symbols-outlined text-[16px]">add_comment</span>
              <span>Publicar Aviso</span>
            </button>
          )}

          {visibleNotices.length > 0 && (
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="h-8 px-2.5 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#6e6e73] hover:text-[#1d1d1f] text-[0.72rem] font-semibold flex items-center gap-0.5 cursor-pointer transition-colors"
            >
              <span>{isCollapsed ? `Expandir (${visibleNotices.length})` : 'Recolher'}</span>
              <span className="material-symbols-outlined text-[16px]">
                {isCollapsed ? 'expand_more' : 'expand_less'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Editor iOS 18 para a Gestão Publicar / Editar Comunicados */}
      {isAdmin && isComposerOpen && (
        <form
          onSubmit={handlePublishOrUpdate}
          className="p-4 rounded-2xl bg-[#f5f5f7] space-y-3 animate-gentle-fade"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[0.84rem] font-bold text-[#1d1d1f]">
              {editingNoticeId
                ? 'Editar Comunicado Institucional'
                : 'Novo Comunicado para Todos os Educadores'}
            </h3>
            <button
              type="button"
              onClick={() => setIsComposerOpen(false)}
              className="text-[0.74rem] font-semibold text-[#6e6e73] hover:text-[#1d1d1f] cursor-pointer"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-2">
              <label className="block text-[0.7rem] font-semibold text-[#6e6e73] mb-1">
                Título do Comunicado
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Reunião Pedagógica / Fechamento de Frequência Outubro"
                className="w-full h-10 px-3 rounded-xl bg-white text-[#1d1d1f] text-[0.82rem] font-semibold focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30"
              />
            </div>

            <div>
              <label className="block text-[0.7rem] font-semibold text-[#6e6e73] mb-1">
                Nível de Destaque
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as NoticePriority)}
                className="w-full h-10 px-3 rounded-xl bg-white text-[#1d1d1f] text-[0.8rem] font-semibold focus:outline-none"
              >
                <option value="importante">Importante (Âmbar)</option>
                <option value="urgente">Urgente (Vermelho)</option>
                <option value="informativo">Informativo (Azul)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[0.7rem] font-semibold text-[#6e6e73] mb-1">
              Mensagem Detalhada (Exibida no Login e na Tela Inicial)
            </label>
            <textarea
              required
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Escreva a orientação para as professoras regentes (PEB I) e especialistas (PEB II)..."
              className="w-full p-3 rounded-xl bg-white text-[#1d1d1f] text-[0.82rem] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-[0.76rem] font-medium text-[#1d1d1f] cursor-pointer">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  className="rounded text-[#0071e3]"
                />
                <span>Fixar no topo da tela de Login</span>
              </label>

              <select
                value={targetAudience}
                onChange={(e) =>
                  setTargetAudience(e.target.value as 'all' | 'peb1' | 'peb2')
                }
                className="h-8 px-2.5 rounded-lg bg-white text-[#1d1d1f] text-[0.74rem] font-medium"
              >
                <option value="all">Público: Todos os Educadores</option>
                <option value="peb1">Apenas Regentes PEB I</option>
                <option value="peb2">Apenas Especialistas PEB II</option>
              </select>
            </div>

            <button
              type="submit"
              className="h-9 px-4 rounded-full bg-[#1d1d1f] hover:bg-black text-white text-[0.78rem] font-semibold cursor-pointer ios-spring-btn"
            >
              {editingNoticeId ? 'Salvar Alterações' : 'Publicar Agora'}
            </button>
          </div>
        </form>
      )}

      {/* Lista de Comunicados Ativos */}
      {!isCollapsed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {visibleNotices.map((notice) => {
            const vis = getPriorityVisuals(notice.priority);
            const isRead = Boolean(readMap[notice.id]);

            return (
              <article
                key={notice.id}
                className={`p-3.5 sm:p-4 rounded-2xl ${vis.bgTint} flex flex-col justify-between gap-2.5 transition-all`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[0.7rem] text-[#6e6e73]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${vis.dotColor}`} />
                      <span className={`font-bold ${vis.textColor}`}>{vis.label}</span>
                      {notice.pinned && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-[#1d1d1f]">Fixado</span>
                        </>
                      )}
                      {notice.targetAudience && notice.targetAudience !== 'all' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {notice.targetAudience === 'peb1' ? 'PEB I' : 'PEB II'}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{notice.authorName}</span>
                    </div>

                    <span className="tabular-nums shrink-0">
                      {formatNoticeDate(notice.createdAtISO)}
                    </span>
                  </div>

                  <h3 className="text-[0.9rem] font-bold text-[#1d1d1f] leading-snug">
                    {notice.title}
                  </h3>

                  <p className="text-[0.8rem] text-[#1d1d1f]/85 leading-relaxed whitespace-pre-line">
                    {notice.content}
                  </p>
                </div>

                <div className="pt-2 border-t border-black/[0.05] flex items-center justify-between gap-2">
                  {!isRead ? (
                    <button
                      type="button"
                      onClick={() => handleMarkRead(notice.id)}
                      className="text-[0.72rem] font-semibold text-[#0066cc] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        check_circle
                      </span>
                      <span>Confirmar leitura</span>
                    </button>
                  ) : (
                    <span className="text-[0.7rem] text-[#1d8338] font-medium flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">
                        verified
                      </span>
                      <span>Ciente</span>
                    </span>
                  )}

                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleTogglePin(notice.id)}
                        className="text-[0.72rem] font-medium text-[#6e6e73] hover:text-[#1d1d1f] cursor-pointer"
                      >
                        {notice.pinned ? 'Desafixar' : 'Fixar'}
                      </button>
                      <span aria-hidden="true" className="text-[#d2d2d7]">
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(notice)}
                        className="text-[0.72rem] font-medium text-[#0066cc] hover:underline cursor-pointer"
                      >
                        Editar
                      </button>
                      <span aria-hidden="true" className="text-[#d2d2d7]">
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteNotice(notice.id)}
                        className="text-[0.72rem] font-medium text-[#ff3b30] hover:underline cursor-pointer"
                      >
                        Remover
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
