'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, CircleAlert, LogIn, Plus, Trash2, UserRound, X } from 'lucide-react';
import type {
  ClaudeAuthStatus,
  ClaudeProfileAssignment,
  ClaudeProfileWithStatus,
} from '@minimalcorp/tsunagi-shared';
import { apiUrl } from '@/lib/api-url';
import { toaster } from '@/lib/toaster';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import type { SelectedNode } from '@/components/env/EnvTreeNavigation';
import { ClaudeLoginDialog } from './ClaudeLoginDialog';
import { Code, Field, errorMessage, requestData } from './local-llm-ui';

const DEFAULT_SLUG = 'default';
const PROFILE_NAME_PATTERN = /^[A-Za-z0-9 _-]+$/;

/** サーバーと同じ規則（空白→`-`、小文字化） */
function toSlug(name: string): string {
  return name.trim().replace(/\s+/g, '-').toLowerCase();
}

function validateName(name: string, profiles: ClaudeProfileWithStatus[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (!PROFILE_NAME_PATTERN.test(trimmed)) return 'Use only letters, numbers, spaces, "-" and "_"';
  const slug = toSlug(trimmed);
  if (profiles.some((p) => p.slug === slug)) return `"${slug}" already exists`;
  return null;
}

function statusLabel(status: ClaudeAuthStatus): string {
  if (!status.loggedIn) return 'Not logged in';
  const account = [status.email, status.orgName].filter(Boolean).join(' · ');
  return account || status.authMethod || 'Logged in';
}

function scopeQuery(node: SelectedNode): string {
  const params = new URLSearchParams({ scope: node.scope });
  if (node.owner) params.set('owner', node.owner);
  if (node.repo) params.set('repo', node.repo);
  return params.toString();
}

interface ClaudeProfileSectionProps {
  selectedNode: SelectedNode;
}

/**
 * Claude のプロファイル（CLAUDE_CONFIG_DIR）。Global ではプロファイルの追加・ログイン・削除、
 * 全スコープでそのスコープのタブが使うプロファイルの選択（親から継承）を行う。
 */
export function ClaudeProfileSection({ selectedNode }: ClaudeProfileSectionProps) {
  const [profiles, setProfiles] = useState<ClaudeProfileWithStatus[] | null>(null);
  const [assignment, setAssignment] = useState<ClaudeProfileAssignment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [loginSlug, setLoginSlug] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClaudeProfileWithStatus | null>(null);

  const isGlobal = selectedNode.scope === 'global';

  const loadProfiles = useCallback(async () => {
    try {
      const data = await requestData<{ profiles: ClaudeProfileWithStatus[] }>(
        '/api/claude-profiles'
      );
      setProfiles(data.profiles);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  const loadAssignment = useCallback(async () => {
    try {
      const data = await requestData<{ assignment: ClaudeProfileAssignment }>(
        `/api/claude-profiles/assignment?${scopeQuery(selectedNode)}`
      );
      setAssignment(data.assignment);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [selectedNode]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    setAssignment(null);
    void loadAssignment();
  }, [loadAssignment]);

  const handleAssign = async (value: string) => {
    try {
      const data = await requestData<{ assignment: ClaudeProfileAssignment }>(
        '/api/claude-profiles/assignment',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope: selectedNode.scope,
            owner: selectedNode.owner,
            repo: selectedNode.repo,
            slug: value === '' ? null : value,
          }),
        }
      );
      setAssignment(data.assignment);
    } catch (err) {
      toaster.create({
        type: 'error',
        title: 'プロファイルを変更できません',
        description: errorMessage(err),
      });
    }
  };

  const handleAdd = async () => {
    try {
      const data = await requestData<{ profile: { slug: string } }>('/api/claude-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      setIsAdding(false);
      setNewName('');
      await loadProfiles();
      // 追加したらそのままログインする
      setLoginSlug(data.profile.slug);
    } catch (err) {
      toaster.create({
        type: 'error',
        title: 'プロファイルを追加できません',
        description: errorMessage(err),
      });
    }
  };

  const handleDelete = async (profile: ClaudeProfileWithStatus) => {
    try {
      const res = await fetch(apiUrl(`/api/claude-profiles/${profile.slug}`), {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTPエラー: ${res.status}`);
      await Promise.all([loadProfiles(), loadAssignment()]);
    } catch (err) {
      toaster.create({
        type: 'error',
        title: 'プロファイルを削除できません',
        description: errorMessage(err),
      });
    }
  };

  if (error) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-foreground">Claude Profile</h2>
        <p className="text-sm text-destructive">{error}</p>
      </section>
    );
  }

  if (!profiles || !assignment) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-foreground">Claude Profile</h2>
        <LoadingSpinner size="sm" message="Loading profiles..." />
      </section>
    );
  }

  const profileName = (slug: string) => profiles.find((p) => p.slug === slug)?.name ?? slug;
  const nameError = validateName(newName, profiles);
  const loginProfile = profiles.find((p) => p.slug === loginSlug);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-foreground">Claude Profile</h2>

      <Field
        label={isGlobal ? 'Default profile' : 'Profile for this scope'}
        hint="このスコープのタスクのターミナル・Claude で使うアカウント。変更は開いているタブにも自動で反映されます"
      >
        <select
          value={assignment.assigned ?? ''}
          onChange={(e) => void handleAssign(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-transparent pl-3 pr-10 text-sm text-foreground shadow-xs"
        >
          {!isGlobal && <option value="">Inherit ({profileName(assignment.effective)})</option>}
          {profiles.map((profile) => (
            <option
              key={profile.slug}
              value={isGlobal && profile.slug === DEFAULT_SLUG ? '' : profile.slug}
            >
              {profile.name}
            </option>
          ))}
        </select>
      </Field>

      {isGlobal && (
        <div className="space-y-2">
          {profiles.map((profile) => (
            <div
              key={profile.slug}
              className="flex items-center justify-between gap-2 rounded-md border border-border p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <UserRound className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{profile.name}</div>
                  <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    {profile.status.loggedIn ? (
                      <Check className="size-3 shrink-0 text-success" />
                    ) : (
                      <CircleAlert className="size-3 shrink-0 text-warning" />
                    )}
                    <span className="truncate">{statusLabel(profile.status)}</span>
                  </div>
                  <div className="truncate text-[0.65rem] text-muted-foreground">
                    <Code>{profile.configDir ?? 'CLAUDE_CONFIG_DIR 未指定（~/.claude）'}</Code>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant={profile.status.loggedIn ? 'ghost' : 'default'}
                  size="sm"
                  onClick={() => setLoginSlug(profile.slug)}
                  title="claude auth login"
                >
                  <LogIn className="size-4" />
                  {profile.status.loggedIn ? 'Re-login' : 'Login'}
                </Button>
                {profile.slug !== DEFAULT_SLUG && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(profile)}
                    className="hover:bg-destructive/10"
                    title="Delete"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}

          {isAdding ? (
            <div className="space-y-2 rounded-md border border-border bg-accent p-3">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim() && !nameError) void handleAdd();
                }}
                placeholder="Profile name (e.g. work)"
                autoFocus
              />
              {nameError ? (
                <p className="text-xs text-destructive">{nameError}</p>
              ) : (
                newName.trim() && (
                  <p className="text-xs text-muted-foreground">
                    <Code>~/.tsunagi/claude-profiles/{toSlug(newName)}</Code>
                  </p>
                )
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsAdding(false);
                    setNewName('');
                  }}
                >
                  <X className="size-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleAdd()}
                  disabled={!newName.trim() || Boolean(nameError)}
                >
                  <Check className="size-4" />
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
              <Plus className="size-4" />
              Add Profile
            </Button>
          )}
        </div>
      )}

      {loginProfile && (
        <ClaudeLoginDialog
          profile={loginProfile}
          onClose={() => {
            setLoginSlug(null);
            void loadProfiles();
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(details) => {
          if (!details.open) setDeleteTarget(null);
        }}
        title="Delete Profile"
        message={
          deleteTarget
            ? `${deleteTarget.name} からログアウトし、${deleteTarget.configDir} を削除します。このプロファイルを使っているスコープは親の設定を継承します。`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) void handleDelete(deleteTarget);
        }}
      />
    </section>
  );
}
