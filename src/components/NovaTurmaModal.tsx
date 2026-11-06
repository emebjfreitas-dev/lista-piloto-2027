import React, { useState } from 'react';
import { ClassGroup, Student } from '../types';
import { generateSedStudentsForClass } from '../data/mockData';

interface NovaTurmaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddClass: (newClass: ClassGroup) => void;
}

export const NovaTurmaModal: React.FC<NovaTurmaModalProps> = ({
  isOpen,
  onClose,
  onAddClass,
}) => {
  const [gradeNumber, setGradeNumber] = useState('1º Ano');
  const [classLetter, setClassLetter] = useState('G');
  const [gradeLevel, setGradeLevel] = useState('Ensino Fundamental I');
  const [shift, setShift] = useState<'Turno Manhã' | 'Turno Tarde'>('Turno Manhã');
  const [room, setRoom] = useState('Sala 16');
  const [studentCount, setStudentCount] = useState(28);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const className = gradeNumber.startsWith('G')
      ? `${gradeNumber}${classLetter}`
      : `${gradeNumber.replace(' Ano', '')}${classLetter}`;

    const newClassId = `turma-${Date.now()}`;
    const gradeString = gradeNumber.startsWith('G') ? `Educação Infantil (${gradeNumber})` : `Ensino Fundamental I (${gradeNumber})`;
    const generatedStudents = generateSedStudentsForClass(newClassId, className, gradeString, shift, studentCount);

    const newClass: ClassGroup = {
      id: newClassId,
      name: className,
      grade: gradeString,
      shift,
      room,
      totalStudents: studentCount,
      presenceRate: 95,
      statusText: 'Fechamento de Outubro: Pendente',
      isPending: true,
      students: generatedStudents,
      monthlyAbsences: generatedStudents.reduce((acc: number, s: Student) => acc + s.totalAbsencesMonth, 0),
      classesHeld: 20,
      classesPlanned: 20,
      weeklyPerformance: [
        { week: '1ª Semana (01 a 04)', rate: 96 },
        { week: '2ª Semana (07 a 11)', rate: 94 },
        { week: '3ª Semana (14 a 19)', rate: 97 },
        { week: '4ª Semana (21 a 31)', rate: 93 },
      ],
      pedagogicalNotes: 'Nova turma cadastrada no diário escolar oficial de 2027.',
    };

    onAddClass(newClass);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/35 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 text-slate-900">
            <span className="material-symbols-outlined text-[22px] text-blue-600">add_circle</span>
            <h3 className="text-base font-semibold">Adicionar Turma (2027)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto p-5 space-y-4 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-[#191c1b] mb-1">
                Etapa / Ano
              </label>
              <select
                value={gradeNumber}
                onChange={(e) => {
                  const val = e.target.value;
                  setGradeNumber(val);
                  if (val.startsWith('G')) {
                    setGradeLevel(`Educação Infantil (${val})`);
                  } else {
                    setGradeLevel(`Ensino Fundamental I (${val})`);
                  }
                }}
                className="w-full h-[50px] px-3 bg-[#f3f4f2] rounded-xl border border-[#c0c8cb] font-semibold text-[#003440] focus:bg-white focus:outline-none"
              >
                <option value="G4">G4 (Infantil 4 anos)</option>
                <option value="G5">G5 (Infantil 5 anos)</option>
                <option value="1º Ano">1º Ano</option>
                <option value="2º Ano">2º Ano</option>
                <option value="3º Ano">3º Ano</option>
                <option value="4º Ano">4º Ano</option>
                <option value="5º Ano">5º Ano</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-[#191c1b] mb-1">
                Turma (Letra)
              </label>
              <input
                type="text"
                maxLength={2}
                value={classLetter}
                onChange={(e) => setClassLetter(e.target.value.toUpperCase())}
                placeholder="Ex: A, B, C, D..."
                className="w-full h-[50px] px-3 bg-[#f3f4f2] rounded-xl border border-[#c0c8cb] font-bold text-[#003440] focus:bg-white focus:outline-none uppercase text-center"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-[#191c1b] mb-1">
                Turno
              </label>
              <select
                value={shift}
                onChange={(e) => setShift(e.target.value as 'Turno Manhã' | 'Turno Tarde')}
                className="w-full h-[50px] px-3 bg-[#f3f4f2] rounded-xl border border-[#c0c8cb] font-semibold text-[#003440] focus:bg-white focus:outline-none"
              >
                <option value="Turno Manhã">☀️ Turno Manhã</option>
                <option value="Turno Tarde">⛅ Turno Tarde</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-[#191c1b] mb-1">
                Sala
              </label>
              <input
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="Ex: Sala 04, Sala Infantil 01"
                className="w-full h-[50px] px-3 bg-[#f3f4f2] rounded-xl border border-[#c0c8cb] font-semibold text-[#003440] focus:bg-white focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm font-bold text-[#191c1b]">
                Total de Estudantes Matriculados
              </label>
              <span className="font-semibold text-slate-900 text-lg font-mono tabular-nums">
                {studentCount} estudantes
              </span>
            </div>
            <input
              type="range"
              min="15"
              max="35"
              value={studentCount}
              onChange={(e) => setStudentCount(Number(e.target.value))}
              className="w-full accent-[#003440] cursor-pointer"
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-slate-200/90 p-4 flex gap-2 shrink-0 z-10">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[46px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="flex-1 min-h-[46px] bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            <span>Cadastrar Turma</span>
          </button>
        </div>
      </form>
      </div>
    </div>
  );
};
