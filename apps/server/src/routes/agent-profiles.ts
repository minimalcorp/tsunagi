import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AgentProfileAssignment, AgentProfileWithStatus } from '@minimalcorp/tsunagi-shared';
import { mkdir } from 'fs/promises';
import * as os from 'os';
import { ptyManager } from '../pty-manager.js';
import { prisma } from '../lib/db.js';
import { deleteEnv, getEnv, setEnv } from '../lib/repositories/environment.js';
import { AGENTS, getAgent, getAgentAvailability, type AgentAdapter } from '../lib/agents/index.js';
import {
  DEFAULT_PROFILE,
  createProfile,
  deleteProfile,
  getProfileAuthStatus,
  listProfiles,
  loginPtyEnv,
  profileExists,
} from '../lib/agent-profiles.js';
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
const LOGIN_SESSION_PREFIX = 'agent-login-';

function validateScope(scope: Scope | undefined, owner?: string, repo?: string): string | null {
  if (scope !== 'global' && scope !== 'owner' && scope !== 'repo') return 'Invalid scope';
  if (scope === 'owner' && !owner) return 'owner is required for scope=owner';
  if (scope === 'repo' && (!owner || !repo)) return 'owner and repo are required for scope=repo';
  return null;
}

async function getAssignment(agent: AgentAdapter, scope: Scope, owner?: string, repo?: string) {
  const { envKey } = agent.profile;
  const row = await prisma.environmentVariable.findFirst({
    where: {
      key: envKey,
      scope,
      ...(scope !== 'global' && { owner }),
      ...(scope === 'repo' && { repo }),
    },
  });
  const merged = await getEnv(scope, owner, repo);
  const assignment: AgentProfileAssignment = {
    assigned: row?.value ?? null,
    effective: merged[envKey] ?? DEFAULT_PROFILE,
  };
  return assignment;
}

function syncPtyEnv(fastify: FastifyInstance): void {
  notifyEnvChanged().catch((err: unknown) => fastify.log.warn(err, 'Failed to sync PTY env'));
}

/** :agent を adapter に解決する。未知なら 404 を返して undefined */
function resolveAgent(id: string, reply: FastifyReply): AgentAdapter | undefined {
  const agent = getAgent(id);
  if (!agent) void reply.status(404).send({ error: 'Unknown agent' });
  return agent;
}

export async function agentProfilesRoutes(fastify: FastifyInstance) {
  // GET /agents - エージェント CLI の導入状況
  fastify.get('/agents', async (_request, reply) => {
    const agents = await Promise.all(AGENTS.map((agent) => getAgentAvailability(agent)));
    return reply.send({ data: { agents } });
  });

  // GET /agent-profiles/:agent - システム既定 + 登録済みプロファイルとログイン状態
  fastify.get<{ Params: { agent: string } }>('/agent-profiles/:agent', async (request, reply) => {
    const agent = resolveAgent(request.params.agent, reply);
    if (!agent) return;
    const profiles = await listProfiles(agent);
    const data: AgentProfileWithStatus[] = await Promise.all([
      getProfileAuthStatus(agent, DEFAULT_PROFILE).then((status) => ({
        agent: agent.id,
        slug: DEFAULT_PROFILE,
        name: 'System default',
        // 設定ディレクトリの環境変数を付けない（普段ターミナルで CLI を使うときと同じ設定）
        configDir: null,
        status,
      })),
      ...profiles.map(async (profile) => ({
        ...profile,
        status: await getProfileAuthStatus(agent, profile.slug),
      })),
    ]);
    return reply.send({ data: { profiles: data } });
  });

  // GET /agent-profiles/:agent/:slug/status - ログイン状態（ログイン用ダイアログで完了を確認する）
  fastify.get<{ Params: { agent: string; slug: string } }>(
    '/agent-profiles/:agent/:slug/status',
    async (request, reply) => {
      const agent = resolveAgent(request.params.agent, reply);
      if (!agent) return;
      const { slug } = request.params;
      if (!(await profileExists(agent, slug))) {
        return reply.status(404).send({ error: 'Profile not found' });
      }
      return reply.send({ data: { status: await getProfileAuthStatus(agent, slug) } });
    }
  );

  // POST /agent-profiles/:agent - プロファイル作成
  fastify.post<{ Params: { agent: string }; Body: { name?: string } }>(
    '/agent-profiles/:agent',
    async (request, reply) => {
      const agent = resolveAgent(request.params.agent, reply);
      if (!agent) return;
      try {
        const profile = await createProfile(agent, request.body?.name ?? '');
        return reply.status(201).send({ data: { profile } });
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // DELETE /agent-profiles/:agent/:slug - プロファイル削除（logout してディレクトリごと消す）
  fastify.delete<{ Params: { agent: string; slug: string } }>(
    '/agent-profiles/:agent/:slug',
    async (request, reply) => {
      const agent = resolveAgent(request.params.agent, reply);
      if (!agent) return;
      const { slug } = request.params;
      if (slug === DEFAULT_PROFILE || !(await profileExists(agent, slug))) {
        return reply.status(404).send({ error: 'Profile not found' });
      }
      await deleteProfile(agent, slug);
      syncPtyEnv(fastify);
      return reply.status(204).send();
    }
  );

  // POST /agent-profiles/:agent/:slug/login - ログイン用 PTY を起動しログインコマンドを実行する
  fastify.post<{ Params: { agent: string; slug: string } }>(
    '/agent-profiles/:agent/:slug/login',
    async (request, reply) => {
      const agent = resolveAgent(request.params.agent, reply);
      if (!agent) return;
      const { slug } = request.params;
      if (!(await profileExists(agent, slug))) {
        return reply.status(404).send({ error: 'Profile not found' });
      }
      // 同じプロファイルのログイン用 PTY が残っていれば閉じる
      const prefix = `${LOGIN_SESSION_PREFIX}${agent.id}-${slug}-`;
      for (const id of ptyManager.listSessions()) {
        if (id.startsWith(prefix)) ptyManager.deleteSession(id);
      }
      const sessionId = `${prefix}${crypto.randomUUID()}`;
      const { env, unsetKeys } = loginPtyEnv(agent, slug);
      const configDir = env[agent.profile.configDirEnvKey];
      // CODEX_HOME は存在しないと codex が起動しない
      if (configDir) await mkdir(configDir, { recursive: true });
      const session = ptyManager.createSession(sessionId, os.homedir(), env, unsetKeys);
      // シェルの初期化（プロンプト表示）を待つため少し遅延させて書き込む
      setTimeout(() => session.pty.write(`${agent.profile.loginCommand}\n`), 300);
      return reply.status(201).send({ data: { sessionId } });
    }
  );

  // DELETE /agent-profiles/login/:sessionId - ログイン用 PTY を閉じる
  fastify.delete<{ Params: { sessionId: string } }>(
    '/agent-profiles/login/:sessionId',
    async (request, reply) => {
      const { sessionId } = request.params;
      if (!sessionId.startsWith(LOGIN_SESSION_PREFIX)) {
        return reply.status(400).send({ error: 'Not a login session' });
      }
      ptyManager.deleteSession(sessionId);
      return reply.status(204).send();
    }
  );

  // GET /agent-profiles/:agent/assignment - スコープのプロファイル割り当て
  fastify.get<{ Params: { agent: string }; Querystring: AssignmentQuery }>(
    '/agent-profiles/:agent/assignment',
    async (request, reply) => {
      const agent = resolveAgent(request.params.agent, reply);
      if (!agent) return;
      const { scope, owner, repo } = request.query;
      const error = validateScope(scope, owner, repo);
      if (error) return reply.status(400).send({ error });
      return reply.send({ data: { assignment: await getAssignment(agent, scope!, owner, repo) } });
    }
  );

  // PUT /agent-profiles/:agent/assignment - スコープのプロファイル割り当てを変更する
  fastify.put<{ Params: { agent: string }; Body: AssignmentBody }>(
    '/agent-profiles/:agent/assignment',
    async (request, reply) => {
      const agent = resolveAgent(request.params.agent, reply);
      if (!agent) return;
      const { scope, owner, repo, slug } = request.body ?? ({} as AssignmentBody);
      const error = validateScope(scope, owner, repo);
      if (error) return reply.status(400).send({ error });
      if (slug !== null && !(await profileExists(agent, slug))) {
        return reply.status(400).send({ error: 'Profile not found' });
      }
      const { envKey } = agent.profile;
      if (slug === null) {
        await deleteEnv(envKey, scope, owner, repo);
      } else {
        await setEnv(envKey, slug, scope, owner, repo);
      }
      syncPtyEnv(fastify);
      return reply.send({ data: { assignment: await getAssignment(agent, scope, owner, repo) } });
    }
  );
}
