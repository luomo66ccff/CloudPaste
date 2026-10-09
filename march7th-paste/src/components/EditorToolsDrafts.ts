"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDraft,
  prepareDraftLibrary,
  removeDraft,
  saveDraft,
  subscribeStorage,
  type DraftDocument,
  type DraftFields,
} from "@/lib/client-storage";

export type DraftVersion = { id: string; revision: number };
type DraftWorkspaceProps = {
  mode: "create" | "edit";
  draftId?: string;
  fields: DraftFields;
  sensitive: boolean;
  autoSave: boolean;
  busy: boolean;
  completed: boolean;
  onRestore: (draft: DraftDocument) => void;
  onMessage: (message: string, error?: boolean) => void;
};

const sameFields = (draft: DraftFields, fields: DraftFields) =>
  draft.title === fields.title &&
  draft.content === fields.content &&
  draft.contentType === fields.contentType &&
  draft.language === fields.language &&
  draft.visibility === fields.visibility &&
  draft.expiresIn === fields.expiresIn;

export function useEditorDrafts({
  mode,
  draftId,
  fields,
  sensitive,
  autoSave,
  busy,
  completed,
  onRestore,
  onMessage,
}: DraftWorkspaceProps) {
  const [ready, setReady] = useState(mode === "edit");
  const [available, setAvailable] = useState(false);
  const [active, setActive] = useState<DraftVersion | null>(null);
  const [status, setStatus] = useState("");
  const [conflict, setConflict] = useState(false);
  const [writing, setWriting] = useState(false);
  const activeRef = useRef<DraftDocument | null>(null);
  const sensitiveRef = useRef(sensitive);
  const conflictRef = useRef(false);
  const mountedRef = useRef(true);
  const completedRef = useRef(completed);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const forkRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    sensitiveRef.current = sensitive;
    completedRef.current = completed;
  }, [completed, sensitive]);

  useEffect(() => {
    if (mode !== "create") return;
    let timer: number | undefined;
    const unsubscribe = subscribeStorage(() => {
      window.clearTimeout(timer);
      // Own writes notify before their promise resolves. Check after activeRef advances.
      timer = window.setTimeout(() => {
        const current = activeRef.current;
        if (
          !current ||
          sensitiveRef.current ||
          completedRef.current ||
          conflictRef.current
        )
          return;
        const latest = getDraft(current.id);
        if (latest?.revision === current.revision) return;
        conflictRef.current = true;
        setConflict(true);
        setStatus("草稿版本冲突 · 正文已保留");
        onMessage(
          "其它页面已修改或删除当前草稿。自动保存已暂停，请另存为新草稿或到草稿库查看。",
          true,
        );
      }, 0);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [mode, onMessage]);

  useEffect(() => {
    if (mode !== "create") return;
    let cancelled = false;
    void prepareDraftLibrary()
      .then((result) => {
        if (cancelled) return;
        setAvailable(result.ok);
        if (!result.ok)
          onMessage(
            "本机草稿库暂不可用，正文仍可编辑和分享。请通过下载保存当前内容。",
            true,
          );
        else if (draftId) {
          const draft = getDraft(draftId);
          if (draft && !sensitiveRef.current) {
            activeRef.current = draft;
            setActive({ id: draft.id, revision: draft.revision });
            onRestore(draft);
            setStatus(`已恢复草稿 · r${draft.revision}`);
          } else if (!draft)
            onMessage(
              "找不到指定草稿，已打开独立的新片段；其它草稿保持原样。",
              true,
            );
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setReady(true);
          setAvailable(false);
          onMessage("无法打开本机草稿库，正文不会因此丢失。", true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [draftId, mode, onMessage, onRestore]);

  const removeOwned = useCallback(async () => {
    const current = activeRef.current;
    activeRef.current = null;
    if (mountedRef.current) {
      setActive(null);
      setStatus("");
    }
    if (!current) return;
    try {
      const result = await removeDraft(current.id, current.revision);
      if (!result.ok && mountedRef.current)
        onMessage(
          result.reason === "conflict"
            ? "当前草稿已被其它页面修改，未删除其它页面的新版本。请到资料库检查。"
            : "本机草稿删除失败，请到资料库检查；敏感正文不会继续保存。",
          true,
        );
    } catch {
      if (mountedRef.current)
        onMessage("本机草稿删除失败，请到资料库检查。", true);
    }
  }, [onMessage]);

  const markSensitive = useCallback(
    (value: boolean) => {
      sensitiveRef.current = value;
      if (value) {
        generationRef.current++;
        conflictRef.current = false;
        setConflict(false);
        void removeOwned();
      }
    },
    [removeOwned],
  );

  const save = useCallback(
    (
      feedback = false,
      asNew = false,
      allowBusy = false,
    ): Promise<DraftDocument | null> => {
      if (sensitive || sensitiveRef.current || mode !== "create") {
        if (feedback)
          onMessage("编辑中的、受密码保护或阅后即焚的正文不会保存到草稿库。");
        return Promise.resolve(null);
      }
      if (!ready || !available || completed || (busy && !allowBusy)) {
        if (feedback)
          onMessage("草稿库不可用或当前操作尚未完成，请先下载正文。", true);
        return Promise.resolve(null);
      }
      if (!fields.title && !fields.content) {
        if (feedback) onMessage("还没有可以保存的内容。");
        return Promise.resolve(null);
      }
      if (asNew && forkRef.current) return Promise.resolve(null);
      if (asNew) forkRef.current = true;
      const snapshot = { ...fields };
      const generation = generationRef.current;
      const operation = queueRef.current.then(async () => {
        try {
          if (
            !mountedRef.current ||
            generation !== generationRef.current ||
            sensitiveRef.current ||
            completedRef.current ||
            (!asNew && conflictRef.current)
          )
            return null;
          setWriting(true);
          const current = asNew ? null : activeRef.current;
          const result = await saveDraft(
            snapshot,
            current
              ? { id: current.id, expectedRevision: current.revision }
              : {},
          );
          if (!result.ok) {
            if (result.reason === "conflict") {
              conflictRef.current = true;
              if (mountedRef.current) setConflict(true);
            }
            if (mountedRef.current) {
              setStatus(
                result.reason === "conflict"
                  ? "草稿版本冲突 · 正文已保留"
                  : "草稿未保存",
              );
              onMessage(
                result.reason === "conflict"
                  ? "另一个页面已更新或删除这份草稿。当前正文已保留，请另存为新草稿或到资料库查看。"
                  : result.reason === "limit"
                    ? "草稿库数量已达上限，请到资料库整理或下载正文。"
                    : result.reason === "quota"
                      ? "浏览器存储空间不足，请下载正文后整理资料库。"
                      : result.reason === "invalid"
                        ? "草稿字段或正文大小不符合要求，当前正文仍保留。"
                        : "草稿库暂不可用，请先下载正文。",
                true,
              );
            }
            return null;
          }
          if (
            !mountedRef.current ||
            sensitiveRef.current ||
            generation !== generationRef.current
          ) {
            await removeDraft(result.draft.id, result.draft.revision);
            return null;
          }
          activeRef.current = result.draft;
          conflictRef.current = false;
          if (mountedRef.current) {
            setActive({ id: result.draft.id, revision: result.draft.revision });
            setConflict(false);
            setStatus(
              `草稿已保存 · r${result.draft.revision} · ${new Date(result.draft.savedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`,
            );
            if (feedback)
              onMessage(
                asNew
                  ? "已另存为一份独立的新草稿，其它版本未被覆盖。"
                  : "当前草稿已保存在此浏览器。",
              );
          }
          return result.draft;
        } catch {
          if (mountedRef.current) {
            setStatus("草稿未保存");
            onMessage("草稿库暂不可用，正文仍保留在编辑器中。", true);
          }
          return null;
        } finally {
          if (asNew) forkRef.current = false;
          if (mountedRef.current) setWriting(false);
        }
      });
      queueRef.current = operation.catch(() => null);
      return operation;
    },
    [available, busy, completed, fields, mode, onMessage, ready, sensitive],
  );

  useEffect(() => {
    if (
      !autoSave ||
      sensitive ||
      !ready ||
      !available ||
      busy ||
      completed ||
      conflict
    )
      return;
    const timer = window.setTimeout(() => {
      void save();
    }, 850);
    return () => window.clearTimeout(timer);
  }, [autoSave, available, busy, completed, conflict, ready, save, sensitive]);

  const currentVersion = useCallback(
    (snapshot: DraftFields): DraftVersion | null => {
      const current = activeRef.current;
      return current && sameFields(current, snapshot)
        ? { id: current.id, revision: current.revision }
        : null;
    },
    [],
  );

  const removeSubmitted = useCallback(async (version: DraftVersion | null) => {
    if (!version) return;
    if (
      activeRef.current?.id === version.id &&
      activeRef.current.revision === version.revision
    )
      activeRef.current = null;
    // A different revision is retained by the storage layer's compare-and-swap check.
    await removeDraft(version.id, version.revision).catch(() => ({
      ok: false,
    }));
  }, []);

  const startNew = useCallback(() => {
    generationRef.current++;
    activeRef.current = null;
    conflictRef.current = false;
    completedRef.current = false;
    setActive(null);
    setConflict(false);
    setStatus("");
  }, []);

  return {
    ready,
    available,
    active,
    status,
    conflict,
    writing,
    save,
    currentVersion,
    removeSubmitted,
    markSensitive,
    startNew,
  };
}
