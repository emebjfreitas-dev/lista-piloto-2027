import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE_PATH = path.join(os.tmpdir(), 'emeb_candelario_shared_school_state_2027_v2.json');
const LEGACY_STATE_FILE_PATH = path.join(__dirname, 'shared_school_state_2027_v2.json');

interface SharedSchoolState {
  authorizedUsers?: any[];
  accessSessionLogs?: any[];
  attendanceWindowConfig?: any;
  classes?: any[];
  classesUpdatedAtMs?: number;
  discoveredNominalPdfs?: any[];
  discoveredDrivePhotos?: any[];
  adminDriveToken?: string;
  adminDriveTokenUpdatedAtMs?: number;
  cloudLinks?: {
    spreadsheetId?: string;
    spreadsheetTitle?: string;
    photosFolderId?: string;
    photosFolderUrl?: string;
    fichasPdfFolderId?: string;
    fichasPdfFolderUrl?: string;
    updatedAtMs?: number;
  };
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

const sanitizeAndDeduplicateClasses = (classes?: any[]): any[] | undefined => {
  if (!Array.isArray(classes)) return classes;
  return classes.map((cls: any, clsIdx: number) => {
    const cleanClassId = cls?.id || `cls-${clsIdx + 1}`;
    const rawStudents = Array.isArray(cls?.students) ? cls.students : [];
    const seenKeys = new Set<string>();
    const seenIds = new Set<string>();
    const cleanStudents: any[] = [];

    rawStudents.forEach((st: any, idx: number) => {
      if (!st || !st.name) return;
      const normName = String(st.name)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
      const raKey = String(st.ra || '').trim();
      const dedupKey = raKey ? `ra:${raKey}|name:${normName}` : `name:${normName}`;
      if (seenKeys.has(dedupKey)) return;
      seenKeys.add(dedupKey);

      const num = st.number || idx + 1;
      let studentId = st.id || `${cleanClassId}-s${num}`;
      if (seenIds.has(studentId)) {
        studentId = `${cleanClassId}-s${num}-i${idx + 1}`;
      }
      seenIds.add(studentId);

      cleanStudents.push({
        ...st,
        id: studentId,
        number: num,
      });
    });

    return {
      ...cls,
      id: cleanClassId,
      totalStudents: cleanStudents.length,
      students: cleanStudents,
    };
  });
};

const readSharedState = (): SharedSchoolState => {
  try {
    const fileToRead = fs.existsSync(STATE_FILE_PATH)
      ? STATE_FILE_PATH
      : fs.existsSync(LEGACY_STATE_FILE_PATH)
      ? LEGACY_STATE_FILE_PATH
      : null;
    if (fileToRead) {
      const raw = fs.readFileSync(fileToRead, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.authorizedUsers)) {
          parsed.authorizedUsers = deduplicateUsersByEmail(parsed.authorizedUsers);
        }
        if (Array.isArray(parsed.classes)) {
          parsed.classes = sanitizeAndDeduplicateClasses(parsed.classes);
        }
        parsed.cloudLinks = {
          photosFolderId: '1FzKx1qghv2_WhOjw7ttvbT_rvaTGYPpn',
          photosFolderUrl:
            'https://drive.google.com/drive/folders/1FzKx1qghv2_WhOjw7ttvbT_rvaTGYPpn',
          fichasPdfFolderId: '1GDEdQuNfhc0vps4mZXv4LLv4kDLZnauJ',
          fichasPdfFolderUrl:
            'https://drive.google.com/drive/folders/1GDEdQuNfhc0vps4mZXv4LLv4kDLZnauJ',
          ...(parsed.cloudLinks || {}),
        };
        // Force override if cloudLinks had old placeholder or empty photosFolderId
        if (
          !parsed.cloudLinks.photosFolderId ||
          parsed.cloudLinks.photosFolderUrl?.includes('my-drive')
        ) {
          parsed.cloudLinks.photosFolderId = '1FzKx1qghv2_WhOjw7ttvbT_rvaTGYPpn';
          parsed.cloudLinks.photosFolderUrl =
            'https://drive.google.com/drive/folders/1FzKx1qghv2_WhOjw7ttvbT_rvaTGYPpn';
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
    ...(patch.classes
      ? { classes: sanitizeAndDeduplicateClasses(patch.classes) }
      : {}),
    updatedAtMs: Date.now(),
  };
  try {
    const tmpPath = `${STATE_FILE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(next, null, 2), 'utf-8');
    fs.renameSync(tmpPath, STATE_FILE_PATH);
  } catch (err) {
    console.warn('Erro ao gravar shared_school_state_2027.json:', err);
  }
  return next;
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });
  app.use(express.json({ limit: '50mb' }));

  // API: Obter estado compartilhado (Usuários Autorizados, Turmas, Estudantes, Fotos, PDFs Escaneados, Links Drive/Sheets e Logs)
  app.get('/api/school-state', (_req, res) => {
    const state = readSharedState();
    const { adminDriveToken: _hiddenToken, ...publicState } = state;
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(publicState);
  });

  // API: Registrar token de leitura da pasta oficial do Drive para permitir proxy de fotos para todos os usuários da ponta (PEB I e PEB II)
  app.post('/api/school-state/drive-token', (req, res) => {
    const { accessToken } = req.body || {};
    if (typeof accessToken === 'string' && accessToken.trim().length > 10) {
      writeSharedState({
        adminDriveToken: accessToken.trim(),
        adminDriveTokenUpdatedAtMs: Date.now(),
      });
    }
    res.json({ ok: true });
  });

  // Cache em memória das imagens do Drive para carregamento instantâneo nos dispositivos dos professores
  const drivePhotoBufferCache = new Map<
    string,
    { buffer: Buffer; contentType: string; cachedAt: number }
  >();

  // API: Proxy universal de fotos do Google Drive (/api/drive-photo/:fileId) para que todos os usuários da ponta visualizem as fotos soltas da pasta sem bloqueio de permissão
  app.get('/api/drive-photo/:fileId', async (req, res) => {
    const fileId = String(req.params.fileId || '').replace(/[^a-zA-Z0-9-_]/g, '');
    if (!fileId) {
      res.status(400).end();
      return;
    }

    const cached = drivePhotoBufferCache.get(fileId);
    if (cached && Date.now() - cached.cachedAt < 1000 * 60 * 60 * 6) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(cached.buffer);
      return;
    }

    const state = readSharedState();
    const token = state.adminDriveToken;

    if (token) {
      try {
        const mediaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
            fileId
          )}?alt=media&supportsAllDrives=true`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (mediaRes.ok) {
          const contentType =
            mediaRes.headers.get('content-type') || 'image/jpeg';
          if (contentType.startsWith('image/') || contentType.includes('octet-stream')) {
            const arrayBuffer = await mediaRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            if (buffer.length > 100) {
              const finalType = contentType.startsWith('image/')
                ? contentType
                : 'image/jpeg';
              if (drivePhotoBufferCache.size > 600) {
                const oldestKey = drivePhotoBufferCache.keys().next().value;
                if (oldestKey) drivePhotoBufferCache.delete(oldestKey);
              }
              drivePhotoBufferCache.set(fileId, {
                buffer,
                contentType: finalType,
                cachedAt: Date.now(),
              });
              res.setHeader('Content-Type', finalType);
              res.setHeader('Cache-Control', 'public, max-age=86400');
              res.send(buffer);
              return;
            }
          }
        }
      } catch {
        // fallback to public thumbnail endpoints below
      }
    }

    const fallbackUrls = [
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w500`,
      `https://lh3.googleusercontent.com/d/${fileId}=w500`,
    ];

    for (const url of fallbackUrls) {
      try {
        const pubRes = await fetch(url);
        const contentType = pubRes.headers.get('content-type') || '';
        if (pubRes.ok && contentType.startsWith('image/')) {
          const arrayBuffer = await pubRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          if (buffer.length > 100) {
            drivePhotoBufferCache.set(fileId, {
              buffer,
              contentType,
              cachedAt: Date.now(),
            });
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.send(buffer);
            return;
          }
        }
      } catch {
        // continue
      }
    }

    res.status(404).end();
  });

  // API: Sincronizar Turmas, Faltas, Atestados, Fotos, NIS, Ônibus Fretado e Links de PDFs Escaneados em tempo real
  app.post('/api/school-state/classes', (req, res) => {
    const {
      classes,
      classesUpdatedAtMs,
      discoveredNominalPdfs,
      discoveredDrivePhotos,
      cloudLinks,
    } = req.body || {};
    if (!Array.isArray(classes)) {
      res.status(400).json({ error: 'Lista de turmas inválida' });
      return;
    }
    const current = readSharedState();
    const incTime = classesUpdatedAtMs || Date.now();

    // Compact any oversized inline base64 strings (>25KB) while preserving Drive photo URLs & PDF links
    const compactClasses = classes.map((cls: any) => ({
      ...cls,
      students: Array.isArray(cls.students)
        ? cls.students.map((st: any) => ({
            ...st,
            photo:
              st.photo &&
              typeof st.photo === 'string' &&
              st.photo.startsWith('data:image') &&
              st.photo.length > 35000 &&
              st.photoDriveUrl
                ? st.photoDriveUrl
                : st.photo,
          }))
        : [],
    }));

    const patch: Partial<SharedSchoolState> = {
      classes: compactClasses,
      classesUpdatedAtMs: Math.max(incTime, current.classesUpdatedAtMs || 0),
    };

    if (Array.isArray(discoveredNominalPdfs) && discoveredNominalPdfs.length > 0) {
      patch.discoveredNominalPdfs = discoveredNominalPdfs;
    }
    if (Array.isArray(discoveredDrivePhotos) && discoveredDrivePhotos.length > 0) {
      patch.discoveredDrivePhotos = discoveredDrivePhotos;
    }
    if (cloudLinks && typeof cloudLinks === 'object') {
      patch.cloudLinks = {
        ...(current.cloudLinks || {}),
        ...cloudLinks,
        updatedAtMs: Date.now(),
      };
    }

    const saved = writeSharedState(patch);
    res.json({ ok: true, classesUpdatedAtMs: saved.classesUpdatedAtMs });
  });

  // API: Sincronizar Links de Pastas (Fotos / Fichas Informativas PDF) e Planilha Oficial Google Sheets
  app.post('/api/school-state/links', (req, res) => {
    const { cloudLinks, discoveredNominalPdfs, discoveredDrivePhotos } = req.body || {};
    const current = readSharedState();
    const patch: Partial<SharedSchoolState> = {};

    if (cloudLinks && typeof cloudLinks === 'object') {
      patch.cloudLinks = {
        ...(current.cloudLinks || {}),
        ...cloudLinks,
        updatedAtMs: Date.now(),
      };
    }
    if (Array.isArray(discoveredNominalPdfs)) {
      patch.discoveredNominalPdfs = discoveredNominalPdfs;
    }
    if (Array.isArray(discoveredDrivePhotos) && discoveredDrivePhotos.length > 0) {
      patch.discoveredDrivePhotos = discoveredDrivePhotos;
    }

    const saved = writeSharedState(patch);
    res.json(saved);
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
