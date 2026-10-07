import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE_PATH = path.join(__dirname, 'shared_school_state_2027.json');

interface SharedSchoolState {
  authorizedUsers?: any[];
  accessSessionLogs?: any[];
  attendanceWindowConfig?: any;
  updatedAtMs: number;
}

const deduplicateUsersByEmail = (users?: any[]): any[] | undefined => {
  if (!Array.isArray(users)) return users;
  const map = new Map<string, any>();
  users.forEach((u, idx) => {
    if (!u || typeof u.email !== 'string') return;
    const email = u.email.trim().toLowerCase();
    if (!email) return;
    const existing = map.get(email);
    if (!existing) {
      map.set(email, { ...u, id: u.id || `usr-official-${idx}`, email });
    } else {
      const incTime = u.updatedAtMs || 0;
      const extTime = existing.updatedAtMs || 0;
      const winner = incTime >= extTime ? u : existing;
      map.set(email, {
        ...winner,
        email,
        updatedAtMs: Math.max(incTime, extTime),
        totalAccessCount: Math.max(u.totalAccessCount || 0, existing.totalAccessCount || 0),
        totalDurationSeconds: Math.max(
          u.totalDurationSeconds || 0,
          existing.totalDurationSeconds || 0
        ),
        lastSessionDurationSeconds: Math.max(
          u.lastSessionDurationSeconds || 0,
          existing.lastSessionDurationSeconds || 0
        ),
        lastLoginAt: u.lastLoginAt || existing.lastLoginAt,
        lastActiveAt: u.lastActiveAt || existing.lastActiveAt,
        lastScreenVisited: u.lastScreenVisited || existing.lastScreenVisited,
      });
    }
  });
  return Array.from(map.values());
};

const readSharedState = (): SharedSchoolState => {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const raw = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.authorizedUsers)) {
          parsed.authorizedUsers = deduplicateUsersByEmail(parsed.authorizedUsers);
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Erro ao ler shared_school_state_2027.json:', err);
  }
  return { updatedAtMs: 0 };
};

const writeSharedState = (patch: Partial<SharedSchoolState>): SharedSchoolState => {
  const current = readSharedState();
  const next: SharedSchoolState = {
    ...current,
    ...patch,
    ...(patch.authorizedUsers
      ? { authorizedUsers: deduplicateUsersByEmail(patch.authorizedUsers) }
      : {}),
    updatedAtMs: Date.now(),
  };
  try {
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(next, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Erro ao gravar shared_school_state_2027.json:', err);
  }
  return next;
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API: Obter estado compartilhado (Usuários Autorizados, Turmas Vinculadas, Logs de Acesso e Janela de Lançamento)
  app.get('/api/school-state', (_req, res) => {
    const state = readSharedState();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(state);
  });

  // API: Atualizar Usuários Autorizados (vínculo de turmas PEB I / PEB II / Admin)
  app.post('/api/school-state/users', (req, res) => {
    const { authorizedUsers } = req.body || {};
    if (!Array.isArray(authorizedUsers)) {
      res.status(400).json({ error: 'Lista de authorizedUsers inválida' });
      return;
    }
    const current = readSharedState();
    // Merge preserving higher access counts/durations while respecting newer updatedAtMs for role/class assignments
    const currentByEmail = new Map<string, any>();
    (current.authorizedUsers || []).forEach((u: any) => {
      if (u && typeof u.email === 'string') {
        currentByEmail.set(u.email.trim().toLowerCase(), u);
      }
    });

    const mergedUsers = authorizedUsers.map((incoming: any) => {
      const email = String(incoming.email || '').trim().toLowerCase();
      const existing = currentByEmail.get(email);
      if (!existing) return incoming;

      const incTime = incoming.updatedAtMs || 0;
      const extTime = existing.updatedAtMs || 0;
      const winner = incTime >= extTime ? incoming : existing;

      return {
        ...winner,
        updatedAtMs: Math.max(incTime, extTime),
        totalAccessCount: Math.max(
          incoming.totalAccessCount || 0,
          existing.totalAccessCount || 0
        ),
        totalDurationSeconds: Math.max(
          incoming.totalDurationSeconds || 0,
          existing.totalDurationSeconds || 0
        ),
        lastSessionDurationSeconds: Math.max(
          incoming.lastSessionDurationSeconds || 0,
          existing.lastSessionDurationSeconds || 0
        ),
        lastLoginAt: incoming.lastLoginAt || existing.lastLoginAt,
        lastActiveAt: incoming.lastActiveAt || existing.lastActiveAt,
        lastScreenVisited: incoming.lastScreenVisited || existing.lastScreenVisited,
      };
    });

    const saved = writeSharedState({ authorizedUsers: mergedUsers });
    res.json(saved);
  });

  // API: Atualizar Logs de Sessão e Tempo Conectado
  app.post('/api/school-state/logs', (req, res) => {
    const { accessSessionLogs, authorizedUsers } = req.body || {};
    const current = readSharedState();

    // Merge session logs by ID
    const logMap = new Map<string, any>();
    (current.accessSessionLogs || []).forEach((l: any) => {
      if (l && l.id) logMap.set(l.id, l);
    });
    if (Array.isArray(accessSessionLogs)) {
      accessSessionLogs.forEach((l: any) => {
        if (!l || !l.id) return;
        const prev = logMap.get(l.id);
        if (!prev || (l.durationSeconds || 0) >= (prev.durationSeconds || 0) || l.logoutTimeISO) {
          logMap.set(l.id, l);
        }
      });
    }
    const mergedLogs = Array.from(logMap.values())
      .sort(
        (a, b) =>
          new Date(b.loginTimeISO || 0).getTime() -
          new Date(a.loginTimeISO || 0).getTime()
      )
      .slice(0, 500);

    let nextUsers = current.authorizedUsers;
    if (Array.isArray(authorizedUsers)) {
      const currentByEmail = new Map<string, any>();
      (current.authorizedUsers || []).forEach((u: any) => {
        if (u && typeof u.email === 'string') {
          currentByEmail.set(u.email.trim().toLowerCase(), u);
        }
      });
      nextUsers = authorizedUsers.map((incoming: any) => {
        const email = String(incoming.email || '').trim().toLowerCase();
        const existing = currentByEmail.get(email);
        if (!existing) return incoming;
        const incTime = incoming.updatedAtMs || 0;
        const extTime = existing.updatedAtMs || 0;
        const winner = incTime >= extTime ? incoming : existing;
        return {
          ...winner,
          updatedAtMs: Math.max(incTime, extTime),
          totalAccessCount: Math.max(
            incoming.totalAccessCount || 0,
            existing.totalAccessCount || 0
          ),
          totalDurationSeconds: Math.max(
            incoming.totalDurationSeconds || 0,
            existing.totalDurationSeconds || 0
          ),
          lastSessionDurationSeconds: Math.max(
            incoming.lastSessionDurationSeconds || 0,
            existing.lastSessionDurationSeconds || 0
          ),
          lastLoginAt: incoming.lastLoginAt || existing.lastLoginAt,
          lastActiveAt: incoming.lastActiveAt || existing.lastActiveAt,
          lastScreenVisited: incoming.lastScreenVisited || existing.lastScreenVisited,
        };
      });
    }

    const saved = writeSharedState({
      accessSessionLogs: mergedLogs,
      ...(nextUsers ? { authorizedUsers: nextUsers } : {}),
    });
    res.json(saved);
  });

  // API: Atualizar Configuração de Janela de Lançamento Excepcional
  app.post('/api/school-state/window', (req, res) => {
    const { attendanceWindowConfig } = req.body || {};
    if (!attendanceWindowConfig) {
      res.status(400).json({ error: 'Configuração inválida' });
      return;
    }
    const saved = writeSharedState({ attendanceWindowConfig });
    res.json(saved);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor EMEB Candelário de Freitas rodando em http://localhost:${PORT}`);
  });
}

startServer();
