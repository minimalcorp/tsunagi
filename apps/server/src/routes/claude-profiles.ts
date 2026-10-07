import type { FastifyInstance } from 'fastify';
import type { ClaudeProfileAssignment, ClaudeProfileWithStatus } from '@minimalcorp/tsunagi-shared';
import * as os from 'os';
import { ptyManager } from '../pty-manager.js';
import { prisma } from '../lib/db.js';
import { deleteEnv, getEnv, setEnv } from '../lib/repositories/environment.js';
import {
  CLAUDE_PROFILE_ENV_KEY,
  DEFAULT_CLAUDE_PROFILE,
  buildClaudeLoginCommand,
  claudeLoginPtyEnv,
  claudeProfileExists,
  createClaudeProfile,
  deleteClaudeProfile,
  getClaudeAuthStatus,
  listClaudeProfiles,
} from '../lib/claude-profiles.js';
import { notifyEnvChanged } from '../lib/pty-env-sync.js';

type Scope = 'global' | 'owner' | 'repo';

interface AssignmentQuery {
  scope?: Scope;
  owner?: string;
  repo?: string;
}

interface AssignmentBody {
  scope: Scope;
  owner?: string;
  repo?: string;
  /** null は割り当てを外す（親を継承。global ではシステム既定） */
  slug: string | null;
}

/** ログイン用 PTY の sessionId の接頭辞（タブの PTY と区別する） */
const LOGIN_SESSION_PREFIX = 'claude-login-';

function validateScope(scope: Scope | undefined, owner?: string, repo?: string): string | null {
  if (scope !== 'global' && scope !== 'owner' && scope !== 'repo') return 'Invalid scope';
  if (scope === 'owner' && !owner) return 'owner is required for scope=owner';
  if (scope === 'repo' && (!owner || !repo)) return 'owner and repo are required for scope=repo';
  return null;
}

async function getAssignment(scope: Scope, owner?: string, repo?: string) {
  const row = await prisma.environmentVariable.findFirst({
    where: {
      key: CLAUDE_PROFILE_ENV_KEY,
      scope,
      ...(scope !== 'global' && { owner }),
      ...(scope === 'repo' && { repo }),
    },
  });
  const merged = await getEnv(scope, owner, repo);
  const assignment: ClaudeProfileAssignment = {
    assigned: row?.value ?? null,
    effective: merged[CLAUDE_PROFILE_ENV_KEY] ?? DEFAULT_CLAUDE_PROFILE,
  };
  return assignment;
}

function syncPtyEnv(fastify: FastifyInstance): void {
  notifyEnvChanged().catch((err: unknown) => fastify.log.warn(err, 'Failed to sync PTY env'));
}

export async function claudeProfilesRoutes(fastify: FastifyInstance) {
  // GET /claude-profiles - システム既定 + 登録済みプロファイルとログイン状態
  fastify.get('/claude-profiles', async (_request, reply) => {
    const profiles = await listClaudeProfiles();
    const data: ClaudeProfileWithStatus[] = await Promise.all([
      getClaudeAuthStatus(DEFAULT_CLAUDE_PROFILE).then((status) => ({
        slug: DEFAULT_CLAUDE_PROFILE,
        name: 'System default',
        // CLAUDE_CONFIG_DIR を付けない（普段ターミナルで claude を使うときと同じ設定）
        configDir: null,
        status,
      })),
      ...profiles.map(async (profile) => ({
        ...profile,
        status: await getClaudeAuthStatus(profile.slug),
      })),
    ]);
    return reply.send({ data: { profiles: data } });
  });

  // GET /claude-profiles/:slug/status - ログイン状態（ログイン用ダイアログで完了を確認する）
  fastify.get<{ Params: { slug: string } }>(
    '/claude-profiles/:slug/status',
    async (request, reply) => {
      const { slug } = request.params;
      if (!(await claudeProfileExists(slug))) {
        return reply.status(404).send({ error: 'Profile not found' });
      }
      return reply.send({ data: { status: await getClaudeAuthStatus(slug) } });
    }
  );

  // POST /claude-profiles - プロファイル作成
  fastify.post<{ Body: { name?: string } }>('/claude-profiles', async (request, reply) => {
    try {
      const profile = await createClaudeProfile(request.body?.name ?? '');
      return reply.status(201).send({ data: { profile } });
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // DELETE /claude-profiles/:slug - プロファイル削除（logout してディレクトリごと消す）
  fastify.delete<{ Params: { slug: string } }>('/claude-profiles/:slug', async (request, reply) => {
    const { slug } = request.params;
    if (slug === DEFAULT_CLAUDE_PROFILE || !(await claudeProfileExists(slug))) {
      return reply.status(404).send({ error: 'Profile not found' });
    }
    await deleteClaudeProfile(slug);
    syncPtyEnv(fastify);
    return reply.status(204).send();
  });

  // POST /claude-profiles/:slug/login - ログイン用 PTY を起動し `claude auth login` を実行する
  fastify.post<{ Params: { slug: string } }>(
    '/claude-profiles/:slug/login',
    async (request, reply) => {
      const { slug } = request.params;
      if (!(await claudeProfileExists(slug))) {
        return reply.status(404).send({ error: 'Profile not found' });
      }
      // 同じプロファイルのログイン用 PTY が残っていれば閉じる
      const prefix = `${LOGIN_SESSION_PREFIX}${slug}-`;
      for (const id of ptyManager.listSessions()) {
        if (id.startsWith(prefix)) ptyManager.deleteSession(id);
      }
      const sessionId = `${prefix}${crypto.randomUUID()}`;
      const { env, unsetKeys } = claudeLoginPtyEnv(slug);
      const session = ptyManager.createSession(sessionId, os.homedir(), env, unsetKeys);
      // シェルの初期化（プロンプト表示）を待つため少し遅延させて書き込む
      setTimeout(() => session.pty.write(`${buildClaudeLoginCommand()}\n`), 300);
      return reply.status(201).send({ data: { sessionId } });
    }
  );

  // DELETE /claude-profiles/login/:sessionId - ログイン用 PTY を閉じる
  fastify.delete<{ Params: { sessionId: string } }>(
    '/claude-profiles/login/:sessionId',
    async (request, reply) => {
      const { sessionId } = request.params;
      if (!sessionId.startsWith(LOGIN_SESSION_PREFIX)) {
        return reply.status(400).send({ error: 'Not a login session' });
      }
      ptyManager.deleteSession(sessionId);
      return reply.status(204).send();
    }
  );

  // GET /claude-profiles/assignment - スコープのプロファイル割り当て
  fastify.get<{ Querystring: AssignmentQuery }>(
    '/claude-profiles/assignment',
    async (request, reply) => {
      const { scope, owner, repo } = request.query;
      const error = validateScope(scope, owner, repo);
      if (error) return reply.status(400).send({ error });
      return reply.send({ data: { assignment: await getAssignment(scope!, owner, repo) } });
    }
  );

  // PUT /claude-profiles/assignment - スコープのプロファイル割り当てを変更する
  fastify.put<{ Body: AssignmentBody }>('/claude-profiles/assignment', async (request, reply) => {
    const { scope, owner, repo, slug } = request.body ?? ({} as AssignmentBody);
    const error = validateScope(scope, owner, repo);
    if (error) return reply.status(400).send({ error });
    if (slug !== null && !(await claudeProfileExists(slug))) {
      return reply.status(400).send({ error: 'Profile not found' });
    }
    if (slug === null) {
      await deleteEnv(CLAUDE_PROFILE_ENV_KEY, scope, owner, repo);
    } else {
      await setEnv(CLAUDE_PROFILE_ENV_KEY, slug, scope, owner, repo);
    }
    syncPtyEnv(fastify);
    return reply.send({ data: { assignment: await getAssignment(scope, owner, repo) } });
  });
}
