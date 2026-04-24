const sampleDataset = [
  {
    title: "静夜思",
    author: "李白",
    content: "床前明月光，疑是地上霜。举头望明月，低头思故乡。",
  },
  {
    title: "春晓",
    author: "孟浩然",
    content: "春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。",
  },
  {
    title: "登鹳雀楼",
    author: "王之涣",
    content: "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。",
  },
];

const repoCatalogFallback = [
  { label: "示例数据 sample-data.json", path: "sample-data.json" },
  { label: "my_database", path: "my_database.json" },
];

let activeDataset = [];
let activeDatasetLabel = "未导入";

const datasetInput = document.querySelector("#datasetInput");
const datasetStatus = document.querySelector("#datasetStatus");
const loadSampleButton = document.querySelector("#loadSampleButton");
const loadTextareaButton = document.querySelector("#loadTextareaButton");
const fileInput = document.querySelector("#fileInput");
const loadFileButton = document.querySelector("#loadFileButton");
const repoFileSelect = document.querySelector("#repoFileSelect");
const repoPathInput = document.querySelector("#repoPathInput");
const loadRepoButton = document.querySelector("#loadRepoButton");
const refreshRepoListButton = document.querySelector("#refreshRepoListButton");
const addRuleButton = document.querySelector("#addRuleButton");
const searchButton = document.querySelector("#searchButton");
const resultCount = document.querySelector("#resultCount");
const resultList = document.querySelector("#resultList");
const ruleList = document.querySelector("#ruleList");
const ruleTemplate = document.querySelector("#ruleTemplate");

function addRule(initialKeyword = "", initialPosition = "") {
  const fragment = ruleTemplate.content.cloneNode(true);
  const ruleItem = fragment.querySelector(".rule-item");
  const keywordInput = fragment.querySelector(".keyword-input");
  const positionInput = fragment.querySelector(".position-input");
  const removeButton = fragment.querySelector(".remove-button");

  keywordInput.value = initialKeyword;
  positionInput.value = initialPosition;

  removeButton.addEventListener("click", () => {
    ruleItem.remove();
  });

  ruleList.appendChild(fragment);
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, "");
}

function splitContentToLines(content) {
  return normalizeText(content)
    .split(/[，。！？；、]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseDataset(rawInput) {
  const parsed = JSON.parse(rawInput);
  if (!Array.isArray(parsed)) {
    throw new Error("数据必须是 JSON 数组");
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`第 ${index + 1} 条数据不是对象`);
    }

    const title = String(item.title || "").trim();
    const author = String(item.author || "").trim();
    const content = String(item.content || "").trim();

    if (!title || !author || !content) {
      throw new Error(`第 ${index + 1} 条数据缺少 title、author 或 content`);
    }

    return { title, author, content };
  });
}

function updateDatasetStatus(count, sourceLabel = activeDatasetLabel) {
  datasetStatus.textContent = `当前数据源：${sourceLabel}，共 ${count} 首诗词`;
}

function setActiveDataset(dataset, sourceLabel) {
  activeDataset = dataset;
  activeDatasetLabel = sourceLabel;
  updateDatasetStatus(dataset.length, sourceLabel);
}

function showError(message) {
  resultCount.textContent = "0 条结果";
  resultList.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function showReadyState(message = "数据已导入，可以开始检索。") {
  resultCount.textContent = "0 条结果";
  resultList.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function populateRepoFileOptions(files) {
  const mergedFiles = files.length ? files : repoCatalogFallback;

  repoFileSelect.innerHTML = '<option value="">请选择仓库数据文件</option>';
  mergedFiles.forEach((file) => {
    const option = document.createElement("option");
    option.value = file.path;
    option.textContent = file.label || file.path;
    repoFileSelect.appendChild(option);
  });
}

async function loadRepoCatalog() {
  try {
    const response = await fetch(".my_database.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("未找到目录清单");
    }

    const files = await response.json();
    if (!Array.isArray(files)) {
      throw new Error("目录清单格式错误");
    }

    populateRepoFileOptions(files);
  } catch (_error) {
    populateRepoFileOptions([]);
  }
}

async function loadDatasetFromText(rawInput, sourceLabel) {
  const dataset = parseDataset(rawInput);
  setActiveDataset(dataset, sourceLabel);
  return dataset;
}

function normalizeRepoPath(targetPath) {
  if (
    targetPath.startsWith("https://github.com/") &&
    targetPath.includes("/blob/")
  ) {
    return targetPath
      .replace("https://github.com/", "https://raw.githubusercontent.com/")
      .replace("/blob/", "/");
  }

  return targetPath;
}

function getSelectedFields() {
  return [...document.querySelectorAll('input[name="searchField"]:checked')].map(
    (input) => input.value,
  );
}

function getLineLengthFilter() {
  return document.querySelector('input[name="lineLength"]:checked').value;
}

function getRules() {
  return [...ruleList.querySelectorAll(".rule-item")]
    .map((item) => {
      const keyword = item.querySelector(".keyword-input").value.trim();
      const positionValue = item.querySelector(".position-input").value.trim();
      const position = positionValue ? Number(positionValue) : null;

      if (position !== null && (!Number.isInteger(position) || position < 1)) {
        throw new Error("字位必须是大于等于 1 的整数");
      }

      return {
        keyword,
        position,
      };
    })
    .filter((rule) => rule.keyword);
}

function matchRule(text, rule) {
  const normalizedText = normalizeText(text);
  const normalizedKeyword = normalizeText(rule.keyword);

  if (!normalizedKeyword) {
    return false;
  }

  if (rule.position) {
    const startIndex = rule.position - 1;
    const targetSlice = normalizedText.slice(
      startIndex,
      startIndex + normalizedKeyword.length,
    );
    return targetSlice === normalizedKeyword;
  }

  return normalizedText.includes(normalizedKeyword);
}

function matchField(text, rules) {
  return rules.every((rule) => matchRule(text, rule));
}

function searchDataset(dataset, fields, lineLengthFilter, rules) {
  if (!dataset.length) {
    throw new Error("请先导入一份诗词数据");
  }

  if (!fields.length) {
    throw new Error("请至少选择一个检索范围");
  }

  if (!rules.length) {
    throw new Error("请至少填写一个关键词");
  }

  return dataset
    .map((poem) => {
      const matches = [];

      if (fields.includes("title") && matchField(poem.title, rules)) {
        matches.push({ type: "标题", value: poem.title });
      }

      if (fields.includes("author") && matchField(poem.author, rules)) {
        matches.push({ type: "作者", value: poem.author });
      }

      if (fields.includes("content")) {
        const lines = splitContentToLines(poem.content);
        const matchedLines = lines.filter((line) => {
          if (lineLengthFilter !== "all" && line.length !== Number(lineLengthFilter)) {
            return false;
          }

          return matchField(line, rules);
        });

        if (matchedLines.length) {
          matches.push({ type: "诗句", value: matchedLines });
        }
      }

      return {
        ...poem,
        matches,
      };
    })
    .filter((poem) => poem.matches.length > 0);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderResults(results) {
  resultCount.textContent = `${results.length} 条结果`;

  if (!results.length) {
    resultList.innerHTML =
      '<div class="empty-state">没有匹配结果，可以调整关键词、字段或句式条件再试试。</div>';
    return;
  }

  resultList.innerHTML = results
    .map((poem) => {
      const chips = poem.matches
        .map((match) => `<span class="match-chip">${escapeHtml(match.type)}命中</span>`)
        .join("");

      const matchedLines = poem.matches
        .filter((match) => match.type === "诗句")
        .flatMap((match) => match.value)
        .map((line) => `<p class="matched-line">${escapeHtml(line)}</p>`)
        .join("");

      return `
        <article class="result-card">
          <h3>${escapeHtml(poem.title)}</h3>
          <div class="meta">${escapeHtml(poem.author)}</div>
          <div>${chips}</div>
          <div class="content-block">${escapeHtml(poem.content)}</div>
          ${matchedLines ? `<div class="content-block"><strong>命中诗句：</strong>${matchedLines}</div>` : ""}
        </article>
      `;
    })
    .join("");
}

async function handleTextareaLoad() {
  try {
    const text = datasetInput.value.trim();
    if (!text) {
      throw new Error("请先粘贴 JSON 数据");
    }

    await loadDatasetFromText(text, "手动粘贴 JSON");
    showReadyState();
  } catch (error) {
    showError(error.message);
  }
}

async function handleFileLoad() {
  try {
    const [file] = fileInput.files;
    if (!file) {
      throw new Error("请先选择一个 JSON 文件");
    }

    const text = await file.text();
    await loadDatasetFromText(text, `本地文件 ${file.name}`);
    datasetInput.value = text;
    showReadyState();
  } catch (error) {
    showError(error.message);
  }
}

async function handleRepoLoad() {
  try {
    const selectedPath = repoFileSelect.value.trim();
    const inputPath = repoPathInput.value.trim();
    const targetPath = normalizeRepoPath(inputPath || selectedPath);

    if (!targetPath) {
      throw new Error("请先选择或填写仓库 JSON 路径");
    }

    const response = await fetch(targetPath, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`读取失败：${targetPath}`);
    }

    const text = await response.text();
    await loadDatasetFromText(text, `仓库文件 ${targetPath}`);
    datasetInput.value = text;
    showReadyState();
  } catch (error) {
    showError(error.message);
  }
}

function handleSearch() {
  try {
    const fields = getSelectedFields();
    const lineLengthFilter = getLineLengthFilter();
    const rules = getRules();
    const results = searchDataset(activeDataset, fields, lineLengthFilter, rules);

    updateDatasetStatus(activeDataset.length, activeDatasetLabel);
    renderResults(results);
  } catch (error) {
    showError(error.message);
  }
}

loadSampleButton.addEventListener("click", async () => {
  datasetInput.value = JSON.stringify(sampleDataset, null, 2);
  await loadDatasetFromText(datasetInput.value, "内置示例数据");
  showReadyState();
});

loadTextareaButton.addEventListener("click", handleTextareaLoad);
loadFileButton.addEventListener("click", handleFileLoad);
loadRepoButton.addEventListener("click", handleRepoLoad);
refreshRepoListButton.addEventListener("click", loadRepoCatalog);
repoFileSelect.addEventListener("change", () => {
  if (repoFileSelect.value) {
    repoPathInput.value = repoFileSelect.value;
  }
});
addRuleButton.addEventListener("click", () => addRule());
searchButton.addEventListener("click", handleSearch);

addRule("明月", "");
populateRepoFileOptions([]);
loadRepoCatalog();
