// Resource Library App
(function(){
  const statusEl = document.getElementById('status');
  const listEl = document.getElementById('fileList');
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('categoryFilter');
  const repoLink = document.getElementById('repoLink');

  const owner = CONFIG.REPO_OWNER;
  const repo = CONFIG.REPO_NAME;
  const branch = CONFIG.BRANCH;
  const token = CONFIG.GITHUB_TOKEN;

  repoLink.href = `https://github.com/${owner}/${repo}`;
  repoLink.textContent = `${owner}/${repo}`;

  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const treeApi = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;

  const showStatus = (msg, show=true) => {
    statusEl.textContent = msg;
    statusEl.style.display = show ? 'block' : 'none';
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showStatus("Link copied to clipboard.", true);
      setTimeout(()=> showStatus("", false), 1500);
    } catch(e) {
      alert("Copy failed. Here’s the link:\n" + text);
    }
  };

  const shareLink = async (title, text, url) => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch (e) {
        await copyToClipboard(url);
      }
    } else {
      await copyToClipboard(url);
    }
  };

  const isBinary = (path) => {
    const binExt = [".png",".jpg",".jpeg",".gif",".webp",".pdf",".zip",".pptx",".docx",".xlsx",".mov",".mp4",".mp3",".wav",".avi",".mkv"];
    return binExt.some(ext => path.toLowerCase().endsWith(ext));
  };

  // ---- NEW: Safe path helpers (encode each segment, keep slashes) ----
  function encodePathSegments(p) {
    return String(p)
      .split('/')
      .map(encodeURIComponent)
      .join('/');
  }
  function toRawUrl(path) {
    // raw.githubusercontent.com/{owner}/{repo}/{branch}/{encoded path}
    return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${encodePathSegments(path)}`;
  }
  function toGithubBlobUrl(path) {
    // github.com/{owner}/{repo}/blob/{branch}/{encoded path}
    return `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(branch)}/${encodePathSegments(path)}`;
  }
  function toDownloadUrl(path) {
    return isBinary(path) ? toRawUrl(path) : toGithubBlobUrl(path);
  }
  // --------------------------------------------------------------------

  const renderFiles = (files) => {
    listEl.innerHTML = "";
    const categories = new Set([""]);
    files.forEach(f => { if (f.category) categories.add(f.category); });

    const current = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="">All categories</option>';
    [...categories].sort().forEach(cat => {
      if (cat === "") return;
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      categoryFilter.appendChild(opt);
    });
    if ([...categories].has(current)) categoryFilter.value = current;

    const term = searchInput.value.trim().toLowerCase();
    const cat = categoryFilter.value;

    const visible = files.filter(f => {
      const matchesSearch = !term || f.name.toLowerCase().includes(term) || f.path.toLowerCase().includes(term);
      const matchesCat = !cat || f.category === cat;
      return matchesSearch && matchesCat;
    });

    if (!visible.length) {
      const li = document.createElement('li');
      li.className = "file";
      li.textContent = "No matching resources.";
      listEl.appendChild(li);
      return;
    }

    visible.forEach(f => {
      const li = document.createElement('li');
      li.className = "file";

      const name = document.createElement('div');
      name.className = "name";
      name.textContent = f.name;

      const category = document.createElement('div');
      category.className = "category";
      category.textContent = f.category || "Uncategorized";

      const actions = document.createElement('div');
      actions.className = "actions";

      const viewBtn = document.createElement('a');
      viewBtn.className = "btn";
      viewBtn.href = toGithubBlobUrl(f.path);   // encoded
      viewBtn.target = "_blank";
      viewBtn.rel = "noopener";
      viewBtn.textContent = "Open";

      const downloadBtn = document.createElement('a');
      downloadBtn.className = "btn";
      downloadBtn.href = toDownloadUrl(f.path); // encoded
      downloadBtn.target = "_blank";
      downloadBtn.rel = "noopener";
      downloadBtn.textContent = isBinary(f.path) ? "Download" : "View Raw";

      const shareBtn = document.createElement('button');
      shareBtn.textContent = "Share";
      shareBtn.onclick = () => {
        const url = toDownloadUrl(f.path);
        const title = f.name;
        const text = `Resource: ${f.name}`;
        shareLink(title, text, url);
      };

      const emailBtn = document.createElement('a');
      emailBtn.className = "btn";
      emailBtn.href = "#";
      emailBtn.textContent = "Email";
      emailBtn.addEventListener('click', (e) => {
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

      const meta = document.createElement('div');
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
      const resp = await fetch(treeApi, { headers });
      if (!resp.ok) {
        const msg = `GitHub API error (${resp.status}). Check repo name, branch, or rate limits.`;
        showStatus(msg, true);
        return;
      }
      const data = await resp.json();
      const files = (data.tree || [])
        .filter(n => n.type === "blob")
        .map(n => ({
          path: n.path,
          name: n.path.split('/').pop(),
          category: n.path.includes('/') ? n.path.split('/')[0] : ""
        }));

      console.log("Fetched files:", files.map(f => f.path)); // helpful diagnostics
      renderFiles(files);

      searchInput.addEventListener('input', () => renderFiles(files));
      categoryFilter.addEventListener('change', () => renderFiles(files));
      showStatus("", false);
    } catch (e) {
      console.error(e);
      showStatus("Failed to load resources. Check your internet connection and config.js.", true);
    }
  };

  document.addEventListener('DOMContentLoaded', init);
})();
