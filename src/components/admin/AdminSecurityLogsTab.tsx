import React from 'react';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { SecurityAuditLogEntry } from '../../types';
import { CustomSelect } from '../CustomSelect';
import { AdminPaginationBar } from './AdminPaginationBar';

interface AdminSecurityLogsTabProps {
  securityLogsTotal: number;
  filteredSecurityLogs: SecurityAuditLogEntry[];
  pagedSecurityLogs: SecurityAuditLogEntry[];
  currentPage: number;
  pageSize: number;
  searchTerm: string;
  severityFilter: 'all' | 'info' | 'warning' | 'security_alert';
  canManage: boolean;
  onChangeSearchTerm: (val: string) => void;
  onChangeSeverityFilter: (val: 'all' | 'info' | 'warning' | 'security_alert') => void;
  onPageChange: (page: number) => void;
  onClearLogs: () => void;
}

export const AdminSecurityLogsTab: React.FC<AdminSecurityLogsTabProps> = ({
  securityLogsTotal,
  filteredSecurityLogs,
  pagedSecurityLogs,
  currentPage,
  pageSize,
  searchTerm,
  severityFilter,
  canManage,
  onChangeSearchTerm,
  onChangeSeverityFilter,
  onPageChange,
  onClearLogs,
}) => {
  return (
    <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-[0_6px_22px_-8px_rgba(9,15,29,0.08)] space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-950">
            Trilha de Auditoria ({securityLogsTotal})
          </h3>
          <p className="text-xs text-slate-700">
            Eventos de acesso, alterações e bloqueios registrados automaticamente
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onChangeSearchTerm(e.target.value)}
            placeholder="Buscar usuário ou ação..."
            className="min-h-[40px] px-3.5 rounded-xl bg-[#f4f7fb] text-xs text-slate-950 placeholder:text-slate-600 focus:bg-white transition-colors"
          />

          <CustomSelect
            value={severityFilter}
            onChange={(val) => onChangeSeverityFilter(val as 'all' | 'info' | 'warning' | 'security_alert')}
            ariaLabel="Filtrar severidade da auditoria"
            className="bg-[#f4f7fb] text-xs font-semibold text-slate-950"
            options={[
              { value: 'all', label: 'Todas severidades' },
              { value: 'info', label: 'Informativo' },
              { value: 'warning', label: 'Avisos' },
              { value: 'security_alert', label: 'Bloqueios' },
            ]}
          />

          {canManage && securityLogsTotal > 0 && (
            <button
              type="button"
              onClick={onClearLogs}
              className="min-h-[40px] px-3 rounded-xl bg-[#edf2f7] hover:bg-rose-100 text-slate-800 hover:text-rose-950 text-xs font-semibold cursor-pointer transition-all duration-150 active:scale-[0.97]"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {filteredSecurityLogs.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[#f4f7fb] text-center text-xs text-slate-700 font-medium">
          Nenhum evento registrado para o filtro selecionado.
        </div>
      ) : (
        <>
          {/* Cards Mobile Auditoria */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 lg:hidden">
            {pagedSecurityLogs.map((log) => {
              const isAlert =
                log.severity === 'security_alert' || log.severity === 'critical';
              const isWarning = log.severity === 'warning';
              return (
                <div key={log.id} className="p-3.5 rounded-2xl bg-[#f4f7fb] space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-xs font-semibold inline-flex items-center gap-1 ${
                        isAlert
                          ? 'bg-rose-100 text-rose-950'
                          : isWarning
                          ? 'bg-amber-100 text-amber-950'
                          : 'bg-emerald-100 text-emerald-950'
                      }`}
                    >
                      {isAlert ? (
                        <ShieldAlert className="w-3 h-3" />
                      ) : isWarning ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : (
                        <Info className="w-3 h-3" />
                      )}
                      <span>
                        {isAlert ? 'Bloqueio' : isWarning ? 'Aviso' : 'Registro'}
                      </span>
                    </span>
                    <span className="text-xs text-slate-700 tabular-nums">
                      {new Date(log.timestampISO).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-950 break-words">
                    {log.actionTitle}
                  </p>
                  <p className="text-xs text-slate-800 break-words">{log.details}</p>
                  <p className="text-xs text-emerald-800 font-medium break-all">
                    {log.userEmail} ({log.userRole.toUpperCase()})
                  </p>
                </div>
              );
            })}
          </div>

          {/* Tabela Desktop Auditoria */}
          <div className="hidden lg:block overflow-x-auto max-h-[520px] rounded-2xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#edf2f7] text-slate-800 text-xs font-semibold sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3">Data/Hora</th>
                  <th className="py-3 px-3">Usuário</th>
                  <th className="py-2.5 px-3">Evento</th>
                  <th className="py-2.5 px-3">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {pagedSecurityLogs.map((log) => {
                  const isAlert =
                    log.severity === 'security_alert' || log.severity === 'critical';
                  const isWarning = log.severity === 'warning';
                  return (
                    <tr key={log.id} className="odd:bg-[#f4f7fb] even:bg-white hover:bg-[#dce7fb]/40 transition-colors">
                      <td className="py-2.5 px-3 align-top">
                        <span
                          className={`px-2 py-0.5 rounded-md text-xs font-semibold inline-flex items-center gap-1 ${
                            isAlert
                              ? 'bg-rose-100 text-rose-950'
                              : isWarning
                              ? 'bg-amber-100 text-amber-950'
                              : 'bg-emerald-100 text-emerald-950'
                          }`}
                        >
                          {isAlert ? 'Bloqueio' : isWarning ? 'Aviso' : 'Registro'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 align-top tabular-nums text-xs text-slate-700 whitespace-nowrap">
                        {new Date(log.timestampISO).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2.5 px-3 align-top">
                        <span className="font-semibold text-slate-950 block break-words">
                          {log.userName || log.userEmail.split('@')[0]}
                        </span>
                        <span className="text-xs text-slate-700 break-all">
                          {log.userEmail} · {log.userRole.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 align-top font-semibold text-slate-950 break-words">
                        {log.actionTitle}
                      </td>
                      <td className="py-2.5 px-3 align-top text-slate-800 max-w-md break-words">
                        {log.details}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <AdminPaginationBar
            currentPage={currentPage}
            totalItems={filteredSecurityLogs.length}
            pageSize={pageSize}
            itemLabel="eventos de auditoria"
            onPageChange={onPageChange}
          />
        </>
      )}
    </section>
  );
};
