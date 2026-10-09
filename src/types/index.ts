export type AttendanceStatus = 'present' | 'absent';

export type DayType = 'dia_letivo' | 'feriado' | 'recesso' | 'planejamento' | 'sabado_letivo';

export interface SchoolDay {
  id: string;
  date: string;
  dayOfWeek: string;
  month: string;
  type: DayType;
  description: string;
}

export interface StudentSedData {
  tipoEnsino: string;
  serie: string;
  numeroChamada: number;
  estudante: string;
  ra: string;
  digRa: string;
  ufRa: string;
  dataNascimento: string;
  tipoAlocacao?: string;
  situacao?: string;
  dataMovimentacao?: string;
  categoriaProfissionalCenso?: string;
  deficiencia?: string;
  posDataCenso?: string;
  turma: string;
  periodo: string;
  dataMatriculaSed?: string;
  procedenciaEscolar?: string;
  irmaos?: string;
  idade?: string;
  arquivo?: string;
  filiacao1?: string;
  filiacao2?: string;
  nomeSocial?: string;
  genero?: string;
  tipoSanguineo?: string;
  racaCor?: string;
  nacionalidade?: string;
  paisOrigem?: string;
  municipioNascimento?: string;
  cpf?: string;
  rg?: string;
  dataEmissaoRg?: string;
  cartaoSus?: string;
  nis?: string;
  cep?: string;
  logradouro?: string;
  numeroResidencia?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  telefones?: string;
  emailGoogle?: string;
  emailMicrosoft?: string;
  emailMunicipal?: string;
  rotaOnibus?: string;
  sucessaoEscolar?: string;
}

export interface MonthlyAttendanceEntry {
  diasLetivosRecorte: number;
  faltas: number;
  atestados: number;
  observacao?: string;
}

export interface ConsecutiveAbsenceOccurrence {
  id: string;
  sequenceNumber: number;
  selectedDates: string[];
  reportedAt: string;
  reportedByTeacher?: string;
  familyFeedback?: string;
  feedbackUpdatedAt?: string;
  feedbackReadByTeacher?: boolean;
}

export interface ConsecutiveAbsenceAlert {
  selectedDates: string[];
  reportedAt: string;
  reportedByTeacher?: string;
  familyFeedback?: string;
  feedbackUpdatedAt?: string;
  active: boolean;
  occurrences?: ConsecutiveAbsenceOccurrence[];
}

export interface Student extends StudentSedData {
  id: string;
  number: number;
  name: string;
  photo?: string;
  photoDriveUrl?: string;
  fichaPdfDriveId?: string;
  fichaPdfDriveUrl?: string;
  fichaPdfSubfolder?: string;
  initials?: string;
  status: AttendanceStatus;
  alert?: string;
  totalAbsencesMonth: number;
  justifiedAbsences?: number;
  diasLetivosRecorte?: number;
  monthlyAttendanceByMonth?: Record<string, MonthlyAttendanceEntry>;
  consecutiveAbsenceAlert?: ConsecutiveAbsenceAlert;
  notes?: string;
  guardianName?: string;
  guardianPhone?: string;
}

export interface DriveNominalPdfFile {
  id: string;
  name: string;
  normalizedStudentName: string;
  subfolderName: string;
  subfolderId?: string;
  webViewLink: string;
  embedPreviewUrl: string;
  thumbnailLink?: string;
  modifiedTime?: string;
}

export interface WeeklyData {
  week: string;
  rate: number;
}

export interface ClassGroup {
  id: string;
  name: string;
  turmaAbrev?: string;
  grade: string;
  shift: string;
  room: string;
  teacherName?: string;
  teacherEmail?: string;
  pronoun?: string;
  teacherPronoun?: string;
  teacherFirstName?: string;
  sedClassName?: string;
  turmaSedName?: string;
  sedExpectedStudents?: number;
  classeSedCode?: string;
  artTeacher?: string;
  artTeacherEmail?: string;
  peTeacher?: string;
  peTeacherEmail?: string;
  englishTeacher?: string;
  englishTeacherEmail?: string;
  totalStudents: number;
  presenceRate: number;
  statusText: string;
  isPending: boolean;
  students: Student[];
  monthlyAbsences: number;
  classesHeld: number;
  classesPlanned: number;
  monthlySchoolDays?: Record<string, number>;
  weeklyPerformance: WeeklyData[];
  pedagogicalNotes: string;
  driveFolderUrl?: string;
}

export interface SheetTabInfo {
  id: string;
  name: string;
  description: string;
  rowsCount: number;
}

export interface GoogleSheetConfig {
  sheetUrl: string;
  sheetId: string;
  sheetName: string;
  lastSync: string;
  status: 'connected' | 'syncing' | 'error';
  rowsCount: number;
  isAutoSyncEnabled: boolean;
  activeTabId: string;
  tabs: SheetTabInfo[];
}

export type UserRole = 'admin' | 'usuario' | 'peb2';

export interface UserProfile {
  role: UserRole;
  name: string;
  label: string;
  description: string;
  assignedClassId: string;
}

export interface SheetRowData {
  id: string;
  studentId: string;
  classId: string;
  tipoEnsino: 'EDUCACAO INFANTIL' | 'ENSINO FUNDAMENTAL';
  etapaSerie: string;
  turma: string;
  turno: string;
  sala: string;
  numero: number;
  nome: string;
  fotoUrl?: string;
  fichaPdfDriveId?: string;
  fichaPdfDriveUrl?: string;
  ra: string;
  digRa: string;
  ufRa: string;
  deficiencia: string;
  diasLetivosMes: number;
  diasLetivosMatriculados: number;
  presencasMes: number;
  recorteInfo: string;
  dataMatricula: string;
  dataMovimentacao: string;
  faltasMes: number;
  faltasJustificadas: number;
  faltasSemAtestado: number;
  percentFaltas: number;
  percentAtestadosSobreFaltas: number;
  percentAtestadosSobreDias: number;
  frequenciaPercent: number;
  situacao: string;
  observacoesAtestado: string;
  filiacao1: string;
  filiacao2: string;
  genero: string;
  emailMunicipal: string;
  responsavel: string;
  telefone: string;
}

export interface UserAccessSessionLog {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  assignedClassName: string;
  loginTimeISO: string;
  lastHeartbeatISO: string;
  logoutTimeISO?: string;
  durationSeconds: number;
  lastScreen?: string;
  isOnlineNow: boolean;
}

export interface AuthorizedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  assignedClassId: string;
  assignedClassName: string;
  assignedClassIds?: string[];
  assignedClassNames?: string[];
  teacherRoleType?:
    | 'peb1'
    | 'peb2'
    | 'admin'
    | 'apoio'
    | 'arte'
    | 'regente'
    | 'especialista'
    | 'gestao';
  pronoun?: string;
  firstName?: string;
  subjectName?: 'ARTE' | 'EDUCAÇÃO FÍSICA' | 'LÍNGUA INGLESA' | 'REGENTE PEB I' | 'GESTÃO / ADMIN';
  active: boolean;
  createdAt: string;
  updatedAtMs?: number;
  totalAccessCount?: number;
  totalDurationSeconds?: number;
  lastLoginAt?: string;
  lastActiveAt?: string;
  lastSessionDurationSeconds?: number;
  lastScreenVisited?: string;
}

export interface AttendanceWindowConfig {
  exceptionalOverrideOpen: boolean;
  simulatedDateISO?: string;
  updatedByEmail?: string;
  updatedAt?: string;
}

export type ScreenType = 
  | 'login'
  | 'turmas'
  | 'detalhes'
  | 'frequencia_mensal'
  | 'faltas_consecutivas'
  | 'bolsa_familia'
  | 'onibus_fretado'
  | 'dias_letivos'
  | 'resumo'
  | 'planilha'
  | 'usuarios_acesso';
