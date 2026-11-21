import React from 'react';
import { UserAccessSessionLog } from '../../types';
import { formatDurationHuman } from '../../services/db';
import { AdminPaginationBar } from './AdminPaginationBar';

interface AdminSessionLogsSectionProps {
  totalLogsCount: number;
  filteredLogs: UserAccessSessionLog[];
  pagedLogs: UserAccessSessionLog[];
  currentPage: number;
  pageSize: number;
  searchTerm: string;
  canManage: boolean;
  hasClearAction: boolean;
  onChangeSearchTerm: (val: string) => void;
  onPageChange: (page: number) => void;
  onClearLogs?: () => void;
}

export const AdminSessionLogsSection: React.FC<AdminSessionLogsSectionProps> = ({
  totalLogsCount,
  filteredLogs,
  pagedLogs,
  currentPage,
  pageSize,
  searchTerm,
  canManage,
  hasClearAction,
  onChangeSearchTerm,
  onPageChange,
  onClearLogs,
}) => {
  return (
    <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-[0_6px_22px_-8px_rgba(9,15,29,0.08)] space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-950">
            Sessões e Tempo de Tela ({totalLogsCount})
          </h2>
          <p className="text-xs text-slate-700">
            Histórico de entradas, telas visitadas e permanência em tempo real
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onChangeSearchTerm(e.target.value)}
            placeholder="Filtrar por e-mail ou turma..."
            className="min-h-[40px] px-3.5 rounded-xl bg-[#f3f6fb] text-xs text-slate-950 placeholder:text-slate-600 focus:bg-white transition-colors"
          />
          {canManage && hasClearAction && onClearLogs && totalLogsCount > 0 && (
            <button
              type="button"
              onClick={onClearLogs}
              className="min-h-[40px] px-3.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-950 font-semibold text-xs cursor-pointer transition-all duration-150 active:scale-[0.97]"
            >
              Limpar Logs
            </button>
          )}
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[#f3f6fb] text-center text-xs text-slate-700 font-medium">
          Nenhuma sessão registrada para o filtro informado.
        </div>
      ) : (
        <>
          {/* Cards Mobile Sessões */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 lg:hidden">
            {pagedLogs.map((log) => {
              const isOnline =
                !log.logoutTimeISO &&
                Date.now() - new Date(log.lastHeartbeatISO).getTime() < 120000;
              return (
                <div key={log.id} className="p-3.5 rounded-2xl bg-[#f3f6fb] space-y-2 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 ${
                        isOnline
                          ? 'bg-emerald-100 text-emerald-950'
                          : 'bg-white text-slate-800'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isOnline ? 'bg-emerald-700' : 'bg-slate-600'
                        }`}
                      />
                      <span>{isOnline ? 'Online' : 'Finalizada'}</span>
                    </span>
                    <span className="text-xs font-semibold text-slate-950 tabular-nums">
                      {formatDurationHuman(log.durationSeconds)}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-950 break-words">
                      {log.name}
                    </p>
                    <p className="text-xs text-emerald-800 font-medium break-all">{log.email}</p>
                    <p className="text-xs text-slate-700 mt-0.5 break-words">
                      {log.assignedClassName}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 tabular-nums pt-1">
                    <span>Início: {new Date(log.loginTimeISO).toLocaleString('pt-BR')}</span>
                    <span className="font-semibold text-slate-950">
                      {log.lastScreen || '1. Turmas'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabela Desktop Sessões */}
          <div className="hidden lg:block overflow-x-auto max-h-[520px] rounded-2xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#eef3f9] text-slate-800 font-semibold text-xs sticky top-0">
                <tr>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Educador(a) e E-mail</th>
                  <th className="py-3 px-3">Turma / Perfil</th>
                  <th className="py-3 px-3">Início</th>
                  <th className="py-3 px-3">Última Atividade</th>
                  <th className="py-3 px-3">Tela Visitada</th>
                  <th className="py-3 px-3 text-center">Permanência</th>
                </tr>
              </thead>
              <tbody>
                {pagedLogs.map((log) => {
                  const isOnline =
                    !log.logoutTimeISO &&
                    Date.now() - new Date(log.lastHeartbeatISO).getTime() < 120000;
                  return (
                    <tr key={log.id} className="odd:bg-[#f3f6fb] even:bg-white hover:bg-[#e8f0fe]/40 transition-colors">
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 ${
                            isOnline
                              ? 'bg-emerald-100 text-emerald-950'
                              : 'bg-[#eef3f9] text-slate-800'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isOnline ? 'bg-emerald-700' : 'bg-slate-600'
                            }`}
                          />
                          <span>{isOnline ? 'Online' : 'Finalizada'}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-950 block break-words">
                          {log.name}
                        </span>
                        <span className="text-xs text-emerald-800 font-medium break-all">{log.email}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 break-words">
                        {log.assignedClassName}
                      </td>
                      <td className="py-2.5 px-3 tabular-nums text-xs text-slate-700">
                        {new Date(log.loginTimeISO).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2.5 px-3 tabular-nums text-xs text-slate-700">
                        {new Date(log.lastHeartbeatISO).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-950">
                        {log.lastScreen || '1. Turmas'}
                      </td>
                      <td className="py-2.5 px-3 text-center font-semibold text-slate-950 tabular-nums">
                        {formatDurationHuman(log.durationSeconds)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <AdminPaginationBar
            currentPage={currentPage}
            totalItems={filteredLogs.length}
            pageSize={pageSize}
            itemLabel="sessões"
            onPageChange={onPageChange}
          />
        </>
      )}
    </section>
  );
};
