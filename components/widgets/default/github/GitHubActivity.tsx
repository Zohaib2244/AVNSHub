"use client";
import "./GitHubActivity.css";

import { useEffect, useState } from "react";
import { Check, Copy, Github, GitCommitHorizontal } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import { useWidget } from "@/components/framework/WidgetContext";
import { timeAgo } from "@/lib/format";
import type { GitHubActivity as GitHubActivityData, GitHubRepos } from "@/lib/github";

/* eslint-disable @next/next/no-img-element -- github avatar is a tiny external image */

const POLL_URL = "/api/github-activity";
const POLL_MS = 60_000;

export function GitHubActivity() {
  const { data } = usePolling<GitHubActivityData>(POLL_URL, POLL_MS);

  return (
    <>
      <div className="github-head">
        {data?.user?.avatarUrl && <img src={data.user.avatarUrl} alt="" className="github-avatar" />}
        <div className="github-id">
          <div className="block-label github-label">
            <GitCommitHorizontal size={14} strokeWidth={1.75} />
            github activity
          </div>
          <div className="github-username">{data?.user?.login ?? "—"}</div>
        </div>
        {data?.user?.profileUrl && (
          <a
            href={data.user.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="github-link-btn"
            aria-label="open github profile"
          >
            <Github size={14} strokeWidth={1.75} />
          </a>
        )}
      </div>

      {data?.latest ? (
        <>
          <div className="block-value accent">{data.latest.message}</div>
          <div className="block-sub">
            {data.latest.repo} · {timeAgo(data.latest.committedAt)}
          </div>
        </>
      ) : (
        <div className="block-value">—</div>
      )}
    </>
  );
}

type Tab = "commits" | "repos";

export function GitHubActivityMore() {
  const { data } = usePolling<GitHubActivityData>(POLL_URL, POLL_MS);
  const { settings } = useWidget();
  const [repos, setRepos] = useState<GitHubRepos>(null);
  const [tab, setTab] = useState<Tab>("commits");
  const [copiedRepo, setCopiedRepo] = useState<string | null>(null);

  // only mounts at L size (the detail area), so this lazy-loads on first reveal
  useEffect(() => {
    fetch("/api/github-repos")
      .then((r) => r.json())
      .then(setRepos)
      .catch(() => {});
  }, []);

  function copyClone(repo: { name: string; cloneUrl: string }) {
    navigator.clipboard.writeText(`git clone ${repo.cloneUrl}`).then(() => {
      setCopiedRepo(repo.name);
      setTimeout(() => setCopiedRepo(null), 1500);
    }).catch(() => {});
  }

  return (
    <>
      <div className="github-tabs">
        <button
          type="button"
          className={`github-tab${tab === "commits" ? " active" : ""}`}
          onClick={() => setTab("commits")}
        >
          commits
        </button>
        <button
          type="button"
          className={`github-tab${tab === "repos" ? " active" : ""}`}
          onClick={() => setTab("repos")}
        >
          repos
        </button>
      </div>

      {tab === "commits" ? (
        data && data.recent.length > 0 ? (
          data.recent.slice(0, Number(settings.flyoutCommits ?? 5)).map((c, i) => (
            <div className="more-row" key={i}>
              <span>{c.message}</span>
              <span className="more-meta">
                {c.repo} · {timeAgo(c.committedAt)}
              </span>
            </div>
          ))
        ) : (
          <div className="block-sub">no recent commits</div>
        )
      ) : (
        <div className="github-repo-list">
          {!repos ? (
            <div className="block-sub">loading repos...</div>
          ) : repos.repos.length === 0 ? (
            <div className="block-sub">no repos found</div>
          ) : (
            repos.repos.map((r) => (
              <div className="github-repo-row" key={r.name}>
                <span>{r.name}</span>
                <button
                  type="button"
                  className="github-copy-btn"
                  onClick={() => copyClone(r)}
                  aria-label={`copy clone command for ${r.name}`}
                  title={`git clone ${r.cloneUrl}`}
                >
                  {copiedRepo === r.name ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.75} />}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
