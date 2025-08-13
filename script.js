// Resource Library App (Contents API version)
(function () {
  let ALL_FILES = []; // ADDED: cache of all files

  const statusEl = document.getElementById("status");
  const listEl = document.getElementById("fileList");
  const searchInput = document.getElementById("searchInput");
  const categoryFilter = document.getElementById("categoryFilter");
  const repoLink = document.getElementById("repoLink");

  const owner = CONFIG.REPO_OWNER;
  const repo = CONFIG.REPO_NAME;
  const branch = CONFIG.BRANCH;                // may be "", "main", "master", etc.
  const token = CONFIG.GITHUB_TOKEN;           // null for public repos

  repoLink.href = `https://github.com/${owner}/${repo}`;
  repoLink.textContent = `${owner}/${repo}`;

  // CHANGED: add Accept header + token if present
  const headers = {
    Accept: "application/vnd.github+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // —— UI helpers
  const showStatus = (msg, show = true) => {
    statusEl.textContent = msg;
    statusEl.style.display = show ? "block" : "none";
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showStatus("Link copied to clipboard.", true);
      setTimeout(() => showStatus("", false), 1500);
    } catch {
      alert("Copy failed. Here’s the link:\n" + text);
    }
  };

  const shareLink = async (title, text, url) => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        await copyToClipboard(url);
      }
    } else {
      await copyToClipboard(url);
    }
  };

  // —— File type helpers
  const isBinary = (path) => {
    const binExt = [".png",".jpg",".jpeg",".gif",".webp",".pdf",".zip",".pptx",".docx",".xlsx",".mov",".mp4",".mp3",".wav",".avi",".mkv"];
    const p = path.toLowerCase();
    return binExt.some((ext) => p.endsWith(ext));
  };

  // —— Safe path helpers (encode each segment, keep slashes)
  function encodePathSegments(p) {
    return String(p).split("/").map(encodeURIComponent).join("/");
  }

  // CHANGED: we’ll resolve the branch before using these URL builders
  let resolvedBranch = branch || ""; // will be set by resolveBranch()

  function toRawUrl(path) {
    return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(resolvedBranch)}/${encodePathSegments(path)}`;
  }
  function toGithubBlobUrl(path) {
    return `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(resolvedBranch)}/${encodePathSegments(path)}`;
  }
  function toDownloadUrl(path) {
    return isBinary(path) ? toRawUrl(path) : toGithubBlobUrl(path);
  }

  // —— Robust fetch with diagnostics (kept, with better messages)
  async function apiJson(url) {
    const res = await fetch(url, { headers });

    // CHANGED: clearer errors + rate limit hinting
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const rl = {
        limit: res.headers.get("x-ratelimit-limit"),
        remaining: res.headers.get("x-ratelimit-remaining"),
        reset: res.headers.get("x-ratelimit-reset"),
      };

      if (res.status === 403 && rl.remaining === "0") {
        throw new Error(
          `GitHub rate limit reached (${rl.limit}/hr). ` +
          `Add GITHUB_TOKEN in config.js or try later.`
        );
      }
      if (res.status === 409) {
        throw new Error(
          `Repo/branch appears empty (409). Add at least one commit to "${resolvedBranch}".`
        );
      }
      if (res.status === 404) {
        throw new Error(
          `Not found (404) at ${url}. Check owner/repo/branch and visibility.`
        );
      }

      console.error("[GitHub API error]", res.status, url, rl, body);
      throw new Error(`${res.status} @ ${url}\n${body.slice(0, 400)}`);
    }
    return res.json();
  }

  // CHANGED: repo/branch resolution helpers
  async function getRepoInfo() {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    return apiJson(url); // { default_branch, private, ... }
  }

  async function resolveBranch() {
    if (resolvedBranch) return resolvedBranch; // already set from CONFIG

    const info = await getRepoInfo();
    const def = info.default_branch || "main";
    resolvedBranch = def;
    return resolvedBranch;
  }

  // —— Contents API helpers (now use resolvedBranch)
  async function listTopLevel() {
    const ref = encodeURIComponent(resolvedBranch);
    const url = `https://api.github.com/repos/${owner}/${repo}/contents?ref=${ref}`;
    return apiJson(url); // array of {name, path, type, ...}
  }

  async function listCategoryFiles(catName) {
    const safe = encodePathSegments(catName);
    const ref = encodeURIComponent(resolvedBranch);
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${safe}?ref=${ref}`;
    return apiJson(url); // array inside that folder
  }

  function normalizeFiles(items, category) {
    return items
      .filter((it) => it.type === "file")
      .map((it) => ({
        path: it.path,                               // e.g. "Category/File Name.pdf"
        name: it.name,                               // file name
        category: category || (it.path.includes("/") ? it.path.split("/")[0] : ""),
      }));
  }

  const renderFiles = (files) => {
    listEl.innerHTML = "";
    const categories = new Set([""]);
    files.forEach((f) => { if (f.category) categories.add(f.category); });

    const current = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="">All categories</option>';
    [...categories].sort().forEach((cat) => {
      if (!cat) return;
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      categoryFilter.appendChild(opt);
    });
    if ([...categories].includes(current)) categoryFilter.value = current;

    const term = searchInput.value.trim().toLowerCase();
    const cat = categoryFilter.value;

    const visible = files.filter((f) => {
      const matchesSearch =
        !term ||
        f.name.toLowerCase().includes(term) ||
        f.path.toLowerCase().includes(term);
      const matchesCat = !cat || f.category === cat;
      return matchesSearch && matchesCat;
    });

    if (!visible.length) {
      const li = document.createElement("li");
      li.className = "file";
      li.textContent = "No matching resources.";
      listEl.appendChild(li);
      return;
    }

    visible.forEach((f) => {
      const li = document.createElement("li");
      li.className = "file";

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = f.name;
      name.title = f.name; // tooltip

      const category = document.createElement("div");
      category.className = "category";
      category.textContent = f.category || "Uncategorized";
      category.title = f.category  || "Uncategorized"; // tooltip

      const actions = document.createElement("div");
      actions.className = "actions";

      const viewBtn = document.createElement("a");
      viewBtn.className = "btn";
      viewBtn.href = toGithubBlobUrl(f.path);
      viewBtn.target = "_blank";
      viewBtn.rel = "noopener";
      viewBtn.textContent = "Open";

      const downloadBtn = document.createElement("a");
      downloadBtn.className = "btn";
      downloadBtn.href = toDownloadUrl(f.path);
      downloadBtn.target = "_blank";
      downloadBtn.rel = "noopener";
      downloadBtn.textContent = isBinary(f.path) ? "Download" : "View Raw";

      const shareBtn = document.createElement("button");
      shareBtn.textContent = "Share";
      shareBtn.onclick = () => {
        const url = toDownloadUrl(f.path);
        const title = f.name;
        const text = `Resource: ${f.name}`;
        shareLink(title, text, url);
      };

      const emailBtn = document.createElement("a");
      emailBtn.className = "btn";
      emailBtn.href = "#";
      emailBtn.textContent = "Email";
      emailBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const sub = encodeURIComponent(`Resource: ${f.name}`);
        const url = toDownloadUrl(f.path);
        const body = encodeURIComponent(`Hi,\n\nHere's a resource you might find helpful:\n${url}\n\n`);
        window.location.href = `mailto:?subject=${sub}&body=${body}`;
      });

      actions.appendChild(viewBtn);
      actions.appendChild(downloadBtn);
      actions.appendChild(shareBtn);
      actions.appendChild(emailBtn);

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = f.path;

      li.appendChild(name);
      li.appendChild(actions);
      li.appendChild(category);
      li.appendChild(meta);
      listEl.appendChild(li);
    });
  };

  const init = async () => {
    showStatus("Loading resources…", true);
    try {
      // CHANGED: resolve the branch first (auto-detect if CONFIG.BRANCH is blank/wrong)
      await resolveBranch();

      // 1) Get top-level items and extract categories (dirs)
      const top = await listTopLevel();
      const categories = top.filter((it) => it.type === "dir").map((d) => d.name);

      if (!categories.length) {
        // No folders—just show any top-level files
        const files = normalizeFiles(top, "");
        console.log("Fetched top-level files:", files.map((f) => f.path));

        ALL_FILES = files;           // ADDED: cache
        renderFiles(ALL_FILES);      // ADDED: render from cache
        showStatus("", false);
      } else {
        // 2) For each category, list its files (non-recursive)
        const allFiles = [];
        for (const cat of categories) {
          try {
            const items = await listCategoryFiles(cat);
            const files = normalizeFiles(items, cat);
            allFiles.push(...files);
          } catch (e) {
            console.error(`Failed reading category "${cat}":`, e);
            // Keep going; other categories may still load
          }
        }

        console.log("Fetched files:", allFiles.map((f) => f.path));
        ALL_FILES = allFiles;        // ADDED: cache
        renderFiles(ALL_FILES);      // ADDED: render from cache
        showStatus("", false);
      }

      // ADDED: live filtering
      searchInput.addEventListener("input", () => renderFiles(ALL_FILES));
      categoryFilter.addEventListener("change", () => renderFiles(ALL_FILES));

    } catch (e) {
      console.error("[Init failed]", e);
      const privateHint = !token ? " If this repo is PRIVATE, set GITHUB_TOKEN in config.js (note: tokens are visible to anyone who can view the page)." : "";
      showStatus(
        `Failed to load resources. ${e.message || e}${privateHint}
Check:
• CONFIG.REPO_OWNER = ${owner}
• CONFIG.REPO_NAME = ${repo}
• CONFIG.BRANCH = ${branch || "(auto)"} (resolved: ${resolvedBranch || "unknown"})`,
        true
      );
    }
  };

  document.addEventListener("DOMContentLoaded", init);
})();
